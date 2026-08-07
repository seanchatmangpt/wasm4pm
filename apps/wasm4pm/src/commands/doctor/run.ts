// Shared check runner and publish checks
import { existsSync, readFileSync, statSync } from 'fs';
import { execSync } from 'child_process';
import * as path from 'path';
import { emitResult, makeResult, ConsoleProjection } from '../../output.js';
import { EXIT_CODES } from '../../exit-codes.js';
import { exitWithFlush } from '../../otel/exit.js';
import { withSpan } from '../_otel.js';
import type { Diagnosis, DoctorReport } from './types.js';
import { printReportToProjection } from './render.js';

// ────────────────────────────────────────────────────────────────────────────
// Shared check runner — builds CommandResult and emits via canonical path
// ────────────────────────────────────────────────────────────────────────────

/**
 * Canonical envelope payload shape:
 * { checks: Diagnosis[], summary: { pass, warn, fail, critical }, healthy: boolean, ...extraFields }
 * All subcommands using runChecks inherit this shape.
 */
export async function runChecks(
  checks: Array<() => Promise<Diagnosis>>,
  format: 'json' | 'human',
  verbose: boolean,
  quiet: boolean,
  extraFields?: Record<string, unknown>,
  precomputedDiagnoses?: Diagnosis[],
  commandName: string = 'doctor'
): Promise<DoctorReport> {
  let latePass = 0;
  let lateWarn = 0;
  let lateFail = 0;
  let lateHealthy = false;

  return withSpan(
    commandName,
    { check_count: precomputedDiagnoses?.length ?? checks.length, format },
    async () => {
      const start = Date.now();
      const diagnoses: Diagnosis[] =
        precomputedDiagnoses ?? (await Promise.all(checks.map((fn) => fn())));

      const report: DoctorReport = {
        diagnoses,
        info: diagnoses.filter((c) => c.severity === 'INFO').length,
        warnings: diagnoses.filter((c) => c.severity === 'WARNING').length,
        stopTheLine: diagnoses.filter((c) => c.severity === 'STOP_THE_LINE').length,
        epistemicHealth: diagnoses.every((c) => c.severity !== 'STOP_THE_LINE'),
      };
      latePass = report.info;
      lateWarn = report.warnings;
      lateFail = report.stopTheLine;
      lateHealthy = report.epistemicHealth;

      // Normalize each check to include `id`, `label`, and `status` fields
      // so JSON consumers have a stable, spec-compliant shape.
      // id   = diag.name (used as canonical identifier)
      // label = human-readable display name (same as name unless prefixed with a dot-id)
      // status = 'pass' | 'warn' | 'fail' derived from severity
      const severityToStatus = (s: Diagnosis['severity']): 'pass' | 'warn' | 'fail' =>
        s === 'INFO' ? 'pass' : s === 'WARNING' ? 'warn' : 'fail';
      const checksPayload = report.diagnoses.map((c) => ({
        ...c,
        id: c.name,
        label: c.name,
        status: severityToStatus(c.severity),
      }));
      const summaryPayload = {
        pass: report.info,
        warn: report.warnings,
        fail: report.stopTheLine,
        critical: report.stopTheLine,
      };

      const payload = {
        checks: checksPayload,
        summary: summaryPayload,
        healthy: report.epistemicHealth,
        total: checksPayload.length,
        ...extraFields,
      };

      const exitCode = report.epistemicHealth ? EXIT_CODES.success : EXIT_CODES.config_error;
      const result = makeResult(commandName, payload, Date.now() - start, exitCode);

      emitResult(result, { format, verbose, quiet }, (_res, p) => {
        printReportToProjection(p, report);
      });

      // Exit immediately to prevent parent main.run() from emitting trailing help text.
      return await exitWithFlush(exitCode);
    },
    () => ({
      checks_pass: latePass,
      checks_warn: lateWarn,
      checks_fail: lateFail,
      healthy: lateHealthy,
    })
  ); // end withSpan
}

// ────────────────────────────────────────────────────────────────────────────
// Safe-to-auto-execute fix prefixes
// ────────────────────────────────────────────────────────────────────────────

export function isAutoExecutable(fixCmd: string): boolean {
  const safePrefixes = ['pnpm install', 'mkdir -p', 'pnpm prepare', 'cd wasm4pm && pnpm run build'];
  return safePrefixes.some((prefix) => fixCmd.startsWith(prefix));
}

// ────────────────────────────────────────────────────────────────────────────
// Publish checks (used by doctorPublish)
// ────────────────────────────────────────────────────────────────────────────

export interface PublishCheck {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  message: string;
}

export function runPublishChecks(rootDir: string): PublishCheck[] {
  const checks: PublishCheck[] = [];

  // 1. Versions — all package.json must match CalVer /^\d+\.\d+\.\d+[a-z]?$/
  const calverPattern = /^\d+\.\d+\.\d+[a-z]?$/;
  const pkgDirs = [
    ...[
      'engine',
      'kernel',
      'config',
      'contracts',
      'planner',
      'observability',
      'testing',
      'ml',
      'swarm',
    ].map((p) => path.join(rootDir, 'packages', p)),
    path.join(rootDir, 'apps', 'wasm4pm'),
  ];

  const versionIssues: string[] = [];
  for (const dir of pkgDirs) {
    const pkgJsonPath = path.join(dir, 'package.json');
    if (!existsSync(pkgJsonPath)) continue;
    try {
      const raw = readFileSync(pkgJsonPath, 'utf-8');
      const pkg = JSON.parse(raw) as { version?: string; name?: string };
      if (!pkg.version || !calverPattern.test(pkg.version)) {
        versionIssues.push(`${pkg.name ?? path.basename(dir)}: ${pkg.version ?? 'missing'}`);
      }
    } catch {
      // ignore
    }
  }
  checks.push({
    name: 'versions',
    status: versionIssues.length === 0 ? 'pass' : 'fail',
    message:
      versionIssues.length === 0
        ? 'All packages have valid CalVer versions'
        : `Invalid versions: ${versionIssues.join(', ')}`,
  });

  // 2. Artifacts — for publishable packages (build script, not private), dist/ exists
  const artifactIssues: string[] = [];
  for (const dir of pkgDirs) {
    const pkgJsonPath = path.join(dir, 'package.json');
    if (!existsSync(pkgJsonPath)) continue;
    try {
      const raw = readFileSync(pkgJsonPath, 'utf-8');
      const pkg = JSON.parse(raw) as {
        private?: boolean;
        scripts?: Record<string, string>;
        name?: string;
      };
      if (!pkg.private && pkg.scripts?.build) {
        const distDir = path.join(dir, 'dist');
        if (!existsSync(distDir)) {
          artifactIssues.push(`${pkg.name ?? path.basename(dir)}: dist/ missing`);
        } else {
          try {
            const entries = readFileSync(distDir);
            void entries;
          } catch {
            // dist exists but check it's a directory
            try {
              const stat = statSync(distDir);
              if (!stat.isDirectory()) {
                artifactIssues.push(`${pkg.name ?? path.basename(dir)}: dist/ is not a directory`);
              }
            } catch {
              // ignore
            }
          }
        }
      }
    } catch {
      // ignore
    }
  }
  checks.push({
    name: 'artifacts',
    status: artifactIssues.length === 0 ? 'pass' : 'fail',
    message:
      artifactIssues.length === 0
        ? 'All publishable packages have dist/ directories'
        : `Missing artifacts: ${artifactIssues.join(', ')}`,
  });

  // 3. files-field — every publishable package has a files array
  const filesIssues: string[] = [];
  for (const dir of pkgDirs) {
    const pkgJsonPath = path.join(dir, 'package.json');
    if (!existsSync(pkgJsonPath)) continue;
    try {
      const raw = readFileSync(pkgJsonPath, 'utf-8');
      const pkg = JSON.parse(raw) as {
        private?: boolean;
        files?: unknown[];
        name?: string;
      };
      if (!pkg.private && (!pkg.files || !Array.isArray(pkg.files) || pkg.files.length === 0)) {
        filesIssues.push(pkg.name ?? path.basename(dir));
      }
    } catch {
      // ignore
    }
  }
  checks.push({
    name: 'files-field',
    status: filesIssues.length === 0 ? 'pass' : 'warn',
    message:
      filesIssues.length === 0
        ? 'All publishable packages have a files field'
        : `Missing files field: ${filesIssues.join(', ')}`,
  });

  // 4. no-private-leakage — @wasm4pm/* packages should not be private: true
  const privateLeakIssues: string[] = [];
  for (const dir of pkgDirs) {
    const pkgJsonPath = path.join(dir, 'package.json');
    if (!existsSync(pkgJsonPath)) continue;
    try {
      const raw = readFileSync(pkgJsonPath, 'utf-8');
      const pkg = JSON.parse(raw) as { private?: boolean; name?: string };
      if (pkg.name?.startsWith('@wasm4pm/') && pkg.private === true) {
        privateLeakIssues.push(pkg.name);
      }
    } catch {
      // ignore
    }
  }
  checks.push({
    name: 'no-private-leakage',
    status: privateLeakIssues.length === 0 ? 'pass' : 'fail',
    message:
      privateLeakIssues.length === 0
        ? 'No @wasm4pm/* packages are marked private'
        : `Private packages: ${privateLeakIssues.join(', ')}`,
  });

  // 5. registry — npm ping succeeds
  let registryStatus: 'pass' | 'warn' = 'pass';
  let registryMsg = 'npm registry is reachable';
  try {
    execSync('npm ping', { encoding: 'utf8', stdio: 'pipe', timeout: 3000 });
  } catch {
    registryStatus = 'warn';
    registryMsg = 'npm registry unreachable (network issue or timeout after 3s)';
  }
  checks.push({ name: 'registry', status: registryStatus, message: registryMsg });

  // 6. changelog — CHANGELOG.md exists and is non-empty
  const changelogPath = path.join(rootDir, 'CHANGELOG.md');
  const hasChangelog =
    existsSync(changelogPath) && readFileSync(changelogPath, 'utf-8').trim().length > 0;
  checks.push({
    name: 'changelog',
    status: hasChangelog ? 'pass' : 'warn',
    message: hasChangelog
      ? 'CHANGELOG.md exists and is non-empty'
      : 'CHANGELOG.md missing or empty',
  });

  return checks;
}

// Re-export ConsoleProjection for convenience in subcommands
export { ConsoleProjection };
