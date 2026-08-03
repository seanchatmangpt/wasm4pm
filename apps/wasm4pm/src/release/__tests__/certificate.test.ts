import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';
import {
  atomicWriteJson,
  buildReleaseCertificate,
  canonicalJson,
  computeCertificateHash,
  sha256,
  verifyReleaseCertificate,
  type ReleaseCertificateV2,
} from '../certificate.js';

const roots: string[] = [];

function writeOctal(header: Buffer, offset: number, length: number, value: number): void {
  const encoded = value.toString(8).padStart(length - 1, '0').slice(-(length - 1));
  header.write(`${encoded}\0`, offset, length, 'ascii');
}

function tarballWithPackageJson(packageJson: string): Buffer {
  const body = Buffer.from(packageJson, 'utf8');
  const header = Buffer.alloc(512);
  header.write('package/package.json', 0, 100, 'utf8');
  writeOctal(header, 100, 8, 0o644);
  writeOctal(header, 108, 8, 0);
  writeOctal(header, 116, 8, 0);
  writeOctal(header, 124, 12, body.length);
  writeOctal(header, 136, 12, 0);
  header.fill(0x20, 148, 156);
  header.write('0', 156, 1, 'ascii');
  header.write('ustar\0', 257, 6, 'ascii');
  header.write('00', 263, 2, 'ascii');
  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  header.write(`${checksum.toString(8).padStart(6, '0')}\0 `, 148, 8, 'ascii');
  const padding = Buffer.alloc(Math.ceil(body.length / 512) * 512 - body.length);
  return gzipSync(Buffer.concat([header, body, padding, Buffer.alloc(1024)]));
}

function createFixture(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wasm4pm-release-certificate-'));
  roots.push(root);
  fs.mkdirSync(path.join(root, 'packages/kernel'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'packages/kernel/package.json'),
    `${JSON.stringify({ name: 'wasm4pm', version: '26.7.23' }, null, 2)}\n`
  );

  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: root });
  execFileSync('git', ['config', 'user.name', 'Release Test'], { cwd: root });
  execFileSync('git', ['add', 'packages/kernel/package.json'], { cwd: root });
  execFileSync('git', ['commit', '-qm', 'fixture'], {
    cwd: root,
    env: {
      ...process.env,
      GIT_AUTHOR_DATE: '2030-01-01T00:00:00Z',
      GIT_COMMITTER_DATE: '2030-01-01T00:00:00Z',
    },
  });
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();

  const releaseDir = path.join(root, 'artifacts/release');
  fs.mkdirSync(path.join(releaseDir, 'npm'), { recursive: true });
  fs.mkdirSync(path.join(root, 'examples/out'), { recursive: true });
  fs.mkdirSync(path.join(root, 'wasm4pm/pkg'), { recursive: true });

  const reachability: Record<string, unknown> = {
    package: 'wasm4pm',
    version: '26.7.23',
    generated_at: '2030-01-01T00:00:00.000Z',
    algorithm_count: 1,
    algorithms: [{ id: 'dfg', reachable: true }],
    reachability_hash: '',
  };
  reachability.reachability_hash = sha256(JSON.stringify(reachability));
  atomicWriteJson(
    path.join(releaseDir, 'ALGORITHM_REACHABILITY_EVIDENCE.v26.7.23.json'),
    reachability
  );

  const algorithm: Record<string, unknown> = {
    algorithm_id: 'dfg',
    positive_cases: [{ status: 'passed' }],
    negative_cases: [{ status: 'failed_correctly' }],
    invariant_cases: [{ status: 'passed' }],
    algorithm_evidence_hash: '',
  };
  algorithm.algorithm_evidence_hash = sha256(JSON.stringify(algorithm));
  const behavior: Record<string, unknown> = {
    package: 'wasm4pm',
    version: '26.7.23',
    git_commit: commit,
    generated_at: '2030-01-01T00:00:00.000Z',
    algorithm_count: 1,
    summary: {
      positive_cases: 1,
      negative_cases: 1,
      invariant_cases: 1,
      all_positive_passed: true,
      all_negative_failed_correctly: true,
      all_invariants_passed: true,
    },
    algorithms: [algorithm],
    behavior_evidence_hash: '',
  };
  behavior.behavior_evidence_hash = sha256(JSON.stringify(behavior));
  atomicWriteJson(
    path.join(releaseDir, 'ALGORITHM_BEHAVIOR_EVIDENCE.v26.7.23.json'),
    behavior
  );

  fs.writeFileSync(path.join(root, 'examples/out/dfg.receipt.json'), '{"status":"ALIVE"}\n');
  fs.writeFileSync(path.join(root, 'wasm4pm/pkg/wasm4pm_bg.wasm'), Buffer.from([0, 97, 115, 109]));
  fs.writeFileSync(
    path.join(releaseDir, 'npm/wasm4pm-26.7.23.tgz'),
    tarballWithPackageJson(JSON.stringify({ name: 'wasm4pm', version: '26.7.23' }))
  );
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('release certificate closure', () => {
  it('canonicalizes object keys deterministically', () => {
    expect(canonicalJson({ z: 1, a: { y: 2, b: 3 } })).toBe('{"a":{"b":3,"y":2},"z":1}');
  });

  it('recomputes the complete exact-artifact graph and rejects tampering', () => {
    const root = createFixture();
    const certificate = buildReleaseCertificate(root);
    const certificatePath = path.join(root, 'RELEASE_CERTIFICATE.v26.7.23.json');
    atomicWriteJson(certificatePath, certificate);

    expect(certificate.certificate.hash).toBe(computeCertificateHash(certificate));
    expect(verifyReleaseCertificate(root)).toMatchObject({ valid: true, issues: [] });

    fs.appendFileSync(path.join(root, 'wasm4pm/pkg/wasm4pm_bg.wasm'), Buffer.from([1]));
    const tampered = verifyReleaseCertificate(root);
    expect(tampered.valid).toBe(false);
    expect(tampered.issues.map((issue) => issue.code)).toContain(
      'PACKAGE_ARTIFACT_BINDING_MISMATCH'
    );
  });

  it('refuses a self-hash that does not bind certificate content', () => {
    const root = createFixture();
    const certificate = buildReleaseCertificate(root);
    const forged: ReleaseCertificateV2 = {
      ...certificate,
      package: { ...certificate.package, git_commit: '0'.repeat(40) },
    };
    atomicWriteJson(path.join(root, 'RELEASE_CERTIFICATE.v26.7.23.json'), forged);

    const verification = verifyReleaseCertificate(root);
    expect(verification.valid).toBe(false);
    expect(verification.issues.map((issue) => issue.code)).toContain(
      'RELEASE_CERTIFICATE_SELF_HASH_MISMATCH'
    );
  });
});
