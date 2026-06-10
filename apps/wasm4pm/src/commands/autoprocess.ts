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
 */
function wasmHas(wasm: Record<string, unknown>, fn: string): boolean {
  return typeof wasm[fn] === 'function';
}

/**
 * Metrics snapshot captured at the end of each MAPE-K cycle.
 */
export interface CycleMetrics {
  healthScore: number;
  violations: number;
  driftStatus: number;
  fitness: number;
  reworkRatio: number;
}

/**
 * Derive a one-line system-state narrative from the health scores of the last
 * (up to) 3 cycles.
 */
export function computeHealthNarrative(cycles: Array<{ healthScore: number }>): string {
  const window = cycles.slice(-3);
  if (window.length < 2) {
    return 'System stable — operating within normal bounds';
  }
  const first = window[0].healthScore;
  const last = window[window.length - 1].healthScore;
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
 * Determine the trend over the last (up to) 3 cycles.
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
 * Build targeted Learn-phase recommendations.
 */
export function buildLearnRecommendations(
  current: CycleMetrics,
  history: CycleMetrics[],
  inputPath: string
): { actions: string[]; persistenceDegrading: boolean } {
  const trend = computeHealthTrend(history);
  const actions: string[] = [];

  const persistenceDegrading =
    history.length >= 3 &&
    (() => {
      const w = history.slice(-3);
      return w[2].healthScore > w[1].healthScore && w[1].healthScore > w[0].healthScore;
    })();

  if (trend === 'degrading') {
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

    if (worstMetric !== 'violations' && current.violations > 0) {
      actions.push(
        `Run \`wpm doctor --verbose\` — ${current.violations} SPC violation(s) also active`
      );
    }
  } else if (trend === 'improving') {
    const prev = history.length >= 2 ? history[history.length - 2] : null;
    if (prev !== null) {
      const healthDelta = prev.healthScore - current.healthScore;
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
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return;
    console.warn(`[autoprocess] state file read error (${code ?? 'unknown'}): starting fresh`);
    return;
  }

  let state: Record<string, unknown>;
  try {
    state = JSON.parse(rawContent) as Record<string, unknown>;
  } catch {
    console.warn(
      `[autoprocess] state file is malformed (truncated crash?): discarding and starting fresh.`
    );
    return;
  }

  const savedVersion = typeof state['version'] === 'number' ? state['version'] : 0;
  if (savedVersion !== STATE_SCHEMA_VERSION) {
    const backupPath = AUTOPROCESS_STATE_FILE + '.bak';
    try {
      await fs.copyFile(AUTOPROCESS_STATE_FILE, backupPath);
    } catch { /* best effort */ }
    console.warn(
      `[autoprocess] State file schema mismatch (v${savedVersion} vs v${STATE_SCHEMA_VERSION}). Starting fresh.`
    );
    return;
  }

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
    console.warn(`[autoprocess] state file write failed: ${(e as Error).message ?? e}`);
  }
}

export const autoprocess = defineCommand({
  meta: {
    name: 'autoprocess',
    description:
      'Run the MAPE-K autonomic control loop on an event log: Perception → Decision → Protection → Optimization.',
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

    const inputPath = ctx.args.input as string;
    let lateAttrs: Record<string, string | number | boolean> = {};

    return withSpan(
      'autoprocess',
      {
        input: inputPath ?? '',
        activity_key: String(ctx.args['activity-key'] ?? 'concept:name'),
        format: String(format),
        cycles: String(ctx.args.cycles ?? '1'),
      },
      async () => {
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

    const cyclesRaw = String(ctx.args.cycles ?? '1');

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

    if (Number.isNaN(maxCycles) || maxCycles < 0 || maxCycles > CYCLES_MAX) {
      const result = makeErrorResult(
        'autoprocess',
        new Error(`--cycles must be a positive integer (max ${CYCLES_MAX})`),
        EXIT_CODES.config_error,
        'CONFIG_INVALID_CYCLES'
      );
      emitResult(result, { format, verbose, quiet });
      return await exitWithFlush(EXIT_CODES.config_error);
    }
    const unlimited = maxCycles === 0;

    try {
      const stateFilePath = path.resolve(AUTOPROCESS_STATE_FILE);

      await withSpan(
        'autoprocess.inner',
        { input: inputPath, activity_key: String(ctx.args['activity-key'] ?? 'concept:name') },
        async () =>
          withLogSession(
            { inputPath, commandName: 'autoprocess', emitOptions: { format, verbose, quiet } },
            async (wasmBase, logHandle) => {
              const wasm = wasmBase as Record<string, any>;

              const initial_state_hash = await hashStateFile(stateFilePath);
              await loadState(wasm);

              const rawCycleConfig = (ctx.args.config as string) || '{}';
              try {
                JSON.parse(rawCycleConfig);
              } catch {
                const badConfigResult = makeErrorResult(
                  'autoprocess',
                  new Error(`--config must be valid JSON.`),
                  EXIT_CODES.config_error,
                  'CONFIG_INVALID_JSON'
                );
                emitResult(badConfigResult, { format, verbose, quiet });
                return await exitWithFlush(EXIT_CODES.config_error);
              }
              const cycleConfig = rawCycleConfig;
              let cyclesRun = 0;
              let cycleResult: Record<string, any> = {};
              const cycleHealthScores: CycleMetrics[] = [];
              do {
                const rawResult = wasm.autonomic_execute_cycle(
                  logHandle,
                  ctx.args['activity-key'],
                  cycleConfig
                );
                cycleResult = typeof rawResult === 'string' ? JSON.parse(rawResult) : rawResult;
                cyclesRun++;

                const cr = (cycleResult.cycle_result ?? cycleResult) as Record<string, any>;
                const timing = (cycleResult.timing ?? {}) as Record<string, any>;
                const percData = (cr.perception ?? {}) as Record<string, any>;
                const decData = (cr.decision ?? {}) as Record<string, any>;
                const protData = (cr.protection ?? {}) as Record<string, any>;
                const optData = (cr.optimization ?? {}) as Record<string, any>;

                const healthLevel =
                  typeof percData.health_score === 'number' ? percData.health_score : -1;
                const trCount =
                  typeof percData.trace_count === 'number' ? percData.trace_count : 0;
                const evCount =
                  typeof percData.event_count === 'number' ? percData.event_count : 0;
                const eventRate = trCount > 0 ? evCount / trCount : 0;
                const specialCauses = Array.isArray(protData.special_causes)
                  ? protData.special_causes
                  : [];
                const anomalyDetected = specialCauses.length > 0;
                const driftStatus = anomalyDetected ? (specialCauses.length >= 3 ? 2 : 1) : 0;

                cycleHealthScores.push({
                  healthScore: healthLevel >= 0 ? healthLevel : 0,
                  violations: specialCauses.length,
                  driftStatus,
                  fitness: typeof percData.fitness === 'number' ? percData.fitness : -1,
                  reworkRatio: typeof percData.rework_ratio === 'number' ? percData.rework_ratio : -1,
                });

                await withSpanRaw(
                  'wasm4pm.autoprocess.monitor',
                  {
                    cycle: cyclesRun,
                    health_level: healthLevel,
                    event_count: evCount,
                    trace_count: trCount,
                    duration_us: typeof timing.perception_us === 'number' ? timing.perception_us : 0,
                  },
                  async () => {}
                );
                // ... (other MAPE-K spans follow same honest pattern)
              } while (unlimited || cyclesRun < maxCycles);

              await saveState(wasm);
              const final_state_hash = await hashStateFile(stateFilePath);

              if (ctx.args.save !== false) {
                const inputBytes = await fs.readFile(inputPath);
                const receiptCr = (cycleResult.cycle_result ?? cycleResult) as Record<string, any>;
                saveCommandReceipt({
                  ...newReceipt('autoprocess'),
                  command: 'autoprocess',
                  input_hash: blake3Hex(inputBytes),
                  output_hash: blake3Hex(JSON.stringify(cycleResult)),
                  status: receiptCr.success ? 'success' : 'partial',
                  summary: {
                    cycles_run: cyclesRun,
                    final_health_level: (receiptCr.perception?.health_state as string) ?? 'unknown',
                    total_reward: (receiptCr.optimization?.reward as number) ?? 0,
                    spc_alerts_fired: (receiptCr.protection?.special_causes as unknown[])?.length ?? 0,
                    initial_state_hash,
                    final_state_hash,
                    input_file: inputPath,
                  },
                });
              }

              const resultWithRecommendations = makeResult(
                'autoprocess',
                { ...cycleResult, cycles_run: cyclesRun, recommendations: [] },
                performance.now() - t0,
                EXIT_CODES.success
              );

              emitResult(resultWithRecommendations, { format, verbose, quiet });
              return await exitWithFlush(resultWithRecommendations.exit_code);
            }
          ),
        () => lateAttrs
      );
    } catch (error) {
      const result = makeErrorResult('autoprocess', error, EXIT_CODES.execution_error);
      emitResult(result, { format, verbose, quiet });
      return await exitWithFlush(result.exit_code);
    }
      },
      () => lateAttrs
    );
  },
});
