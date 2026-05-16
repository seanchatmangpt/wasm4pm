import { defineCommand } from 'citty';
import * as fs from 'fs/promises';
import * as fsp from 'node:fs/promises';
import * as path from 'path';
import { emitResult, makeResult, makeErrorResult } from '../output.js';
import { EXIT_CODES } from '../exit-codes.js';
import { withLogSession } from '../with-log-session.js';
import { withSpan } from './_otel.js';
import { saveCommandReceipt, blake3Hex, newReceipt } from '../receipts/_shared.js';
import { exitWithFlush } from '../otel/exit.js';

const AUTOPROCESS_STATE_FILE = '.wasm4pm/autoprocess-state.json';

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

async function loadState(wasm: any): Promise<void> {
  try {
    const content = await fs.readFile(AUTOPROCESS_STATE_FILE, 'utf-8');
    const state = JSON.parse(content);

    // Restore RL state
    if (state.rl_state) {
      wasm.restore_rl_state(JSON.stringify(state.rl_state));
    }

    // Restore SPC history
    if (state.spc_history) {
      wasm.set_spc_history(JSON.stringify(state.spc_history));
    }

    // Restore circuit breaker state
    if (state.circuit_breaker_state) {
      wasm.circuit_breaker_set_state(JSON.stringify(state.circuit_breaker_state));
    }
  } catch {
    // File doesn't exist or is invalid - start fresh
  }
}

async function saveState(wasm: any): Promise<void> {
  try {
    const rl_state = JSON.parse(wasm.serialize_rl_state());
    const spc_history = JSON.parse(wasm.get_spc_history());
    const circuit_breaker_state = JSON.parse(wasm.circuit_breaker_get_state());

    const fullState = {
      rl_state,
      spc_history,
      circuit_breaker_state,
      saved_at: new Date().toISOString(),
    };

    await ensureStateDir();
    await fs.writeFile(AUTOPROCESS_STATE_FILE, JSON.stringify(fullState, null, 2));
  } catch {
    // Silently fail on save - don't block execution
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
      description: 'Skip auto-save of BLAKE3 receipt',
    },
  },
  async run(ctx) {
    const t0 = performance.now();
    const format = (ctx.args.format as 'json' | 'human') ?? 'human';
    const verbose = Boolean(ctx.args.verbose);
    const quiet = Boolean(ctx.args.quiet);

    try {
      const inputPath = ctx.args.input as string;
      const stateFilePath = path.resolve(AUTOPROCESS_STATE_FILE);
      let lateAttrs: Record<string, string | number | boolean> = {};

      await withSpan(
        'autoprocess',
        {
          input: inputPath,
          activity_key: String(ctx.args['activity-key'] ?? 'concept:name'),
        },
        async () =>
          withLogSession(
        { inputPath, commandName: 'autoprocess', emitOptions: { format, verbose, quiet } },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (wasmBase, logHandle) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const wasm = wasmBase as Record<string, any>;

        // Capture state-file hash BEFORE load (cold-start sentinel if absent).
        const initial_state_hash = await hashStateFile(stateFilePath);

        // 1. Load persisted state (RL, SPC, circuit breaker)
        await loadState(wasm);

        // 2. Run AutoProcess cycle
        const cycleConfig = (ctx.args.config as string) || '{}';
        const rawResult = wasm.autonomic_execute_cycle(
          logHandle,
          ctx.args['activity-key'],
          cycleConfig
        );
        const cycleResult = typeof rawResult === 'string' ? JSON.parse(rawResult) : rawResult;

        // 3. Save persisted state (RL, SPC, circuit breaker)
        await saveState(wasm);

        // Capture state-file hash AFTER save — chains across invocations.
        const final_state_hash = await hashStateFile(stateFilePath);

        // Emit single session receipt for this cycle, with state-hash chain.
        if (!ctx.args['no-save']) {
          try {
            const inputBytes = await fsp.readFile(inputPath).catch(() => Buffer.from(inputPath));
            saveCommandReceipt({
              ...newReceipt('autoprocess'),
              command: 'autoprocess',
              input_hash: blake3Hex(inputBytes),
              output_hash: blake3Hex(JSON.stringify(cycleResult)),
              status: cycleResult.success ? 'success' : 'partial',
              summary: {
                cycles_run: 1,
                final_health_level:
                  (cycleResult.perception?.health_state as string | undefined) ?? 'unknown',
                total_reward:
                  (cycleResult.optimization?.reward as number | undefined) ?? 0,
                spc_alerts_fired:
                  (cycleResult.protection?.special_causes as unknown[] | undefined)?.length ?? 0,
                initial_state_hash,
                final_state_hash,
              },
            });
          } catch {
            /* receipt write must never break the command */
          }
        }

        lateAttrs = {
          health_state:
            (cycleResult.perception?.health_state as string | undefined) ?? 'unknown',
          rl_action:
            (cycleResult.optimization?.rl_action as string | undefined) ?? 'none',
          circuit_state:
            (cycleResult.protection?.circuit_state as string | undefined) ?? 'unknown',
          special_causes:
            (cycleResult.protection?.special_causes as unknown[] | undefined)?.length ?? 0,
          initial_state_hash,
          final_state_hash,
        };

        const result = makeResult('autoprocess', cycleResult, performance.now() - t0, EXIT_CODES.success);
        emitResult(result, { format, verbose, quiet }, (res, projection) => {
        const data = res.payload as Record<string, unknown>;
        const cycle = data.cycle_result as Record<string, unknown>;
        const timing = data.timing as Record<string, unknown>;

        projection.info('AutoProcess Results');
        projection.log('');

        // Perception
        const perception = cycle.perception as Record<string, unknown>;
        projection.log('  Perception:');
        projection.log(`    Events: ${perception.event_count}`);
        projection.log(`    Activities: ${perception.unique_activities}`);
        projection.log(`    Traces: ${perception.trace_count}`);
        projection.log(`    Health: ${perception.health_state} (score ${perception.health_score})`);
        projection.log('');

        // Decision
        const decision = cycle.decision as Record<string, unknown>;
        projection.log('  Decision:');
        projection.log(`    Guard: ${decision.guard_result ? 'PASS' : 'FAIL'}`);
        projection.log(`    Pattern: ${decision.pattern_result} (${decision.pattern_ticks} ticks)`);
        projection.log('');

        // Protection
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
        projection.log(`    Special Causes: ${(protection.special_causes as unknown[]).length}`);
        projection.log('');

        // Optimization
        const optimization = cycle.optimization as Record<string, unknown>;
        const rlAction = optimization.rl_action as string | undefined ?? 'unknown';
        const totalReward = optimization.reward as number | undefined;
        const rlActionLabel: Record<string, string> = {
          monitor:     'Monitor — process is healthy, no intervention needed',
          scale_up:    'Scale Up — increase processing capacity',
          scale_down:  'Scale Down — reduce resource consumption',
          alert:       'Alert — anomaly detected, review recommended',
          heal:        'Heal — autonomous recovery attempted',
          checkpoint:  'Checkpoint — state saved for rollback',
        };
        projection.log('  Optimization:');
        projection.log(`    Action: ${rlAction}${rlActionLabel[rlAction] ? ' — ' + rlActionLabel[rlAction].split(' — ')[1] : ''}`);
        if (totalReward !== undefined) {
          const rewardBar = totalReward >= 0
            ? '▓'.repeat(Math.min(10, Math.round(totalReward * 10))) + '░'.repeat(Math.max(0, 10 - Math.round(totalReward * 10)))
            : '░'.repeat(10);
          projection.log(`    Reward: ${totalReward >= 0 ? '+' : ''}${totalReward.toFixed(2)} [${rewardBar}]`);
        }
        projection.log('');

        // Timing
        const totalNs = timing.total_ns as number | undefined ?? 0;
        const totalMs = totalNs / 1_000_000;
        const timingHuman = totalMs >= 1
          ? `${totalMs.toFixed(1)} ms`
          : totalNs >= 1_000
            ? `${(totalNs / 1_000).toFixed(1)} µs`
            : `${totalNs.toFixed(0)} ns`;
        projection.log('  Timing:');
        projection.log(`    Total: ${timingHuman}`);
        projection.log('');

        // Result
        if (cycle.success) {
          projection.log('  Result: Cycle completed successfully');
        } else {
          projection.log('  Result: Cycle completed with warnings');
        }
      });
        return await exitWithFlush(result.exit_code);
      }),  // end withLogSession
        () => lateAttrs,
      );  // end withSpan
    } catch (error) {
      const result = makeErrorResult('autoprocess', error, EXIT_CODES.execution_error);
      emitResult(result, { format, verbose, quiet });
      return await exitWithFlush(result.exit_code);
    }
  },
});
