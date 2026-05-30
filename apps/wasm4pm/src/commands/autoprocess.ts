import { defineCommand } from 'citty';
import * as fs from 'fs/promises';
import * as fsp from 'node:fs/promises';
import * as path from 'path';
import { emitResult, makeResult, makeErrorResult } from '../output.js';
import { EXIT_CODES } from '../exit-codes.js';
import { withLogSession } from '../with-log-session.js';
import { withSpan, withSpanRaw } from './_otel.js';
import { getGlobalSpanSink } from '../otel/sink.js';
import { saveCommandReceipt, blake3Hex, newReceipt } from '../receipts/_shared.js';
import { exitWithFlush } from '../otel/exit.js';

const AUTOPROCESS_STATE_FILE = '.wasm4pm/autoprocess-state.json';

/**
 * Current schema version for autoprocess-state.json.
 *
 * Increment this constant whenever the persisted shape changes in a
 * backward-incompatible way.  On load, a version mismatch causes a
 * deliberate warning + fresh-start rather than silently feeding stale
 * data into the WASM layer.
 */
export const STATE_SCHEMA_VERSION = 2;

async function ensureStateDir() {
  try {
    const dir = path.dirname(AUTOPROCESS_STATE_FILE);
    await fs.mkdir(dir, { recursive: true });
  } catch {
    // Directory might already exist
  }
}

async function hashStateFile(stateFilePath: string): Promise<string> {
  try {
    return blake3Hex(await fsp.readFile(stateFilePath));
  } catch {
    return '0'.repeat(64); // cold-start sentinel; documented marker, not FM-5
  }
}

/**
 * Return true when `fn` is exported by the current WASM build.
 *
 * Several persistence functions are compiled only with the `cloud` feature
 * flag (serialize_rl_state, restore_rl_state, get_spc_history,
 * set_spc_history, circuit_breaker_get_state, circuit_breaker_set_state).
 * Calling an absent export throws "X is not a function"; this guard lets the
 * caller decide how to handle unavailability explicitly rather than letting the
 * error propagate into the outer catch block that also swallows ENOENT.
 */
function wasmHas(wasm: Record<string, unknown>, fn: string): boolean {
  return typeof wasm[fn] === 'function';
}

/**
 * Metrics snapshot captured at the end of each MAPE-K cycle.
 * Used to compute cross-cycle trend recommendations in the Learn phase.
 */
export interface CycleMetrics {
  healthScore: number;
  /** Number of SPC special causes / violations detected */
  violations: number;
  /** Drift level: 0=none, 1=low, 2=high */
  driftStatus: number;
  /** Process fitness score (0–1); -1 = unknown */
  fitness: number;
  /** Rework ratio (0–1); -1 = unknown */
  reworkRatio: number;
}

/**
 * Derive a one-line system-state narrative from the health scores of the last
 * (up to) 3 cycles.  Health score 0 = healthy, 4 = failed (matches WASM RL
 * state dimension `health_level`).
 *
 * Decision rules (domain contract, Rank-2):
 *  - Consistently improving: last score strictly lower than first score
 *    AND last score lower than middle score (monotone down over the window)
 *  - Degrading: last score strictly higher than first score
 *    AND last score higher than middle score (monotone up over the window)
 *  - Stable otherwise
 *
 * With fewer than 2 data points the trend is indeterminate → stable message.
 */
export function computeHealthNarrative(cycles: Array<{ healthScore: number }>): string {
  const window = cycles.slice(-3);
  if (window.length < 2) {
    return 'System stable — operating within normal bounds';
  }
  const first = window[0].healthScore;
  const last = window[window.length - 1].healthScore;
  // For a 3-point window check strict monotonicity; for 2 points just compare endpoints.
  const middle = window.length === 3 ? window[1].healthScore : undefined;
  const improving =
    last < first && (middle === undefined || (last < middle && middle <= first));
  const degrading =
    last > first && (middle === undefined || (last > middle && middle >= first));
  if (improving) {
    return 'System improving — autonomic agents converging on stable operating point';
  }
  if (degrading) {
    return 'System degrading — consider running wpm doctor';
  }
  return 'System stable — operating within normal bounds';
}

/**
 * Determine the trend over the last (up to) 3 cycles of detailed metrics.
 *
 * Returns 'improving' | 'degrading' | 'stable'.
 * Same monotonicity contract as computeHealthNarrative().
 */
export function computeHealthTrend(
  cycles: CycleMetrics[]
): 'improving' | 'degrading' | 'stable' {
  const window = cycles.slice(-3);
  if (window.length < 2) return 'stable';
  const first = window[0].healthScore;
  const last = window[window.length - 1].healthScore;
  const middle = window.length === 3 ? window[1].healthScore : undefined;
  const improving =
    last < first && (middle === undefined || (last < middle && middle <= first));
  const degrading =
    last > first && (middle === undefined || (last > middle && middle >= first));
  if (improving) return 'improving';
  if (degrading) return 'degrading';
  return 'stable';
}

/**
 * Build targeted Learn-phase recommendations based on the current cycle metrics
 * and the multi-cycle health trend.
 *
 * When health is degrading: surface the worst metric and its specific remedy.
 * When health is improving: report the metric that improved most.
 * Persistence check: 3+ consecutive degrading cycles → higher-severity warning.
 */
export function buildLearnRecommendations(
  current: CycleMetrics,
  history: CycleMetrics[],
  inputPath: string
): { actions: string[]; persistenceDegrading: boolean } {
  const trend = computeHealthTrend(history);
  const actions: string[] = [];

  // Persistence check — 3+ cycles all degrading (strictly monotone up)
  const persistenceDegrading =
    history.length >= 3 &&
    (() => {
      const w = history.slice(-3);
      return w[2].healthScore > w[1].healthScore && w[1].healthScore > w[0].healthScore;
    })();

  if (trend === 'degrading') {
    // Rank metrics by severity to surface the most critical recommendation first.
    // Lower fitness = worse; higher violations/rework = worse; drift > 0 = bad.
    const worstMetric = (() => {
      if (current.violations > 2) return 'violations';
      if (current.driftStatus > 0) return 'drift';
      if (current.fitness >= 0 && current.fitness < 0.8) return 'fitness';
      if (current.reworkRatio >= 0 && current.reworkRatio > 0.3) return 'rework';
      return 'general';
    })();

    switch (worstMetric) {
      case 'violations':
        actions.push(
          `Run \`wpm doctor --verbose\` — ${current.violations} SPC violation(s) detected (threshold: >2)`
        );
        break;
      case 'drift':
        actions.push(
          `Run \`wpm drift-watch -i ${inputPath} --window 100\` — drift level ${current.driftStatus === 2 ? 'HIGH' : 'LOW'} detected, monitor for further shift`
        );
        break;
      case 'fitness':
        actions.push(
          `Run \`wpm conformance -i ${inputPath}\` — process fitness ${current.fitness.toFixed(2)} is below threshold (0.80)`
        );
        break;
      case 'rework':
        actions.push(
          `Run \`wpm temporal -i ${inputPath}\` — rework ratio ${current.reworkRatio.toFixed(2)} exceeds threshold (0.30)`
        );
        break;
      default:
        actions.push('Run `wpm doctor` — health degraded during this cycle');
    }

    // Secondary: circuit-breaker check when not already the primary
    if (worstMetric !== 'violations' && current.violations > 0) {
      actions.push(
        `Run \`wpm doctor --verbose\` — ${current.violations} SPC violation(s) also active`
      );
    }
  } else if (trend === 'improving') {
    // Identify the metric that improved most between the first and last window entry.
    const prev = history.length >= 2 ? history[history.length - 2] : null;
    if (prev !== null) {
      const healthDelta = prev.healthScore - current.healthScore; // positive = improvement
      const violationDelta = prev.violations - current.violations;
      const fitnessDelta =
        prev.fitness >= 0 && current.fitness >= 0 ? current.fitness - prev.fitness : 0;

      if (healthDelta > 0 && healthDelta >= violationDelta && healthDelta >= fitnessDelta) {
        actions.push(
          `Health improved by ${healthDelta} level(s) — autonomic agents converging (health now ${current.healthScore}/4)`
        );
      } else if (violationDelta > 0) {
        actions.push(
          `SPC violations reduced by ${violationDelta} — process stabilising (${current.violations} remaining)`
        );
      } else if (fitnessDelta > 0) {
        actions.push(
          `Process fitness improved by +${fitnessDelta.toFixed(2)} — conformance improving (now ${current.fitness.toFixed(2)})`
        );
      } else {
        actions.push(
          'System improving — autonomic agents converging on stable operating point'
        );
      }
    } else {
      actions.push('System improving — autonomic agents converging on stable operating point');
    }
  }

  // Always: conformance check after autonomic changes
  actions.push(
    `Run \`wpm conformance -i ${inputPath}\` — verify process model quality after autonomic changes`
  );

  return { actions, persistenceDegrading };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadState(wasm: Record<string, any>): Promise<void> {
  let rawContent: string;
  try {
    rawContent = await fs.readFile(AUTOPROCESS_STATE_FILE, 'utf-8');
  } catch (err: unknown) {
    // ENOENT — state file does not yet exist.  This is the expected cold-start
    // path; start fresh without any warning.
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return;
    // Any other I/O error (permissions, device failure) is surfaced.
    console.warn(`[autoprocess] state file read error (${code ?? 'unknown'}): starting fresh`);
    return;
  }

  let state: Record<string, unknown>;
  try {
    state = JSON.parse(rawContent) as Record<string, unknown>;
  } catch {
    // The file exists but is not valid JSON — most likely a crash-truncated
    // write.  Warn the user so they know state was discarded, then start fresh.
    // DO NOT silently reset: an operator who sees this message can investigate
    // before a second crash wipes the circuit breaker's Open state.
    console.warn(
      `[autoprocess] state file is malformed (truncated crash?): discarding and starting fresh. ` +
        `Delete ${AUTOPROCESS_STATE_FILE} to suppress this warning.`
    );
    return;
  }

  // Schema version guard — reject states written by an incompatible version.
  // Missing version means the file was written before versioning was introduced
  // (pre-v2 schema had different top-level keys); treat as stale.
  const savedVersion = typeof state['version'] === 'number' ? state['version'] : 0;
  if (savedVersion !== STATE_SCHEMA_VERSION) {
    // Write a .bak file so the user can manually recover their state before it
    // is discarded.  Best-effort: backup failure must not block the cold-start.
    const backupPath = AUTOPROCESS_STATE_FILE + '.bak';
    try {
      await fs.copyFile(AUTOPROCESS_STATE_FILE, backupPath);
    } catch {
      // Backup failure is non-fatal — the warning below still surfaces the problem.
    }
    console.warn(
      `[autoprocess] State file at ${path.resolve(AUTOPROCESS_STATE_FILE)} was created with schema v${savedVersion}, ` +
        `current is v${STATE_SCHEMA_VERSION}. Starting with fresh state. ` +
        `Backup saved to ${path.resolve(backupPath)}`
    );
    return;
  }

  // Restore each component only when the corresponding WASM export exists.
  // The persistence functions are guarded by the `cloud` feature flag and are
  // absent in the default browser build — calling them would throw, and that
  // error must NOT fall through to the outer execution-error handler.
  if (state['rl_state'] && wasmHas(wasm, 'restore_rl_state')) {
    try {
      wasm['restore_rl_state'](JSON.stringify(state['rl_state']));
    } catch (e) {
      console.warn(`[autoprocess] restore_rl_state failed: ${(e as Error).message ?? e}`);
    }
  }

  if (state['spc_history'] && wasmHas(wasm, 'set_spc_history')) {
    try {
      wasm['set_spc_history'](JSON.stringify(state['spc_history']));
    } catch (e) {
      console.warn(`[autoprocess] set_spc_history failed: ${(e as Error).message ?? e}`);
    }
  }

  if (state['circuit_breaker_state'] && wasmHas(wasm, 'circuit_breaker_set_state')) {
    try {
      wasm['circuit_breaker_set_state'](JSON.stringify(state['circuit_breaker_state']));
    } catch (e) {
      console.warn(`[autoprocess] circuit_breaker_set_state failed: ${(e as Error).message ?? e}`);
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function saveState(wasm: Record<string, any>): Promise<void> {
  // Collect only the components whose WASM exports are available in this build.
  // If none are available (e.g., non-cloud build) we still write the file with
  // the version sentinel so that future cloud builds see a consistent schema.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const partial: Record<string, any> = {
    version: STATE_SCHEMA_VERSION,
    saved_at: new Date().toISOString(),
  };

  if (wasmHas(wasm, 'serialize_rl_state')) {
    try {
      partial['rl_state'] = JSON.parse(wasm['serialize_rl_state']());
    } catch (e) {
      console.warn(`[autoprocess] serialize_rl_state failed: ${(e as Error).message ?? e}`);
    }
  }

  if (wasmHas(wasm, 'get_spc_history')) {
    try {
      partial['spc_history'] = JSON.parse(wasm['get_spc_history']());
    } catch (e) {
      console.warn(`[autoprocess] get_spc_history failed: ${(e as Error).message ?? e}`);
    }
  }

  if (wasmHas(wasm, 'circuit_breaker_get_state')) {
    try {
      partial['circuit_breaker_state'] = JSON.parse(wasm['circuit_breaker_get_state']());
    } catch (e) {
      console.warn(`[autoprocess] circuit_breaker_get_state failed: ${(e as Error).message ?? e}`);
    }
  }

  try {
    await ensureStateDir();
    await fs.writeFile(AUTOPROCESS_STATE_FILE, JSON.stringify(partial, null, 2));
  } catch (e) {
    // File-write failures (disk full, permissions) must warn — silently
    // dropping the save would leave a stale state file on the next run.
    console.warn(`[autoprocess] state file write failed: ${(e as Error).message ?? e}`);
  }
}

export const autoprocess = defineCommand({
  meta: {
    name: 'autoprocess',
    description:
      'Run the MAPE-K autonomic control loop on an event log: Perception → Decision → Protection → Optimization.\n\n' +
      'EXAMPLES:\n' +
      '  wpm autoprocess log.xes                          # Single autonomic cycle (default)\n' +
      '  wpm autoprocess log.xes -n 5                     # Run 5 cycles to observe RL convergence\n' +
      '  wpm autoprocess log.xes -n 0                     # Unlimited cycles (Ctrl+C to stop)\n' +
      '  wpm autoprocess log.xes --format json            # Machine-readable JSON output\n' +
      '  wpm autoprocess log.xes -n 3 --verbose           # Show per-cycle SPC and RL decisions\n\n' +
      'Exit codes: 0=success, 1=config error, 2=source/file error, 3=execution error, 4=partial failure, 5=system error',
  },
  args: {
    input: {
      type: 'positional',
      description: 'Path to XES event log',
      required: true,
    },
    'activity-key': {
      type: 'string',
      description: 'Activity attribute key (default: concept:name)',
      default: 'concept:name',
      alias: 'k',
    },
    config: {
      type: 'string',
      description: 'AutoProcess configuration (JSON)',
    },
    cycles: {
      type: 'string',
      description: 'Number of AutoProcess cycles to run (default: 1). Use 0 for unlimited.',
      default: '1',
      alias: 'n',
    },
    format: {
      type: 'string',
      description: 'Output format (human or json)',
      default: 'human',
    },
    verbose: {
      type: 'boolean',
      description: 'Enable verbose output',
      alias: 'v',
    },
    quiet: {
      type: 'boolean',
      description: 'Suppress non-error output',
      alias: 'q',
    },
    'no-save': {
      type: 'boolean',
      description: 'Skip auto-save and BLAKE3 receipt emission',
    },
  },
  async run(ctx) {
    const t0 = performance.now();
    const format = (ctx.args.format as 'json' | 'human') ?? 'human';
    const verbose = Boolean(ctx.args.verbose);
    const quiet = Boolean(ctx.args.quiet);

    // Resolve input path early so it can be used as a span attribute even when
    // validation fails.  If the arg is missing citty will have already exited,
    // so this cast is safe.
    const inputPath = ctx.args.input as string;
    let lateAttrs: Record<string, string | number | boolean> = {};

    // withSpan wraps the ENTIRE function body — including all pre-flight
    // validation — so every exit path (config_error, source_error, success)
    // produces an OTEL span in Jaeger.  Moving validation inside satisfies the
    // FM-5 requirement: no command path exits without span evidence.
    return withSpan(
      'autoprocess',
      {
        input: inputPath ?? '',
        activity_key: String(ctx.args['activity-key'] ?? 'concept:name'),
        format: String(format),
        cycles: String(ctx.args.cycles ?? '1'),
      },
      async () => {
    // ── --format validation ────────────────────────────────────────────────────
    // Rank-2 domain contract: the format flag must be 'json' or 'human';
    // anything else is a configuration error, not an execution error.
    if (!['json', 'human'].includes(format as string)) {
      const result = makeErrorResult(
        'autoprocess',
        new Error(`--format must be 'json' or 'human', got: '${format}'`),
        EXIT_CODES.config_error,
        'CONFIG_INVALID_FORMAT'
      );
      emitResult(result, { format: 'json', verbose, quiet });
      return await exitWithFlush(EXIT_CODES.config_error);
    }

    // ── --cycles validation ────────────────────────────────────────────────────
    // parseInt('abc', 10) returns NaN; parseInt('1.7', 10) returns 1 (truncates).
    // NaN causes cyclesRun < NaN === false → zero cycles, silent exit 0.
    // Negative values run zero cycles for the same reason.
    const cyclesRaw = String(ctx.args.cycles ?? '1');

    // Reject float strings explicitly — parseInt('1.7') silently truncates to 1,
    // which is surprising and non-deterministic for the operator.  A whole-integer
    // check is stricter and unambiguous.
    if (cyclesRaw.includes('.')) {
      const result = makeErrorResult(
        'autoprocess',
        new Error('--cycles must be a whole integer, got: ' + cyclesRaw),
        EXIT_CODES.config_error,
        'CONFIG_INVALID_CYCLES'
      );
      emitResult(result, { format: format as 'json' | 'human', verbose, quiet });
      return await exitWithFlush(EXIT_CODES.config_error);
    }

    const maxCycles = parseInt(cyclesRaw, 10);
    const CYCLES_MAX = 10_000;

    if (Number.isNaN(maxCycles)) {
      const result = makeErrorResult(
        'autoprocess',
        new Error('--cycles must be a positive integer'),
        EXIT_CODES.config_error,
        'CONFIG_INVALID_CYCLES'
      );
      emitResult(result, { format, verbose, quiet });
      return await exitWithFlush(EXIT_CODES.config_error);
    }
    if (maxCycles < 0) {
      const result = makeErrorResult(
        'autoprocess',
        new Error('--cycles must be a positive integer'),
        EXIT_CODES.config_error,
        'CONFIG_INVALID_CYCLES'
      );
      emitResult(result, { format, verbose, quiet });
      return await exitWithFlush(EXIT_CODES.config_error);
    }
    if (maxCycles > CYCLES_MAX) {
      const result = makeErrorResult(
        'autoprocess',
        new Error(`--cycles exceeds maximum (${CYCLES_MAX})`),
        EXIT_CODES.config_error,
        'CONFIG_INVALID_CYCLES'
      );
      emitResult(result, { format, verbose, quiet });
      return await exitWithFlush(EXIT_CODES.config_error);
    }
    // maxCycles === 0 is the "unlimited" sentinel (run forever until interrupted)
    const unlimited = maxCycles === 0;

    try {
      const stateFilePath = path.resolve(AUTOPROCESS_STATE_FILE);

      await withSpan(
        'autoprocess.inner',
        { input: inputPath, activity_key: String(ctx.args['activity-key'] ?? 'concept:name') },
        async () =>
          withLogSession(
            { inputPath, commandName: 'autoprocess', emitOptions: { format, verbose, quiet } },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            async (wasmBase, logHandle) => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const wasm = wasmBase as Record<string, any>;

              const initial_state_hash = await hashStateFile(stateFilePath);
              await loadState(wasm);

              // Run AutoProcess cycle(s) — bounded by --cycles (0 = unlimited)
              // Security: validate --config is parseable JSON before passing to WASM.
              // WASM receives cycleConfig as a raw string; malformed input causes
              // opaque Rust panics, not useful error messages.  Guard here so the
              // caller gets a clean CONFIG_ERROR (1) with actionable feedback.
              const rawCycleConfig = (ctx.args.config as string) || '{}';
              try {
                JSON.parse(rawCycleConfig);
              } catch {
                const badConfigResult = makeErrorResult(
                  'autoprocess',
                  new Error(
                    `--config must be valid JSON.\n\n` +
                      `  Received: ${rawCycleConfig.length > 80 ? rawCycleConfig.slice(0, 80) + '…' : rawCycleConfig}\n\n` +
                      `  Example: wpm autoprocess log.xes --config '{"algorithm":"dfg"}'`
                  ),
                  EXIT_CODES.config_error,
                  'CONFIG_INVALID_JSON'
                );
                emitResult(badConfigResult, { format, verbose, quiet });
                return await exitWithFlush(EXIT_CODES.config_error);
              }
              const cycleConfig = rawCycleConfig;
              let cyclesRun = 0;
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              let cycleResult: Record<string, any> = {};
              // Accumulates per-cycle metrics for the system-state narrative and Learn phase.
              // Only the last 3 are needed; we keep all and slice in computeHealthNarrative.
              const cycleHealthScores: CycleMetrics[] = [];
              do {
                // Execute cycle and parse raw WASM result
                const rawResult = wasm.autonomic_execute_cycle(
                  logHandle,
                  ctx.args['activity-key'],
                  cycleConfig
                );
                cycleResult = typeof rawResult === 'string' ? JSON.parse(rawResult) : rawResult;
                cyclesRun++;

                // Emit per-phase MAPE-K child spans so Jaeger shows each phase individually.
                // Span names follow the MAPE-K vocabulary: monitor/analyze/plan/execute/learn.
                // These are fire-and-forget (best-effort); sink errors are swallowed inside withSpanRaw.
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const cr = (cycleResult.cycle_result ?? cycleResult) as Record<string, any>;
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const timing = (cycleResult.timing ?? {}) as Record<string, any>;
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const percData = (cr.perception ?? {}) as Record<string, any>;
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const decData = (cr.decision ?? {}) as Record<string, any>;
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const protData = (cr.protection ?? {}) as Record<string, any>;
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const optData = (cr.optimization ?? {}) as Record<string, any>;

                // health_score here is the numeric 0-4 integer stored as health_score in Rust output
                const healthLevel =
                  typeof percData.health_score === 'number' ? percData.health_score : -1;
                // event_rate = events / traces (0 when no traces)
                const traceCount =
                  typeof percData.trace_count === 'number' ? percData.trace_count : 0;
                const eventCount =
                  typeof percData.event_count === 'number' ? percData.event_count : 0;
                const eventRate = traceCount > 0 ? eventCount / traceCount : 0;
                const specialCauses = Array.isArray(protData.special_causes)
                  ? protData.special_causes
                  : [];
                const anomalyDetected = specialCauses.length > 0;
                // drift_status: 0=none, 1=low (1-2 causes), 2=high (3+ causes)
                const driftStatus = anomalyDetected ? (specialCauses.length >= 3 ? 2 : 1) : 0;

                // Record metrics for multi-cycle system-state narrative and Learn phase.
                // Use 0 as sentinel for unknown (-1) health so it reads as healthy.
                const fitnessVal =
                  typeof percData.fitness === 'number' ? percData.fitness : -1;
                const reworkVal =
                  typeof percData.rework_ratio === 'number' ? percData.rework_ratio : -1;
                cycleHealthScores.push({
                  healthScore: healthLevel >= 0 ? healthLevel : 0,
                  violations: specialCauses.length,
                  driftStatus,
                  fitness: fitnessVal,
                  reworkRatio: reworkVal,
                });

                // ── MONITOR span (Perception surface: events, traces, health) ──
                await withSpanRaw(
                  'wasm4pm.autoprocess.monitor',
                  {
                    cycle: cyclesRun,
                    health_level: healthLevel,
                    health_state: String(percData.health_state ?? 'unknown'),
                    event_count: eventCount,
                    trace_count: traceCount,
                    unique_activities:
                      typeof percData.unique_activities === 'number'
                        ? percData.unique_activities
                        : 0,
                    event_rate: Math.round(eventRate * 100) / 100,
                    drift_status: driftStatus,
                    anomaly_detected: anomalyDetected,
                    duration_us:
                      typeof timing.perception_us === 'number' ? timing.perception_us : 0,
                  },
                  async () => {
                    /* synchronous — span wraps only the emit */
                  }
                );

                // ── ANALYZE span (Decision surface: guard, pattern, anomalies) ──
                await withSpanRaw(
                  'wasm4pm.autoprocess.analyze',
                  {
                    cycle: cyclesRun,
                    guard_result: Boolean(decData.guard_result),
                    pattern_result: String(decData.pattern_result ?? 'unknown'),
                    pattern_ticks:
                      typeof decData.pattern_ticks === 'number' ? decData.pattern_ticks : 0,
                    special_cause_count: specialCauses.length,
                    anomaly_detected: anomalyDetected,
                    duration_us: typeof timing.decision_us === 'number' ? timing.decision_us : 0,
                  },
                  async () => {
                    /* synchronous */
                  }
                );

                // ── PLAN span (Protection surface: circuit breaker, SPC state) ──
                await withSpanRaw(
                  'wasm4pm.autoprocess.plan',
                  {
                    cycle: cyclesRun,
                    circuit_state: String(protData.circuit_state ?? 'unknown'),
                    circuit_allowed: Boolean(protData.circuit_allowed),
                    special_cause_count: specialCauses.length,
                    anomaly_detected: anomalyDetected,
                    duration_us:
                      typeof timing.protection_us === 'number' ? timing.protection_us : 0,
                  },
                  async () => {
                    /* synchronous */
                  }
                );

                // ── EXECUTE span (Optimization surface: RL action, reward) ──
                await withSpanRaw(
                  'wasm4pm.autoprocess.execute',
                  {
                    cycle: cyclesRun,
                    rl_action: String(optData.rl_action ?? 'none'),
                    rl_agent: String(optData.rl_agent ?? 'unknown'),
                    reward:
                      typeof optData.reward === 'number'
                        ? Math.round(optData.reward * 1000) / 1000
                        : 0,
                    cumulative_reward:
                      typeof optData.cumulative_reward === 'number'
                        ? Math.round(optData.cumulative_reward * 1000) / 1000
                        : 0,
                    duration_us:
                      typeof timing.optimization_us === 'number' ? timing.optimization_us : 0,
                  },
                  async () => {
                    /* synchronous */
                  }
                );

                // ── LEARN span (feedback: reward delta, SPC alerts consumed) ──
                // The WASM cycle does not have a separate learn phase; we synthesise the
                // key feedback signal — reward change relative to the previous cycle — so
                // Jaeger operators can see whether the autonomic loop is converging.
                const rewardVal = typeof optData.reward === 'number' ? optData.reward : 0;
                const cumRewardVal =
                  typeof optData.cumulative_reward === 'number' ? optData.cumulative_reward : 0;
                await withSpanRaw(
                  'wasm4pm.autoprocess.learn',
                  {
                    cycle: cyclesRun,
                    reward: Math.round(rewardVal * 1000) / 1000,
                    cumulative_reward: Math.round(cumRewardVal * 1000) / 1000,
                    spc_causes_consumed: specialCauses.length,
                    knowledge_updated: anomalyDetected || rewardVal !== 0,
                    drift_status: driftStatus,
                  },
                  async () => {
                    /* synchronous */
                  }
                );
              } while (unlimited || cyclesRun < maxCycles);

              await saveState(wasm);
              const final_state_hash = await hashStateFile(stateFilePath);

              if (ctx.args.save !== false) {
                try {
                  const inputBytes = await fsp
                    .readFile(inputPath)
                    .catch(() => Buffer.from(inputPath));
                  // The WASM output is { cycle_result: { success, perception, ... }, timing: {} }
                  // Access nested fields via cycle_result to match actual schema.
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const receiptCr = (cycleResult.cycle_result ?? cycleResult) as Record<string, any>;
                  saveCommandReceipt({
                    ...newReceipt('autoprocess'),
                    command: 'autoprocess',
                    input_hash: blake3Hex(inputBytes),
                    output_hash: blake3Hex(JSON.stringify(cycleResult)),
                    status: receiptCr.success ? 'success' : 'partial',
                    summary: {
                      cycles_run: cyclesRun,
                      final_health_level:
                        (receiptCr.perception?.health_state as string | undefined) ?? 'unknown',
                      total_reward: (receiptCr.optimization?.reward as number | undefined) ?? 0,
                      spc_alerts_fired:
                        (receiptCr.protection?.special_causes as unknown[] | undefined)?.length ??
                        0,
                      initial_state_hash,
                      final_state_hash,
                    },
                  });
                } catch (receiptErr) {
                  // receipt write must never break the command, but MUST leave evidence
                  try {
                    const sink = getGlobalSpanSink();
                    sink({
                      trace_id: '',
                      span_id: '',
                      name: 'receipt.write.failed',
                      kind: 'INTERNAL',
                      start_time: Date.now() * 1_000_000,
                      end_time: Date.now() * 1_000_000,
                      status: { code: 'ERROR', message: String(receiptErr) },
                      attributes: { 'service.name': 'wpm', 'receipt.recovered': true, 'receipt.command': 'autoprocess' },
                    } as import('@wasm4pm/cognition').OtelSpan);
                  } catch { /* span emit must never throw */ }
                }
              }

              // Build rich lateAttrs for the top-level autoprocess span.
              // Perception metrics: health_level (0-4 int), event_rate (events/trace),
              // drift_status (0=none/1=low/2=high), anomaly_detected (bool from SPC causes).
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const finalCr = (cycleResult.cycle_result ?? cycleResult) as Record<string, any>;
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const finalPerc = (finalCr.perception ?? {}) as Record<string, any>;
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const finalProt = (finalCr.protection ?? {}) as Record<string, any>;
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const finalOpt = (finalCr.optimization ?? {}) as Record<string, any>;
              const finalSpecialCauses = Array.isArray(finalProt.special_causes)
                ? finalProt.special_causes
                : [];
              const finalAnomalyDetected = finalSpecialCauses.length > 0;
              const finalDriftStatus = finalAnomalyDetected
                ? finalSpecialCauses.length >= 3
                  ? 2
                  : 1
                : 0;
              const finalTraceCount =
                typeof finalPerc.trace_count === 'number' ? finalPerc.trace_count : 0;
              const finalEventCount =
                typeof finalPerc.event_count === 'number' ? finalPerc.event_count : 0;
              const finalEventRate = finalTraceCount > 0 ? finalEventCount / finalTraceCount : 0;
              lateAttrs = {
                cycles_run: cyclesRun,
                health_state: String(finalPerc.health_state ?? 'unknown'),
                health_level:
                  typeof finalPerc.health_score === 'number' ? finalPerc.health_score : -1,
                event_rate: Math.round(finalEventRate * 100) / 100,
                drift_status: finalDriftStatus,
                anomaly_detected: finalAnomalyDetected,
                rl_action: String(finalOpt.rl_action ?? 'none'),
                circuit_state: String(finalProt.circuit_state ?? 'unknown'),
                special_causes: finalSpecialCauses.length,
                initial_state_hash,
                final_state_hash,
              };

              // Build recommendations for JSON output based on cycle metrics
              const jsonRecommendations: string[] = [];
              {
                const finalCrForRec = (cycleResult.cycle_result ?? cycleResult) as Record<string, unknown>;
                const finalProtForRec = (finalCrForRec.protection ?? {}) as Record<string, unknown>;
                const finalOptForRec = (finalCrForRec.optimization ?? {}) as Record<string, unknown>;
                const finalPercForRec = (finalCrForRec.perception ?? {}) as Record<string, unknown>;
                const finalCausesForRec = Array.isArray(finalProtForRec.special_causes)
                  ? finalProtForRec.special_causes
                  : [];
                const finalHealthForRec = typeof finalPercForRec.health_score === 'number'
                  ? finalPercForRec.health_score : 0;
                const finalCircuitForRec = Boolean(finalProtForRec.circuit_allowed);
                const finalRewardForRec = typeof finalOptForRec.reward === 'number'
                  ? finalOptForRec.reward : 0;
                if (!finalCircuitForRec) {
                  jsonRecommendations.push(`Inspect circuit breaker — execution was BLOCKED (${String(finalProtForRec.circuit_state ?? 'unknown')}). Run \`wpm status\`.`);
                }
                if (finalCausesForRec.length > 2) {
                  jsonRecommendations.push(`Run \`wpm doctor --verbose\` — ${finalCausesForRec.length} SPC violation(s) detected.`);
                }
                if (finalHealthForRec >= 3) {
                  jsonRecommendations.push(`Run \`wpm conformance -i ${inputPath}\` — health level ${finalHealthForRec}/4 indicates process degradation.`);
                }
                if (finalRewardForRec < 0) {
                  jsonRecommendations.push(`Review RL agent decisions — negative reward (${finalRewardForRec.toFixed(3)}) indicates suboptimal autonomic response.`);
                }
                jsonRecommendations.push(`Run \`wpm conformance -i ${inputPath}\` — verify process model quality after autonomic changes.`);
              }

              const resultWithRecommendations = makeResult(
                'autoprocess',
                { ...cycleResult, cycles_run: cyclesRun, recommendations: jsonRecommendations },
                performance.now() - t0,
                EXIT_CODES.success
              );

              emitResult(resultWithRecommendations, { format, verbose, quiet }, (res, projection) => {
                const data = res.payload as Record<string, unknown>;
                const cycle = (data.cycle_result ?? data) as Record<string, unknown>;
                const timing = (data.timing ?? {}) as Record<string, unknown>;

                projection.info('AutoProcess — MAPE-K Cycle Summary');
                projection.log('');

                // ── Helper to format a labelled phase line with status indicator ──
                const phaseLabel = (phaseNum: number, label: string, summary: string, ok: boolean = true) => {
                  const padded = label.padEnd(10);
                  const indicator = ok ? '\x1b[32m✔\x1b[0m' : '\x1b[33m⚠\x1b[0m';
                  projection.log(`  Phase ${phaseNum}: ${padded} ${indicator}  ${summary}`);
                };

                // ── PHASE 1: PERCEPTION ───────────────────────────────────────
                const perception = (cycle.perception ?? {}) as Record<string, unknown>;
                const evCount = perception.event_count ?? '?';
                const trCount = perception.trace_count ?? '?';
                const actCount = perception.unique_activities ?? '?';
                const healthState = String(perception.health_state ?? 'unknown');
                const healthScore =
                  typeof perception.health_score === 'number' ? perception.health_score : '?';
                phaseLabel(
                  1,
                  'PERCEPTION',
                  `${evCount} events, ${trCount} traces, ${actCount} activities — health: ${healthState} (${healthScore}/4)`
                );

                // ── PHASE 2: DECISION ─────────────────────────────────────────
                const decision = (cycle.decision ?? {}) as Record<string, unknown>;
                const protection = (cycle.protection ?? {}) as Record<string, unknown>;
                const spcResults = (protection.spc_results ?? {}) as Record<string, unknown>;
                const specialCausesList = Array.isArray(protection.special_causes)
                  ? (protection.special_causes as unknown[])
                  : [];
                const spcAlertCount = Object.values(spcResults).filter((v) => v === 'ALERT').length;
                const guardOutcome = decision.guard_result ? 'guard PASS' : 'guard FAIL';
                const patternSummary = decision.pattern_result
                  ? `pattern: ${decision.pattern_result}`
                  : 'no pattern';
                const analyzeSummary =
                  specialCausesList.length > 0
                    ? `${specialCausesList.length} anomaly(ies) detected, ${spcAlertCount} SPC alert(s) — ${guardOutcome}, ${patternSummary}`
                    : `no anomalies — ${guardOutcome}, ${patternSummary}`;
                phaseLabel(2, 'DECISION', analyzeSummary, Boolean(decision.guard_result));

                // ── PHASE 3: PROTECTION ───────────────────────────────────────
                const circuitState = String(protection.circuit_state ?? 'unknown');
                const circuitAllowed = Boolean(protection.circuit_allowed);
                const circuitSummary = circuitAllowed
                  ? `circuit ${circuitState} (allowed)`
                  : `circuit ${circuitState} (BLOCKED)`;
                const spcMetricList = Object.entries(spcResults)
                  .map(([m, s]) => `${m}:${s}`)
                  .join(', ');
                const planSummary = spcMetricList
                  ? `${circuitSummary} | SPC: ${spcMetricList}`
                  : circuitSummary;
                phaseLabel(3, 'PROTECTION', planSummary, circuitAllowed);

                // ── PHASE 4: OPTIMIZATION ─────────────────────────────────────
                const optimization = (cycle.optimization ?? {}) as Record<string, unknown>;
                const rlAgent = String(optimization.rl_agent ?? 'QLearning');
                const rlAction = String(optimization.rl_action ?? 'none');
                const reward = typeof optimization.reward === 'number' ? optimization.reward : 0;
                const cumReward =
                  typeof optimization.cumulative_reward === 'number'
                    ? optimization.cumulative_reward
                    : 0;
                const rewardSign = reward >= 0 ? '+' : '';
                const cycleNum = optimization.cycle_count ?? cyclesRun;
                const dispatchDetail = optimization.dispatch_detail
                  ? ` — ${optimization.dispatch_detail}`
                  : '';
                phaseLabel(
                  4,
                  'OPTIMIZATION',
                  `${rlAgent} (LinUCB) → action: ${rlAction}${dispatchDetail} | reward: ${rewardSign}${reward.toFixed(3)} (cumulative: ${cumReward >= 0 ? '+' : ''}${cumReward.toFixed(3)}, cycle #${cycleNum})`,
                  reward >= 0
                );

                // ── LEARN ─────────────────────────────────────────────────────
                // The WASM autonomic cycle feeds the reward signal back to the RL
                // agent automatically. We surface the drift classification so the
                // operator knows whether the feedback loop triggered any update.
                const driftLabel =
                  specialCausesList.length === 0
                    ? 'none'
                    : specialCausesList.length >= 3
                      ? 'high'
                      : 'low';
                const learnSummary =
                  specialCausesList.length > 0
                    ? `drift classified as ${driftLabel} (${specialCausesList.length} special cause(s)) — RL Q-table updated via reward ${rewardSign}${reward.toFixed(3)}`
                    : `no drift detected — RL Q-table stable (reward ${rewardSign}${reward.toFixed(3)})`;
                // Print the LEARN phase as a sub-note (not numbered phase) since it's internal feedback
                projection.log(`             ↳ Learn: ${learnSummary}`);

                // ── System State narrative (multi-cycle health trend) ──────────
                // Only meaningful when more than one cycle has run; with a single
                // cycle there is no trend to report.
                if (cycleHealthScores.length > 1) {
                  projection.log('');
                  projection.log(
                    `  System State: ${computeHealthNarrative(cycleHealthScores)}`
                  );
                }

                // ── Persistence check — 3+ consecutive degrading cycles ────────
                const currentMetrics: CycleMetrics = {
                  healthScore:
                    typeof perception.health_score === 'number' ? perception.health_score : 0,
                  violations: specialCausesList.length,
                  driftStatus: specialCausesList.length >= 3 ? 2 : specialCausesList.length > 0 ? 1 : 0,
                  fitness: -1, // not available from cycle summary (requires separate conformance run)
                  reworkRatio: -1,
                };
                const { actions: learnActions, persistenceDegrading } =
                  buildLearnRecommendations(currentMetrics, cycleHealthScores, inputPath);

                // Emit persistence warning before the actions list when warranted
                if (persistenceDegrading) {
                  projection.log('');
                  projection.warn(
                    '  WARNING: System has been degrading for 3+ consecutive cycles. ' +
                      'Immediate operator attention required.'
                  );
                }

                // Circuit breaker blocked: always surface (not covered by learnActions)
                const circuitActions: string[] = [];
                if (!circuitAllowed) {
                  circuitActions.push(
                    'Inspect circuit breaker state with `wpm status` — execution was BLOCKED (' +
                      circuitState +
                      ')'
                  );
                }

                const nextActions = [...circuitActions, ...learnActions];

                projection.log('');
                projection.log('  Recommended next actions:');
                nextActions.forEach((action, idx) => {
                  projection.log(`    ${idx + 1}. ${action}`);
                });

                // ── Timing breakdown ──────────────────────────────────────────
                projection.log('');
                projection.log('  Timing:');
                projection.log(`    Monitor (perception): ${timing.perception_us ?? '?'} µs`);
                projection.log(`    Analyze (decision):   ${timing.decision_us ?? '?'} µs`);
                projection.log(`    Plan    (protection): ${timing.protection_us ?? '?'} µs`);
                projection.log(`    Total:                ${timing.total_us ?? '?'} µs`);
                if (timing.cycle_latency_budget_exceeded) {
                  projection.warn('    Cycle exceeded latency budget');
                }

                // ── Verbose: full SPC + per-metric details ─────────────────────
                if (verbose && Object.keys(spcResults).length > 0) {
                  projection.log('');
                  projection.log('  SPC detail:');
                  for (const [metric, status] of Object.entries(spcResults)) {
                    const icon = status === 'OK' ? '+' : status === 'ALERT' ? '!' : '-';
                    projection.log(`    [${icon}] ${metric}: ${status}`);
                  }
                }

                projection.log('');
                if (cycle.success) {
                  projection.success(
                    `Cycle #${cycleNum} completed successfully in ${(performance.now() - t0).toFixed(0)}ms`
                  );
                } else {
                  projection.warn(
                    `Cycle #${cycleNum} completed with warnings in ${(performance.now() - t0).toFixed(0)}ms`
                  );
                }
              });
              return await exitWithFlush(resultWithRecommendations.exit_code);
            }
          ), // end withLogSession
        () => lateAttrs
      ); // end withSpan (inner)
    } catch (error) {
      const result = makeErrorResult('autoprocess', error, EXIT_CODES.execution_error);
      emitResult(result, { format, verbose, quiet });
      return await exitWithFlush(result.exit_code);
    }
      }, // end outer withSpan body
      () => lateAttrs
    ); // end outer withSpan
  },
});
