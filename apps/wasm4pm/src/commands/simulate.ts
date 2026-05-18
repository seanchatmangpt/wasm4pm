import { defineCommand } from 'citty';
import * as fs from 'fs/promises';
import { emitResult, makeResult, makeErrorResult } from '../output.js';
import { EXIT_CODES } from '../exit-codes.js';
import { withLogSession } from '../with-log-session.js';
import { withSpan } from './_otel.js';
import {
  saveCommandReceipt,
  blake3Hex,
  newReceipt,
  type CommandReceipt,
} from '../receipts/_shared.js';
import { exitWithFlush } from '../otel/exit.js';

export const simulate = defineCommand({
  meta: {
    name: 'simulate',
    description:
      'Monte Carlo simulation and DFG playout to generate synthetic event log traces.\n' +
      '\n' +
      'Examples:\n' +
      '  wpm simulate log.xes                          # simulate 100 cases, random seed\n' +
      '  wpm simulate log.xes --cases 500              # simulate 500 cases\n' +
      '  wpm simulate log.xes --cases 200 --seed 42    # reproducible run (fixed seed)\n' +
      '  wpm simulate log.xes --time 120000            # cap at 120 s wall time\n' +
      '  wpm simulate log.xes --format json            # machine-readable output\n' +
      '\n' +
      'Output includes: sojourn-time distribution (mean, P5/P50/P95), resource utilisation,\n' +
      '  avg trace length, and DFG playout traces (when available).\n' +
      '\n' +
      'Exit codes: 0=success  1=config/arg error  2=source/file error  3=execution error',
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

    // Late attributes captured after Monte Carlo simulation completes.
    // These output metrics are only known after WASM returns — cannot be set at span-open time.
    let lateCasesCompleted = 0;
    let lateAvgSojournMs = 0;
    let lateP95SojournMs = 0;
    let lateStatus = 'ok';

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
              new Error(
                `Invalid --cases value '${rawCases}': must be a positive integer.\n\n` +
                  `  --cases sets the number of synthetic traces to generate (default: 100).\n` +
                  `  Example: wpm simulate <log.xes> --cases 500`
              ),
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
              new Error(
                `Invalid --time value '${rawTime}': must be a positive integer (milliseconds).\n\n` +
                  `  --time sets the maximum simulation duration in milliseconds (default: 60000).\n` +
                  `  Example: wpm simulate <log.xes> --time 120000`
              ),
              EXIT_CODES.config_error,
              'INVALID_ARG'
            );
            emitResult(result, { format, verbose, quiet });
            return await exitWithFlush(result.exit_code);
          }
          const maxTime = parsedTime ?? 60000;
          const rawSeed = ctx.args.seed as string | undefined;
          const parsedSeed = rawSeed != null ? parseInt(rawSeed, 10) : undefined;
          if (parsedSeed !== undefined && Number.isNaN(parsedSeed)) {
            const result = makeErrorResult(
              'simulate',
              new Error(
                `Invalid --seed value '${rawSeed}': must be an integer.\n\n` +
                  `  --seed sets the random seed for reproducible simulation runs.\n` +
                  `  Example: wpm simulate <log.xes> --seed 42`
              ),
              EXIT_CODES.config_error,
              'INVALID_ARG'
            );
            emitResult(result, { format, verbose, quiet });
            return await exitWithFlush(result.exit_code);
          }
          const seed = parsedSeed != null ? parsedSeed : Math.floor(Math.random() * 2_147_483_647);

          await withLogSession(
            {
              inputPath,
              activityKey,
              commandName: 'simulate',
              emitOptions: { format, verbose, quiet },
            },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            async (wasmBase, logHandle) => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const wasm = wasmBase as Record<string, any>;

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
              const sim = simResult as Record<string, unknown>;

              // Attempt DFG playout using the real WASM export `play_out_dfg`.
              // The previously used alias `simulate_process_tree_playout` was never
              // exported by the WASM binary and always threw silently. We now
              // discover the DFG first and hand its JSON to play_out_dfg.
              let playoutResult: Record<string, unknown> | null = null;
              try {
                const rawDfg = wasm.discover_dfg(logHandle, activityKey);
                const dfgJson = typeof rawDfg === 'string' ? rawDfg : JSON.stringify(rawDfg);
                const playoutParams = { num_traces: numCases };
                const rawPlayout = wasm.play_out_dfg(dfgJson, playoutParams);
                playoutResult =
                  typeof rawPlayout === 'string' ? JSON.parse(rawPlayout) : rawPlayout;
              } catch {
                // DFG playout not available in this WASM profile — silent skip
              }

              // resource_utilization is HashMap<String, f64>; compute mean across resources
              const resourceUtil = sim.resource_utilization;
              const resourceUtilMean = (() => {
                if (typeof resourceUtil === 'object' && resourceUtil !== null) {
                  const vals = Object.values(resourceUtil as Record<string, number>);
                  return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
                }
                return typeof resourceUtil === 'number' ? resourceUtil : 0;
              })();

              const payload = {
                input: inputPath,
                activityKey,
                simulation: {
                  method: 'monte_carlo',
                  casesRequested: numCases,
                  casesCompleted: sim.completed_cases ?? numCases,
                  elapsedMs: Math.round((performance.now() - t0) * 100) / 100,
                  seed,
                },
                statistics: {
                  avgTraceLength: sim.avg_trace_length ?? 0,
                  avgSojournTimeMs: sim.avg_sojourn_time_ms ?? 0,
                  sojournTimeStdMs: sim.sojourn_time_std_ms ?? 0,
                  sojournTimeP5Ms: sim.sojourn_time_p5_ms ?? 0,
                  sojournTimeP50Ms: sim.sojourn_time_p50_ms ?? 0,
                  sojournTimeP95Ms: sim.sojourn_time_p95_ms ?? 0,
                  resourceUtilization: resourceUtilMean,
                  resourceUtilizationByActivity:
                    (sim.resource_utilization as Record<string, number> | undefined) ?? {},
                  activityStatistics:
                    (sim.activity_statistics as Record<string, unknown> | undefined) ?? {},
                },
                traces: (sim.traces ?? []) as Array<Record<string, unknown>>,
                ...(playoutResult && { playout: playoutResult }),
              };

              // Capture output metrics for late OTEL span attributes
              lateCasesCompleted =
                typeof payload.simulation.casesCompleted === 'number'
                  ? payload.simulation.casesCompleted
                  : numCases;
              lateAvgSojournMs =
                typeof payload.statistics.avgSojournTimeMs === 'number'
                  ? payload.statistics.avgSojournTimeMs
                  : 0;
              lateP95SojournMs =
                typeof payload.statistics.sojournTimeP95Ms === 'number'
                  ? payload.statistics.sojournTimeP95Ms
                  : 0;
              lateStatus = 'ok';

              const result = makeResult(
                'simulate',
                payload,
                performance.now() - t0,
                EXIT_CODES.success
              );
              emitResult(result, { format, verbose, quiet }, (res, projection) => {
                printHumanSimulation(projection, res.payload as typeof payload);
              });

              if (!ctx.args['no-save']) {
                try {
                  const inputBytes = await fs
                    .readFile(inputPath!)
                    .catch(() => Buffer.from(inputPath!));
                  const receipt: CommandReceipt = {
                    ...newReceipt('simulate'),
                    command: 'simulate',
                    input_hash: blake3Hex(inputBytes),
                    output_hash: blake3Hex(JSON.stringify(payload)),
                    status: 'success',
                    summary: {
                      cases_simulated: payload.simulation.casesCompleted,
                      avg_sojourn_time_ms: payload.statistics.avgSojournTimeMs,
                      seed,
                      model_kind: 'monte-carlo',
                    },
                  };
                  saveCommandReceipt(receipt);
                } catch {
                  /* receipt write must never break the command */
                }
              }

              return await exitWithFlush(result.exit_code);
            }
          ); // end withLogSession
        } catch (error) {
          lateStatus = 'error';
          const result = makeErrorResult('simulate', error, EXIT_CODES.execution_error);
          emitResult(result, { format, verbose, quiet });
          return await exitWithFlush(result.exit_code);
        }
      },
      // getLateAttrs: emit simulation output metrics as OTEL span attributes.
      // avg_sojourn_time_ms and p95_sojourn_time_ms are key performance indicators
      // for the Van der Aalst temporal perspective (remaining-time prediction context).
      () => ({
        cases_completed: lateCasesCompleted,
        avg_sojourn_time_ms: lateAvgSojournMs,
        p95_sojourn_time_ms: lateP95SojournMs,
        status: lateStatus,
      })
    );
  },
});

function fmt(n: unknown, decimals = 1): string {
  if (typeof n !== 'number' || !isFinite(n)) return '—';
  return n.toFixed(decimals);
}

function printHumanSimulation(
  projection: import('../output.js').ConsoleProjection,
  payload: {
    input: string;
    activityKey: string;
    simulation: {
      method: string;
      casesRequested: number;
      casesCompleted: unknown;
      elapsedMs: number;
      seed: number;
    };
    statistics: {
      avgTraceLength: unknown;
      avgSojournTimeMs: unknown;
      sojournTimeStdMs: unknown;
      sojournTimeP5Ms: unknown;
      sojournTimeP50Ms: unknown;
      sojournTimeP95Ms: unknown;
      resourceUtilization: unknown;
    };
    traces: Array<Record<string, unknown>>;
    playout?: Record<string, unknown>;
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
  projection.log('  Performance distribution (sojourn time per simulated case):');
  projection.log(`    Mean:   ${fmt(stats.avgSojournTimeMs, 1)} ms`);
  projection.log(`    Std:    ${fmt(stats.sojournTimeStdMs, 1)} ms`);
  projection.log(`    P5:     ${fmt(stats.sojournTimeP5Ms, 1)} ms`);
  projection.log(`    Median: ${fmt(stats.sojournTimeP50Ms, 1)} ms`);
  projection.log(`    P95:    ${fmt(stats.sojournTimeP95Ms, 1)} ms`);
  projection.log('');

  // Plain-English interpretation of the simulation distribution
  const p50Ms = typeof stats.sojournTimeP50Ms === 'number' ? stats.sojournTimeP50Ms : 0;
  const p95Ms = typeof stats.sojournTimeP95Ms === 'number' ? stats.sojournTimeP95Ms : 0;
  const fmtDuration = (ms: number): string => {
    if (ms >= 86_400_000) return `${(ms / 86_400_000).toFixed(1)} days`;
    if (ms >= 3_600_000) return `${(ms / 3_600_000).toFixed(1)} hours`;
    if (ms >= 60_000) return `${(ms / 60_000).toFixed(1)} minutes`;
    return `${ms.toFixed(0)} ms`;
  };
  if (p50Ms > 0 || p95Ms > 0) {
    projection.log(`  Interpretation:`);
    projection.log(
      `    Median completion: ${fmtDuration(p50Ms)} — half of simulated cases finish faster than this.`
    );
    if (p95Ms > 0) {
      projection.log(
        `    P95 completion:    ${fmtDuration(p95Ms)} — 95% of cases finish within this time; 5% take longer.`
      );
    }
    projection.log('');
  }

  projection.log('  Process structure:');
  projection.log(`    Avg trace length:   ${fmt(stats.avgTraceLength, 2)} activities`);
  projection.log(`    Avg resource util:  ${fmt((stats.resourceUtilization as number) * 100, 1)}%`);
  projection.log('');

  projection.log('  Next steps:');
  projection.log(
    `    Run "wpm temporal ${payload.input}" to compare simulated distributions against`
  );
  projection.log(`    real event-log performance (service time vs waiting time per activity).`);
  projection.log('');

  if (payload.playout) {
    const p = payload.playout;
    projection.log('  DFG playout:');
    if (p.trace_count !== undefined) {
      projection.log(`    Traces generated: ${p.trace_count}`);
    }
    if (p.event_count !== undefined) {
      projection.log(`    Events generated: ${p.event_count}`);
    }
    if (p.handle !== undefined) {
      projection.log(`    Result handle:    ${p.handle}`);
    }
    projection.log('');
  }
}
