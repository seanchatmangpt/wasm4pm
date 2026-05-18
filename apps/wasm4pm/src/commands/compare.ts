import { defineCommand } from 'citty';
import { ALGORITHM_CLI_ALIASES } from '@wasm4pm/contracts';
import { emitResult, makeResult, makeErrorResult } from '../output.js';
import { EXIT_CODES } from '../exit-codes.js';
import { withLogSession } from '../with-log-session.js';
import { discriminate, toUniformStats, DiscoveryShapeError } from '../discriminator.js';
import * as fs from 'node:fs';
import { withSpan } from './_otel.js';
import {
  saveCommandReceipt,
  blake3Hex,
  newReceipt,
  type CommandReceipt,
} from '../receipts/_shared.js';
import { exitWithFlush } from '../otel/exit.js';

/**
 * Algorithms supported by `wpm compare`.
 * Each entry describes how to invoke the discovery function via the WASM module.
 */
const ALGORITHMS = [
  'dfg',
  'alpha',
  'heuristic',
  'inductive',
  'ilp',
  'genetic',
  'pso',
  'astar',
  'hill-climbing',
  'simulated-annealing',
  'ant-colony',
  'declare',
  'skeleton',
  'dfg-optimized',
] as const;

type Algorithm = (typeof ALGORITHMS)[number];

interface ModelStats {
  algorithm: Algorithm;
  nodes: number;
  edges: number;
  variants: number;
  density: number;
  complexity: number;
  elapsedMs: number;
}

/**
 * A recommendation of which algorithm to use, derived from the comparison results.
 * Three recommendations are produced, one per criterion.
 */
interface AlgorithmRecommendation {
  /** Fastest algorithm (lowest elapsedMs among successful runs). */
  fastest: { algorithm: Algorithm; elapsedMs: number; rationale: string };
  /** Most detailed algorithm (highest edge count among successful runs). */
  mostDetailed: { algorithm: Algorithm; edges: number; rationale: string };
  /** Best quality/speed tradeoff — highest edges-per-ms ratio. */
  bestTradeoff: { algorithm: Algorithm; edgesPerMs: number; rationale: string };
}

/**
 * Derive a winner recommendation from a set of model stats.
 * Only considers successful runs (nodes >= 0).
 * Returns null if there are fewer than 2 successful runs.
 */
function deriveRecommendation(stats: ModelStats[]): AlgorithmRecommendation | null {
  const valid = stats.filter((s) => s.nodes >= 0 && s.elapsedMs > 0);
  if (valid.length < 2) return null;

  // Fastest
  const fastest = valid.reduce((a, b) => (a.elapsedMs <= b.elapsedMs ? a : b));

  // Most detailed (most edges — richer structural model)
  const mostDetailed = valid.reduce((a, b) => (a.edges >= b.edges ? a : b));

  // Best tradeoff: edges-per-ms (normalised quality per unit time)
  const withRatio = valid.map((s) => ({ ...s, edgesPerMs: s.edges / s.elapsedMs }));
  const bestTradeoff = withRatio.reduce((a, b) => (a.edgesPerMs >= b.edgesPerMs ? a : b));

  return {
    fastest: {
      algorithm: fastest.algorithm,
      elapsedMs: fastest.elapsedMs,
      rationale: `Lowest wall-clock time (${fastest.elapsedMs.toFixed(1)} ms) — use when throughput matters`,
    },
    mostDetailed: {
      algorithm: mostDetailed.algorithm,
      edges: mostDetailed.edges,
      rationale: `Highest edge count (${mostDetailed.edges} edges) — use when model fidelity matters`,
    },
    bestTradeoff: {
      algorithm: bestTradeoff.algorithm,
      edgesPerMs: Math.round(bestTradeoff.edgesPerMs * 100) / 100,
      rationale: `Best edges-per-ms ratio (${bestTradeoff.edgesPerMs.toFixed(2)}) — use for balanced analysis`,
    },
  };
}

/**
 * Invoke the appropriate WASM discovery function for the given algorithm,
 * then extract common DFG-shaped statistics from the result.
 */
function runDiscovery(
  wasm: Record<string, CallableFunction>,
  algo: Algorithm,
  logHandle: string,
  activityKey: string
): { raw: unknown; elapsedMs: number } {
  const t0 = performance.now();
  let raw: unknown;

  switch (algo) {
    case 'dfg':
      raw = wasm['discover_dfg'](logHandle, activityKey);
      break;
    case 'alpha':
      raw = wasm['discover_alpha_plus_plus'](logHandle, activityKey, 0.0);
      break;
    case 'heuristic':
      raw = wasm['discover_heuristic_miner'](logHandle, activityKey, 0.5);
      break;
    case 'inductive':
      raw = wasm['discover_inductive_miner'](logHandle, activityKey);
      break;
    case 'ilp':
      raw = wasm['discover_ilp_petri_net'](logHandle, activityKey);
      break;
    case 'genetic':
      raw = wasm['discover_genetic_algorithm'](logHandle, activityKey, 20, 20);
      break;
    case 'pso':
      raw = wasm['discover_pso_algorithm'](logHandle, activityKey, 20, 20);
      break;
    case 'astar':
      raw = wasm['discover_astar'](logHandle, activityKey, 500);
      break;
    case 'hill-climbing':
      raw = wasm['discover_hill_climbing'](logHandle, activityKey);
      break;
    case 'simulated-annealing':
      raw = wasm['discover_simulated_annealing'](logHandle, activityKey, 1.0, 0.95);
      break;
    case 'ant-colony':
      raw = wasm['discover_ant_colony'](logHandle, activityKey, 20, 20);
      break;
    case 'declare':
      raw = wasm['discover_declare'](logHandle, activityKey);
      break;
    case 'skeleton':
      // min_frequency=1 includes all directly-follows relations (no filtering)
      raw = wasm['extract_process_skeleton'](logHandle, activityKey, 1);
      break;
    case 'dfg-optimized':
      // discover_dfg_filtered prunes edges below the frequency threshold — the
      // "optimized" variant filters out low-frequency noise (threshold=2 keeps edges
      // seen at least twice, reducing spurious arcs in large logs).
      raw = wasm['discover_dfg_filtered'](logHandle, activityKey, 2);
      break;
    default: {
      // Exhaustiveness guard — TypeScript ensures this is unreachable
      const _never: never = algo;
      throw new Error(`Unknown algorithm: ${_never}`);
    }
  }

  const elapsedMs = performance.now() - t0;
  return { raw, elapsedMs };
}

/**
 * Run the model metrics WASM function to get variants, density, complexity.
 * Throws if metrics computation fails (failing fast, not silently).
 */
function extractModelMetrics(
  wasm: Record<string, CallableFunction>,
  logHandle: string,
  activityKey: string
): { variants: number; density: number; complexity: number } {
  const raw = wasm['compute_model_metrics'](logHandle, activityKey);
  const obj = (typeof raw === 'string' ? JSON.parse(raw) : raw) as Record<string, unknown>;

  const variants = (obj['num_variants'] as number | null) ?? null;
  const density = (obj['density'] as number | null) ?? null;
  const complexity = (obj['complexity_score'] as number | null) ?? null;

  if (variants === null || density === null || complexity === null) {
    throw new Error(
      `Incomplete model metrics: variants=${variants}, density=${density}, complexity=${complexity}`
    );
  }

  return { variants, density, complexity };
}

/**
 * Render the ASCII bar-chart column for a numeric value within [min, max].
 * Width = 8 chars, filled with block characters.
 */
function sparkBar(value: number, min: number, max: number, width = 8): string {
  if (max <= min) return '░'.repeat(width);
  const ratio = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const filled = Math.round(ratio * width);
  return '▓'.repeat(filled) + '░'.repeat(width - filled);
}

/**
 * Pad a string to the given width, truncating with '…' if too long.
 */
function col(s: string, width: number): string {
  if (s.length > width) return s.slice(0, width - 1) + '…';
  return s.padEnd(width);
}

function numCol(n: number, width: number, decimals = 0): string {
  return (decimals > 0 ? n.toFixed(decimals) : String(Math.round(n))).padStart(width);
}

export const compare = defineCommand({
  meta: {
    name: 'compare',
    description:
      'Run two or more algorithms on the same XES log and print a side-by-side comparison table',
  },
  args: {
    algorithms: {
      type: 'positional',
      description: `Algorithms to compare (space-separated). Available: ${ALGORITHMS.join(', ')}`,
      required: true,
    },
    input: {
      type: 'string',
      description: 'Path to XES event log file',
      required: true,
      alias: 'i',
    },
    'activity-key': {
      type: 'string',
      description: 'Activity attribute key (default: concept:name)',
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
    'cache-stats': {
      type: 'boolean',
      description: 'Print cache hit/miss statistics after comparison',
    },
    'no-save': {
      type: 'boolean',
      description: 'Do not auto-save the receipt to .wasm4pm/results/',
    },
  },
  async run(ctx) {
    const format = (ctx.args.format as 'json' | 'human') ?? 'human';
    const verbose = Boolean(ctx.args.verbose);
    const quiet = Boolean(ctx.args.quiet);
    const emitOptions = { format, verbose, quiet };

    return withSpan(
      'compare',
      {
        algorithms: String(ctx.args.algorithms ?? ''),
        input: String(ctx.args.input ?? ''),
        format,
      },
      async () => {
        try {
          // Parse algorithms from the single positional (citty collects remaining args as string)
          const rawAlgos = (ctx.args.algorithms as string)
            .split(/[\s,]+/)
            .map((s) => s.trim().toLowerCase())
            .filter(Boolean);

          // Resolve kernel IDs to CLI aliases, then validate
          const resolved = rawAlgos.map((a) => ALGORITHM_CLI_ALIASES[a] ?? a);
          const invalid = resolved.filter((a) => !ALGORITHMS.includes(a as Algorithm));
          if (invalid.length > 0) {
            const result = makeErrorResult(
              'compare',
              new Error(
                `Unknown algorithm(s): ${invalid.join(', ')}. Available: ${Object.keys(ALGORITHM_CLI_ALIASES).join(', ')}`
              ),
              EXIT_CODES.source_error,
              'UNKNOWN_ALGORITHMS'
            );
            emitResult(result, emitOptions);
            return await exitWithFlush(result.exit_code);
          }

          if (resolved.length < 2) {
            const result = makeErrorResult(
              'compare',
              new Error('Please specify at least two algorithms to compare.'),
              EXIT_CODES.source_error,
              'TOO_FEW_ALGORITHMS'
            );
            emitResult(result, emitOptions);
            return await exitWithFlush(result.exit_code);
          }

          const algos = resolved as Algorithm[];

          const inputPath = ctx.args.input as string;
          const activityKey = (ctx.args['activity-key'] as string) || 'concept:name';

          await withLogSession(
            { inputPath, activityKey, commandName: 'compare', emitOptions },
            async (wasmBase, logHandle) => {
              const wasm = wasmBase as Record<string, CallableFunction>;

              // Get shared metrics (variants, density, complexity) once from the log.
              // If metrics are unavailable (e.g. WASM version mismatch), fall back to
              // sentinel values so the comparison still runs.
              let sharedMetrics: { variants: number; density: number; complexity: number };
              try {
                sharedMetrics = extractModelMetrics(wasm, logHandle, activityKey);
              } catch {
                sharedMetrics = { variants: -1, density: -1, complexity: -1 };
              }

              // Run each algorithm individually. Errors are isolated per-algorithm so
              // a single failure produces a sentinel row rather than aborting the batch.
              const t0 = performance.now();
              const stats: ModelStats[] = [];
              const algorithmErrors: string[] = [];
              for (const algo of algos) {
                try {
                  const { raw, elapsedMs } = runDiscovery(wasm, algo, logHandle, activityKey);
                  const { nodes, edges } = toUniformStats(discriminate(raw, algo));
                  stats.push({
                    algorithm: algo,
                    nodes,
                    edges,
                    variants: sharedMetrics.variants,
                    density: sharedMetrics.density,
                    complexity: sharedMetrics.complexity,
                    elapsedMs,
                  });
                } catch (err) {
                  // Record the failure; push a sentinel row so output is always complete
                  const msg = err instanceof Error ? err.message : String(err);
                  algorithmErrors.push(`${algo}: ${msg}`);
                  stats.push({
                    algorithm: algo,
                    nodes: -1,
                    edges: -1,
                    variants: sharedMetrics.variants,
                    density: sharedMetrics.density,
                    complexity: sharedMetrics.complexity,
                    elapsedMs: 0,
                  });
                }
              }
              const totalElapsedMs = performance.now() - t0;

              // Derive winner recommendations before building payload
              const recommendation = deriveRecommendation(stats);

              // Build canonical result payload. Include algorithm_errors only when some
              // runs failed so consumers can distinguish partial from full success.
              const payload: {
                input: string;
                activityKey: string;
                algorithms: ModelStats[];
                recommendation: AlgorithmRecommendation | null;
                algorithm_errors?: string[];
              } = {
                input: inputPath,
                activityKey,
                algorithms: stats,
                recommendation,
              };
              if (algorithmErrors.length > 0) {
                payload.algorithm_errors = algorithmErrors;
              }

              // Handle --cache-stats (fetch before emitting)
              let cacheStats: Record<string, unknown> | null = null;
              if (ctx.args['cache-stats']) {
                if (typeof wasm.get_cache_stats !== 'function') {
                  const errResult = makeErrorResult(
                    'compare',
                    new Error('Cache statistics requested but not available in WASM module'),
                    EXIT_CODES.execution_error,
                    'CACHE_STATS_UNAVAILABLE'
                  );
                  emitResult(errResult, emitOptions);
                  return await exitWithFlush(errResult.exit_code);
                }
                const statsRaw = wasm.get_cache_stats();
                cacheStats = (
                  typeof statsRaw === 'string' ? JSON.parse(statsRaw) : statsRaw
                ) as Record<string, unknown>;
              }

              // Partial failure (exit 4) when at least one algorithm produced a sentinel row;
              // full success (exit 0) when all algorithms ran cleanly.
              const resultExitCode =
                algorithmErrors.length > 0 ? EXIT_CODES.partial_failure : EXIT_CODES.success;
              const cmdResult = makeResult('compare', payload, totalElapsedMs, resultExitCode);

              // Persist BLAKE3 receipt for proof-of-execution
              if (!ctx.args['no-save']) {
                try {
                  const inputBytes = fs.readFileSync(inputPath);
                  const receipt: CommandReceipt = {
                    ...newReceipt('compare'),
                    input_hash: blake3Hex(inputBytes),
                    output_hash: blake3Hex(JSON.stringify(payload)),
                    status: algorithmErrors.length > 0 ? 'partial' : 'success',
                    summary: {
                      algorithms: algos,
                      activityKey,
                      elapsedMs: Math.round(totalElapsedMs * 100) / 100,
                      ...(algorithmErrors.length > 0 ? { errors: algorithmErrors } : {}),
                    },
                  };
                  saveCommandReceipt(receipt);
                } catch {
                  /* receipt write must never break the command */
                }
              }

              emitResult(cmdResult, emitOptions, (res, projection) => {
                const p = res.payload as typeof payload;
                const s = p.algorithms;

                projection.info(`Comparing algorithms: ${algos.join(', ')}`);
                projection.log('');
                projection.success(`Algorithm comparison — ${p.input}`);
                projection.log(
                  `  Activity key: ${p.activityKey}  |  Log variants: ${sharedMetrics.variants}`
                );
                projection.log('');

                // Compute ranges for sparklines
                const validStats = s.filter((st) => st.nodes >= 0);
                const minNodes = Math.min(...validStats.map((st) => st.nodes));
                const maxNodes = Math.max(...validStats.map((st) => st.nodes));
                const minEdges = Math.min(...validStats.map((st) => st.edges));
                const maxEdges = Math.max(...validStats.map((st) => st.edges));
                const minTime = Math.min(...validStats.map((st) => st.elapsedMs));
                const maxTime = Math.max(...validStats.map((st) => st.elapsedMs));

                // Table header
                projection.log(
                  `  ${'Algorithm'.padEnd(20)}  ${'Nodes'.padStart(6)}  ${'Edges'.padStart(6)}  ${'Time(ms)'.padStart(9)}  ${'Nodes'.padEnd(10)}  ${'Edges'.padEnd(10)}  ${'Time'.padEnd(10)}`
                );
                projection.log(
                  `  ${'─'.repeat(20)}  ${'─'.repeat(6)}  ${'─'.repeat(6)}  ${'─'.repeat(9)}  ${'(bar)'.padEnd(10)}  ${'(bar)'.padEnd(10)}  ${'(bar)'.padEnd(10)}`
                );

                for (const st of s) {
                  const algoCol = col(st.algorithm, 20);
                  if (st.nodes < 0) {
                    projection.log(
                      `  ${algoCol}  ${'ERROR'.padStart(6)}  ${'─'.padStart(6)}  ${'─'.padStart(9)}`
                    );
                    continue;
                  }
                  const nodesStr = numCol(st.nodes, 6);
                  const edgesStr = numCol(st.edges, 6);
                  const timeStr = numCol(st.elapsedMs, 9, 1);
                  const nodesBar = sparkBar(st.nodes, minNodes, maxNodes).padEnd(10);
                  const edgesBar = sparkBar(st.edges, minEdges, maxEdges).padEnd(10);
                  const timeBar = sparkBar(st.elapsedMs, minTime, maxTime).padEnd(10);
                  projection.log(
                    `  ${algoCol}  ${nodesStr}  ${edgesStr}  ${timeStr}  ${nodesBar}  ${edgesBar}  ${timeBar}`
                  );
                }

                projection.log('');
                projection.log(
                  '  Legend: ▓▓▓▓▓▓▓▓ = max  ░░░░░░░░ = min   bars are relative within this comparison'
                );
                projection.log('');
                projection.log('  Metric guide (process mining interpretation):');
                projection.log(
                  '    Nodes    — number of distinct activities + gateways in the model.'
                );
                projection.log(
                  '               More nodes = finer-grained model; fewer = more abstract.'
                );
                projection.log('    Edges    — number of directly-follows relations captured.');
                projection.log(
                  '               More edges = higher structural detail; also higher complexity.'
                );
                projection.log(
                  '               A flower model (every activity follows every other) has maximum edges'
                );
                projection.log(
                  '               but zero precision. Use wpm quality to check fitness+precision together.'
                );
                projection.log(
                  '    Time(ms) — wall-clock discovery time for this log. Lower = faster iteration.'
                );
                projection.log(
                  '               For large logs (>100K events) this gap compounds significantly.'
                );
                projection.log('');

                // Partial failure notice
                if (p.algorithm_errors && p.algorithm_errors.length > 0) {
                  projection.log('  Algorithm errors (partial results):');
                  for (const e of p.algorithm_errors) {
                    projection.warn(`    ${e}`);
                  }
                  projection.log('');
                }

                // Winner recommendation section
                if (recommendation) {
                  projection.log('  Recommendations:');
                  projection.success(
                    `    Fastest      → ${recommendation.fastest.algorithm.padEnd(18)}  ${recommendation.fastest.rationale}`
                  );
                  projection.success(
                    `    Most detailed→ ${recommendation.mostDetailed.algorithm.padEnd(18)}  ${recommendation.mostDetailed.rationale}`
                  );
                  projection.success(
                    `    Best tradeoff→ ${recommendation.bestTradeoff.algorithm.padEnd(18)}  ${recommendation.bestTradeoff.rationale}`
                  );
                  projection.log('');
                  projection.log(
                    '  Note: "Most detailed" (highest edge count) is not the same as highest quality.'
                  );
                  projection.log(
                    '  A model with many edges may be overfit (low precision) or underfit (low fitness).'
                  );
                  projection.log(
                    '  Validate with: wpm quality <log.xes>  to see fitness+precision+generalization.'
                  );
                  projection.log('');
                }

                // Cache statistics (if fetched)
                if (cacheStats) {
                  const hitRate =
                    (cacheStats.parse_hits as number) + (cacheStats.parse_misses as number) > 0
                      ? (
                          ((cacheStats.parse_hits as number) /
                            ((cacheStats.parse_hits as number) +
                              (cacheStats.parse_misses as number))) *
                          100
                        ).toFixed(1)
                      : 'N/A';
                  projection.info('Cache statistics:');
                  projection.info(`  Parse hits: ${cacheStats.parse_hits}`);
                  projection.info(`  Parse misses: ${cacheStats.parse_misses}`);
                  projection.info(`  Hit rate: ${hitRate}%`);
                  projection.info(`  Columnar entries: ${cacheStats.columnar_entries}`);
                  projection.info(`  Interner entries: ${cacheStats.interner_entries}`);
                }
              });

              return await exitWithFlush(cmdResult.exit_code);
            }
          ); // end withLogSession
        } catch (error) {
          const code =
            error instanceof DiscoveryShapeError ? 'DISCOVERY_SHAPE_MISMATCH' : 'COMPARISON_FAILED';
          const result = makeErrorResult(
            'compare',
            error instanceof Error ? error : new Error(String(error)),
            EXIT_CODES.execution_error,
            code
          );
          emitResult(result, emitOptions);
          return await exitWithFlush(result.exit_code);
        }
      }
    );
  },
});
