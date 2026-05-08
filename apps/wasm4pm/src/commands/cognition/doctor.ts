import { defineCommand } from 'citty';
import { spawn as nodeSpawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import * as path from 'node:path';
import * as url from 'node:url';
import { EXIT_CODES } from '../../exit-codes.js';
import { emitCognitionSpan } from './_shared.js';

/** Injectable spawn function — tests supply a fake to avoid real bash invocations. */
export type SpawnFn = (cmd: string, args: string[], opts: object) => ChildProcess;

// ── Path resolution ───────────────────────────────────────────────────────────
//
// When the CLI runs from dist/commands/cognition/doctor.js, __dirname is
// apps/wasm4pm/dist/commands/cognition.  The script lives at:
//   <workspace-root>/crates/wasm4pm-cognition/scripts/cognition-doctor.json.sh
//
// We walk up from __dirname: cognition → commands → dist → apps/wasm4pm →
// apps → <workspace-root>.

/** Derives the absolute path to `cognition-doctor.json.sh` relative to the compiled binary. */
export function resolveScriptPath(): string {
  const __filename = url.fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  // From dist/commands/cognition: up 3 = apps/wasm4pm, up 2 more = workspace root
  const workspaceRoot = path.resolve(__dirname, '..', '..', '..', '..', '..');
  return path.join(
    workspaceRoot,
    'crates',
    'wasm4pm-cognition',
    'scripts',
    'cognition-doctor.json.sh'
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DoctorCheck {
  id: number;
  name: string;
  status: 'ok' | 'fail';
  detail: string;
  duration_ms: number;
}

export interface DoctorSummary {
  passed: number;
  failed: number;
  total: number;
  duration_ms: number;
}

export interface DoctorReport {
  doctor_version: number;
  checks: DoctorCheck[];
  summary: DoctorSummary;
}

// ── ANSI helpers ──────────────────────────────────────────────────────────────

const NO_COLOR = process.env['NO_COLOR'] !== undefined;

function color(code: string, text: string): string {
  if (NO_COLOR) return text;
  return `\x1b[${code}m${text}\x1b[0m`;
}

const GREEN = (t: string) => color('32', t);
const RED = (t: string) => color('31', t);
const DIM = (t: string) => color('2', t);
const BOLD = (t: string) => color('1', t);

// ── Human renderer ────────────────────────────────────────────────────────────

function renderHuman(report: DoctorReport): void {
  const { checks, summary } = report;

  process.stdout.write(
    `\n${BOLD('─── Cognition Doctor ───')} ${DIM(`(${summary.duration_ms}ms)`)}\n\n`
  );

  for (const check of checks) {
    const icon = check.status === 'ok' ? GREEN('[✓]') : RED('[✗]');
    const nameField = `${check.id}. ${check.name}`;
    const padded = nameField.padEnd(52, ' ');
    const durationStr = DIM(`(${check.duration_ms}ms)`);
    process.stdout.write(`  ${icon} ${padded} ${durationStr}\n`);
    if (check.status === 'fail' && check.detail) {
      process.stdout.write(`       ${DIM('↳')} ${RED(check.detail)}\n`);
    }
  }

  const passLine =
    summary.failed === 0
      ? GREEN(`─── ${summary.passed}/${summary.total} passed ───`)
      : RED(`─── ${summary.passed}/${summary.total} passed ───`);

  process.stdout.write(`\n${passLine}\n\n`);
}

// ── Script executor ───────────────────────────────────────────────────────────

export function runDoctorScript(
  scriptPath: string,
  spawnFn: SpawnFn = nodeSpawn as unknown as SpawnFn
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';

    const child = spawnFn('bash', [scriptPath], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    child.stdout!.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr!.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });

    child.on('error', (err: NodeJS.ErrnoException) => {
      resolve({ exitCode: -1, stdout, stderr: err.message });
    });

    child.on('close', (code: number | null) => {
      resolve({ exitCode: code ?? 1, stdout, stderr });
    });
  });
}

// ── Core logic (exported for tests) ──────────────────────────────────────────

export interface RunDoctorOptions {
  format: 'human' | 'json';
  quiet: boolean;
  scriptPath?: string;
  spawnFn?: SpawnFn;
  /** OTEL span sink — injected by tests to capture the `cognition.doctor` span. */
  spanSink?: (span: import('@wasm4pm/cognition').OtelSpan) => void;
}

/**
 * Core logic for `wpm cognition doctor`. Spawns `cognition-doctor.json.sh`,
 * parses its JSON output, and emits a `cognition.doctor` OTEL span.
 * Exported so tests can inject `spawnFn` and `spanSink` without module mocking.
 */
export async function runDoctor(opts: RunDoctorOptions): Promise<void> {
  const { format, quiet } = opts;
  const scriptPath = opts.scriptPath ?? resolveScriptPath();
  const spawnFn = opts.spawnFn;
  const startNs = Date.now() * 1_000_000;
  const startMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
  let spanStatus: 'OK' | 'ERROR' = 'OK';
  let spanErrMsg: string | undefined;
  let finalExitCode: number = EXIT_CODES.success;

  const version = '26.4.23';

  function makeMeta() {
    return {
      run_id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      version,
    };
  }

  // ── 1. Spawn the JSON doctor script ────────────────────────────────────────
  // runDoctorScript always resolves (error event calls resolve, not reject)
  const spawnResult = await runDoctorScript(scriptPath, spawnFn);

  // ── 2. Handle spawn-level ENOENT (bash not found or script path wrong) ────
  if (spawnResult.exitCode === -1) {
    spanStatus = 'ERROR';
    spanErrMsg = `DOCTOR_SPAWN_FAILED: ${spawnResult.stderr}`;
    const envelope = {
      status: 'error',
      command: 'cognition doctor',
      error_code: 'DOCTOR_SPAWN_FAILED',
      message: `cognition-doctor.json.sh could not be invoked: ${spawnResult.stderr}`,
      meta: makeMeta(),
    };
    if (!quiet) {
      if (format === 'json') {
        process.stdout.write(JSON.stringify(envelope, null, 2) + '\n');
      } else {
        process.stderr.write(
          `${RED('[error]')} cognition-doctor.json.sh could not be invoked.\n  ${spawnResult.stderr}\n`
        );
      }
    }
    finalExitCode = EXIT_CODES.system_error;
    emitCognitionSpan(
      'doctor',
      startNs,
      (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startMs,
      spanStatus,
      spanErrMsg,
      opts.spanSink,
    );
    process.exit(finalExitCode);
  }

  // ── 3. Parse JSON output ───────────────────────────────────────────────────
  let report: DoctorReport;
  try {
    report = JSON.parse(spawnResult.stdout) as DoctorReport;
  } catch (parseErr) {
    spanStatus = 'ERROR';
    spanErrMsg = `DOCTOR_PARSE_FAILED: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`;
    const envelope = {
      status: 'error',
      command: 'cognition doctor',
      error_code: 'DOCTOR_PARSE_FAILED',
      message: `Could not parse doctor script output as JSON: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`,
      raw_output: spawnResult.stdout.slice(0, 512),
      meta: makeMeta(),
    };
    if (!quiet) {
      if (format === 'json') {
        process.stdout.write(JSON.stringify(envelope, null, 2) + '\n');
      } else {
        process.stderr.write(
          `${RED('[error]')} Could not parse cognition doctor output as JSON.\n`
        );
      }
    }
    finalExitCode = EXIT_CODES.execution_error;
    emitCognitionSpan(
      'doctor',
      startNs,
      (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startMs,
      spanStatus,
      spanErrMsg,
      opts.spanSink,
    );
    process.exit(finalExitCode);
  }

  // ── 4. Determine outcome ───────────────────────────────────────────────────
  const allPassed = report.summary.failed === 0;

  // ── 5. Emit output ─────────────────────────────────────────────────────────
  if (!quiet) {
    if (format === 'json') {
      const envelope = {
        status: allPassed ? 'success' : 'error',
        command: 'cognition doctor',
        ...(allPassed ? {} : { error_code: 'DOCTOR_CHECK_FAILED' }),
        message: allPassed
          ? `All ${report.summary.total} checks passed`
          : `${report.summary.failed} of ${report.summary.total} checks failed`,
        payload: {
          checks: report.checks,
          summary: report.summary,
        },
        meta: makeMeta(),
      };
      process.stdout.write(JSON.stringify(envelope, null, 2) + '\n');
    } else {
      renderHuman(report);
    }
  }

  // ── 6. Emit span + exit ────────────────────────────────────────────────────
  if (!allPassed) {
    spanStatus = 'ERROR';
    spanErrMsg = `${report.summary.failed} of ${report.summary.total} checks failed`;
  }
  finalExitCode = allPassed ? EXIT_CODES.success : EXIT_CODES.execution_error;
  emitCognitionSpan(
    'doctor',
    startNs,
    (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startMs,
    spanStatus,
    spanErrMsg,
    opts.spanSink,
  );
  process.exit(finalExitCode);
}

// ── Command definition ────────────────────────────────────────────────────────

export const doctor = defineCommand({
  meta: {
    name: 'doctor',
    description: '9-check cognition capability probe',
  },
  args: {
    format: {
      type: 'string',
      description: 'Output format: human (default) or json',
      default: 'human',
    },
    verbose: {
      type: 'boolean',
      alias: 'v',
      description: 'Show additional detail for passing checks',
    },
    quiet: {
      type: 'boolean',
      alias: 'q',
      description: 'Suppress all non-error output',
    },
  },
  async run(ctx) {
    await runDoctor({
      format: (ctx.args.format as string) === 'json' ? 'json' : 'human',
      quiet: ctx.args.quiet === true,
    });
  },
});
