import {
  verifyReleaseCertificate,
  type ReleaseCertificateVerification,
} from '../../apps/wasm4pm/src/release/certificate.js';

function main(): void {
  const json = process.argv.includes('--json');
  const verification: ReleaseCertificateVerification = verifyReleaseCertificate(process.cwd());

  if (json) {
    process.stdout.write(`${JSON.stringify(verification, null, 2)}\n`);
  } else if (verification.valid) {
    process.stdout.write(
      `[PASS] ${verification.certificate_path} recomputed against exact package, commit, evidence, examples, tarball, and WASM artifacts.\n`
    );
    process.stdout.write(`       certificate_hash=${verification.certificate_hash}\n`);
    process.stdout.write(`       git_commit=${verification.git_commit}\n`);
  } else {
    process.stderr.write(`[FAIL] ${verification.certificate_path}\n`);
    for (const issue of verification.issues) {
      process.stderr.write(`       ${issue.code}: ${issue.message}\n`);
    }
  }

  if (!verification.valid) process.exitCode = 1;
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
}
