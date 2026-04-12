import { defineCommand } from 'citty';
import * as fs from 'fs/promises';
import { getFormatter, HumanFormatter, JSONFormatter } from '../output.js';
import { EXIT_CODES } from '../exit-codes.js';
import { WasmLoader } from '@pictl/engine';
import type { OutputOptions } from '../output.js';

export interface AutoProcessOptions extends OutputOptions {
  'activity-key'?: string;
  config?: string;
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

      // 2. Load XES file
      const inputPath = ctx.args.input as string;
      const xesContent = await fs.readFile(inputPath, 'utf-8');
      const logHandle = wasm.load_eventlog_from_xes(xesContent);

      // 3. Run AutoProcess cycle
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

      // 5. Cleanup
      wasm.delete_object(logHandle);

      process.exit(EXIT_CODES.success);
    } catch (error) {
      if (formatter instanceof JSONFormatter) {
        formatter.error('AutoProcess failed', error);
      } else {
        formatter.error(
          `AutoProcess failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      process.exit(EXIT_CODES.execution_error);
    }
  },
});
