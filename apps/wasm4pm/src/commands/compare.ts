import { defineCommand } from 'citty';
import { ALGORITHM_CLI_ALIASES, resolveAlgorithmId } from '@wasm4pm/contracts';
import { emitResult, makeResult, makeErrorResult } from '../output.js';
import { EXIT_CODES } from '../exit-codes.js';
import { withLogSession } from '../with-log-session.js';
import { discriminate, toUniformStats, DiscoveryShapeError } from '../discriminator.js';
import * as fs from 'node:fs';
import { withSpan, withSpanRaw } from './_otel.js';
import { AnalysisSpans } from '@wasm4pm/observability';
import {
  saveCommandReceipt,
  blake3Hex,
  newReceipt,
  type CommandReceipt,
} from '../receipts/_shared.js';
import { exitWithFlush } from '../otel/exit.js';

/**
 * Discovery algorithms supported by `wpm compare` (side-by-side benchmark subset).
 * Use `wpm run -a <id>` for the full kernel registry (~60 algorithms including OCEL, ML, drift).
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

const COMPARE_REGISTRY_IDS = Object.keys(ALGORITHM_CLI_ALIASES).filter((registryId) =>
  ALGORITHMS.includes(ALGORITHM_CLI_ALIASES[registryId] as Algorithm)
);

/** Resolve user input to a compare-supported CLI alias key. */
function resolveCompareAlgorithm(input: string): Algorithm | undefined {
  const registryId = resolveAlgorithmId(input, COMPARE_REGISTRY_IDS);
  if (!registryId) return undefined;
  const alias = ALGORITHM_CLI_ALIASES[registryId] as Algorithm;
  return ALGORITHMS.includes(alias) ? alias : undefined;
}

/**
 * Static registry of Van der Aalst quality dimensions per algorithm.
 *
 * speedTier  — 0-100, lower = faster (from kernel registry)
 * qualityTier — 0-100, higher = better model quality (from kernel registry)
 *
 * These are design-time proxies derived from the kernel registry.
 * For live fitness/precision scores run `wpm quality <log.xes>`.
 *
 * Use-case guidance follows van der Aalst's four-quadrant model:
 *   exploration  — quick first look, no publication intent
 *   daily        — routine operational analysis
 *   conformance  — model-to-log compliance checking
 *   publication  — final model for academic/executive reporting
 */
interface AlgorithmProfile {
  speedTier: number; // 0-100, lower is faster
  qualityTier: number; // 0-100, higher is better
  /** Van der Aalst precision tendency: how tightly the model constrains behaviour */
  precisionProxy: 'low' | 'medium' | 'high';
  /** Van der Aalst fitness tendency: how well the model replays the log */
  fitnessProxy: 'low' | 'medium' | 'high';
  /** Van der Aalst generalization tendency */
  generalizationProxy: 'low' | 'medium' | 'high';
  /** Van der Aalst simplicity tendency */
  simplicityProxy: 'low' | 'medium' | 'high';
  /** Recommended use cases, ordered from most to least appropriate */
  useCases: string[];
}

const ALGO_PROFILES: Record<Algorithm, AlgorithmProfile> = {
  dfg: {
    speedTier: 5,
    qualityTier: 30,
    precisionProxy: 'low',
    fitnessProxy: 'high',
    generalizationProxy: 'high',
    simplicityProxy: 'high',
    useCases: ['exploration / quick first look', 'streaming / large logs'],
  },
  skeleton: {
    speedTier: 3,
    qualityTier: 25,
    precisionProxy: 'low',
    fitnessProxy: 'medium',
    generalizationProxy: 'high',
    simplicityProxy: 'high',
    useCases: ['exploration / quick first look', 'backbone extraction'],
  },
  alpha: {
    speedTier: 20,
    qualityTier: 45,
    precisionProxy: 'medium',
    fitnessProxy: 'medium',
    generalizationProxy: 'medium',
    simplicityProxy: 'medium',
    useCases: ['academic baseline', 'simple sequential processes'],
  },
  heuristic: {
    speedTier: 25,
    qualityTier: 50,
    precisionProxy: 'medium',
    fitnessProxy: 'high',
    generalizationProxy: 'medium',
    simplicityProxy: 'medium',
    useCases: ['daily operational analysis', 'noisy real-world logs'],
  },
  inductive: {
    speedTier: 30,
    qualityTier: 55,
    precisionProxy: 'medium',
    fitnessProxy: 'high',
    generalizationProxy: 'high',
    simplicityProxy: 'medium',
    useCases: ['daily operational analysis', 'conformance checking', 'sound model required'],
  },
  'hill-climbing': {
    speedTier: 40,
    qualityTier: 55,
    precisionProxy: 'medium',
    fitnessProxy: 'medium',
    generalizationProxy: 'medium',
    simplicityProxy: 'medium',
    useCases: ['balanced analysis', 'medium-complexity logs'],
  },
  declare: {
    speedTier: 35,
    qualityTier: 50,
    precisionProxy: 'medium',
    fitnessProxy: 'medium',
    generalizationProxy: 'high',
    simplicityProxy: 'low',
    useCases: ['flexible/unstructured processes', 'constraint mining'],
  },
  'simulated-annealing': {
    speedTier: 55,
    qualityTier: 65,
    precisionProxy: 'medium',
    fitnessProxy: 'high',
    generalizationProxy: 'medium',
    simplicityProxy: 'medium',
    useCases: ['quality analysis', 'iterative improvement'],
  },
  astar: {
    speedTier: 60,
    qualityTier: 70,
    precisionProxy: 'high',
    fitnessProxy: 'high',
    generalizationProxy: 'medium',
    simplicityProxy: 'medium',
    useCases: ['conformance checking', 'quality analysis'],
  },
  'ant-colony': {
    speedTier: 65,
    qualityTier: 75,
    precisionProxy: 'high',
    fitnessProxy: 'high',
    generalizationProxy: 'medium',
    simplicityProxy: 'low',
    useCases: ['quality analysis', 'publication / final model'],
  },
  pso: {
    speedTier: 70,
    qualityTier: 75,
    precisionProxy: 'high',
    fitnessProxy: 'high',
    generalizationProxy: 'medium',
    simplicityProxy: 'low',
    useCases: ['quality analysis', 'publication / final model'],
  },
  genetic: {
    speedTier: 75,
    qualityTier: 80,
    precisionProxy: 'high',
    fitnessProxy: 'high',
    generalizationProxy: 'medium',
    simplicityProxy: 'low',
    useCases: ['publication / final model', 'quality-over-speed scenarios'],
  },
  'dfg-optimized': {
    speedTier: 70,
    qualityTier: 85,
    precisionProxy: 'high',
    fitnessProxy: 'high',
    generalizationProxy: 'medium',
    simplicityProxy: 'medium',
    useCases: ['publication / final model', 'optimized DFG with best fitness'],
  },
  ilp: {
    speedTier: 80,
    qualityTier: 90,
    precisionProxy: 'high',
    fitnessProxy: 'high',
    generalizationProxy: 'low',
    simplicityProxy: 'low',
    useCases: ['publication / final model', 'maximum quality required'],
  },
};

interface ModelStats {
  algorithm: Algorithm;
  nodes: number;
  edges: number;
  variants: number;
  density: number;
  complexity: number;
  elapsedMs: number;
  /**
   * Alias for `elapsedMs` — satisfies the JSON contract field name `duration_ms`.
   * Both fields are present so consumers can use either name.
   */
  duration_ms: number;
  /**
   * Shape/type of the model returned by this algorithm:
   * 'dfg' | 'petrinet' | 'tree' | 'declare' | 'unknown' (on error).
   * Lets consumers distinguish Petri net from DFG without inspecting raw output.
   */
  output_type: 'dfg' | 'petrinet' | 'tree' | 'declare' | 'unknown';
  /** Number of nodes (alias: node_count) */
  node_count: number;
  /** Number of edges (alias: edge_count) */
  edge_count: number;
  /** Quality tier from ALGO_PROFILES (0-100) */
  qualityTier: number;
  /** Speed tier from ALGO_PROFILES (0-100, lower = faster) */
  speedTier: number;
  /**
   * Always true — signals that qualityTier is a design-time registry proxy,
   * not a live fitness/precision score computed from the log.
   * For authoritative Van der Aalst scores run `wpm quality <log.xes>`.
   */
  quality_tier_is_proxy: true;
  /**
   * Live token-replay fitness score (0-1), only populated when --quality flag is used.
   * null means fitness was not computed (flag not set or WASM function unavailable).
   */
  liveFitness?: number | null;
  /**
   * Live precision score (0-1), only populated when --quality flag is used.
   * null means precision was not computed.
   */
  livePrecision?: number | null;
}

/**
 * A recommendation of which algorithm to use, derived from the comparison results.
 * Recommendations are grounded in Van der Aalst's four quality dimensions.
 */
interface AlgorithmRecommendation {
  /** Fastest algorithm (lowest elapsedMs among successful runs). */
  fastest: { algorithm: Algorithm; elapsedMs: number; rationale: string };
  /** Highest quality algorithm (highest qualityTier among successful runs). */
  highestQuality: { algorithm: Algorithm; qualityTier: number; rationale: string };
  /** Best quality/speed tradeoff — highest qualityTier-per-ms ratio. */
  bestTradeoff: { algorithm: Algorithm; qualityPerMs: number; rationale: string };
  /** Plain-language speed-vs-quality narrative for the practitioner. */
  tradeoffNarrative: string;
}

/**
 * Derive a winner recommendation from a set of model stats.
 * Only considers successful runs (nodes >= 0).
 * Returns null if there are fewer than 2 successful runs.
 *
 * Quality is measured by qualityTier (Van der Aalst proxy: higher = better
 * fitness+precision balance). Edge count alone is NOT a quality proxy — a
 * flower model has maximum edges but zero precision.
 */
function deriveRecommendation(stats: ModelStats[]): AlgorithmRecommendation | null {
  const valid = stats.filter((s) => s.nodes >= 0 && s.elapsedMs > 0);
  if (valid.length < 2) return null;

  // Fastest by wall-clock time
  const fastest = valid.reduce((a, b) => (a.elapsedMs <= b.elapsedMs ? a : b));

  // Highest quality by registry quality tier
  const highestQuality = valid.reduce((a, b) => (a.qualityTier >= b.qualityTier ? a : b));

  // Best tradeoff: qualityTier per ms (quality gained per unit time)
  const withRatio = valid.map((s) => ({ ...s, qualityPerMs: s.qualityTier / s.elapsedMs }));
  const bestTradeoff = withRatio.reduce((a, b) => (a.qualityPerMs >= b.qualityPerMs ? a : b));

  // Speed-vs-quality narrative: compare fastest vs highest quality
  let tradeoffNarrative: string;
  if (fastest.algorithm === highestQuality.algorithm) {
    tradeoffNarrative = `${fastest.algorithm} is both the fastest and highest quality in this comparison.`;
  } else {
    const speedup = highestQuality.elapsedMs / fastest.elapsedMs;
    const qualityGain = highestQuality.qualityTier - fastest.qualityTier;
    const pct = Math.round((qualityGain / Math.max(fastest.qualityTier, 1)) * 100);
    tradeoffNarrative =
      `Fastest: ${fastest.algorithm} (${fastest.elapsedMs.toFixed(1)} ms, quality tier ${fastest.qualityTier}/100). ` +
      `Highest quality: ${highestQuality.algorithm} (${highestQuality.elapsedMs.toFixed(1)} ms, quality tier ${highestQuality.qualityTier}/100). ` +
      `${highestQuality.algorithm} is ${speedup.toFixed(1)}x slower but scores ${pct}% higher on the Van der Aalst quality scale.`;
  }

  return {
    fastest: {
      algorithm: fastest.algorithm,
      elapsedMs: fastest.elapsedMs,
      rationale: `Lowest wall-clock time (${fastest.elapsedMs.toFixed(1)} ms, quality tier ${fastest.qualityTier}/100) — use for exploration and quick-look analysis`,
    },
    highestQuality: {
      algorithm: highestQuality.algorithm,
      qualityTier: highestQuality.qualityTier,
      rationale: `Highest quality tier (${highestQuality.qualityTier}/100, ${highestQuality.elapsedMs.toFixed(1)} ms) — use for publication and conformance checking`,
    },
    bestTradeoff: {
      algorithm: bestTradeoff.algorithm,
      qualityPerMs: Math.round(bestTradeoff.qualityPerMs * 100) / 100,
      rationale: `Best quality/time ratio (${bestTradeoff.qualityTier}/100 quality in ${bestTradeoff.elapsedMs.toFixed(1)} ms) — use for daily operational analysis`,
    },
    tradeoffNarrative,
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
  // When all compared values are equal (max == min), every algorithm is tied at the
  // same level. Rendering all-░ (minimum) is misleading — the values are not minimal,
  // they are identical. Render all-▓ (maximum) to signal "tied at ceiling" clearly.
  if (max <= min) return '▓'.repeat(width);
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
      'Run multiple discovery algorithms on the same log side-by-side. ' +
      'Exits with code 4 (Partial Failure) if at least one algorithm fails but others succeed. ' +
      'Example: wpm compare dfg,heuristic -i process.xes',
  },
  args: {
    algorithms: {
      type: 'positional',
      description: `Algorithms to compare (space-separated). Available: ${ALGORITHMS.join(', ')}`,
      required: true,
    },
    input: {
      type: 'string',
      description: 'Path to XES event log file — use -i as shorthand',
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
      description: 'Output format: human (default, sparkline table), json (detailed payload), or csv (flat metrics table)',
      default: 'human',
    },
    'no-color': {
      type: 'boolean',
      description: 'Disable ANSI colors in output',
    },
    'no-emoji': {
      type: 'boolean',
      description: 'Disable emoji in output',
    },
    verbose: {
      type: 'boolean',
      description: 'Enable verbose output — use -v as shorthand',
      alias: 'v',
    },
    quiet: {
      type: 'boolean',
      description: 'Suppress non-error output — use -q as shorthand',
      alias: 'q',
    },
    'cache-stats': {
      type: 'boolean',
      description: 'Print cache hit/miss statistics after comparison',
    },
    quality: {
      type: 'boolean',
      description:
        'After running each algorithm, attempt to compute token-replay fitness and show a quality-ranked table. ' +
        'For authoritative Van der Aalst scores run: wpm quality <log.xes>.',
    },
    'no-save': {
      type: 'boolean',
      description: 'Do not auto-save the receipt to .wasm4pm/receipts/',
    },
    'cohort': {
      type: 'string' as const,
      description: 'Partition traces by case attribute for cohort comparison (e.g. --cohort org:resource)',
    },
  },
  async run(ctx) {
    const format = (ctx.args.format as 'json' | 'human' | 'csv') ?? 'human';
    const verbose = Boolean(ctx.args.verbose);
    const quiet = Boolean(ctx.args.quiet);
    const showQuality = Boolean(ctx.args.quality);
    const emitOptions = { format: format as any, verbose, quiet };

    // Pre-WASM validation: reject unknown format values before loading WASM.
    // Doing this early avoids wasting time on WASM initialisation for a config error.
    if (format !== 'json' && format !== 'human' && format !== 'csv') {
      const result = makeErrorResult(
        'compare',
        new Error(
          `Invalid --format value: '${format}'. Must be 'human', 'json', or 'csv'.\n\n` +
            `Usage:  wpm compare dfg,heuristic -i log.xes --format csv`
        ),
        EXIT_CODES.config_error,
        'INVALID_FORMAT'
      );
      // Emit as JSON regardless of the bad format so the envelope is machine-readable.
      emitResult(result, { format: 'json', verbose, quiet });
      return await exitWithFlush(result.exit_code);
    }

    return withSpan(
      'compare',
      {
        algorithms: String(ctx.args.algorithms ?? ''),
        input: String(ctx.args.input ?? ''),
        format,
        quality: showQuality,
      },
      async () => {
        try {
          // Parse algorithms from the single positional (citty collects remaining args as string)
          const rawAlgos = (ctx.args.algorithms as string)
            .split(/[\s,]+/)
            .map((s) => s.trim().toLowerCase())
            .filter(Boolean);

          // Empty or separator-only input (e.g. "" or ",") — config error
          if (rawAlgos.length === 0) {
            const result = makeErrorResult(
              'compare',
              new Error(
                `No algorithms specified.\n\n` +
                  `Usage:  wpm compare dfg,heuristic -i log.xes\n` +
                  `        wpm compare dfg heuristic inductive -i log.xes\n\n` +
                  `Quick picks: dfg, heuristic, inductive, ilp, genetic\n` +
                  `Run 'wpm algorithms' to list all available algorithms.`
              ),
              EXIT_CODES.config_error,
              'NO_ALGORITHMS'
            );
            emitResult(result, emitOptions);
            return await exitWithFlush(result.exit_code);
          }

          // Resolve registry IDs or CLI aliases to compare-supported keys
          const resolved = rawAlgos.map((a) => resolveCompareAlgorithm(a));
          const invalid = resolved.filter((a): a is undefined => a === undefined);
          if (invalid.length > 0) {
            const invalidRaw = rawAlgos.filter((a, i) => resolved[i] === undefined);
            const result = makeErrorResult(
              'compare',
              new Error(
                `Unknown algorithm(s): ${invalidRaw.join(', ')}.\n\n` +
                  `  Available CLI aliases: ${ALGORITHMS.join(', ')}\n\n` +
                  `  Usage:  wpm compare dfg,heuristic,genetic -i log.xes\n` +
                  `  Run 'wpm algorithms' to list all available algorithms with descriptions.`
              ),
              EXIT_CODES.config_error,
              'UNKNOWN_ALGORITHMS'
            );
            emitResult(result, emitOptions);
            return await exitWithFlush(result.exit_code);
          }

          const resolvedAlgos = resolved as Algorithm[];

          // Deduplicate algorithms — dfg,dfg is a config error: a comparison needs distinct algorithms
          const seen = new Set<string>();
          const duplicates: string[] = [];
          for (const a of resolvedAlgos) {
            if (seen.has(a)) {
              duplicates.push(a);
            } else {
              seen.add(a);
            }
          }
          if (duplicates.length > 0) {
            const result = makeErrorResult(
              'compare',
              new Error(
                `Duplicate algorithm(s) specified: ${duplicates.join(', ')}.\n\n` +
                  `Each algorithm must appear at most once — a comparison needs distinct algorithms.\n\n` +
                  `Usage:  wpm compare dfg,heuristic -i log.xes\n` +
                  `Run 'wpm algorithms' to list all available algorithms.`
              ),
              EXIT_CODES.config_error,
              'DUPLICATE_ALGORITHMS'
            );
            emitResult(result, emitOptions);
            return await exitWithFlush(result.exit_code);
          }

          if (resolvedAlgos.length < 2) {
            const result = makeErrorResult(
              'compare',
              new Error(
                `At least two algorithms are required for comparison (got ${resolvedAlgos.length}).\n\n` +
                  `Usage:  wpm compare dfg,heuristic -i log.xes\n` +
                  `        wpm compare dfg heuristic inductive -i log.xes\n\n` +
                  `Quick picks: dfg, heuristic, inductive, ilp, genetic\n` +
                  `Run 'wpm algorithms' to list all available algorithms.`
              ),
              EXIT_CODES.config_error,
              'TOO_FEW_ALGORITHMS'
            );
            emitResult(result, emitOptions);
            return await exitWithFlush(result.exit_code);
          }

          const algos = resolvedAlgos;

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
              await withSpanRaw(
                `wasm4pm.${AnalysisSpans.compareStart(algos.length)}`,
                { algorithms: algos.join(','), activityKey, log: inputPath },
                async () => {
                  for (const algo of algos) {
                    let algoStat: ModelStats | undefined;
                    let algoError: string | undefined;
                    await withSpanRaw(
                      `wasm4pm.${AnalysisSpans.compareAlgo(algo)}`,
                      { algorithm: algo, activityKey, log: inputPath, quality_tier: ALGO_PROFILES[algo].qualityTier },
                      async () => {
                        try {
                          const { raw, elapsedMs } = runDiscovery(wasm, algo, logHandle, activityKey);
                          const shape = discriminate(raw, algo);
                          const { nodes, edges } = toUniformStats(shape);
                          const profile = ALGO_PROFILES[algo];
                          algoStat = {
                            algorithm: algo,
                            nodes,
                            edges,
                            node_count: nodes,
                            edge_count: edges,
                            output_type: shape.kind,
                            variants: sharedMetrics.variants,
                            density: sharedMetrics.density,
                            complexity: sharedMetrics.complexity,
                            elapsedMs,
                            duration_ms: elapsedMs,
                            qualityTier: profile.qualityTier,
                            speedTier: profile.speedTier,
                            quality_tier_is_proxy: true,
                          };

                          // --quality: attempt live token-replay fitness computation
                          if (showQuality) {
                            try {
                              const fitnessRaw = typeof wasm['compute_token_replay_fitness'] === 'function'
                                ? wasm['compute_token_replay_fitness'](logHandle, activityKey)
                                : null;
                              if (fitnessRaw !== null) {
                                const parsed = typeof fitnessRaw === 'string' ? JSON.parse(fitnessRaw) : fitnessRaw;
                                const fitnessVal = typeof parsed === 'number'
                                  ? parsed
                                  : typeof parsed?.fitness === 'number'
                                    ? parsed.fitness
                                    : typeof parsed?.fitness_value === 'number'
                                      ? parsed.fitness_value
                                      : null;
                                algoStat.liveFitness = fitnessVal;
                                algoStat.livePrecision = typeof parsed?.precision === 'number'
                                  ? parsed.precision : null;
                              } else {
                                algoStat.liveFitness = null;
                                algoStat.livePrecision = null;
                              }
                            } catch {
                              algoStat.liveFitness = null;
                              algoStat.livePrecision = null;
                            }
                          }
                        } catch (err) {
                          // Record the failure; push a sentinel row so output is always complete
                          const msg = err instanceof Error ? err.message : String(err);
                          algoError = msg;
                          algorithmErrors.push(`${algo}: ${msg}`);
                          const profile = ALGO_PROFILES[algo];
                          algoStat = {
                            algorithm: algo,
                            nodes: -1,
                            edges: -1,
                            node_count: -1,
                            edge_count: -1,
                            output_type: 'unknown' as const,
                            variants: sharedMetrics.variants,
                            density: sharedMetrics.density,
                            complexity: sharedMetrics.complexity,
                            elapsedMs: 0,
                            duration_ms: 0,
                            qualityTier: profile.qualityTier,
                            speedTier: profile.speedTier,
                            quality_tier_is_proxy: true,
                          };
                        }
                      },
                      () => ({
                        nodes: algoStat?.nodes ?? -1,
                        edges: algoStat?.edges ?? -1,
                        elapsed_ms: Math.round(algoStat?.elapsedMs ?? 0),
                        output_type: algoStat?.output_type ?? 'unknown',
                        status: algoError ? 'error' : 'ok',
                        ...(algoError ? { error: algoError } : {}),
                      })
                    );
                    if (algoStat) stats.push(algoStat);
                  }
                },
                () => ({
                  algo_count: algos.length,
                  error_count: algorithmErrors.length,
                  elapsed_ms: Math.round(performance.now() - t0),
                })
              );
              const totalElapsedMs = performance.now() - t0;

              // Derive winner recommendations before building payload
              const recommendation = deriveRecommendation(stats);

              // Derive a single "winner" string — the algorithm with the highest qualityTier
              // among successful runs, or null if fewer than 2 runs succeeded.
              const winner: string | null =
                recommendation !== null ? recommendation.highestQuality.algorithm : null;

              // Build canonical result payload. Include algorithm_errors only when some
              // runs failed so consumers can distinguish partial from full success.
              const payload: {
                status: 'ok';
                input: string;
                activityKey: string;
                /** Array of algorithm name strings that were compared. */
                algorithms: string[];
                /** Per-algorithm comparison results (one entry per algorithm). */
                comparisons: ModelStats[];
                /** Algorithm with the highest quality tier, or null if fewer than 2 succeeded. */
                winner: string | null;
                recommendation: AlgorithmRecommendation | null;
                algorithm_errors?: string[];
              } = {
                status: 'ok' as const,
                input: inputPath,
                activityKey,
                algorithms: algos,
                comparisons: stats,
                winner,
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
                const s = p.comparisons;

                if (format === 'csv') {
                  projection.log('algorithm,nodes,edges,elapsed_ms,quality_tier,live_fitness,live_precision');
                  for (const st of s) {
                    const nodesVal = st.nodes >= 0 ? st.nodes : 'ERROR';
                    const edgesVal = st.nodes >= 0 ? st.edges : '';
                    const timeVal = st.nodes >= 0 ? st.elapsedMs.toFixed(1) : '';
                    const qualVal = st.qualityTier;
                    const fitVal = st.liveFitness != null ? st.liveFitness.toFixed(3) : '';
                    const precVal = st.livePrecision != null ? st.livePrecision.toFixed(3) : '';
                    projection.log(`${st.algorithm},${nodesVal},${edgesVal},${timeVal},${qualVal},${fitVal},${precVal}`);
                  }
                  return;
                }

                projection.info(`Comparing algorithms: ${algos.join(', ')}`);
                projection.log('');

                // Compute ranges for sparklines (must be before header so we know success count)
                const validStats = s.filter((st) => st.nodes >= 0);

                // BUG-2 FIX: Show warning/error header when 0 algorithms succeeded rather than
                // unconditionally emitting a green ✔ even when all runs failed.
                if (validStats.length === 0) {
                  projection.error(`Algorithm comparison — ${p.input} (all algorithms failed)`);
                } else if (validStats.length < s.length) {
                  projection.warn(`Algorithm comparison — ${p.input} (partial: ${validStats.length}/${s.length} succeeded)`);
                } else {
                  projection.success(`Algorithm comparison — ${p.input}`);
                }
                projection.log(
                  `  Activity key: ${p.activityKey}  |  Log variants: ${sharedMetrics.variants}`
                );
                projection.log('');
                const minNodes = Math.min(...validStats.map((st) => st.nodes));
                const maxNodes = Math.max(...validStats.map((st) => st.nodes));
                const minEdges = Math.min(...validStats.map((st) => st.edges));
                const maxEdges = Math.max(...validStats.map((st) => st.edges));
                const minTime = Math.min(...validStats.map((st) => st.elapsedMs));
                const maxTime = Math.max(...validStats.map((st) => st.elapsedMs));
                const minQuality = Math.min(...validStats.map((st) => st.qualityTier));
                const maxQuality = Math.max(...validStats.map((st) => st.qualityTier));

                // Table header — includes Quality* column so all four Van der Aalst
                // proxies are visible at a glance alongside structural metrics.
                // The * signals that Quality* is a design-time proxy, not a live score.
                projection.log(
                  `  ${'Algorithm'.padEnd(20)}  ${'Nodes'.padStart(6)}  ${'Edges'.padStart(6)}  ${'Time(ms)'.padStart(9)}  ${'Quality*'.padStart(8)}  ${'Nodes'.padEnd(10)}  ${'Edges'.padEnd(10)}  ${'Time'.padEnd(10)}  ${'Quality*'.padEnd(10)}`
                );
                projection.log(
                  `  ${'─'.repeat(20)}  ${'─'.repeat(6)}  ${'─'.repeat(6)}  ${'─'.repeat(9)}  ${'─'.repeat(8)}  ${'(bar)'.padEnd(10)}  ${'(bar)'.padEnd(10)}  ${'(bar)'.padEnd(10)}  ${'(bar)'.padEnd(10)}`
                );

                for (const st of s) {
                  const algoCol = col(st.algorithm, 20);
                  if (st.nodes < 0) {
                    projection.log(
                      `  ${algoCol}  ${'ERROR'.padStart(6)}  ${'─'.padStart(6)}  ${'─'.padStart(9)}  ${'─'.padStart(8)}`
                    );
                    continue;
                  }
                  const nodesStr = numCol(st.nodes, 6);
                  const edgesStr = numCol(st.edges, 6);
                  const timeStr = numCol(st.elapsedMs, 9, 1);
                  const qualStr = numCol(st.qualityTier, 8);
                  const nodesBar = sparkBar(st.nodes, minNodes, maxNodes).padEnd(10);
                  const edgesBar = sparkBar(st.edges, minEdges, maxEdges).padEnd(10);
                  const timeBar = sparkBar(st.elapsedMs, minTime, maxTime).padEnd(10);
                  const qualBar = sparkBar(st.qualityTier, minQuality, maxQuality).padEnd(10);
                  projection.log(
                    `  ${algoCol}  ${nodesStr}  ${edgesStr}  ${timeStr}  ${qualStr}  ${nodesBar}  ${edgesBar}  ${timeBar}  ${qualBar}`
                  );
                }

                projection.log('');
                projection.log(
                  '  Legend: ▓▓▓▓▓▓▓▓ = max  ░░░░░░░░ = min   bars are relative within this comparison'
                );

                // --quality: quality-ranked comparison table
                if (showQuality) {
                  const withFitness = validStats.filter((st) => st.liveFitness != null);
                  if (withFitness.length > 0) {
                    const ranked = [...withFitness].sort((a, b) => {
                      const fa = a.liveFitness ?? 0;
                      const fb = b.liveFitness ?? 0;
                      if (Math.abs(fb - fa) > 0.001) return fb - fa;
                      return b.qualityTier - a.qualityTier;
                    });
                    const minSpeed = Math.min(...ranked.map((r) => r.speedTier));
                    const maxSpeed = Math.max(...ranked.map((r) => r.speedTier));
                    const minQuality = Math.min(...ranked.map((r) => r.qualityTier));
                    const maxQuality = Math.max(...ranked.map((r) => r.qualityTier));
                    projection.log('');
                    projection.log('  ─── Quality Ranking (--quality) ─────────────────────────────');
                    projection.log('');
                    projection.log(
                      `  ${'Rank'.padEnd(5)} ${'Algorithm'.padEnd(22)} ${'Speed'.padEnd(10)} ${'Quality*'.padEnd(10)} ${'Fitness'.padEnd(10)} ${'Precision'.padEnd(10)}`
                    );
                    projection.log(
                      `  ${'─'.repeat(5)} ${'─'.repeat(22)} ${'─'.repeat(10)} ${'─'.repeat(10)} ${'─'.repeat(10)} ${'─'.repeat(10)}`
                    );
                    ranked.forEach((st, idx) => {
                      const rank = `${idx + 1}.`;
                      const alg = col(st.algorithm, 22);
                      const speedBar = sparkBar(st.speedTier, minSpeed, maxSpeed, 8).padEnd(10);
                      const qualBar = sparkBar(st.qualityTier, minQuality, maxQuality, 8).padEnd(10);
                      const fitStr = st.liveFitness != null ? st.liveFitness.toFixed(3) : '—';
                      const precStr = st.livePrecision != null ? st.livePrecision.toFixed(3) : '—';
                      projection.log(
                        `  ${rank.padEnd(5)} ${alg} ${speedBar} ${qualBar} ${fitStr.padEnd(10)} ${precStr.padEnd(10)}`
                      );
                    });
                    projection.log('');
                    projection.log('  Speed bars: lower = faster. Fitness: token-replay score (0–1). Quality*: design-time proxy.');
                    projection.log('');
                  } else {
                    projection.log('');
                    projection.log('  --quality: live fitness not available in this WASM build. Run: wpm quality <log.xes>');
                    projection.log('');
                  }
                }

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
                projection.log(
                  '    Quality* — Van der Aalst quality tier (0-100). * = design-time registry proxy,'
                );
                projection.log(
                  '               not a live fitness/precision score computed from this log.'
                );
                projection.log(
                  '               Higher = better expected fitness+precision balance.'
                );
                projection.log(
                  '               For authoritative scores: wpm quality <log.xes>.'
                );
                projection.log('');

                // Partial failure notice
                if (p.algorithm_errors && p.algorithm_errors.length > 0) {
                  projection.warn(`\n  ⚠ Command finished with PARTIAL FAILURE (Exit Code 4):`);
                  projection.warn(`    ${s.filter(st => st.nodes >= 0).length} algorithm(s) succeeded, ${p.algorithm_errors.length} failed.`);
                  projection.log('  Failed algorithm details:');
                  for (const e of p.algorithm_errors) {
                    projection.warn(`    • ${e}`);
                  }
                  projection.log('');
                }

                // Winner recommendation section — Van der Aalst grounded
                if (recommendation) {
                  projection.log('  ─── Winner ───────────────────────────────────────────────');
                  projection.log('');
                  projection.log(`  Trade-off: ${recommendation.tradeoffNarrative}`);
                  projection.log('');
                  projection.log('  Recommendations by criterion:');
                  projection.success(
                    `    Fastest        → ${recommendation.fastest.algorithm.padEnd(20)}  ${recommendation.fastest.rationale}`
                  );
                  projection.success(
                    `    Highest quality→ ${recommendation.highestQuality.algorithm.padEnd(20)}  ${recommendation.highestQuality.rationale}`
                  );
                  projection.success(
                    `    Best tradeoff  → ${recommendation.bestTradeoff.algorithm.padEnd(20)}  ${recommendation.bestTradeoff.rationale}`
                  );
                  projection.log('');

                  // Van der Aalst 4-dimension breakdown for top 2 algorithms
                  // (fastest and highest quality — the practitioner's core choice)
                  const top2 = [
                    recommendation.fastest.algorithm,
                    recommendation.highestQuality.algorithm,
                  ].filter((v, i, arr) => arr.indexOf(v) === i);
                  if (top2.length >= 1) {
                    projection.log('  Van der Aalst 4-dimension profile (top algorithm(s)):');
                    projection.log('');
                    projection.log(
                      `  ${'Algorithm'.padEnd(20)}  ${'Fitness'.padEnd(10)}  ${'Precision'.padEnd(10)}  ${'Generalize'.padEnd(12)}  ${'Simplicity'.padEnd(12)}  Recommended for`
                    );
                    projection.log(
                      `  ${'─'.repeat(20)}  ${'─'.repeat(10)}  ${'─'.repeat(10)}  ${'─'.repeat(12)}  ${'─'.repeat(12)}  ${'─'.repeat(30)}`
                    );
                    for (const algoName of top2) {
                      const profile = ALGO_PROFILES[algoName as Algorithm];
                      if (!profile) continue;
                      const useCaseLabel = profile.useCases[0] ?? 'general analysis';
                      projection.log(
                        `  ${col(algoName, 20)}  ${profile.fitnessProxy.padEnd(10)}  ${profile.precisionProxy.padEnd(10)}  ${profile.generalizationProxy.padEnd(12)}  ${profile.simplicityProxy.padEnd(12)}  ${useCaseLabel}`
                      );
                    }
                    projection.log('');
                  }

                  // Per-algorithm use-case labels for all compared algorithms
                  projection.log('  Recommended for (all compared algorithms):');
                  for (const st of s) {
                    if (st.nodes < 0) continue; // skip failed runs
                    const profile = ALGO_PROFILES[st.algorithm];
                    const label = profile.useCases.join(' | ');
                    projection.log(`    ${col(st.algorithm, 20)}  ${label}`);
                  }
                  projection.log('');

                  projection.log(
                    '  Note: Quality* is a design-time registry proxy (quality_tier_is_proxy: true),'
                  );
                  projection.log(
                    '  not a live fitness/precision score. For authoritative Van der Aalst metrics: wpm quality <log.xes>'
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
