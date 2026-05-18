import { defineCommand } from 'citty';
import * as fs from 'fs/promises';
import * as fsp from 'node:fs/promises';
import * as path from 'path';
import { emitResult, makeResult, makeErrorResult } from '../output.js';
import { EXIT_CODES } from '../exit-codes.js';
import { withLogSession } from '../with-log-session.js';
import { withSpan, withSpanRaw } from './_otel.js';
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
const STATE_SCHEMA_VERSION = 2;

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
    console.warn(
      `[autoprocess] state file schema version ${savedVersion} !== expected ${STATE_SCHEMA_VERSION}: ` +
        `discarding stale state and starting fresh. ` +
        `Delete ${AUTOPROCESS_STATE_FILE} to suppress this warning.`
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
    description: 'Run AutoProcess: Perception → Decision → Protection → Optimization',
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
  },
  async run(ctx) {
    const t0 = performance.now();
    const format = (ctx.args.format as 'json' | 'human') ?? 'human';
    const verbose = Boolean(ctx.args.verbose);
    const quiet = Boolean(ctx.args.quiet);
    const maxCycles = parseInt(String(ctx.args.cycles ?? '1'), 10);
    const unlimited = maxCycles === 0;

    try {
      const inputPath = ctx.args.input as string;
      const stateFilePath = path.resolve(AUTOPROCESS_STATE_FILE);
      let lateAttrs: Record<string, string | number | boolean> = {};

      await withSpan(
        'autoprocess',
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
              const cycleConfig = (ctx.args.config as string) || '{}';
              let cyclesRun = 0;
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              let cycleResult: Record<string, any> = {};
              do {
                // Execute cycle and parse raw WASM result
                const rawResult = wasm.autonomic_execute_cycle(
                  logHandle,
                  ctx.args['activity-key'],
                  cycleConfig
                );
                cycleResult = typeof rawResult === 'string' ? JSON.parse(rawResult) : rawResult;
                cyclesRun++;

                // Emit per-phase child spans so Jaeger shows the MAPE-K phases individually.
                // These are fire-and-forget (best-effort); sink errors are already swallowed inside withSpanRaw.
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

                await withSpanRaw(
                  'wasm4pm.autoprocess.perception',
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

                await withSpanRaw(
                  'wasm4pm.autoprocess.decision',
                  {
                    cycle: cyclesRun,
                    guard_result: Boolean(decData.guard_result),
                    pattern_result: String(decData.pattern_result ?? 'unknown'),
                    pattern_ticks:
                      typeof decData.pattern_ticks === 'number' ? decData.pattern_ticks : 0,
                    duration_us: typeof timing.decision_us === 'number' ? timing.decision_us : 0,
                  },
                  async () => {
                    /* synchronous */
                  }
                );

                await withSpanRaw(
                  'wasm4pm.autoprocess.protection',
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

                await withSpanRaw(
                  'wasm4pm.autoprocess.optimization',
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
              } while (unlimited || cyclesRun < maxCycles);

              await saveState(wasm);
              const final_state_hash = await hashStateFile(stateFilePath);

              if (!ctx.args['no-save']) {
                try {
                  const inputBytes = await fsp
                    .readFile(inputPath)
                    .catch(() => Buffer.from(inputPath));
                  saveCommandReceipt({
                    ...newReceipt('autoprocess'),
                    command: 'autoprocess',
                    input_hash: blake3Hex(inputBytes),
                    output_hash: blake3Hex(JSON.stringify(cycleResult)),
                    status: cycleResult.success ? 'success' : 'partial',
                    summary: {
                      cycles_run: cyclesRun,
                      final_health_level:
                        (cycleResult.perception?.health_state as string | undefined) ?? 'unknown',
                      total_reward: (cycleResult.optimization?.reward as number | undefined) ?? 0,
                      spc_alerts_fired:
                        (cycleResult.protection?.special_causes as unknown[] | undefined)?.length ??
                        0,
                      initial_state_hash,
                      final_state_hash,
                    },
                  });
                } catch {
                  /* receipt write must never break the command */
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

              const result = makeResult(
                'autoprocess',
                { ...cycleResult, cycles_run: cyclesRun },
                performance.now() - t0,
                EXIT_CODES.success
              );
              emitResult(result, { format, verbose, quiet }, (res, projection) => {
                const data = res.payload as Record<string, unknown>;
                const cycle = data.cycle_result as Record<string, unknown>;
                const timing = data.timing as Record<string, unknown>;
                projection.info('AutoProcess Results');
                projection.log('');
                const perception = cycle.perception as Record<string, unknown>;
                projection.log('  Perception:');
                projection.log(`    Events: ${perception.event_count}`);
                projection.log(`    Activities: ${perception.unique_activities}`);
                projection.log(`    Traces: ${perception.trace_count}`);
                projection.log(
                  `    Health: ${perception.health_state} (score ${perception.health_score})`
                );
                projection.log('');
                const decision = cycle.decision as Record<string, unknown>;
                projection.log('  Decision:');
                projection.log(`    Guard: ${decision.guard_result ? 'PASS' : 'FAIL'}`);
                projection.log(
                  `    Pattern: ${decision.pattern_result} (${decision.pattern_ticks} ticks)`
                );
                projection.log('');
                const protection = cycle.protection as Record<string, unknown>;
                projection.log('  Protection:');
                projection.log(`    Circuit: ${protection.circuit_state}`);
                const spc = protection.spc_results as Record<string, unknown> | undefined;
                if (spc) {
                  for (const [metric, status] of Object.entries(spc)) {
                    const icon = status === 'OK' ? '+' : status === 'ALERT' ? '!' : '-';
                    projection.log(`    SPC ${metric}: ${icon} ${status}`);
                  }
                }
                projection.log(
                  `    Special Causes: ${(protection.special_causes as unknown[]).length}`
                );
                projection.log('');
                const optimization = cycle.optimization as Record<string, unknown>;
                projection.log('  Optimization:');
                projection.log(
                  `    Agent:   ${optimization.rl_agent ?? 'QLearning'} (LinUCB-selected)`
                );
                projection.log(`    Action:  ${optimization.rl_action}`);
                const reward = typeof optimization.reward === 'number' ? optimization.reward : 0;
                const cumReward =
                  typeof optimization.cumulative_reward === 'number'
                    ? optimization.cumulative_reward
                    : 0;
                const rewardSign = reward >= 0 ? '+' : '';
                projection.log(
                  `    Reward:  ${rewardSign}${reward.toFixed(3)} (cumulative: ${cumReward >= 0 ? '+' : ''}${cumReward.toFixed(3)}, cycle #${optimization.cycle_count ?? '?'})`
                );
                if (optimization.dispatch_detail) {
                  projection.log(`    Detail:  ${optimization.dispatch_detail}`);
                }
                projection.log('');
                projection.log('  Timing:');
                projection.log(`    Perception:  ${timing.perception_us ?? '?'} µs`);
                projection.log(`    Decision:    ${timing.decision_us ?? '?'} µs`);
                projection.log(`    Protection:  ${timing.protection_us ?? '?'} µs`);
                projection.log(`    Total:       ${timing.total_us ?? '?'} µs`);
                if (timing.cycle_latency_budget_exceeded) {
                  projection.log(`    Warning: cycle exceeded latency budget`);
                }
                projection.log('');
                if (cycle.success) {
                  projection.log('  Result: Cycle completed successfully');
                } else {
                  projection.log('  Result: Cycle completed with warnings');
                }
              });
              return await exitWithFlush(result.exit_code);
            }
          ), // end withLogSession
        () => lateAttrs
      ); // end withSpan
    } catch (error) {
      const result = makeErrorResult('autoprocess', error, EXIT_CODES.execution_error);
      emitResult(result, { format, verbose, quiet });
      return await exitWithFlush(result.exit_code);
    }
  },
});
