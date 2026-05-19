import { defineCommand } from 'citty';
import * as fs from 'fs/promises';
import { emitResult, makeResult, makeErrorResult } from '../output.js';
import { EXIT_CODES } from '../exit-codes.js';
import { withLogSession } from '../with-log-session.js';
import { withSpan } from './_otel.js';
import { saveCommandReceipt, blake3Hex, newReceipt, type CommandReceipt } from '../receipts/_shared.js';
import { exitWithFlush } from '../otel/exit.js';

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
    iterations: {
      type: 'string',
      description: 'Number of simulation runs to execute for statistics (default: 1)',
      default: '1',
    },
    seed: {
      type: 'string',
      description: 'Random seed for reproducibility (default: random)',
    },
    'max-duration': {
      type: 'string',
      description: 'Stop simulations after N milliseconds of wall-clock time (default: unlimited)',
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
    'no-save': {
      type: 'boolean',
      description: 'Skip auto-save and BLAKE3 receipt',
    },
  },
  async run(ctx) {
    const t0 = performance.now();
    const format = (ctx.args.format as 'json' | 'human') ?? 'human';
    const verbose = Boolean(ctx.args.verbose);
    const quiet = Boolean(ctx.args.quiet);

    return withSpan(
      'simulate',
      {
        input: String(ctx.args.input ?? ctx.args.file ?? ''),
        activity_key: String(ctx.args['activity-key'] ?? ''),
        cases: Number(ctx.args.cases ?? 0),
        time: Number(ctx.args.time ?? 0),
        seed: Number(ctx.args.seed ?? 0),
        format,
      },
      async () => {
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
        return await exitWithFlush(result.exit_code);
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
        return await exitWithFlush(result.exit_code);
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
        return await exitWithFlush(result.exit_code);
      }
      const maxTime = parsedTime ?? 60000;

      const rawIterations = ctx.args.iterations as string | undefined;
      const parsedIterations = rawIterations != null ? parseInt(rawIterations, 10) : undefined;
      if (parsedIterations !== undefined && Number.isNaN(parsedIterations)) {
        const result = makeErrorResult(
          'simulate',
          'Invalid --iterations value: must be a number',
          EXIT_CODES.config_error,
          'INVALID_ARG'
        );
        emitResult(result, { format, verbose, quiet });
        return await exitWithFlush(result.exit_code);
      }
      const numIterations = Math.max(1, parsedIterations ?? 1);

      const rawMaxDuration = ctx.args['max-duration'] as string | undefined;
      const parsedMaxDuration = rawMaxDuration != null ? parseInt(rawMaxDuration, 10) : undefined;
      if (parsedMaxDuration !== undefined && Number.isNaN(parsedMaxDuration)) {
        const result = makeErrorResult(
          'simulate',
          'Invalid --max-duration value: must be a number',
          EXIT_CODES.config_error,
          'INVALID_ARG'
        );
        emitResult(result, { format, verbose, quiet });
        return await exitWithFlush(result.exit_code);
      }
      const maxDuration = parsedMaxDuration;

      const rawSeed = ctx.args.seed as string | undefined;
      const parsedSeed = rawSeed != null ? parseInt(rawSeed, 10) : undefined;
      if (parsedSeed !== undefined && Number.isNaN(parsedSeed)) {
        const result = makeErrorResult(
          'simulate',
          'Invalid --seed value: must be a number',
          EXIT_CODES.config_error,
          'INVALID_ARG'
        );
        emitResult(result, { format, verbose, quiet });
        return await exitWithFlush(result.exit_code);
      }
      const baseSeed = parsedSeed ?? Math.floor(Math.random() * 2_147_483_647);

      await withLogSession(
        { inputPath, activityKey, commandName: 'simulate', emitOptions: { format, verbose, quiet } },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (wasmBase, logHandle) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const wasm = wasmBase as Record<string, any>;

        // Run multiple iterations if requested
        const iterationResults: Array<{ traceLengths: number[]; duration: number }> = [];
        const wallClockStart = Date.now();

        for (let iter = 0; iter < numIterations; iter++) {
          // Check max-duration wall-clock limit
          if (maxDuration && Date.now() - wallClockStart > maxDuration) {
            break;
          }

          const iterSeed = baseSeed + iter; // Vary seed per iteration
          const config = JSON.stringify({
            num_cases: numCases,
            inter_arrival_mean_ms: 1000.0,
            activity_service_time_ms: {},
            resource_capacity: {},
            simulation_time_ms: maxTime,
            random_seed: iterSeed,
          });

          const rawSim = wasm.monte_carlo_simulation(logHandle, '', '', config);
          const simResult = typeof rawSim === 'string' ? JSON.parse(rawSim) : rawSim;
          const traces = ((simResult as Record<string, unknown>).traces ?? []) as Array<Record<string, unknown>>;
          const traceLengths = traces.map((t) => {
            const activities = t.activities as string[] | undefined;
            return activities ? activities.length : 0;
          });

          iterationResults.push({
            traceLengths,
            duration: (simResult as Record<string, unknown>).simulation_time_ms as number ?? maxTime,
          });
        }

        // Compute statistics across iterations
        const allTraceLengths: number[] = [];
        const allDurations: number[] = [];
        for (const iter of iterationResults) {
          allTraceLengths.push(...iter.traceLengths);
          allDurations.push(iter.duration);
        }

        const computeStats = (values: number[]) => {
          if (values.length === 0) {
            return { mean: 0, std: 0, p95: 0, min: 0, max: 0 };
          }
          const sorted = [...values].sort((a, b) => a - b);
          const mean = values.reduce((a, b) => a + b, 0) / values.length;
          const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
          const std = Math.sqrt(variance);
          const p95Index = Math.ceil(sorted.length * 0.95) - 1;
          return {
            mean: Math.round(mean * 100) / 100,
            std: Math.round(std * 100) / 100,
            p95: sorted[Math.max(0, p95Index)],
            min: sorted[0],
            max: sorted[sorted.length - 1],
          };
        };

        const traceStats = computeStats(allTraceLengths);
        const durationStats = computeStats(allDurations);

        // Discover variants in aggregated results
        const variantSet = new Set<string>();
        for (const iter of iterationResults) {
          if (iter.traceLengths.length > 0) {
            variantSet.add(iter.traceLengths.join(','));
          }
        }

        const payload = {
          input: inputPath,
          activityKey,
          simulation: {
            method: 'monte_carlo',
            casesRequested: numCases,
            casesCompleted: allTraceLengths.length,
            iterations: numIterations,
            completedIterations: iterationResults.length,
            elapsedMs: Math.round((performance.now() - t0) * 100) / 100,
            seed: baseSeed,
            maxDuration: maxDuration ?? null,
          },
          statistics: {
            traceCount: allTraceLengths.length,
            traceLengths: traceStats,
            durations: durationStats,
            variantsDiscovered: variantSet.size,
          },
        };

        const result = makeResult('simulate', payload, performance.now() - t0, EXIT_CODES.success);
        emitResult(result, { format, verbose, quiet }, (res, projection) => {
          printHumanSimulation(projection, res.payload as typeof payload);
        });

        if (!ctx.args['no-save']) {
          try {
            const inputBytes = await fs.readFile(inputPath!).catch(() => Buffer.from(inputPath!));
            const receipt: CommandReceipt = {
              ...newReceipt('simulate'),
              command: 'simulate',
              input_hash: blake3Hex(inputBytes),
              output_hash: blake3Hex(JSON.stringify(payload)),
              status: 'success',
              summary: {
                cases_generated: allTraceLengths.length,
                iterations: iterationResults.length,
                seed: baseSeed,
                model_kind: 'monte-carlo',
              },
            };
            saveCommandReceipt(receipt);
          } catch {
            /* receipt write must never break the command */
          }
        }

        return await exitWithFlush(result.exit_code);
      });  // end withLogSession
    } catch (error) {
      const result = makeErrorResult('simulate', error, EXIT_CODES.execution_error);
      emitResult(result, { format, verbose, quiet });
      return await exitWithFlush(result.exit_code);
    }
      },
    );
  },
});

function printHumanSimulation(
  projection: import('../output.js').ConsoleProjection,
  payload: {
    input: string;
    activityKey: string;
    simulation: { method: string; casesRequested: number; casesCompleted: number; iterations: number; completedIterations: number; elapsedMs: number; seed: number; maxDuration: number | null };
    statistics: { traceCount: number; traceLengths: { mean: number; std: number; p95: number; min: number; max: number }; durations: { mean: number; std: number; p95: number; min: number; max: number }; variantsDiscovered: number };
  }
): void {
  const { simulation: sim, statistics: stats } = payload;

  projection.log('');
  projection.success(`Monte Carlo Simulation — ${payload.input}`);
  projection.log(`  Activity key: ${payload.activityKey}`);
  projection.log(`  Seed: ${sim.seed}`);
  projection.log('');
  projection.log('  Simulation:');
  projection.log(`    Cases requested:    ${sim.casesRequested}`);
  projection.log(`    Cases completed:    ${sim.casesCompleted}`);
  projection.log(`    Iterations:         ${sim.iterations}`);
  projection.log(`    Completed:          ${sim.completedIterations}`);
  projection.log(`    Elapsed time:       ${sim.elapsedMs}ms`);
  if (sim.maxDuration !== null) {
    projection.log(`    Max duration:       ${sim.maxDuration}ms`);
  }
  projection.log('');
  projection.log('  Trace Statistics:');
  projection.log(`    Total traces:       ${stats.traceCount}`);
  projection.log(`    Trace length (activities):
      Mean:    ${stats.traceLengths.mean.toFixed(2)}
      Std:     ${stats.traceLengths.std.toFixed(2)}
      P95:     ${stats.traceLengths.p95}
      Range:   [${stats.traceLengths.min}, ${stats.traceLengths.max}]`);
  projection.log('');
  projection.log('  Duration Statistics (ms):');
  projection.log(`    Duration:
      Mean:    ${stats.durations.mean.toFixed(2)}
      Std:     ${stats.durations.std.toFixed(2)}
      P95:     ${stats.durations.p95}
      Range:   [${stats.durations.min}, ${stats.durations.max}]`);
  projection.log('');
  projection.log(`  Variants discovered: ${stats.variantsDiscovered}`);
  projection.log('');
}
