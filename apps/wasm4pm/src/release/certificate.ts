import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';

export const RELEASE_CERTIFICATE_SCHEMA = 'wasm4pm.release-certificate.v2' as const;

export interface ReleaseCertificateIssue {
  readonly code: string;
  readonly message: string;
}

export interface ReleaseCertificateVerification {
  readonly valid: boolean;
  readonly certificate_path: string;
  readonly certificate_hash?: string;
  readonly git_commit?: string;
  readonly issues: readonly ReleaseCertificateIssue[];
}

export interface ReleaseCertificateV2 {
  readonly schema_version: typeof RELEASE_CERTIFICATE_SCHEMA;
  readonly package: {
    readonly name: string;
    readonly version: string;
    readonly git_commit: string;
    readonly package_json_path: string;
    readonly package_json_sha256: string;
  };
  readonly reachability: {
    readonly evidence_path: string;
    readonly evidence_file_sha256: string;
    readonly evidence_claimed_hash: string;
    readonly algorithm_count: number;
    readonly algorithms_reachable: number;
    readonly all_reachable: boolean;
  };
  readonly behavior: {
    readonly evidence_path: string;
    readonly evidence_file_sha256: string;
    readonly evidence_claimed_hash: string;
    readonly algorithm_count: number;
    readonly positive_case_count: number;
    readonly negative_case_count: number;
    readonly invariant_case_count: number;
    readonly all_positive_passed: boolean;
    readonly all_negative_failed_correctly: boolean;
    readonly all_invariants_passed: boolean;
    readonly all_algorithm_receipts_recompute: boolean;
  };
  readonly examples: {
    readonly root: string;
    readonly file_count: number;
    readonly manifest_hash: string;
    readonly files: readonly {
      readonly path: string;
      readonly size: number;
      readonly sha256: string;
    }[];
  };
  readonly package_artifact: {
    readonly tarball_path: string;
    readonly tarball_name: string;
    readonly tarball_size: number;
    readonly tarball_sha1: string;
    readonly tarball_sha256: string;
    readonly tarball_integrity: string;
    readonly packed_package_name: string;
    readonly packed_package_version: string;
    readonly wasm_bundle_path: string;
    readonly wasm_bundle_size: number;
    readonly wasm_bundle_sha256: string;
  };
  readonly generated_at: string;
  readonly certificate: {
    readonly algorithm: 'sha256';
    readonly hash: string;
  };
}

export class ReleaseCertificateError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'ReleaseCertificateError';
  }
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ReleaseCertificateError('INVALID_EVIDENCE_SCHEMA', `${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new ReleaseCertificateError('INVALID_EVIDENCE_SCHEMA', `${label} must be a non-empty string`);
  }
  return value;
}

function asNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ReleaseCertificateError('INVALID_EVIDENCE_SCHEMA', `${label} must be a finite number`);
  }
  return value;
}

function asBoolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') {
    throw new ReleaseCertificateError('INVALID_EVIDENCE_SCHEMA', `${label} must be boolean`);
  }
  return value;
}

function asArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new ReleaseCertificateError('INVALID_EVIDENCE_SCHEMA', `${label} must be an array`);
  }
  return value;
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, child]) => [key, sortJson(child)])
    );
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortJson(value));
}

export function sha256(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex');
}

function sha1(data: Buffer): string {
  return createHash('sha1').update(data).digest('hex');
}

function sha512Integrity(data: Buffer): string {
  return `sha512-${createHash('sha512').update(data).digest('base64')}`;
}

function readJsonFile(filePath: string): Record<string, unknown> {
  try {
    return asRecord(JSON.parse(fs.readFileSync(filePath, 'utf8')), filePath);
  } catch (error) {
    if (error instanceof ReleaseCertificateError) throw error;
    throw new ReleaseCertificateError(
      'INVALID_JSON_EVIDENCE',
      `Cannot read JSON evidence ${filePath}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

function requireFile(rootDir: string, relativePath: string, code: string): string {
  const absolute = path.resolve(rootDir, relativePath);
  const root = path.resolve(rootDir);
  if (absolute !== root && !absolute.startsWith(`${root}${path.sep}`)) {
    throw new ReleaseCertificateError('PATH_ESCAPE_REFUSED', `${relativePath} escapes the repository root`);
  }
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
    throw new ReleaseCertificateError(code, `Required artifact is missing: ${relativePath}`);
  }
  return absolute;
}

function relativeUnix(rootDir: string, absolutePath: string): string {
  return path.relative(rootDir, absolutePath).split(path.sep).join('/');
}

function currentCommit(rootDir: string): string {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch (error) {
    throw new ReleaseCertificateError(
      'GIT_IDENTITY_REQUIRED',
      `Cannot resolve exact Git commit: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

function commitTimestamp(rootDir: string): string {
  try {
    return execFileSync('git', ['show', '-s', '--format=%cI', 'HEAD'], {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch (error) {
    throw new ReleaseCertificateError(
      'GIT_TIMESTAMP_REQUIRED',
      `Cannot resolve commit timestamp: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

function packageIdentity(rootDir: string): {
  name: string;
  version: string;
  packagePath: string;
  packageHash: string;
} {
  const packagePath = requireFile(
    rootDir,
    'packages/kernel/package.json',
    'PACKAGE_IDENTITY_MISSING'
  );
  const bytes = fs.readFileSync(packagePath);
  const pkg = asRecord(JSON.parse(bytes.toString('utf8')), 'packages/kernel/package.json');
  return {
    name: asString(pkg.name, 'packages/kernel/package.json.name'),
    version: asString(pkg.version, 'packages/kernel/package.json.version'),
    packagePath,
    packageHash: sha256(bytes),
  };
}

function recomputeClaimedHash(
  evidence: Record<string, unknown>,
  field: 'reachability_hash' | 'behavior_evidence_hash'
): { claimed: string; recomputed: string } {
  const claimed = asString(evidence[field], field);
  const copy = cloneJson(evidence);
  copy[field] = '';
  return { claimed, recomputed: sha256(JSON.stringify(copy)) };
}

function collectReachability(rootDir: string, version: string): ReleaseCertificateV2['reachability'] {
  const relativePath = `artifacts/release/ALGORITHM_REACHABILITY_EVIDENCE.v${version}.json`;
  const evidencePath = requireFile(rootDir, relativePath, 'REACHABILITY_EVIDENCE_MISSING');
  const bytes = fs.readFileSync(evidencePath);
  const evidence = readJsonFile(evidencePath);
  const algorithms = asArray(evidence.algorithms, 'reachability.algorithms').map((value, index) =>
    asRecord(value, `reachability.algorithms[${index}]`)
  );
  const algorithmCount = asNumber(evidence.algorithm_count, 'reachability.algorithm_count');
  if (algorithmCount !== algorithms.length) {
    throw new ReleaseCertificateError(
      'REACHABILITY_COUNT_MISMATCH',
      `Reachability count ${algorithmCount} does not equal ${algorithms.length} algorithm rows`
    );
  }
  const { claimed, recomputed } = recomputeClaimedHash(evidence, 'reachability_hash');
  if (claimed !== recomputed) {
    throw new ReleaseCertificateError(
      'REACHABILITY_HASH_MISMATCH',
      `Reachability claimed hash ${claimed} does not recompute to ${recomputed}`
    );
  }
  const reachable = algorithms.filter((algorithm) => algorithm.reachable === true).length;
  return {
    evidence_path: relativePath,
    evidence_file_sha256: sha256(bytes),
    evidence_claimed_hash: claimed,
    algorithm_count: algorithmCount,
    algorithms_reachable: reachable,
    all_reachable: reachable === algorithmCount,
  };
}

function countCases(
  algorithms: readonly Record<string, unknown>[],
  key: 'positive_cases' | 'negative_cases' | 'invariant_cases',
  requiredStatus: string
): { count: number; allExpected: boolean } {
  let count = 0;
  let allExpected = true;
  for (const [algorithmIndex, algorithm] of algorithms.entries()) {
    const cases = asArray(algorithm[key], `behavior.algorithms[${algorithmIndex}].${key}`);
    count += cases.length;
    for (const [caseIndex, value] of cases.entries()) {
      const testCase = asRecord(value, `${key}[${caseIndex}]`);
      if (testCase.status !== requiredStatus) allExpected = false;
    }
  }
  return { count, allExpected };
}

function algorithmReceiptsRecompute(algorithms: readonly Record<string, unknown>[]): boolean {
  return algorithms.every((algorithm) => {
    const claimed = algorithm.algorithm_evidence_hash;
    if (typeof claimed !== 'string' || !/^[0-9a-f]{64}$/.test(claimed)) return false;
    const copy = cloneJson(algorithm);
    copy.algorithm_evidence_hash = '';
    return sha256(JSON.stringify(copy)) === claimed;
  });
}

function collectBehavior(rootDir: string, version: string, gitCommit: string): ReleaseCertificateV2['behavior'] {
  const relativePath = `artifacts/release/ALGORITHM_BEHAVIOR_EVIDENCE.v${version}.json`;
  const evidencePath = requireFile(rootDir, relativePath, 'BEHAVIOR_EVIDENCE_MISSING');
  const bytes = fs.readFileSync(evidencePath);
  const evidence = readJsonFile(evidencePath);
  if (asString(evidence.git_commit, 'behavior.git_commit') !== gitCommit) {
    throw new ReleaseCertificateError(
      'BEHAVIOR_COMMIT_MISMATCH',
      'Behavior evidence is not bound to the current Git commit'
    );
  }
  const algorithms = asArray(evidence.algorithms, 'behavior.algorithms').map((value, index) =>
    asRecord(value, `behavior.algorithms[${index}]`)
  );
  const algorithmCount = asNumber(evidence.algorithm_count, 'behavior.algorithm_count');
  if (algorithmCount !== algorithms.length) {
    throw new ReleaseCertificateError(
      'BEHAVIOR_COUNT_MISMATCH',
      `Behavior count ${algorithmCount} does not equal ${algorithms.length} algorithm rows`
    );
  }
  const summary = asRecord(evidence.summary, 'behavior.summary');
  const positive = countCases(algorithms, 'positive_cases', 'passed');
  const negative = countCases(algorithms, 'negative_cases', 'failed_correctly');
  const invariant = countCases(algorithms, 'invariant_cases', 'passed');
  if (
    asNumber(summary.positive_cases, 'behavior.summary.positive_cases') !== positive.count ||
    asNumber(summary.negative_cases, 'behavior.summary.negative_cases') !== negative.count ||
    asNumber(summary.invariant_cases, 'behavior.summary.invariant_cases') !== invariant.count
  ) {
    throw new ReleaseCertificateError(
      'BEHAVIOR_CASE_COUNT_MISMATCH',
      'Behavior summary case counts do not match the executable case rows'
    );
  }
  if (
    asBoolean(summary.all_positive_passed, 'behavior.summary.all_positive_passed') !==
      positive.allExpected ||
    asBoolean(
      summary.all_negative_failed_correctly,
      'behavior.summary.all_negative_failed_correctly'
    ) !== negative.allExpected ||
    asBoolean(summary.all_invariants_passed, 'behavior.summary.all_invariants_passed') !==
      invariant.allExpected
  ) {
    throw new ReleaseCertificateError(
      'BEHAVIOR_SUMMARY_MISMATCH',
      'Behavior summary booleans do not match the case outcomes'
    );
  }
  const { claimed, recomputed } = recomputeClaimedHash(evidence, 'behavior_evidence_hash');
  if (claimed !== recomputed) {
    throw new ReleaseCertificateError(
      'BEHAVIOR_HASH_MISMATCH',
      `Behavior claimed hash ${claimed} does not recompute to ${recomputed}`
    );
  }
  const receiptsRecompute = algorithmReceiptsRecompute(algorithms);
  if (!receiptsRecompute) {
    throw new ReleaseCertificateError(
      'ALGORITHM_RECEIPT_HASH_MISMATCH',
      'At least one algorithm behavior receipt hash does not recompute'
    );
  }
  return {
    evidence_path: relativePath,
    evidence_file_sha256: sha256(bytes),
    evidence_claimed_hash: claimed,
    algorithm_count: algorithmCount,
    positive_case_count: positive.count,
    negative_case_count: negative.count,
    invariant_case_count: invariant.count,
    all_positive_passed: positive.allExpected,
    all_negative_failed_correctly: negative.allExpected,
    all_invariants_passed: invariant.allExpected,
    all_algorithm_receipts_recompute: receiptsRecompute,
  };
}

function walkFiles(root: string, current = root): string[] {
  if (!fs.existsSync(current)) return [];
  const files: string[] = [];
  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    const absolute = path.join(current, entry.name);
    if (entry.isDirectory()) files.push(...walkFiles(root, absolute));
    else if (entry.isFile()) files.push(absolute);
  }
  return files.sort((left, right) => {
    const leftRelative = relativeUnix(root, left);
    const rightRelative = relativeUnix(root, right);
    return leftRelative < rightRelative ? -1 : leftRelative > rightRelative ? 1 : 0;
  });
}

function collectExamples(rootDir: string): ReleaseCertificateV2['examples'] {
  const relativeRoot = 'examples/out';
  const absoluteRoot = path.resolve(rootDir, relativeRoot);
  const files = walkFiles(absoluteRoot).map((absolute) => {
    const bytes = fs.readFileSync(absolute);
    return {
      path: relativeUnix(absoluteRoot, absolute),
      size: bytes.length,
      sha256: sha256(bytes),
    };
  });
  if (files.length === 0) {
    throw new ReleaseCertificateError(
      'EXAMPLE_EVIDENCE_MISSING',
      'examples/out contains no executed example evidence'
    );
  }
  return {
    root: relativeRoot,
    file_count: files.length,
    manifest_hash: sha256(canonicalJson(files)),
    files,
  };
}

function readTarEntry(tarball: Buffer, wantedPath: string): Buffer {
  const tar = gunzipSync(tarball);
  let offset = 0;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const rawName = header.subarray(0, 100).toString('utf8').replace(/\0.*$/s, '');
    const rawPrefix = header.subarray(345, 500).toString('utf8').replace(/\0.*$/s, '');
    const entryPath = rawPrefix ? `${rawPrefix}/${rawName}` : rawName;
    const sizeText = header.subarray(124, 136).toString('ascii').replace(/\0.*$/s, '').trim();
    const size = Number.parseInt(sizeText || '0', 8);
    if (!Number.isFinite(size) || size < 0) {
      throw new ReleaseCertificateError('INVALID_TARBALL', `Invalid tar entry size for ${entryPath}`);
    }
    const bodyStart = offset + 512;
    const bodyEnd = bodyStart + size;
    if (bodyEnd > tar.length) {
      throw new ReleaseCertificateError('INVALID_TARBALL', `Truncated tar entry ${entryPath}`);
    }
    if (entryPath === wantedPath) return tar.subarray(bodyStart, bodyEnd);
    offset = bodyStart + Math.ceil(size / 512) * 512;
  }
  throw new ReleaseCertificateError(
    'PACKED_PACKAGE_IDENTITY_MISSING',
    `${wantedPath} is absent from the npm tarball`
  );
}

function collectPackageArtifact(
  rootDir: string,
  name: string,
  version: string
): ReleaseCertificateV2['package_artifact'] {
  const tarballName = `${name.replace(/^@/, '').replace(/\//g, '-')}-${version}.tgz`;
  const tarballRelative = `artifacts/release/npm/${tarballName}`;
  const tarballPath = requireFile(rootDir, tarballRelative, 'NPM_TARBALL_MISSING');
  const tarball = fs.readFileSync(tarballPath);
  const packedPackageJson = asRecord(
    JSON.parse(readTarEntry(tarball, 'package/package.json').toString('utf8')),
    'packed package/package.json'
  );
  const packedName = asString(packedPackageJson.name, 'packed package name');
  const packedVersion = asString(packedPackageJson.version, 'packed package version');
  if (packedName !== name || packedVersion !== version) {
    throw new ReleaseCertificateError(
      'PACKED_PACKAGE_IDENTITY_MISMATCH',
      `Tarball contains ${packedName}@${packedVersion}, expected ${name}@${version}`
    );
  }

  const wasmRelative = 'wasm4pm/pkg/wasm4pm_bg.wasm';
  const wasmPath = requireFile(rootDir, wasmRelative, 'WASM_BUNDLE_MISSING');
  const wasm = fs.readFileSync(wasmPath);
  if (wasm.length === 0) {
    throw new ReleaseCertificateError('WASM_BUNDLE_EMPTY', `${wasmRelative} is empty`);
  }

  return {
    tarball_path: tarballRelative,
    tarball_name: tarballName,
    tarball_size: tarball.length,
    tarball_sha1: sha1(tarball),
    tarball_sha256: sha256(tarball),
    tarball_integrity: sha512Integrity(tarball),
    packed_package_name: packedName,
    packed_package_version: packedVersion,
    wasm_bundle_path: wasmRelative,
    wasm_bundle_size: wasm.length,
    wasm_bundle_sha256: sha256(wasm),
  };
}

function unsignedCertificate(certificate: ReleaseCertificateV2): ReleaseCertificateV2 {
  return {
    ...certificate,
    certificate: { algorithm: 'sha256', hash: '' },
  };
}

export function computeCertificateHash(certificate: ReleaseCertificateV2): string {
  return sha256(canonicalJson(unsignedCertificate(certificate)));
}

export function buildReleaseCertificate(rootDir = process.cwd()): ReleaseCertificateV2 {
  const root = path.resolve(rootDir);
  const pkg = packageIdentity(root);
  const gitCommit = currentCommit(root);
  const draft: ReleaseCertificateV2 = {
    schema_version: RELEASE_CERTIFICATE_SCHEMA,
    package: {
      name: pkg.name,
      version: pkg.version,
      git_commit: gitCommit,
      package_json_path: relativeUnix(root, pkg.packagePath),
      package_json_sha256: pkg.packageHash,
    },
    reachability: collectReachability(root, pkg.version),
    behavior: collectBehavior(root, pkg.version, gitCommit),
    examples: collectExamples(root),
    package_artifact: collectPackageArtifact(root, pkg.name, pkg.version),
    generated_at: commitTimestamp(root),
    certificate: { algorithm: 'sha256', hash: '' },
  };
  return {
    ...draft,
    certificate: { algorithm: 'sha256', hash: computeCertificateHash(draft) },
  };
}

const INVALID_MARKERS = new Set([
  '...',
  'placeholder',
  'verified_via_gate',
  'calculated_at_runtime',
  'assume success',
  'stub',
  'fake',
  'not_found',
  'wasm_not_found',
  'integrity_not_found',
  'empty_examples',
]);

function findInvalidMarkers(value: unknown, found = new Set<string>()): Set<string> {
  if (typeof value === 'string') {
    const normalized = value.toLowerCase();
    for (const marker of INVALID_MARKERS) {
      if (normalized === marker || normalized.includes(marker)) found.add(marker);
    }
  } else if (Array.isArray(value)) {
    for (const child of value) findInvalidMarkers(child, found);
  } else if (value && typeof value === 'object') {
    for (const child of Object.values(value as Record<string, unknown>)) {
      findInvalidMarkers(child, found);
    }
  }
  return found;
}

function compareSection(
  issues: ReleaseCertificateIssue[],
  name: keyof ReleaseCertificateV2,
  actual: unknown,
  expected: unknown
): void {
  if (canonicalJson(actual) !== canonicalJson(expected)) {
    issues.push({
      code: `${String(name).toUpperCase()}_BINDING_MISMATCH`,
      message: `Certificate ${String(name)} section does not match current disk evidence`,
    });
  }
}

export function verifyReleaseCertificate(rootDir = process.cwd()): ReleaseCertificateVerification {
  const root = path.resolve(rootDir);
  let pkg: ReturnType<typeof packageIdentity>;
  try {
    pkg = packageIdentity(root);
  } catch (error) {
    return {
      valid: false,
      certificate_path: 'UNKNOWN',
      issues: [
        {
          code: error instanceof ReleaseCertificateError ? error.code : 'PACKAGE_IDENTITY_FAILED',
          message: error instanceof Error ? error.message : String(error),
        },
      ],
    };
  }
  const relativeCertificatePath = `RELEASE_CERTIFICATE.v${pkg.version}.json`;
  const absoluteCertificatePath = path.resolve(root, relativeCertificatePath);
  if (!fs.existsSync(absoluteCertificatePath)) {
    return {
      valid: false,
      certificate_path: relativeCertificatePath,
      issues: [
        {
          code: 'RELEASE_CERTIFICATE_MISSING',
          message: `Required certificate is missing: ${relativeCertificatePath}`,
        },
      ],
    };
  }

  let actual: ReleaseCertificateV2;
  try {
    actual = readJsonFile(absoluteCertificatePath) as unknown as ReleaseCertificateV2;
  } catch (error) {
    return {
      valid: false,
      certificate_path: relativeCertificatePath,
      issues: [
        {
          code: error instanceof ReleaseCertificateError ? error.code : 'CERTIFICATE_PARSE_FAILED',
          message: error instanceof Error ? error.message : String(error),
        },
      ],
    };
  }

  const issues: ReleaseCertificateIssue[] = [];
  if (actual.schema_version !== RELEASE_CERTIFICATE_SCHEMA) {
    issues.push({
      code: 'RELEASE_CERTIFICATE_SCHEMA_UNSUPPORTED',
      message: `Expected ${RELEASE_CERTIFICATE_SCHEMA}, found ${String(actual.schema_version)}`,
    });
  }
  const invalidMarkers = [...findInvalidMarkers(actual)].sort();
  if (invalidMarkers.length > 0) {
    issues.push({
      code: 'RELEASE_CERTIFICATE_PLACEHOLDER_REFUSED',
      message: `Certificate contains invalid marker(s): ${invalidMarkers.join(', ')}`,
    });
  }
  if (!actual.certificate || actual.certificate.algorithm !== 'sha256') {
    issues.push({
      code: 'RELEASE_CERTIFICATE_HASH_ALGORITHM_UNSUPPORTED',
      message: 'Certificate must use sha256 self-hashing',
    });
  } else if (computeCertificateHash(actual) !== actual.certificate.hash) {
    issues.push({
      code: 'RELEASE_CERTIFICATE_SELF_HASH_MISMATCH',
      message: 'Certificate self-hash does not recompute',
    });
  }

  let expected: ReleaseCertificateV2 | undefined;
  try {
    expected = buildReleaseCertificate(root);
  } catch (error) {
    issues.push({
      code: error instanceof ReleaseCertificateError ? error.code : 'RELEASE_EVIDENCE_RECOMPUTE_FAILED',
      message: error instanceof Error ? error.message : String(error),
    });
  }

  if (expected) {
    compareSection(issues, 'package', actual.package, expected.package);
    compareSection(issues, 'reachability', actual.reachability, expected.reachability);
    compareSection(issues, 'behavior', actual.behavior, expected.behavior);
    compareSection(issues, 'examples', actual.examples, expected.examples);
    compareSection(
      issues,
      'package_artifact',
      actual.package_artifact,
      expected.package_artifact
    );
    compareSection(issues, 'generated_at', actual.generated_at, expected.generated_at);
    if (actual.certificate?.hash !== expected.certificate.hash) {
      issues.push({
        code: 'RELEASE_CERTIFICATE_EXPECTED_HASH_MISMATCH',
        message: 'Certificate hash does not bind the current exact artifact graph',
      });
    }
  }

  return {
    valid: issues.length === 0,
    certificate_path: relativeCertificatePath,
    certificate_hash: actual.certificate?.hash,
    git_commit: actual.package?.git_commit,
    issues,
  };
}

export function atomicWriteJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temporary, filePath);
}
