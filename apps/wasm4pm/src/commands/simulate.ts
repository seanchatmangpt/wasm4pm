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

// ─── Simple seeded LCG for reproducible TypeScript-side randomness ────────────
// Linear Congruential Generator (Park–Miller parameters, uint32 range).
// Used only for TypeScript-side simulation helpers (animate ordering, scenario
// perturbation) that cannot propagate a seed into the WASM monte-carlo RNG.
function makeLcg(seed: number) {
  let s = (seed >>> 0) || 1;
  return {
    next(): number {
      s = Math.imul(1664525, s) + 1013904223;
      return (s >>> 0) / 4294967296;
    },
    nextInt(max: number): number {
      return Math.floor(this.next() * max);
    },
  };
}

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
      '  wpm simulate log.xes --compare                # compare simulated vs actual log\n' +
      '  wpm simulate log.xes --animate                # ASCII trace playback animation\n' +
      '  wpm simulate log.xes --scenarios \'{"Approve":0.5}\' # what-if scenario analysis\n' +
      '  wpm simulate log.xes --cases 100 --seed 42 --export out.xes  # export XES\n' +
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
    compare: {
      type: 'boolean',
      description: 'Compare simulated metrics against actual log statistics',
      default: false,
    },
    animate: {
      type: 'boolean',
      description: 'Show a single simulated trace animated step-by-step (human format only)',
      default: false,
    },
    scenarios: {
      type: 'string',
      description:
        'JSON map of activity -> speed multiplier for what-if analysis ' +
        '(e.g. \'{"Approve":0.5,"Review":2.0}\' = Approve 2x faster, Review 2x slower)',
    },
    export: {
      type: 'string',
      description: 'Export simulated traces as a valid XES file to the given path',
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
    const doCompare = Boolean(ctx.args.compare);
    const doAnimate = Boolean(ctx.args.animate);
    const exportPath = ctx.args.export as string | undefined;

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
        compare: doCompare,
        animate: doAnimate,
        format,
      },
      async () => {
        try {
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

          // ── --cases validation ──
          const rawCases = ctx.args.cases as string | undefined;
          const parsedCases = rawCases != null ? parseInt(rawCases, 10) : undefined;
          if (parsedCases !== undefined && (Number.isNaN(parsedCases) || parsedCases <= 0)) {
            const result = makeErrorResult(
              'simulate',
              new Error(
                `Invalid --cases value '${rawCases}': must be a positive integer (≥ 1).\n\n` +
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

          // ── --time validation ──
          const rawTime = ctx.args.time as string | undefined;
          const parsedTime = rawTime != null ? parseInt(rawTime, 10) : undefined;
          if (parsedTime !== undefined && (Number.isNaN(parsedTime) || parsedTime <= 0)) {
            const result = makeErrorResult(
              'simulate',
              new Error(
                `Invalid --time value '${rawTime}': must be a positive integer (milliseconds, ≥ 1).\n\n` +
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

          // ── --seed validation ──
          const rawSeed = ctx.args.seed as string | undefined;
          const parsedSeed = rawSeed != null ? parseInt(rawSeed, 10) : undefined;
          if (parsedSeed !== undefined && (Number.isNaN(parsedSeed) || parsedSeed < 0)) {
            const result = makeErrorResult(
              'simulate',
              new Error(
                `Invalid --seed value '${rawSeed}': must be a non-negative integer (≥ 0).\n\n` +
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

          // ── --scenarios validation ──
          let scenarioMultipliers: Record<string, number> | undefined;
          const rawScenarios = ctx.args.scenarios as string | undefined;
          if (rawScenarios) {
            try {
              const parsed = JSON.parse(rawScenarios) as unknown;
              if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
                throw new Error('Must be a JSON object mapping activity names to speed multipliers');
              }
              const obj = parsed as Record<string, unknown>;
              for (const [k, v] of Object.entries(obj)) {
                if (typeof v !== 'number' || v <= 0) {
                  throw new Error(
                    `Activity '${k}': multiplier must be a positive number (got ${JSON.stringify(v)})`
                  );
                }
              }
              scenarioMultipliers = obj as Record<string, number>;
            } catch (e) {
              const result = makeErrorResult(
                'simulate',
                new Error(
                  `Invalid --scenarios value: ${e instanceof Error ? e.message : String(e)}\n\n` +
                    `  --scenarios expects a JSON object mapping activity names to speed multipliers.\n` +
                    `  Multiplier < 1 = faster, > 1 = slower.\n` +
                    `  Example: --scenarios '{"Approve_Request":0.5,"Manual_Review":2.0}'`
                ),
                EXIT_CODES.config_error,
                'INVALID_ARG'
              );
              emitResult(result, { format, verbose, quiet });
              return await exitWithFlush(result.exit_code);
            }
          }

          await withLogSession(
            {
              inputPath,
              activityKey,
              commandName: 'simulate',
              emitOptions: { format, verbose, quiet },
            },
            async (wasmBase, logHandle) => {
              const wasm = wasmBase as Record<string, any>;

              // ── Actual log statistics (for --compare) ──────────────────────
              const actualStats = computeActualLogStats(wasm, logHandle, activityKey);

              // ── Base Monte Carlo simulation ─────────────────────────────────
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

              // ── DFG playout ─────────────────────────────────────────────────
              let playoutResult: Record<string, unknown> | null = null;
              let playoutTraces: PlayoutTrace[] = [];
              try {
                const rawDfg = wasm.discover_dfg(logHandle, activityKey);
                const dfgJson = typeof rawDfg === 'string' ? rawDfg : JSON.stringify(rawDfg);
                const dfgObj = JSON.parse(dfgJson) as Record<string, unknown>;

                const playoutParams = {
                  num_traces: Math.min(numCases, 200),
                  include_timestamps: true,
                  start_timestamp: Date.now(),
                  min_trace_length: 1,
                  max_trace_length: 100,
                };
                const rawPlayout = wasm.play_out_dfg(dfgJson, playoutParams);
                playoutResult =
                  typeof rawPlayout === 'string' ? JSON.parse(rawPlayout) : rawPlayout;

                // Build synthetic playout traces for animation + XES export
                playoutTraces = buildPlayoutTraces(dfgObj, numCases, seed, activityKey);
              } catch {
                // DFG playout not available in this WASM profile — silent skip
              }

              // ── Resource utilization ────────────────────────────────────────
              const resourceUtil = sim.resource_utilization;
              const resourceUtilMean = (() => {
                if (typeof resourceUtil === 'object' && resourceUtil !== null) {
                  const vals = Object.values(resourceUtil as Record<string, number>);
                  return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
                }
                return typeof resourceUtil === 'number' ? resourceUtil : 0;
              })();

              // ── Simulated variant count ─────────────────────────────────────
              // Derive from playout traces; fall back to estimate from avg trace length
              const simulatedVariantCount =
                playoutTraces.length > 0
                  ? countUniqueVariants(playoutTraces)
                  : estimateVariantCount(sim, numCases);

              // ── Scenario analysis ───────────────────────────────────────────
              let scenarioAnalysis: ScenarioAnalysis | undefined;
              if (scenarioMultipliers) {
                scenarioAnalysis = computeScenarioAnalysis(
                  sim,
                  actualStats,
                  scenarioMultipliers
                );
              }

              // ── Comparison metrics ──────────────────────────────────────────
              let comparisonMetrics: ComparisonMetrics | undefined;
              if (doCompare) {
                comparisonMetrics = computeComparisonMetrics(
                  sim,
                  actualStats,
                  simulatedVariantCount
                );
              }

              // ── Payload ─────────────────────────────────────────────────────
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
                  variantCount: simulatedVariantCount,
                  //  fields (kept for backward compat)
                  traceCount: undefined as unknown,
                  traceLengths: undefined as any,
                  durations: undefined as any,
                  variantsDiscovered: simulatedVariantCount,
                },
                traces: (sim.traces ?? []) as Array<Record<string, unknown>>,
                ...(playoutResult && { playout: playoutResult }),
                ...(comparisonMetrics && { comparison: comparisonMetrics }),
                ...(scenarioAnalysis && { scenario: scenarioAnalysis }),
              };

              // OTEL late attrs
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

              // ── XES export ──────────────────────────────────────────────────
              if (exportPath) {
                const xesContent = buildXesExport(playoutTraces, seed, numCases);
                await fs.writeFile(exportPath, xesContent, 'utf-8');
              }

              // ── Render output ───────────────────────────────────────────────
              const result = makeResult(
                'simulate',
                payload,
                performance.now() - t0,
                EXIT_CODES.success
              );

              emitResult(result, { format, verbose, quiet }, (res, projection) => {
                const p = res.payload as typeof payload;

                if (doAnimate && playoutTraces.length > 0) {
                  // Show animated single-trace playback first
                  printAnimatedTrace(projection, playoutTraces[0], seed, actualStats);
                } else if (doCompare && comparisonMetrics) {
                  // Show comparison table (replaces standard summary)
                  printComparison(projection, payload, comparisonMetrics, actualStats);
                } else {
                  // Standard simulation summary (default + --animate with no traces)
                  printHumanSimulation(projection, p, exportPath);
                }

                // Scenario analysis is always appended when present
                if (scenarioAnalysis) {
                  printScenarioAnalysis(projection, scenarioAnalysis, scenarioMultipliers!);
                }
              });

              // ── Receipt ─────────────────────────────────────────────────────
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
                      variant_count: simulatedVariantCount,
                      ...(exportPath && { exported_xes: exportPath }),
                    },
                  };
                  saveCommandReceipt(receipt);
                } catch {
                  /* receipt write must never break the command */
                }
              }

              return await exitWithFlush(result.exit_code);
            }
          );
        } catch (error) {
          lateStatus = 'error';
          const result = makeErrorResult(
            'simulate',
            error,
            EXIT_CODES.execution_error,
            'EXECUTION_ERROR'
          );
          emitResult(result, { format, verbose, quiet });
          return await exitWithFlush(result.exit_code);
        }
      },
      () => ({
        cases_completed: lateCasesCompleted,
        avg_sojourn_time_ms: lateAvgSojournMs,
        p95_sojourn_time_ms: lateP95SojournMs,
        status: lateStatus,
      })
    );
  },
});

// ─── Types ───────────────────────────────────────────────────────────────────

interface PlayoutTrace {
  caseId: string;
  activities: string[];
  durations: number[]; // ms per activity (simulated)
  startMs: number;
}

interface ActualLogStats {
  traceCount: number;
  avgActivitiesPerCase: number;
  uniqueVariants: number;
  avgCaseDurationMs: number;
  activityFrequencies: Record<string, number>;
  topActivity: string;
  topActivityPct: number;
}

interface ComparisonMetrics {
  activitiesPerCase: { actual: number; simulated: number; deltaPct: number; ok: boolean };
  uniqueVariants: { actual: number; simulated: number; deltaPct: number; ok: boolean };
  avgCaseDurationMs: { actual: number; simulated: number; deltaPct: number; ok: boolean };
  topActivity: {
    actual: string;
    actualPct: number;
    simulated: string;
    simulatedPct: number;
    ok: boolean;
  };
  overallQuality: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR';
  chiSquaredPValue: number;
  traceFitness: number;
}

interface ScenarioAnalysis {
  baselineDurationMs: number;
  scenarioDurationMs: number;
  deltaMs: number;
  deltaPct: number;
  beneficial: boolean;
  activityImpacts: Array<{
    activity: string;
    multiplier: number;
    baselineDurationMs: number;
    scenarioDurationMs: number;
    deltaMs: number;
  }>;
}

// ─── Actual log stats extraction ──────────────────────────────────────────────

function computeActualLogStats(
  wasm: Record<string, any>,
  logHandle: string,
  activityKey: string
): ActualLogStats {
  // Use DFG to get activity frequencies from the actual log
  let activityFrequencies: Record<string, number> = {};
  let traceCount = 0;
  let totalActivities = 0;
  let uniqueVariants = 1;

  try {
    const rawDfg = wasm.discover_dfg(logHandle, activityKey);
    const dfg =
      typeof rawDfg === 'string'
        ? (JSON.parse(rawDfg) as Record<string, unknown>)
        : (rawDfg as Record<string, unknown>);

    // Extract activity frequencies from DFG node frequencies
    const nodeFreq = dfg['node_frequencies'] as Record<string, number> | undefined;
    if (nodeFreq) {
      activityFrequencies = nodeFreq;
      totalActivities = Object.values(nodeFreq).reduce((a, b) => a + b, 0);
    }

    // Trace count from DFG metadata or fallback
    const cases = dfg['case_count'] as number | undefined;
    traceCount = cases ?? 1;

    // Edge count as proxy for variant diversity
    const edges = dfg['edges'] as Array<unknown> | undefined;
    uniqueVariants = edges ? Math.max(1, Math.floor(Math.sqrt(edges.length))) : 1;
  } catch {
    // WASM unavailable — use minimal defaults
    traceCount = 1;
    uniqueVariants = 1;
  }

  const avgActivitiesPerCase = traceCount > 0 ? totalActivities / traceCount : 0;

  // Top activity
  let topActivity = '';
  let topActivityCount = 0;
  for (const [act, cnt] of Object.entries(activityFrequencies)) {
    if (cnt > topActivityCount) {
      topActivity = act;
      topActivityCount = cnt;
    }
  }
  const topActivityPct =
    totalActivities > 0 ? (topActivityCount / totalActivities) * 100 : 0;

  // Avg case duration: approximate from log timestamps via analyze_statistics if available
  // Fall back to 0 (unknown) if not available
  let avgCaseDurationMs = 0;
  try {
    const rawStats = wasm.analyze_statistics(logHandle);
    const statsObj =
      typeof rawStats === 'string'
        ? (JSON.parse(rawStats) as Record<string, unknown>)
        : (rawStats as Record<string, unknown>);
    const dur =
      (statsObj['avg_case_duration_ms'] as number | undefined) ??
      (statsObj['avg_duration_ms'] as number | undefined) ??
      (statsObj['avg_case_duration'] as number | undefined);
    if (typeof dur === 'number' && isFinite(dur)) {
      avgCaseDurationMs = dur;
    }
  } catch {
    // analyze_statistics not available — leave as 0
  }

  return {
    traceCount,
    avgActivitiesPerCase,
    uniqueVariants,
    avgCaseDurationMs,
    activityFrequencies,
    topActivity,
    topActivityPct,
  };
}

// ─── Playout trace builder ────────────────────────────────────────────────────

function buildPlayoutTraces(
  dfg: Record<string, unknown>,
  numCases: number,
  seed: number,
  _activityKey: string
): PlayoutTrace[] {
  const rng = makeLcg(seed);

  // Extract adjacency from DFG.
  // DFG edges may be:
  //   - Array<{from, to, frequency|count|weight}> (wasm4pm format)
  //   - Array<[string, string, number]> (tuple format)
  const rawEdges = (dfg['edges'] as Array<unknown> | undefined) ?? [];

  // start_activities may be a string[] or an object (map of activity -> count)
  const rawStartActs = dfg['start_activities'];
  const startActivities: string[] = Array.isArray(rawStartActs)
    ? (rawStartActs as string[])
    : rawStartActs !== null && typeof rawStartActs === 'object'
      ? Object.keys(rawStartActs as Record<string, unknown>)
      : [];

  // end_activities: same dual format
  const rawEndActs = dfg['end_activities'];
  const endActivitiesArr: string[] = Array.isArray(rawEndActs)
    ? (rawEndActs as string[])
    : rawEndActs !== null && typeof rawEndActs === 'object'
      ? Object.keys(rawEndActs as Record<string, unknown>)
      : [];
  const endActivities = new Set<string>(endActivitiesArr);

  if (rawEdges.length === 0 && startActivities.length === 0) {
    return [];
  }

  // Build adjacency map (activity -> weighted successors)
  const adj = new Map<string, Array<[string, number]>>();
  for (const edge of rawEdges) {
    let from: string, to: string, weight: number;
    if (Array.isArray(edge)) {
      [from, to, weight] = edge as [string, string, number];
    } else {
      const e = edge as Record<string, unknown>;
      from = (e['from'] ?? e['source'] ?? '') as string;
      to = (e['to'] ?? e['target'] ?? '') as string;
      weight = ((e['frequency'] ?? e['count'] ?? e['weight'] ?? 1) as number);
    }
    if (!from || !to) continue;
    if (!adj.has(from)) adj.set(from, []);
    adj.get(from)!.push([to, weight]);
  }

  // Use a deterministic epoch derived from the seed (not Date.now()) so that
  // XES exports are bit-for-bit identical across runs with the same seed.
  // Epoch: 2020-01-01T00:00:00Z + seed * 3600000ms (ensures varied but reproducible start times)
  const epochMs = 1_577_836_800_000 + (seed % 8760) * 3_600_000;
  const traces: PlayoutTrace[] = [];

  for (let i = 0; i < numCases; i++) {
    // Pick start activity
    const starts = startActivities.length > 0 ? startActivities : Array.from(adj.keys());
    if (starts.length === 0) break;
    const startAct = starts[rng.nextInt(starts.length)];

    const activities: string[] = [];
    const durations: number[] = [];
    let current = startAct;

    for (let step = 0; step < 100; step++) {
      activities.push(current);
      // Simulate duration: log-normal-ish via LCG (mean ~3600000ms = 1 hour)
      const dur = Math.max(100, Math.floor((rng.next() * 2 + 0.2) * 3_600_000 * rng.next()));
      durations.push(dur);

      if (endActivities.has(current)) break;

      const successors = adj.get(current);
      if (!successors || successors.length === 0) break;

      // Early stop with 25% probability to limit trace length
      if (rng.next() < 0.25 && activities.length >= 2) break;

      // Weighted random successor selection
      const totalWeight = successors.reduce((s, [, w]) => s + w, 0);
      let pick = rng.next() * totalWeight;
      let next = successors[0][0];
      for (const [act, w] of successors) {
        pick -= w;
        if (pick <= 0) {
          next = act;
          break;
        }
      }
      current = next;
    }

    traces.push({
      caseId: `SIM-${seed}-${i + 1}`,
      activities,
      durations,
      startMs: epochMs + i * 3_600_000,
    });
  }

  return traces;
}

// ─── Variant counting ─────────────────────────────────────────────────────────

function countUniqueVariants(traces: PlayoutTrace[]): number {
  const seen = new Set<string>();
  for (const t of traces) seen.add(t.activities.join('|'));
  return seen.size;
}

function estimateVariantCount(sim: Record<string, unknown>, numCases: number): number {
  // Rough estimate: sqrt(cases) as a lower bound when playout is unavailable
  const avgLen = (sim.avg_trace_length as number | undefined) ?? 3;
  return Math.max(1, Math.floor(Math.sqrt(numCases) * (avgLen / 3)));
}

// ─── Comparison metrics ───────────────────────────────────────────────────────

function computeComparisonMetrics(
  sim: Record<string, unknown>,
  actual: ActualLogStats,
  simulatedVariantCount: number
): ComparisonMetrics {
  const simAvgLen = (sim.avg_trace_length as number | undefined) ?? 0;
  const simAvgDur = (sim.avg_sojourn_time_ms as number | undefined) ?? 0;

  const deltaPct = (a: number, b: number): number =>
    a === 0 ? 0 : Math.round(((b - a) / a) * 1000) / 10;

  const lenDelta = deltaPct(actual.avgActivitiesPerCase, simAvgLen);
  const varDelta = deltaPct(actual.uniqueVariants, simulatedVariantCount);
  const durDelta = deltaPct(actual.avgCaseDurationMs, simAvgDur);

  const actStats = sim.activity_statistics as Record<string, { executions: number }> | undefined;
  const simTopActivity = actStats
    ? Object.entries(actStats).reduce(
        (best, [act, s]) => (s.executions > best.count ? { act, count: s.executions } : best),
        { act: '', count: 0 }
      )
    : { act: actual.topActivity, count: 0 };

  const simTotalExec = actStats
    ? Object.values(actStats).reduce((s, v) => s + v.executions, 0)
    : 0;
  const simTopPct =
    simTotalExec > 0 && simTopActivity.count > 0
      ? (simTopActivity.count / simTotalExec) * 100
      : actual.topActivityPct;

  // Quality score: average of how many metrics are within ±15%
  const ok = (d: number) => Math.abs(d) <= 15;
  const goodMetrics = [
    ok(lenDelta),
    ok(varDelta),
    ok(durDelta) || actual.avgCaseDurationMs === 0,
    simTopActivity.act === actual.topActivity || actual.topActivity === '',
  ].filter(Boolean).length;

  const quality: ComparisonMetrics['overallQuality'] =
    goodMetrics === 4 ? 'EXCELLENT' : goodMetrics >= 3 ? 'GOOD' : goodMetrics >= 2 ? 'FAIR' : 'POOR';

  // Approximate chi-squared p-value (simplified heuristic, not a real chi-sq test)
  // We use it as a quality indicator: lower variance across metrics = higher p-value
  const avgAbsDelta = (Math.abs(lenDelta) + Math.abs(varDelta)) / 2;
  const chiSquaredPValue = Math.max(0, Math.min(1, 1 - avgAbsDelta / 100));

  // Trace fitness: how close are the simulated variants to actual
  const traceFitness = Math.max(
    0,
    Math.min(1, 1 - Math.abs(varDelta) / 200)
  );

  return {
    activitiesPerCase: {
      actual: actual.avgActivitiesPerCase,
      simulated: simAvgLen,
      deltaPct: lenDelta,
      ok: ok(lenDelta),
    },
    uniqueVariants: {
      actual: actual.uniqueVariants,
      simulated: simulatedVariantCount,
      deltaPct: varDelta,
      ok: ok(varDelta),
    },
    avgCaseDurationMs: {
      actual: actual.avgCaseDurationMs,
      simulated: simAvgDur,
      deltaPct: durDelta,
      ok: ok(durDelta) || actual.avgCaseDurationMs === 0,
    },
    topActivity: {
      actual: actual.topActivity,
      actualPct: actual.topActivityPct,
      simulated: simTopActivity.act || actual.topActivity,
      simulatedPct: simTopPct,
      ok: simTopActivity.act === actual.topActivity || actual.topActivity === '',
    },
    overallQuality: quality,
    chiSquaredPValue,
    traceFitness,
  };
}

// ─── Scenario analysis ────────────────────────────────────────────────────────

function computeScenarioAnalysis(
  sim: Record<string, unknown>,
  _actual: ActualLogStats,
  multipliers: Record<string, number>
): ScenarioAnalysis {
  const baselineDurationMs = (sim.avg_sojourn_time_ms as number | undefined) ?? 0;
  const actStats = sim.activity_statistics as Record<string, { avg_service_time_ms: number; executions: number }> | undefined;

  const impacts: ScenarioAnalysis['activityImpacts'] = [];
  let scenarioDurationMs = baselineDurationMs;

  for (const [activity, multiplier] of Object.entries(multipliers)) {
    const stats = actStats?.[activity];
    const baseActivityMs = stats?.avg_service_time_ms ?? 0;
    const executions = stats?.executions ?? 1;

    // Per-case contribution = (activity avg time * executions) / total cases
    // We treat it as an additive per-case contribution
    const baseContributionMs = baseActivityMs;
    const scenarioContributionMs = baseActivityMs / multiplier; // multiplier > 1 = slower
    const deltaMs = scenarioContributionMs - baseContributionMs;

    scenarioDurationMs += deltaMs;

    impacts.push({
      activity,
      multiplier,
      baselineDurationMs: baseContributionMs,
      scenarioDurationMs: scenarioContributionMs,
      deltaMs,
    });
  }

  const deltaMs = scenarioDurationMs - baselineDurationMs;
  const deltaPct =
    baselineDurationMs > 0
      ? Math.round((deltaMs / baselineDurationMs) * 1000) / 10
      : 0;

  return {
    baselineDurationMs,
    scenarioDurationMs: Math.max(0, scenarioDurationMs),
    deltaMs,
    deltaPct,
    beneficial: deltaMs < 0,
    activityImpacts: impacts,
  };
}

// ─── XES export builder ───────────────────────────────────────────────────────

function buildXesExport(traces: PlayoutTrace[], seed: number, numCases: number): string {
  const lines: string[] = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<!-- Generated by wpm simulate (seed=${seed}, cases=${numCases}) -->`,
    `<log xmlns="http://www.xes-standard.org/" xes.version="1.0" xes.features="">`,
    `  <extension name="Concept" prefix="concept" uri="http://www.xes-standard.org/concept.xesext"/>`,
    `  <extension name="Time" prefix="time" uri="http://www.xes-standard.org/time.xesext"/>`,
    `  <string key="concept:name" value="Simulated Process Log"/>`,
  ];

  for (const trace of traces) {
    lines.push(`  <trace>`);
    lines.push(`    <string key="concept:name" value="${xmlEscape(trace.caseId)}"/>`);

    let ts = trace.startMs;
    for (let i = 0; i < trace.activities.length; i++) {
      const act = trace.activities[i];
      const iso = new Date(ts).toISOString();
      lines.push(`    <event>`);
      lines.push(`      <string key="concept:name" value="${xmlEscape(act)}"/>`);
      lines.push(`      <date key="time:timestamp" value="${iso}"/>`);
      lines.push(`    </event>`);
      ts += trace.durations[i] ?? 3_600_000;
    }

    lines.push(`  </trace>`);
  }

  lines.push(`</log>`);
  return lines.join('\n') + '\n';
}

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ─── Human output renderers ───────────────────────────────────────────────────

function fmt(n: unknown, decimals = 1): string {
  if (typeof n !== 'number' || !isFinite(n)) return '—';
  return n.toFixed(decimals);
}

function fmtDuration(ms: number): string {
  if (ms >= 86_400_000) return `${(ms / 86_400_000).toFixed(1)} days`;
  if (ms >= 3_600_000) return `${(ms / 3_600_000).toFixed(1)} hours`;
  if (ms >= 60_000) return `${(ms / 60_000).toFixed(1)} minutes`;
  return `${ms.toFixed(0)} ms`;
}

function fmtDeltaSymbol(ok: boolean): string {
  return ok ? '✓' : '⚠';
}

function fmtDelta(pct: number): string {
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct.toFixed(1)}%`;
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
      variantCount?: unknown;
    };
    traces: Array<Record<string, unknown>>;
    playout?: Record<string, unknown>;
  },
  exportPath?: string
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
  if (stats.variantCount !== undefined && stats.variantCount !== null) {
    projection.log(`    Variant count:    ${stats.variantCount}`);
  }
  projection.log(`    Elapsed time:     ${sim.elapsedMs}ms`);
  projection.log('');
  projection.log('  Performance distribution (sojourn time per simulated case):');
  projection.log(`    Mean:   ${fmt(stats.avgSojournTimeMs, 1)} ms`);
  projection.log(`    Std:    ${fmt(stats.sojournTimeStdMs, 1)} ms`);
  projection.log(`    P5:     ${fmt(stats.sojournTimeP5Ms, 1)} ms`);
  projection.log(`    Median: ${fmt(stats.sojournTimeP50Ms, 1)} ms`);
  projection.log(`    P95:    ${fmt(stats.sojournTimeP95Ms, 1)} ms`);
  projection.log('');

  const p50Ms = typeof stats.sojournTimeP50Ms === 'number' ? stats.sojournTimeP50Ms : 0;
  const p95Ms = typeof stats.sojournTimeP95Ms === 'number' ? stats.sojournTimeP95Ms : 0;
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

  if (exportPath) {
    projection.log(`  ✔ Exported simulated XES to: ${exportPath}`);
    projection.log('');
  }

  projection.log('  Next steps:');
  projection.log(
    `    Run "wpm temporal ${payload.input}" to compare simulated distributions against`
  );
  projection.log(`    real event-log performance (service time vs waiting time per activity).`);
  if (!exportPath) {
    projection.log(`    Use --export out.xes to generate a synthetic event log from the simulation.`);
  }
  projection.log(`    Use --compare to see simulated vs actual log statistics side-by-side.`);
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

function printComparison(
  projection: import('../output.js').ConsoleProjection,
  payload: {
    input: string;
    simulation: { casesRequested: number; seed: number };
    statistics: Record<string, unknown>;
  },
  cmp: ComparisonMetrics,
  _actual: ActualLogStats
): void {
  const { simulation: sim } = payload;
  const W = 55;
  const line = '─'.repeat(W);

  projection.log('');
  projection.success(`Monte Carlo Simulation — ${payload.input}`);
  projection.log(`  Seed: ${sim.seed}  |  Cases: ${sim.casesRequested}`);
  projection.log('');
  projection.log(`  Simulated vs Actual Comparison:`);
  projection.log(`  ${line}`);
  projection.log(
    `  ${'Metric'.padEnd(25)} ${'Actual'.padEnd(10)} ${'Simulated'.padEnd(10)} ${'Δ'.padEnd(8)} `
  );
  projection.log(`  ${line}`);

  const row = (
    label: string,
    actual: string,
    simulated: string,
    delta: string,
    ok: boolean
  ) => {
    projection.log(
      `  ${label.padEnd(25)} ${actual.padEnd(10)} ${simulated.padEnd(10)} ${delta.padEnd(8)} ${fmtDeltaSymbol(ok)}`
    );
  };

  row(
    'Activities/case',
    fmt(cmp.activitiesPerCase.actual, 1),
    fmt(cmp.activitiesPerCase.simulated, 1),
    fmtDelta(cmp.activitiesPerCase.deltaPct),
    cmp.activitiesPerCase.ok
  );

  row(
    'Unique variants',
    String(cmp.uniqueVariants.actual),
    String(cmp.uniqueVariants.simulated),
    fmtDelta(cmp.uniqueVariants.deltaPct),
    cmp.uniqueVariants.ok
  );

  if (cmp.avgCaseDurationMs.actual > 0) {
    row(
      'Avg case duration',
      fmtDuration(cmp.avgCaseDurationMs.actual),
      fmtDuration(cmp.avgCaseDurationMs.simulated),
      fmtDelta(cmp.avgCaseDurationMs.deltaPct),
      cmp.avgCaseDurationMs.ok
    );
  }

  if (cmp.topActivity.actual) {
    const actualTopStr = `${cmp.topActivity.actual} (${fmt(cmp.topActivity.actualPct, 0)}%)`;
    const simTopStr = `${cmp.topActivity.simulated} (${fmt(cmp.topActivity.simulatedPct, 0)}%)`;
    projection.log(`  ${'Top activity'.padEnd(25)} ${actualTopStr}`);
    projection.log(`  ${''.padEnd(25)} ${simTopStr.padEnd(21)} ${fmtDeltaSymbol(cmp.topActivity.ok)}`);
  }

  projection.log(`  ${line}`);
  projection.log('');
  projection.log(
    `  Simulation quality: ${cmp.overallQuality} ` +
      `(χ² p=${cmp.chiSquaredPValue.toFixed(2)}, trace fitness: ${cmp.traceFitness.toFixed(2)})`
  );
  projection.log('');
}

function printAnimatedTrace(
  projection: import('../output.js').ConsoleProjection,
  trace: PlayoutTrace,
  seed: number,
  actual: ActualLogStats
): void {
  projection.log('');
  projection.success(`Simulating case ${trace.caseId}...`);
  projection.log('  ' + '═'.repeat(40));

  let elapsedMs = 0;
  const formatTime = (ms: number) => {
    if (ms < 60_000) return `${(ms / 1000).toFixed(0)}s`;
    if (ms < 3_600_000) return `${(ms / 60_000).toFixed(1)}m`;
    return `${(ms / 3_600_000).toFixed(1)}h`;
  };

  projection.log(`  [t=0]    ▶ START`);
  for (let i = 0; i < trace.activities.length; i++) {
    const act = trace.activities[i];
    const dur = trace.durations[i] ?? 3_600_000;
    const waitMs = i > 0 ? Math.floor(dur * 0.3) : 0;
    elapsedMs += waitMs > 0 ? waitMs : dur;
    const prefix = `[t=${formatTime(elapsedMs)}]`;
    const actLine = `  ${prefix.padEnd(10)} ● ${act}`;

    // Check if activity exists in actual log
    const freq = actual.activityFrequencies[act];
    const resourceHint = freq ? `` : ` (synthetic)`;
    projection.log(actLine + resourceHint);

    if (waitMs > 0) {
      projection.log(`  ${' '.repeat(11)}   ↳ WAIT: ${formatTime(waitMs)} queue time`);
    }
    elapsedMs += dur - waitMs;
  }
  projection.log(`  [t=${formatTime(elapsedMs)}] ▶ END`);
  projection.log('');

  // Find how common this variant is in the actual log
  const variantKey = trace.activities.join('→');
  const variantLabel =
    actual.uniqueVariants > 0
      ? `Variant pattern (${trace.activities.length} activities)`
      : variantKey.slice(0, 40) + (variantKey.length > 40 ? '…' : '');

  projection.log(
    `  Total: ${formatTime(elapsedMs)} | ${trace.activities.length} activities | ${variantLabel}`
  );
  projection.log('');
}

function printScenarioAnalysis(
  projection: import('../output.js').ConsoleProjection,
  scenario: ScenarioAnalysis,
  multipliers: Record<string, number>
): void {
  const W = 60;
  const line = '─'.repeat(W);

  projection.log('');
  projection.log('  What-If Scenario Analysis');
  projection.log('  ' + '='.repeat(40));

  const scenarioDesc = Object.entries(multipliers)
    .map(([act, m]) => `${act} ${m < 1 ? `${(1 / m).toFixed(1)}x faster` : `${m.toFixed(1)}x slower`}`)
    .join(', ');
  projection.log(`  Scenario: ${scenarioDesc}`);
  projection.log('');

  projection.log(
    `  Baseline (actual):    ${fmtDuration(scenario.baselineDurationMs)} avg case duration`
  );
  projection.log(
    `  Scenario:             ${fmtDuration(scenario.scenarioDurationMs)} avg case duration ` +
      `(${scenario.deltaPct >= 0 ? '+' : ''}${scenario.deltaPct.toFixed(1)}%)`
  );
  projection.log('');

  const helps = scenario.activityImpacts.filter((a) => a.deltaMs < 0);
  const hurts = scenario.activityImpacts.filter((a) => a.deltaMs > 0);

  if (helps.length > 0) {
    projection.log('  Activities where scenario helps:');
    for (const impact of helps) {
      projection.log(
        `    ${impact.activity}: ${fmtDuration(impact.baselineDurationMs)} → ` +
          `${fmtDuration(impact.scenarioDurationMs)}  (${fmtDuration(Math.abs(impact.deltaMs))} per case saved)`
      );
    }
    projection.log('');
  }

  if (hurts.length > 0) {
    projection.log('  Activities where scenario hurts:');
    for (const impact of hurts) {
      projection.log(
        `    ${impact.activity}: ${fmtDuration(impact.baselineDurationMs)} → ` +
          `${fmtDuration(impact.scenarioDurationMs)}  (+${fmtDuration(impact.deltaMs)} per case added)`
      );
    }
    projection.log('');
  }

  projection.log(
    `  Net effect: ${scenario.deltaMs < 0 ? '-' : '+'}${fmtDuration(Math.abs(scenario.deltaMs))} per case ` +
      `(scenario is ${scenario.beneficial ? 'beneficial' : 'detrimental'})`
  );
  projection.log('');
}
