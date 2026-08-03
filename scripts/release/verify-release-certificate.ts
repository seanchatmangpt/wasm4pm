import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  atomicWriteJson,
  buildReleaseCertificate,
  sha256,
  verifyReleaseCertificate,
} from '../../apps/wasm4pm/src/release/certificate.js';

interface PackageJson {
  readonly name: string;
  readonly version: string;
}

interface NpmPackMetadata {
  readonly filename?: string;
  readonly name?: string;
  readonly version?: string;
}

function readPackage(filePath: string): PackageJson {
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Partial<PackageJson>;
  if (!parsed.name || !parsed.version) {
    throw new Error(`${filePath} must declare name and version`);
  }
  return { name: parsed.name, version: parsed.version };
}

function gitIdentity(rootDir: string): { commit: string; timestamp: string } {
  return {
    commit: execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim(),
    timestamp: execFileSync('git', ['show', '-s', '--format=%cI', 'HEAD'], {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim(),
  };
}

function manufactureTarball(
  rootDir: string,
  kernelDir: string,
  artifactDir: string,
  pkg: PackageJson
): string {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wasm4pm-pack-'));
  try {
    const output = execFileSync(
      'npm',
      ['pack', '--json', '--pack-destination', tempDir],
      {
        cwd: kernelDir,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        maxBuffer: 8 * 1024 * 1024,
      }
    );
    const metadata = JSON.parse(output) as NpmPackMetadata[];
    const packed = metadata[0];
    if (!packed?.filename) throw new Error('npm pack did not return a tarball filename');
    if (packed.name && packed.name !== pkg.name) {
      throw new Error(`npm pack returned ${packed.name}; expected ${pkg.name}`);
    }
    if (packed.version && packed.version !== pkg.version) {
      throw new Error(`npm pack returned version ${packed.version}; expected ${pkg.version}`);
    }

    const source = path.join(tempDir, packed.filename);
    if (!fs.existsSync(source)) throw new Error(`npm pack did not create ${source}`);
    fs.mkdirSync(artifactDir, { recursive: true });
    const destination = path.join(artifactDir, packed.filename);
    fs.rmSync(destination, { force: true });
    fs.renameSync(source, destination);
    return path.relative(rootDir, destination).split(path.sep).join('/');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function main(): void {
  const rootDir = process.cwd();
  const kernelDir = path.join(rootDir, 'packages/kernel');
  const pkg = readPackage(path.join(kernelDir, 'package.json'));
  const git = gitIdentity(rootDir);
  const artifactDir = path.join(rootDir, 'artifacts/release/npm');
  const pendingPath = path.join(
    rootDir,
    `artifacts/release/RELEASE_CERTIFICATE.v${pkg.version}.pending.json`
  );
  const outcomePath = path.join(
    rootDir,
    `artifacts/release/RELEASE_CERTIFICATE.v${pkg.version}.outcome.json`
  );
  const certificatePath = path.join(rootDir, `RELEASE_CERTIFICATE.v${pkg.version}.json`);
  const runId = sha256(`${pkg.name}@${pkg.version}\n${git.commit}`).slice(0, 32);

  atomicWriteJson(pendingPath, {
    schema_version: 'wasm4pm.release-certificate-actuation.v1',
    receipt_kind: 'pending',
    run_id: runId,
    status: 'PENDING',
    package: `${pkg.name}@${pkg.version}`,
    git_commit: git.commit,
    intended_outputs: [
      `artifacts/release/npm/${pkg.name.replace(/^@/, '').replace(/\//g, '-')}-${pkg.version}.tgz`,
      path.basename(certificatePath),
    ],
    timestamp: git.timestamp,
  });

  try {
    const tarballPath = manufactureTarball(rootDir, kernelDir, artifactDir, pkg);
    const certificate = buildReleaseCertificate(rootDir);
    atomicWriteJson(certificatePath, certificate);

    const verification = verifyReleaseCertificate(rootDir);
    if (!verification.valid) {
      throw new Error(
        `Generated certificate failed replay: ${verification.issues
          .map((issue) => `${issue.code}: ${issue.message}`)
          .join('; ')}`
      );
    }

    atomicWriteJson(outcomePath, {
      schema_version: 'wasm4pm.release-certificate-actuation.v1',
      receipt_kind: 'outcome',
      run_id: runId,
      status: 'ALIVE',
      package: `${pkg.name}@${pkg.version}`,
      git_commit: git.commit,
      tarball_path: tarballPath,
      tarball_sha256: certificate.package_artifact.tarball_sha256,
      certificate_path: path.basename(certificatePath),
      certificate_hash: certificate.certificate.hash,
      timestamp: git.timestamp,
    });

    process.stdout.write(
      `${JSON.stringify(
        {
          status: 'ALIVE',
          certificate_path: path.basename(certificatePath),
          certificate_hash: certificate.certificate.hash,
          tarball_path: tarballPath,
          git_commit: git.commit,
        },
        null,
        2
      )}\n`
    );
  } catch (error) {
    atomicWriteJson(outcomePath, {
      schema_version: 'wasm4pm.release-certificate-actuation.v1',
      receipt_kind: 'outcome',
      run_id: runId,
      status: 'BLOCKED',
      package: `${pkg.name}@${pkg.version}`,
      git_commit: git.commit,
      error: error instanceof Error ? error.message : String(error),
      timestamp: git.timestamp,
    });
    throw error;
  }
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
}
