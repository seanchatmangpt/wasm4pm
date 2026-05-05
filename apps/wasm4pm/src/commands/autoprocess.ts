import { defineCommand } from 'citty';
import * as fs from 'fs/promises';
import * as path from 'path';
import { getFormatter, HumanFormatter, JSONFormatter } from '../output.js';
import { EXIT_CODES, type ExitCode } from '../exit-codes.js';
import { WasmLoader } from '@pictl/engine';
import type { OutputOptions } from '../output.js';

const AUTOPROCESS_STATE_FILE = '.pictl/autoprocess-state.json';

export interface AutoProcessOptions extends OutputOptions {
  'activity-key'?: string;
  config?: string;
}

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
  } catch (error) {
    // File doesn't exist or is invalid - that's okay, we'll start fresh
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
  } catch (error) {
    // Silently fail on save - don't block execution
  }
}

export const autoprocess = defineCommand({
  meta: {
    name: 'autoprocess',
    description:
      'Run AutoProcess: Perception → Decision → Protection → Optimization',
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
    const formatter = getFormatter({
      format: ctx.args.format as 'human' | 'json',
      verbose: ctx.args.verbose,
      quiet: ctx.args.quiet,
    });

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
        cycleConfig,
      );
      const result =
        typeof rawResult === 'string'
          ? JSON.parse(rawResult)
          : rawResult;

      // 4. Format output
      if (formatter instanceof JSONFormatter) {
        formatter.success('AutoProcess cycle completed', result);
      } else {
        const cycle = result.cycle_result;
        const timing = result.timing;

        formatter.info('AutoProcess Results');
        formatter.log('');

        // Perception
        formatter.log('  Perception:');
        formatter.log(
          `    Events: ${cycle.perception.event_count}`,
        );
        formatter.log(
          `    Activities: ${cycle.perception.unique_activities}`,
        );
        formatter.log(
          `    Traces: ${cycle.perception.trace_count}`,
        );
        formatter.log(
          `    Health: ${cycle.perception.health_state} (score ${cycle.perception.health_score})`,
        );
        formatter.log('');

        // Decision
        formatter.log('  Decision:');
        formatter.log(
          `    Guard: ${cycle.decision.guard_result ? 'PASS' : 'FAIL'}`,
        );
        formatter.log(
          `    Pattern: ${cycle.decision.pattern_result} (${cycle.decision.pattern_ticks} ticks)`,
        );
        formatter.log('');

        // Protection
        formatter.log('  Protection:');
        formatter.log(
          `    Circuit: ${cycle.protection.circuit_state}`,
        );
        const spc = cycle.protection.spc_results;
        if (spc) {
          const spcEntries = Object.entries(spc);
          for (const [metric, status] of spcEntries) {
            const icon = status === 'OK' ? '+' : status === 'ALERT' ? '!' : '-';
            formatter.log(`    SPC ${metric}: ${icon} ${status}`);
          }
        }
        formatter.log(
          `    Special Causes: ${cycle.protection.special_causes.length}`,
        );
        formatter.log('');

        // Optimization
        formatter.log('  Optimization:');
        formatter.log(
          `    Action: ${cycle.optimization.rl_action}`,
        );
        formatter.log('');

        // Timing
        formatter.log('  Timing:');
        formatter.log(
          `    Total: ${timing.total_ns} ns (see benchmarks for nanosecond measurements)`,
        );
        formatter.log('');

        // Success indicator
        if (cycle.success) {
          formatter.log('  Result: Cycle completed successfully');
        } else {
          formatter.log('  Result: Cycle completed with warnings');
        }
      }

      // 5. Save persisted state (RL, SPC, circuit breaker)
      await saveState(wasm);

      // 6. Cleanup
      wasm.delete_object(logHandle);

      // Use process.exit() to prevent citty from printing help text
      // The formatter uses synchronous console.log for output that flushes immediately
      process.exit(EXIT_CODES.success);
    } catch (error) {
      // Determine correct exit code based on error type
      let exitCode: ExitCode = EXIT_CODES.execution_error;

      // File not found or read errors are source errors
      if (error instanceof Error) {
        if ('code' in error && error.code === 'ENOENT') {
          exitCode = EXIT_CODES.source_error;
        }
      }

      if (formatter instanceof JSONFormatter) {
        formatter.error('AutoProcess failed', error);
      } else {
        formatter.error(
          `AutoProcess failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      process.exit(exitCode);
    }
  },
});
