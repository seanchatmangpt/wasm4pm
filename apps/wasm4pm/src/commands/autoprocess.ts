import { defineCommand } from 'citty';
import * as fs from 'fs/promises';
import * as path from 'path';
import { emitResult, makeResult, makeErrorResult } from '../output.js';
import { EXIT_CODES, type ExitCode } from '../exit-codes.js';
import { WasmLoader } from '@wasm4pm/engine';

const AUTOPROCESS_STATE_FILE = '.wasm4pm/autoprocess-state.json';

async function ensureStateDir() {
  try {
    const dir = path.dirname(AUTOPROCESS_STATE_FILE);
    await fs.mkdir(dir, { recursive: true });
  } catch {
    // Directory might already exist
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
  },
  async run(ctx) {
    const t0 = performance.now();
    const format = (ctx.args.format as 'json' | 'human') ?? 'human';
    const verbose = Boolean(ctx.args.verbose);
    const quiet = Boolean(ctx.args.quiet);

    try {
      // 1. Load WASM module
      const loader = WasmLoader.getInstance();
      await loader.init();
      const wasm = loader.get();

      // 2. Load persisted state (RL, SPC, circuit breaker)
      await loadState(wasm);

      // 3. Load XES file
      const inputPath = ctx.args.input as string;
      const xesContent = await fs.readFile(inputPath, 'utf-8');
      const logHandle = wasm.load_eventlog_from_xes(xesContent);

      // 4. Run AutoProcess cycle
      const cycleConfig = (ctx.args.config as string) || '{}';
      const rawResult = wasm.autonomic_execute_cycle(
        logHandle,
        ctx.args['activity-key'],
        cycleConfig
      );
      const cycleResult = typeof rawResult === 'string' ? JSON.parse(rawResult) : rawResult;

      // 5. Save persisted state (RL, SPC, circuit breaker)
      await saveState(wasm);

      // 6. Cleanup
      wasm.delete_object(logHandle);

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
        projection.log('  Optimization:');
        projection.log(`    Action: ${optimization.rl_action}`);
        projection.log('');

        // Timing
        projection.log('  Timing:');
        projection.log(
          `    Total: ${timing.total_ns} ns (see benchmarks for nanosecond measurements)`
        );
        projection.log('');

        // Result
        if (cycle.success) {
          projection.log('  Result: Cycle completed successfully');
        } else {
          projection.log('  Result: Cycle completed with warnings');
        }
      });
      process.exit(result.exit_code);
    } catch (error) {
      // Determine correct exit code based on error type
      let exitCode: ExitCode = EXIT_CODES.execution_error;
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        exitCode = EXIT_CODES.source_error;
      }

      const result = makeErrorResult('autoprocess', error, exitCode);
      emitResult(result, { format, verbose, quiet });
      process.exit(result.exit_code);
    }
  },
});
