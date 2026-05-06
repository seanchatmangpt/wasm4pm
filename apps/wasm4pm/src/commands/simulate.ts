import { defineCommand } from 'citty';
import * as fs from 'fs/promises';
import { emitResult, makeResult, makeErrorResult } from '../output.js';
import { EXIT_CODES } from '../exit-codes.js';
import { WasmLoader } from '@wasm4pm/engine';
import { createQuietObservabilityLayer } from '../observability-util.js';

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
    const t0 = performance.now();
    const format = (ctx.args.format as 'json' | 'human') ?? 'human';
    const verbose = Boolean(ctx.args.verbose);
    const quiet = Boolean(ctx.args.quiet);

    try {
      // Resolve input path (positional OR --file/-i)
      const inputPath: string | undefined =
        (ctx.args.input as string | undefined) || (ctx.args.file as string | undefined);

      if (!inputPath) {
        const result = makeErrorResult(
          'simulate',
          'Input file required.\n\nUsage:  wpm simulate <log.xes>\n        wpm simulate <log.xes> --cases 500\n\nRun "wpm simulate --help" for details.',
          EXIT_CODES.source_error,
          'MISSING_INPUT'
        );
        emitResult(result, { format, verbose, quiet });
        process.exit(result.exit_code);
      }

      try {
        await fs.access(inputPath);
      } catch {
        const result = makeErrorResult(
          'simulate',
          `Input file not found: ${inputPath}`,
          EXIT_CODES.source_error,
          'FILE_NOT_FOUND'
        );
        emitResult(result, { format, verbose, quiet });
        process.exit(result.exit_code);
      }

      const activityKey = (ctx.args['activity-key'] as string) || 'concept:name';
      const rawCases = ctx.args.cases as string | undefined;
      const parsedCases = rawCases != null ? parseInt(rawCases, 10) : undefined;
      if (parsedCases !== undefined && Number.isNaN(parsedCases)) {
        const result = makeErrorResult(
          'simulate',
          'Invalid --cases value: must be a number',
          EXIT_CODES.config_error,
          'INVALID_ARG'
        );
        emitResult(result, { format, verbose, quiet });
        process.exit(result.exit_code);
      }
      const numCases = parsedCases ?? 100;

      const rawTime = ctx.args.time as string | undefined;
      const parsedTime = rawTime != null ? parseInt(rawTime, 10) : undefined;
      if (parsedTime !== undefined && Number.isNaN(parsedTime)) {
        const result = makeErrorResult(
          'simulate',
          'Invalid --time value: must be a number',
          EXIT_CODES.config_error,
          'INVALID_ARG'
        );
        emitResult(result, { format, verbose, quiet });
        process.exit(result.exit_code);
      }
      const maxTime = parsedTime ?? 60000;
      const seed = ctx.args.seed
        ? parseInt(ctx.args.seed as string, 10)
        : Math.floor(Math.random() * 2_147_483_647);

      // Load WASM module
      const loaderConfig =
        format === 'json' ? { observability: createQuietObservabilityLayer() } : {};
      const loader = WasmLoader.getInstance(loaderConfig);
      await loader.init();
      const wasm = loader.get();

      const xesContent = await fs.readFile(inputPath, 'utf-8');
      const logHandle: string = wasm.load_eventlog_from_xes(xesContent);

      const config = JSON.stringify({
        num_cases: numCases,
        inter_arrival_mean_ms: 1000.0,
        activity_service_time_ms: {},
        resource_capacity: {},
        simulation_time_ms: maxTime,
        random_seed: seed,
      });
      const rawSim = wasm.monte_carlo_simulation(logHandle, '', '', config);
      const simResult = typeof rawSim === 'string' ? JSON.parse(rawSim) : rawSim;

      let playoutResult: Record<string, unknown> | null = null;
      try {
        const rawPlayout = wasm.simulate_process_tree_playout(
          logHandle,
          activityKey,
          numCases,
          seed
        );
        playoutResult = typeof rawPlayout === 'string' ? JSON.parse(rawPlayout) : rawPlayout;
      } catch {
        // Process tree playout not available
      }

      wasm.delete_object(logHandle);

      const payload = {
        input: inputPath,
        activityKey,
        simulation: {
          method: 'monte_carlo',
          casesRequested: numCases,
          casesCompleted: (simResult as Record<string, unknown>).completed_cases ?? numCases,
          elapsedMs: Math.round((performance.now() - t0) * 100) / 100,
          seed,
        },
        statistics: {
          avgTraceLength: (simResult as Record<string, unknown>).avg_trace_length ?? 0,
          avgSojournTime: (simResult as Record<string, unknown>).avg_sojourn_time ?? 0,
          resourceUtilization: (simResult as Record<string, unknown>).resource_utilization ?? 0,
        },
        traces: ((simResult as Record<string, unknown>).traces ?? []) as Array<Record<string, unknown>>,
        ...(playoutResult && { playout: playoutResult }),
      };

      const result = makeResult('simulate', payload, performance.now() - t0, EXIT_CODES.success);
      emitResult(result, { format, verbose, quiet }, (res, projection) => {
        printHumanSimulation(projection, res.payload as typeof payload);
      });
      process.exit(result.exit_code);
    } catch (error) {
      const result = makeErrorResult('simulate', error, EXIT_CODES.execution_error);
      emitResult(result, { format, verbose, quiet });
      process.exit(result.exit_code);
    }
  },
});

function printHumanSimulation(
  projection: import('../output.js').ConsoleProjection,
  payload: {
    input: string;
    activityKey: string;
    simulation: { method: string; casesRequested: number; casesCompleted: unknown; elapsedMs: number; seed: number };
    statistics: { avgTraceLength: unknown; avgSojournTime: unknown; resourceUtilization: unknown };
    traces: Array<Record<string, unknown>>;
  }
): void {
  const { simulation: sim, statistics: stats } = payload;

  projection.log('');
  projection.success(`Monte Carlo Simulation — ${payload.input}`);
  projection.log(`  Activity key: ${payload.activityKey}`);
  projection.log(`  Seed: ${sim.seed}`);
  projection.log('');
  projection.log('  Simulation:');
  projection.log(`    Cases requested:  ${sim.casesRequested}`);
  projection.log(`    Cases completed:  ${sim.casesCompleted}`);
  projection.log(`    Elapsed time:     ${sim.elapsedMs}ms`);
  projection.log('');
  projection.log('  Statistics:');
  projection.log(`    Avg trace length:    ${stats.avgTraceLength}`);
  projection.log(`    Avg sojourn time:    ${stats.avgSojournTime}`);
  projection.log(
    `    Resource utilization: ${((stats.resourceUtilization as number) * 100).toFixed(1)}%`
  );
  projection.log('');

  if (payload.traces.length > 0) {
    projection.log('  Sample traces (first 5):');
    for (const trace of payload.traces.slice(0, 5)) {
      const activities = trace.activities as string[];
      projection.log(`    ${activities.join(' → ')}`);
    }
    if (payload.traces.length > 5) {
      projection.log(`    ... and ${payload.traces.length - 5} more traces`);
    }
    projection.log('');
  }
}
