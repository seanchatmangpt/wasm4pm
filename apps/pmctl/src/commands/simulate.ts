import { defineCommand } from 'citty';
import * as fs from 'fs/promises';
import { getFormatter, HumanFormatter, JSONFormatter } from '../output.js';
import { EXIT_CODES } from '../exit-codes.js';
import type { OutputOptions } from '../output.js';
import { WasmLoader } from '@pictl/engine';

export interface SimulateOptions extends OutputOptions {
  input?: string;
  cases?: number;
  time?: number;
  seed?: number;
  activityKey?: string;
}

export const simulate = defineCommand({
  meta: {
    name: 'simulate',
    description: 'Monte Carlo simulation and process tree playout to generate synthetic traces',
  },
  args: {
    input: {
      type: 'positional',
      description: 'Path to XES event log file',
      required: false,
    },
    file: {
      type: 'string',
      description: 'Path to XES event log file (named alternative to positional)',
      alias: 'i',
    },
    cases: {
      type: 'string',
      description: 'Number of cases to simulate (default: 100)',
      default: '100',
    },
    time: {
      type: 'string',
      description: 'Maximum simulation time in milliseconds (default: 60000)',
      default: '60000',
    },
    seed: {
      type: 'string',
      description: 'Random seed for reproducibility (default: random)',
    },
    'activity-key': {
      type: 'string',
      description: 'XES activity attribute key (default: concept:name)',
      default: 'concept:name',
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
      // Resolve input path (positional OR --file/-i)
      const inputPath: string | undefined =
        (ctx.args.input as string | undefined) || (ctx.args.file as string | undefined);

      if (!inputPath) {
        formatter.error(
          'Input file required.\n\nUsage:  pictl simulate <log.xes>\n        pictl simulate <log.xes> --cases 500\n\nRun "pictl simulate --help" for details.'
        );
        process.exit(EXIT_CODES.source_error);
      }

      // Validate input file exists
      try {
        await fs.access(inputPath);
      } catch {
        formatter.error(`Input file not found: ${inputPath}`);
        process.exit(EXIT_CODES.source_error);
      }

      const activityKey = (ctx.args['activity-key'] as string) || 'concept:name';
      const numCases = parseInt((ctx.args.cases as string) || '100', 10);
      const maxTime = parseInt((ctx.args.time as string) || '60000', 10);
      const seed = ctx.args.seed ? parseInt(ctx.args.seed as string, 10) : Math.floor(Math.random() * 2_147_483_647);

      if (formatter instanceof HumanFormatter) {
        formatter.info(`Monte Carlo simulation: ${inputPath}`);
        formatter.debug(`Cases: ${numCases}, Max time: ${maxTime}ms, Seed: ${seed}`);
      }

      // Load WASM module
      const loader = WasmLoader.getInstance();
      await loader.init();
      const wasm = loader.get();

      // Parse XES and load log
      if (formatter instanceof HumanFormatter) {
        formatter.debug('Loading event log from XES file...');
      }

      const xesContent = await fs.readFile(inputPath, 'utf-8');
      const logHandle: string = wasm.load_eventlog_from_xes(xesContent);

      // Discover process tree for simulation
      if (formatter instanceof HumanFormatter) {
        formatter.debug('Discovering process tree for simulation...');
      }

      const rawTree = wasm.discover_inductive_miner(logHandle, activityKey);
      const processTree = typeof rawTree === 'string' ? JSON.parse(rawTree) : rawTree;

      // Run Monte Carlo simulation
      if (formatter instanceof HumanFormatter) {
        formatter.debug('Running Monte Carlo simulation...');
      }

      const t0 = performance.now();
      const rawSim = wasm.simulate_monte_carlo(logHandle, activityKey, numCases, maxTime, seed);
      const elapsedMs = performance.now() - t0;

      const simResult = typeof rawSim === 'string' ? JSON.parse(rawSim) : rawSim;

      // Extract process tree playout results if available
      let playoutResult: Record<string, unknown> | null = null;
      try {
        const rawPlayout = wasm.simulate_process_tree_playout(logHandle, activityKey, numCases, seed);
        playoutResult = typeof rawPlayout === 'string' ? JSON.parse(rawPlayout) : rawPlayout;
      } catch {
        // Process tree playout not available
      }

      // Free log handle
      try {
        wasm.delete_object(logHandle);
      } catch {
        /* best-effort */
      }

      // Build result
      const result = {
        status: 'success',
        input: inputPath,
        activityKey,
        simulation: {
          method: 'monte_carlo',
          casesRequested: numCases,
          casesCompleted: (simResult as Record<string, unknown>).completed_cases ?? numCases,
          elapsedMs: Math.round(elapsedMs * 100) / 100,
          seed,
        },
        statistics: {
          avgTraceLength: (simResult as Record<string, unknown>).avg_trace_length ?? 0,
          avgSojournTime: (simResult as Record<string, unknown>).avg_sojourn_time ?? 0,
          resourceUtilization: (simResult as Record<string, unknown>).resource_utilization ?? 0,
        },
        traces: (simResult as Record<string, unknown>).traces ?? [],
        ...(playoutResult && { playout: playoutResult }),
      };

      // Output results
      if (formatter instanceof JSONFormatter) {
        formatter.success('Simulation complete', result);
      } else {
        printHumanSimulation(formatter as HumanFormatter, result);
      }

      process.exit(EXIT_CODES.success);
    } catch (error) {
      if (formatter instanceof JSONFormatter) {
        formatter.error('Simulation failed', error);
      } else {
        formatter.error(
          `Simulation failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
      process.exit(EXIT_CODES.execution_error);
    }
  },
});

function printHumanSimulation(formatter: HumanFormatter, result: Record<string, unknown>): void {
  const sim = result.simulation as Record<string, unknown>;
  const stats = result.statistics as Record<string, unknown>;

  formatter.log('');
  formatter.success(`Monte Carlo Simulation — ${result.input as string}`);
  formatter.log(`  Activity key: ${result.activityKey as string}`);
  formatter.log(`  Seed: ${sim.seed as number}`);
  formatter.log('');
  formatter.log('  Simulation:');
  formatter.log(`    Cases requested:  ${sim.casesRequested as number}`);
  formatter.log(`    Cases completed:  ${sim.casesCompleted as number}`);
  formatter.log(`    Elapsed time:     ${sim.elapsedMs as number}ms`);
  formatter.log('');
  formatter.log('  Statistics:');
  formatter.log(`    Avg trace length:    ${stats.avgTraceLength as number}`);
  formatter.log(`    Avg sojourn time:    ${stats.avgSojournTime as number}`);
  formatter.log(`    Resource utilization: ${((stats.resourceUtilization as number) * 100).toFixed(1)}%`);
  formatter.log('');

  const traces = result.traces as Array<Record<string, unknown>>;
  if (traces.length > 0 && formatter instanceof HumanFormatter) {
    formatter.log('  Sample traces (first 5):');
    for (const trace of traces.slice(0, 5)) {
      const activities = trace.activities as string[];
      formatter.log(`    ${activities.join(' → ')}`);
    }
    if (traces.length > 5) {
      formatter.log(`    ... and ${traces.length - 5} more traces`);
    }
    formatter.log('');
  }
}
