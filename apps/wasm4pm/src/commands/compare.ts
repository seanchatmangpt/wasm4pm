import { defineCommand } from 'citty';
import { ALGORITHM_CLI_ALIASES } from '@wasm4pm/contracts';
import { emitResult, makeResult, makeErrorResult } from '../output.js';
import { EXIT_CODES } from '../exit-codes.js';
import { withLogSession } from '../with-log-session.js';
import { discriminate, toUniformStats, DiscoveryShapeError } from '../discriminator.js';
import * as fs from 'node:fs';
import { withSpan } from './_otel.js';
import { saveCommandReceipt, blake3Hex, newReceipt, type CommandReceipt } from '../receipts/_shared.js';
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

/**
 * Registry quality tier (0-100) for each algorithm supported by compare.
 * Sourced from packages/kernel/src/registry.ts qualityTier values.
 * Higher = better expected model quality (fitness-precision trade-off).
 */
const QUALITY_TIERS: Record<Algorithm, number> = {
  dfg: 30,
  alpha: 45,
  heuristic: 50,
  inductive: 55,
  ilp: 90,
  genetic: 80,
  pso: 75,
  astar: 70,
  'hill-climbing': 55,
  'simulated-annealing': 65,
  'ant-colony': 75,
  declare: 50,
  skeleton: 25,
  'dfg-optimized': 85,
};

interface ModelStats {
  algorithm: Algorithm;
  nodes: number;
  edges: number;
  variants: number;
  density: number;
  complexity: number;
  elapsedMs: number;
  qualityTier: number;
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
      raw = wasm['extract_process_skeleton'](logHandle, activityKey);
      break;
    case 'dfg-optimized':
      raw = wasm['discover_dfg'](logHandle, activityKey);
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
          new Error(`Unknown algorithm(s): ${invalid.join(', ')}. Available: ${Object.keys(ALGORITHM_CLI_ALIASES).join(', ')}`),
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

        // Get shared metrics (variants, density, complexity) once from the log
        const sharedMetrics = extractModelMetrics(wasm, logHandle, activityKey);

        // Run each algorithm
        const t0 = performance.now();
        const stats: ModelStats[] = [];
        for (const algo of algos) {
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
            qualityTier: QUALITY_TIERS[algo],
          });
        }
        const totalElapsedMs = performance.now() - t0;

        // Build canonical result payload
        const payload = {
          input: inputPath,
          activityKey,
          algorithms: stats,
        };

        // Handle --cache-stats (fetch before emitting)
        let cacheStats: Record<string, unknown> | null = null;
        if (ctx.args['cache-stats']) {
          if (typeof wasm.get_cache_stats !== 'function') {
            const errResult = makeErrorResult('compare', new Error('Cache statistics requested but not available in WASM module'), EXIT_CODES.execution_error, 'CACHE_STATS_UNAVAILABLE');
            emitResult(errResult, emitOptions);
            return await exitWithFlush(errResult.exit_code);
          }
          const statsRaw = wasm.get_cache_stats();
          cacheStats = (typeof statsRaw === 'string' ? JSON.parse(statsRaw) : statsRaw) as Record<string, unknown>;
        }

        const cmdResult = makeResult('compare', payload, totalElapsedMs, EXIT_CODES.success);

        // Persist BLAKE3 receipt for proof-of-execution
        if (!ctx.args['no-save']) {
          try {
            const inputBytes = fs.readFileSync(inputPath);
            const receipt: CommandReceipt = {
              ...newReceipt('compare'),
              input_hash: blake3Hex(inputBytes),
              output_hash: blake3Hex(JSON.stringify(payload)),
              status: 'success',
              summary: {
                algorithms: algos,
                activityKey,
                elapsedMs: Math.round(totalElapsedMs * 100) / 100,
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

        // Quality tier range for sparklines
        const minQuality = Math.min(...validStats.map((st) => st.qualityTier));
        const maxQuality = Math.max(...validStats.map((st) => st.qualityTier));

        // Table header includes QTier so fitness-precision trade-off is visible at a glance
        projection.log(
          `  ${'Algorithm'.padEnd(20)}  ${'QTier'.padStart(5)}  ${'Nodes'.padStart(6)}  ${'Edges'.padStart(6)}  ${'Time(ms)'.padStart(9)}  ${'Quality'.padEnd(10)}  ${'Time'.padEnd(10)}`
        );
        projection.log(
          `  ${'─'.repeat(20)}  ${'─'.repeat(5)}  ${'─'.repeat(6)}  ${'─'.repeat(6)}  ${'─'.repeat(9)}  ${'(bar)'.padEnd(10)}  ${'(bar)'.padEnd(10)}`
        );

        for (const st of s) {
          const algoCol = col(st.algorithm, 20);
          if (st.nodes < 0) {
            projection.log(
              `  ${algoCol}  ${'ERROR'.padStart(5)}  ${'─'.padStart(6)}  ${'─'.padStart(6)}  ${'─'.padStart(9)}`
            );
            continue;
          }
          const qtierStr = numCol(st.qualityTier, 5);
          const nodesStr = numCol(st.nodes, 6);
          const edgesStr = numCol(st.edges, 6);
          const timeStr = numCol(st.elapsedMs, 9, 1);
          const qualityBar = sparkBar(st.qualityTier, minQuality, maxQuality).padEnd(10);
          const timeBar = sparkBar(st.elapsedMs, minTime, maxTime).padEnd(10);
          projection.log(
            `  ${algoCol}  ${qtierStr}  ${nodesStr}  ${edgesStr}  ${timeStr}  ${qualityBar}  ${timeBar}`
          );
        }

        projection.log('');
        projection.log(
          '  QTier: registry quality score 0-100 (fitness+precision trade-off, higher=better)'
        );
        projection.log(
          '  Legend: ▓▓▓▓▓▓▓▓ = max  ░░░░░░░░ = min   bars are relative within this comparison'
        );

        // Recommend the best quality-speed trade-off
        const byQuality = validStats.slice().sort((a, b) => b.qualityTier - a.qualityTier);
        const bySpeed = validStats.slice().sort((a, b) => a.elapsedMs - b.elapsedMs);
        if (byQuality.length > 0 && bySpeed.length > 0) {
          const bestQuality = byQuality[0];
          const fastest = bySpeed[0];
          projection.log('');
          if (bestQuality.algorithm === fastest.algorithm) {
            projection.log(
              `  Recommendation: ${bestQuality.algorithm} is both fastest and highest quality in this set.`
            );
          } else {
            projection.log(
              `  Recommendation: ${bestQuality.algorithm} (quality ${bestQuality.qualityTier}/100) gives the best model; ` +
                `${fastest.algorithm} (${fastest.elapsedMs.toFixed(1)}ms) is fastest.`
            );
            projection.log(
              `  Next: run wpm conformance -i <log.xes> to verify fitness of the best model.`
            );
          }
        }
        projection.log('');

        // Cache statistics (if fetched)
        if (cacheStats) {
          const hitRate =
            (cacheStats.parse_hits as number) + (cacheStats.parse_misses as number) > 0
              ? (((cacheStats.parse_hits as number) / ((cacheStats.parse_hits as number) + (cacheStats.parse_misses as number))) * 100).toFixed(1)
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
      });  // end withLogSession
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
      },
    );
  },
});
