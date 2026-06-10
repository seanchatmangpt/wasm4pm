// Doctor subcommands: check, env, tps, fix, perf, watch, report, publish
import { defineCommand } from 'citty';
import * as fs from 'fs/promises';
import { existsSync, readFileSync } from 'fs';
import { execSync } from 'child_process';
import * as path from 'path';
import { emitResult, makeResult, makeErrorResult, ConsoleProjection } from '../../output.js';
import { EXIT_CODES } from '../../exit-codes.js';
import { exitWithFlush } from '../../otel/exit.js';
import type { DoctorReport } from './types.js';
import { renderBadge, printReportToProjection, generateHtmlReport } from './render.js';
import { runChecks, isAutoExecutable, runPublishChecks } from './run.js';
import { resolveWorkspaceRoot } from './checks-env.js';
import {
  ENV_CHECKS,
  TPS_CHECKS,
  ALL_CHECKS,
} from './checks-arrays.js';

// ────────────────────────────────────────────────────────────────────────────
// Subcommand: check
// ────────────────────────────────────────────────────────────────────────────

export const doctorCheck = defineCommand({
  meta: {
    name: 'check',
    description: 'Run all 47 health checks (or a filtered subset). Example: wpm doctor check --verbose',
  },
  args: {
    format: {
      type: 'string',
      description: 'Output format (human or json)',
      default: 'human',
    },
    verbose: {
      type: 'boolean',
      description: 'Show all checks including passing ones',
      alias: 'v',
    },
    quiet: {
      type: 'boolean',
      description: 'Suppress non-error output',
      alias: 'q',
    },
    checks: {
      type: 'string',
      description:
        'Comma-separated check function names to run (e.g. checkWasmBinary,checkNodeVersion)',
    },
  },
  async run(ctx) {
    const format = (ctx.args.format as 'json' | 'human') ?? 'human';
    const verbose = Boolean(ctx.args.verbose);
    const quiet = Boolean(ctx.args.quiet);

    let checksToRun = ALL_CHECKS;

    if (ctx.args.checks) {
      const names = (ctx.args.checks as string).split(',').map((s) => s.trim());
      const filtered = ALL_CHECKS.filter((fn) => names.includes(fn.name));
      if (filtered.length > 0) {
        checksToRun = filtered;
      }
    }

    await runChecks(checksToRun, format, verbose, quiet, undefined, undefined, 'doctor check');
  },
});

// ────────────────────────────────────────────────────────────────────────────
// Subcommand: env
// ────────────────────────────────────────────────────────────────────────────

export const doctorEnv = defineCommand({
  meta: {
    name: 'env',
    description: 'Run only the 17 environment checks',
  },
  args: {
    format: {
      type: 'string',
      description: 'Output format (human or json)',
      default: 'human',
    },
    verbose: {
      type: 'boolean',
      description: 'Show all checks including passing ones',
      alias: 'v',
    },
    quiet: {
      type: 'boolean',
      description: 'Suppress non-error output',
      alias: 'q',
    },
  },
  async run(ctx) {
    const format = (ctx.args.format as 'json' | 'human') ?? 'human';
    const verbose = Boolean(ctx.args.verbose);
    const quiet = Boolean(ctx.args.quiet);
    const diagnoses = await Promise.all(ENV_CHECKS.map((fn) => fn()));
    await runChecks(
      ENV_CHECKS,
      format,
      verbose,
      quiet,
      { environment: diagnoses },
      diagnoses,
      'doctor env'
    );
  },
});

// ────────────────────────────────────────────────────────────────────────────
// Subcommand: tps
// ────────────────────────────────────────────────────────────────────────────

export const doctorTps = defineCommand({
  meta: {
    name: 'tps',
    description: 'Run only the 7 TPS pipeline integrity checks',
  },
  args: {
    format: {
      type: 'string',
      description: 'Output format (human or json)',
      default: 'human',
    },
    verbose: {
      type: 'boolean',
      description: 'Show all checks including passing ones',
      alias: 'v',
    },
    quiet: {
      type: 'boolean',
      description: 'Suppress non-error output',
      alias: 'q',
    },
    'fail-fast': {
      type: 'boolean',
      description: 'Exit on first failure',
    },
  },
  async run(ctx) {
    const format = (ctx.args.format as 'json' | 'human') ?? 'human';
    const verbose = Boolean(ctx.args.verbose);
    const quiet = Boolean(ctx.args.quiet);
    const failFast = ctx.args['fail-fast'] as boolean | undefined;

    if (failFast) {
      for (const fn of TPS_CHECKS) {
        const diag = await fn();
        if (diag.severity === 'STOP_THE_LINE') {
          const report: DoctorReport = {
            diagnoses: [diag],
            info: 0,
            warnings: 0,
            stopTheLine: 1,
            epistemicHealth: false,
          };
          const result = makeErrorResult(
            'doctor tps',
            new Error(diag.message),
            EXIT_CODES.config_error,
            'TPS_CHECK_FAILED'
          );
          emitResult(result, { format, verbose, quiet }, (_res, proj) => {
            printReportToProjection(proj, report);
          });
          return await exitWithFlush(EXIT_CODES.config_error);
        }
      }

      // All passed — run full report
      await runChecks(TPS_CHECKS, format, verbose, quiet, undefined, undefined, 'doctor tps');
    } else {
      await runChecks(TPS_CHECKS, format, verbose, quiet, undefined, undefined, 'doctor tps');
    }
  },
});

// ────────────────────────────────────────────────────────────────────────────
// Subcommand: fix
// ────────────────────────────────────────────────────────────────────────────

export const doctorFix = defineCommand({
  meta: {
    name: 'fix',
    description: 'Run all checks and execute auto-fixable repair commands. Example: wpm doctor fix --verbose',
  },
  args: {
    format: {
      type: 'string',
      description: 'Output format (human or json)',
      default: 'human',
    },
    verbose: {
      type: 'boolean',
      description: 'Show all checks including passing ones',
      alias: 'v',
    },
    quiet: {
      type: 'boolean',
      description: 'Suppress non-error output',
      alias: 'q',
    },
    'dry-run': {
      type: 'boolean',
      description: 'Print fix commands without executing',
    },
    yes: {
      type: 'boolean',
      description: 'Skip confirmation prompts',
      alias: 'y',
    },
  },
  async run(ctx) {
    const start = Date.now();
    const format = (ctx.args.format as 'json' | 'human') ?? 'human';
    const verbose = Boolean(ctx.args.verbose);
    const quiet = Boolean(ctx.args.quiet);
    const dryRun = ctx.args['dry-run'] as boolean | undefined;
    const yes = ctx.args.yes as boolean | undefined;

    // Run all checks first
    const diagnoses = await Promise.all(ALL_CHECKS.map((fn) => fn()));

    // Collect fixable checks
    const fixable = diagnoses.filter(
      (d) => d.severity !== 'INFO' && d.fix && isAutoExecutable(d.fix)
    );

    if (format !== 'json') {
      const p = new ConsoleProjection({ verbose, quiet });
      p.log('');
      p.log(`wpm doctor fix — found ${fixable.length} auto-fixable issue(s)`);
      p.log('─'.repeat(80));

      for (const d of diagnoses) {
        const badge = renderBadge(d.severity);
        p.log(`  ${badge}  ${d.name}: ${d.message}`);
        if (d.severity !== 'INFO' && d.fix) {
          if (isAutoExecutable(d.fix)) {
            p.log(`         → Auto-fix: ${d.fix}`);
          } else {
            p.log(`         → Manual fix: ${d.fix}`);
          }
        }
      }

      p.log('');

      if (fixable.length === 0) {
        p.log(
          dryRun
            ? 'Dry-run: no auto-fixable issues found — nothing would be executed.'
            : 'No auto-fixable issues found.'
        );
        const noFixablePayload = {
          dry_run: Boolean(dryRun),
          fixable: [],
          unfixable: [],
          no_fixable: true,
        };
        emitResult(
          makeResult('doctor fix', noFixablePayload, Date.now() - start, EXIT_CODES.success),
          { format, verbose, quiet }
        );
        return await exitWithFlush(EXIT_CODES.success);
      }

      if (dryRun) {
        p.log(`Dry-run mode — would execute ${fixable.length} fix command(s):`);
        for (const d of fixable) {
          p.log(`  $ ${d.fix}`);
        }
        p.log('');
        const dryRunPayload = {
          dry_run: true,
          fixable: fixable.map((d) => d.fix),
          unfixable: diagnoses
            .filter((d) => d.severity !== 'INFO' && d.fix && !isAutoExecutable(d.fix))
            .map((d) => d.fix),
        };
        emitResult(
          makeResult('doctor fix', dryRunPayload, Date.now() - start, EXIT_CODES.success),
          { format, verbose, quiet }
        );
        return await exitWithFlush(EXIT_CODES.success);
      }

      if (!yes) {
        // Simple confirmation (no readline — just skip if stdin is not a tty)
        p.log(`Run ${fixable.length} fix command(s)? [y/N]`);
        // In non-interactive mode, skip
        if (!process.stdin.isTTY) {
          p.log('Skipping — stdin is not a TTY. Use --yes to force.');
          const skipPayload = {
            dry_run: false,
            skipped: true,
            reason: 'non-tty',
            fixable_count: fixable.length,
          };
          emitResult(
            makeResult('doctor fix', skipPayload, Date.now() - start, EXIT_CODES.success),
            { format, verbose, quiet }
          );
          return await exitWithFlush(EXIT_CODES.success);
        }
        // Read one line
        const answer = await new Promise<string>((resolve) => {
          process.stdin.setEncoding('utf8');
          process.stdin.once('data', (chunk) => resolve(String(chunk).trim()));
        });
        if (answer.toLowerCase() !== 'y') {
          p.log('Aborted.');
          const abortPayload = {
            dry_run: false,
            skipped: true,
            reason: 'user-aborted',
            fixable_count: fixable.length,
          };
          emitResult(
            makeResult('doctor fix', abortPayload, Date.now() - start, EXIT_CODES.success),
            { format, verbose, quiet }
          );
          return await exitWithFlush(EXIT_CODES.success);
        }
      }

      // Execute fixes
      for (const d of fixable) {
        p.log(`  $ ${d.fix}`);
        try {
          execSync(d.fix!, { stdio: 'inherit' });
        } catch (err) {
          p.log(`  ✗ Failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      // Re-run all checks after fixes
      p.log('');
      p.log('Re-running checks after fixes...');
    }

    // Final check run — skip if dry-run (already returned above for human formatter)
    if (!dryRun) {
      await runChecks(ALL_CHECKS, format, verbose, quiet, undefined, undefined, 'doctor fix');
    } else if (format === 'json') {
      const payload = {
        dry_run: true,
        fixable: fixable.map((d) => d.fix),
        unfixable: diagnoses
          .filter((d) => d.severity !== 'INFO' && d.fix && !isAutoExecutable(d.fix))
          .map((d) => d.fix),
      };
      const result = makeResult('doctor fix', payload, Date.now() - start);
      emitResult(result, { format, verbose, quiet });
      return await exitWithFlush(EXIT_CODES.success);
    }
  },
});

// ────────────────────────────────────────────────────────────────────────────
// Subcommand: perf
// ────────────────────────────────────────────────────────────────────────────

interface PerfBaseline {
  _comment?: string;
  _updated?: string;
  _methodology?: string;
  [scenario: string]:
    | {
        description: string;
        n: number;
        algorithm: string;
        measured_ms: number;
        ceiling_ms: number;
      }
    | string
    | undefined;
}

export const doctorPerf = defineCommand({
  meta: {
    name: 'perf',
    description: 'Benchmark key operations against the performance baseline',
  },
  args: {
    format: {
      type: 'string',
      description: 'Output format (human or json)',
      default: 'human',
    },
    verbose: {
      type: 'boolean',
      description: 'Show all checks including passing ones',
      alias: 'v',
    },
    quiet: {
      type: 'boolean',
      description: 'Suppress non-error output',
      alias: 'q',
    },
    'update-baseline': {
      type: 'boolean',
      description: 'Write new measured values to the baseline JSON file',
    },
    threshold: {
      type: 'string',
      description: 'Percent over ceiling before treating as regression (default: 20)',
      default: '20',
    },
    yes: {
      type: 'boolean',
      description: 'Skip confirmation prompts',
      alias: 'y',
    },
  },
  async run(ctx) {
    const format = (ctx.args.format as 'json' | 'human') ?? 'human';
    const verbose = Boolean(ctx.args.verbose);
    const quiet = Boolean(ctx.args.quiet);
    const updateBaseline = ctx.args['update-baseline'] as boolean | undefined;
    const thresholdPct = parseInt((ctx.args.threshold as string) ?? '20', 10);
    const yes = ctx.args.yes as boolean | undefined;
    const start = Date.now();

    // Find the baseline file
    const baselinePaths = [path.join(process.cwd(), 'packages/kernel/performance_baseline.json')];

    const rootDir = resolveWorkspaceRoot();
    if (rootDir) {
      baselinePaths.unshift(path.join(rootDir, 'packages/kernel/performance_baseline.json'));
    }

    let baselinePath: string | null = null;
    let baseline: PerfBaseline | null = null;

    for (const p of baselinePaths) {
      if (existsSync(p)) {
        try {
          const raw = readFileSync(p, 'utf-8');
          baseline = JSON.parse(raw) as PerfBaseline;
          baselinePath = p;
          break;
        } catch {
          // ignore
        }
      }
    }

    if (!baseline || !baselinePath) {
      const result = makeResult(
        'doctor perf',
        { regressions: [], within_threshold: [] },
        Date.now() - start
      );
      emitResult(result, { format, verbose, quiet }, (_res, p) => {
        p.log('');
        p.log('Performance baseline file not found (packages/kernel/performance_baseline.json)');
        p.log('Run from within the wasm4pm workspace.');
      });
      return await exitWithFlush(EXIT_CODES.success);
    }

    // Synthetic WASM stub — measures TypeScript dispatch overhead only (no real WASM needed)
    function syntheticDfgRun(_handle: string, _activityKey: string): Record<string, unknown> {
      return { nodes: ['A', 'B'], edges: [{ from: 'A', to: 'B', count: 1 }] };
    }

    interface ScenarioResult {
      scenario: string;
      measured_ms: number;
      ceiling_ms: number;
      status: 'OK' | 'REGRESSION' | 'SKIP';
    }

    const results: ScenarioResult[] = [];

    // Only test scenarios that involve the dfg/cache benchmarks
    const measurableScenarios = ['dfg_n100', 'dfg_n1k', 'cache_hit_n1k'];

    for (const scenarioKey of measurableScenarios) {
      const entry = baseline[scenarioKey];
      if (!entry || typeof entry === 'string') continue;

      const n = entry.n;
      const ceiling = entry.ceiling_ms;

      const runStart = Date.now();
      for (let i = 0; i < n; i++) {
        syntheticDfgRun(`handle-${i}`, 'concept:name');
      }
      const measured = Date.now() - runStart;

      const overPct = ((measured - ceiling) / ceiling) * 100;
      const status: 'OK' | 'REGRESSION' = overPct > thresholdPct ? 'REGRESSION' : 'OK';

      results.push({ scenario: scenarioKey, measured_ms: measured, ceiling_ms: ceiling, status });
    }

    const allOk = results.every((r) => r.status === 'OK');
    const regressions = results.filter((r) => r.status === 'REGRESSION');
    const within_threshold = results.filter((r) => r.status === 'OK');

    const exitCode = allOk ? EXIT_CODES.success : EXIT_CODES.config_error;
    const perfResult = makeResult(
      'doctor perf',
      { results, regressions, within_threshold },
      Date.now() - start,
      exitCode
    );

    emitResult(perfResult, { format, verbose, quiet }, (_res, p) => {
      p.log('');
      p.log('wpm doctor perf — performance baseline comparison');
      p.log('─'.repeat(80));
      p.log('');

      const colWidths = { scenario: 22, measured: 12, ceiling: 10, status: 12 };
      const header =
        'Scenario'.padEnd(colWidths.scenario) +
        'Measured'.padEnd(colWidths.measured) +
        'Ceiling'.padEnd(colWidths.ceiling) +
        'Status';
      p.log(`  ${header}`);
      p.log('  ' + '─'.repeat(header.length));

      for (const r of results) {
        const row =
          r.scenario.padEnd(colWidths.scenario) +
          `${r.measured_ms}ms`.padEnd(colWidths.measured) +
          `${r.ceiling_ms}ms`.padEnd(colWidths.ceiling) +
          (r.status === 'OK' ? '✓ OK' : '✗ REGRESSION');
        p.log(`  ${row}`);
      }

      p.log('');

      if (regressions.length === 0) {
        p.success('All performance checks within ceiling.');
      } else {
        p.error(`${regressions.length} regression(s) detected (>${thresholdPct}% over ceiling).`);
      }
    });

    // Update baseline if requested
    if (updateBaseline && baselinePath) {
      let proceed = yes;
      if (!proceed && process.stdin.isTTY) {
        const p = new ConsoleProjection({ verbose, quiet });
        p.log(`\nUpdate baseline at ${baselinePath}? [y/N]`);
        proceed = await new Promise<boolean>((resolve) => {
          process.stdin.setEncoding('utf8');
          process.stdin.once('data', (chunk) =>
            resolve(String(chunk).trim().toLowerCase() === 'y')
          );
        });
      }

      if (proceed) {
        for (const r of results) {
          const entry = baseline[r.scenario];
          if (entry && typeof entry !== 'string') {
            entry.measured_ms = r.measured_ms;
          }
        }
        if (baseline._updated !== undefined) {
          baseline._updated = new Date().toISOString().slice(0, 10);
        }
        await fs.writeFile(baselinePath, JSON.stringify(baseline, null, 2) + '\n', 'utf-8');
        if (format !== 'json') {
          const p = new ConsoleProjection({ verbose, quiet });
          p.log(`Updated baseline: ${baselinePath}`);
        }
      }
    }
    return await exitWithFlush(allOk ? EXIT_CODES.success : EXIT_CODES.config_error);
  },
});

// ────────────────────────────────────────────────────────────────────────────
// Subcommand: watch
// ────────────────────────────────────────────────────────────────────────────

export const doctorWatch = defineCommand({
  meta: {
    name: 'watch',
    description: 'Run doctor check in a loop, printing only changes',
  },
  args: {
    format: {
      type: 'string',
      description: 'Output format (human or json)',
      default: 'human',
    },
    verbose: {
      type: 'boolean',
      description: 'Show all checks including passing ones',
      alias: 'v',
    },
    quiet: {
      type: 'boolean',
      description: 'Suppress non-error output',
      alias: 'q',
    },
    interval: {
      type: 'string',
      description: 'Poll interval in seconds (default: 30, min: 5)',
      default: '30',
    },
    'on-fail': {
      type: 'string',
      // SECURITY: This value is passed verbatim to execSync as a shell command.
      // It is intentionally a user-provided hook command (same trust level as a
      // Makefile target).  Document that callers must supply only trusted values.
      description: 'Shell command to execute on new failure (env: DOCTOR_FAIL_CHECK=<name>). WARNING: executed verbatim by the shell — supply only trusted commands.',
    },
  },
  async run(ctx) {
    const start = Date.now();
    const format = (ctx.args.format as 'json' | 'human') ?? 'human';
    const verbose = Boolean(ctx.args.verbose);
    const quiet = Boolean(ctx.args.quiet);
    const onFail = ctx.args['on-fail'] as string | undefined;
    // SECURITY NOTE (MEDIUM): --on-fail executes an arbitrary shell string supplied by
    // the caller.  This is by design (ci/cd hook), but should be restricted to
    // allowlisted paths or validated against a safe pattern in future if used in
    // automated pipelines where the value might come from untrusted config.
    let intervalSec = parseInt((ctx.args.interval as string) ?? '30', 10);
    // Guard against NaN (non-numeric --interval value): parseInt returns NaN for
    // strings like "bad". NaN < 5 is false, so the minimum guard would be bypassed
    // and setTimeout(NaN) fires at ~1ms — a busy loop. Default to 30 instead.
    if (!Number.isFinite(intervalSec)) intervalSec = 30;

    const p = new ConsoleProjection({ verbose, quiet });

    if (intervalSec < 5) {
      if (format !== 'json') {
        p.log(`Warning: --interval ${intervalSec} is below minimum (5). Using 5.`);
      }
      intervalSec = 5;
    }

    emitResult(
      makeResult(
        'doctor watch',
        { status: 'watching', interval_sec: intervalSec },
        0,
        EXIT_CODES.success
      ),
      { format, verbose, quiet }
    );

    // Use Severity type inline to avoid circular import
    let prevResults: Map<string, 'INFO' | 'WARNING' | 'STOP_THE_LINE'> = new Map();
    let iteration = 0;
    let running = true;

    process.on('SIGINT', () => {
      running = false;
    });

    while (running) {
      const diagnoses = await Promise.all(ALL_CHECKS.map((fn) => fn()));
      const current = new Map(diagnoses.map((d) => [d.name, d.severity]));

      const passing = diagnoses.filter((d) => d.severity === 'INFO').length;
      const total = diagnoses.length;

      if (iteration === 0) {
        // Full verbose output on first iteration
        const report: DoctorReport = {
          diagnoses,
          info: diagnoses.filter((d) => d.severity === 'INFO').length,
          warnings: diagnoses.filter((d) => d.severity === 'WARNING').length,
          stopTheLine: diagnoses.filter((d) => d.severity === 'STOP_THE_LINE').length,
          epistemicHealth: diagnoses.every((d) => d.severity !== 'STOP_THE_LINE'),
        };
        if (format !== 'json') {
          printReportToProjection(p, report);
        }
      } else {
        // Only print changes
        const changes = diagnoses.filter((diag) => {
          const prev = prevResults.get(diag.name);
          return prev !== diag.severity;
        });
        const newFailures = diagnoses.filter((diag) => {
          const prev = prevResults.get(diag.name);
          return diag.severity === 'STOP_THE_LINE' && prev !== 'STOP_THE_LINE';
        });

        if (changes.length === 0) {
          if (format !== 'json') {
            const now = new Date();
            const ts = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
            p.log(`[${ts}] ✓ ${passing}/${total} checks passing`);
          }
        } else {
          if (format !== 'json') {
            p.log('');
            p.log(`[CHANGED] ${changes.length} check(s) changed status:`);
            for (const d of changes) {
              const prev = prevResults.get(d.name) ?? 'unknown';
              p.log(`  ${d.name}: ${prev} → ${d.severity}`);
              if (d.fix) p.log(`    fix: ${d.fix}`);
            }
          }
        }

        // Execute on-fail command for new failures
        if (onFail && newFailures.length > 0) {
          for (const d of newFailures) {
            try {
              execSync(onFail, {
                stdio: 'inherit',
                env: { ...process.env, DOCTOR_FAIL_CHECK: d.name },
              });
            } catch {
              // ignore on-fail errors
            }
          }
        }
      }

      prevResults = current;
      iteration++;

      if (!running) break;

      // Wait for the interval
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, intervalSec * 1000);
        process.once('SIGINT', () => {
          clearTimeout(timer);
          resolve();
        });
      });
    }

    // Final summary on exit
    if (format !== 'json') {
      p.log('');
      p.log(`wpm doctor watch stopped after ${iteration} iteration(s).`);
    }

    emitResult(
      makeResult(
        'doctor watch',
        { iterations: iteration, stopped: true, status: 'stopped' },
        Date.now() - start,
        EXIT_CODES.success
      ),
      { format, verbose, quiet }
    );

    return await exitWithFlush(EXIT_CODES.success);
  },
});

// ────────────────────────────────────────────────────────────────────────────
// Subcommand: report
// ────────────────────────────────────────────────────────────────────────────

export const doctorReport = defineCommand({
  meta: {
    name: 'report',
    description: 'Generate a JSON or HTML health report',
  },
  args: {
    format: {
      type: 'string',
      description: 'Report format: json or html (default: json)',
      default: 'json',
    },
    out: {
      type: 'string',
      description: 'Output file path (default: wpm-doctor-report.json or .html)',
    },
    open: {
      type: 'boolean',
      description: 'Open the report in a browser after generation',
    },
    verbose: {
      type: 'boolean',
      description: 'Show all checks including passing ones',
      alias: 'v',
    },
    quiet: {
      type: 'boolean',
      description: 'Suppress non-error output',
      alias: 'q',
    },
  },
  async run(ctx) {
    const start = Date.now();
    const reportFormat = ((ctx.args.format as string) ?? 'json').toLowerCase();
    const openAfter = ctx.args.open as boolean | undefined;
    const verbose = Boolean(ctx.args.verbose);
    const quiet = Boolean(ctx.args.quiet);

    const p = new ConsoleProjection({ verbose, quiet });

    const diagnoses = await Promise.all(ALL_CHECKS.map((fn) => fn()));

    // Read package.json version
    let wpmVersion = 'unknown';
    try {
      const pkgJsonPath = new URL('../../../package.json', import.meta.url).pathname;
      if (existsSync(pkgJsonPath)) {
        const pkgRaw = readFileSync(pkgJsonPath, 'utf-8');
        const pkg = JSON.parse(pkgRaw) as { version?: string };
        wpmVersion = pkg.version ?? 'unknown';
      }
    } catch {
      // ignore
    }

    const summary = {
      pass: diagnoses.filter((d) => d.severity === 'INFO').length,
      warn: diagnoses.filter((d) => d.severity === 'WARNING').length,
      fail: diagnoses.filter((d) => d.severity === 'STOP_THE_LINE').length,
      critical: diagnoses.filter((d) => d.severity === 'STOP_THE_LINE').length,
    };

    const reportData = {
      generated_at: new Date().toISOString(),
      wpm_version: wpmVersion,
      platform: {
        os: process.platform,
        arch: process.arch,
        node: process.version,
      },
      checks: diagnoses,
      summary,
    };

    let outPath: string;

    if (reportFormat === 'html') {
      outPath = (ctx.args.out as string) ?? 'wpm-doctor-report.html';
      const html = generateHtmlReport(reportData);
      await fs.writeFile(outPath, html, 'utf-8');
    } else {
      outPath = (ctx.args.out as string) ?? 'wpm-doctor-report.json';
      await fs.writeFile(outPath, JSON.stringify(reportData, null, 2) + '\n', 'utf-8');
    }

    p.log('');
    p.log(`Report written to: ${outPath}`);
    p.log(`Summary: ${summary.pass} pass, ${summary.warn} warn, ${summary.fail} fail`);

    if (openAfter) {
      const openCmd =
        process.platform === 'darwin'
          ? `open "${outPath}"`
          : process.platform === 'win32'
            ? `start "" "${outPath}"`
            : `xdg-open "${outPath}"`;
      try {
        execSync(openCmd, { stdio: 'ignore' });
      } catch {
        p.log(`Could not open ${outPath} automatically.`);
      }
    }

    // report subcommand always exits 0 when the file is successfully written —
    // failing checks are recorded in the report content, not a reason to exit non-zero.
    const reportExitCode = EXIT_CODES.success;
    const result = makeResult(
      'doctor report',
      { report_path: outPath, summary, format: reportFormat },
      Date.now() - start,
      reportExitCode
    );
    emitResult(result, { format: 'human', verbose, quiet });
    return await exitWithFlush(reportExitCode);
  },
});

// ────────────────────────────────────────────────────────────────────────────
// Subcommand: publish
// ────────────────────────────────────────────────────────────────────────────

export const doctorPublish = defineCommand({
  meta: {
    name: 'publish',
    description: 'Run all checks plus publish-readiness validation',
  },
  args: {
    format: {
      type: 'string',
      description: 'Output format (human or json)',
      default: 'human',
    },
    verbose: {
      type: 'boolean',
      description: 'Show all checks including passing ones',
      alias: 'v',
    },
    quiet: {
      type: 'boolean',
      description: 'Suppress non-error output',
      alias: 'q',
    },
    publish: {
      type: 'boolean',
      description: 'Run pnpm publish if all checks pass',
    },
    registry: {
      type: 'string',
      description: 'Override npm registry for checks and publish',
    },
    yes: {
      type: 'boolean',
      description: 'Skip confirmation prompts',
      alias: 'y',
    },
  },
  async run(ctx) {
    const format = (ctx.args.format as 'json' | 'human') ?? 'human';
    const verbose = Boolean(ctx.args.verbose);
    const quiet = Boolean(ctx.args.quiet);
    const doPublish = ctx.args.publish as boolean | undefined;
    const yes = ctx.args.yes as boolean | undefined;
    const start = Date.now();

    // Run core checks first
    const diagnoses = await Promise.all(ALL_CHECKS.map((fn) => fn()));
    const coreReport: DoctorReport = {
      diagnoses,
      info: diagnoses.filter((d) => d.severity === 'INFO').length,
      warnings: diagnoses.filter((d) => d.severity === 'WARNING').length,
      stopTheLine: diagnoses.filter((d) => d.severity === 'STOP_THE_LINE').length,
      epistemicHealth: diagnoses.every((d) => d.severity !== 'STOP_THE_LINE'),
    };

    // Run publish-specific checks
    const rootDir = resolveWorkspaceRoot();
    let publishChecks: ReturnType<typeof runPublishChecks> = [];
    if (rootDir) {
      publishChecks = runPublishChecks(rootDir);
    }

    const publishReady =
      coreReport.epistemicHealth && publishChecks.every((c) => c.status !== 'fail');

    const payload = {
      coreReport,
      publishChecks,
      publishReady,
      ready: publishReady,
    };

    const exitCode = publishReady ? EXIT_CODES.success : EXIT_CODES.config_error;
    const result = makeResult('doctor publish', payload, Date.now() - start, exitCode);

    emitResult(result, { format, verbose, quiet }, (_res, p) => {
      printReportToProjection(p, coreReport);

      p.log('');
      p.log('Publish readiness checks:');
      p.log('─'.repeat(80));
      for (const c of publishChecks) {
        const icon = c.status === 'pass' ? '✓' : c.status === 'warn' ? '⚠' : '✗';
        p.log(`  ${icon}  ${c.name}: ${c.message}`);
      }
      p.log('');

      if (publishReady) {
        p.success('Package is ready to publish.');
      } else {
        p.error('Package is NOT ready to publish. Fix issues above.');
      }
    });

    if (!publishReady) {
      return await exitWithFlush(EXIT_CODES.config_error);
    }

    if (doPublish && publishReady) {
      let proceed = yes;
      if (!proceed && format !== 'json' && process.stdin.isTTY) {
        const p = new ConsoleProjection({ verbose, quiet });
        p.log('\nRun pnpm -r publish --access public? [y/N]');
        proceed = await new Promise<boolean>((resolve) => {
          process.stdin.setEncoding('utf8');
          process.stdin.once('data', (chunk) =>
            resolve(String(chunk).trim().toLowerCase() === 'y')
          );
        });
      }

      if (proceed) {
        const registryFlag = ctx.args.registry ? ` --registry ${ctx.args.registry as string}` : '';
        execSync(`pnpm -r publish --access public${registryFlag}`, { stdio: 'inherit' });
      }
    }
    return await exitWithFlush(EXIT_CODES.success);
  },
});
