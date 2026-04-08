import { defineCommand } from 'citty';
import * as fs from 'fs/promises';
import { ALGORITHM_CLI_ALIASES } from '@pictl/contracts';
import { getFormatter, HumanFormatter, JSONFormatter } from '../output.js';
import { EXIT_CODES } from '../exit-codes.js';
import { WasmLoader } from '@pictl/engine';

/**
 * Algorithms supported by `pictl compare`.
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
 * Invoke the appropriate WASM discovery function for the given algorithm,
 * then extract common DFG-shaped statistics from the result.
 */
function runDiscovery(
  wasm: Record<string, CallableFunction>,
  algo: Algorithm,
  logHandle: string,
  activityKey: string,
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
      raw = wasm['discover_process_skeleton'](logHandle, activityKey);
      break;
    case 'dfg-optimized':
      raw = wasm['discover_dfg_optimized'](logHandle, activityKey, 0.5, 0.5);
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
 * Extract node/edge counts from a discovery result.
 * Results may be a parsed object already (JsValue) or a JSON string.
 */
function extractStats(raw: unknown): { nodes: number; edges: number } {
  let obj: Record<string, unknown>;

  if (typeof raw === 'string') {
    try {
      obj = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return { nodes: 0, edges: 0 };
    }
  } else if (raw !== null && typeof raw === 'object') {
    obj = raw as Record<string, unknown>;
  } else {
    return { nodes: 0, edges: 0 };
  }

  // DFG / social-network shape: { nodes: [...], edges: [...] }
  if (Array.isArray(obj['nodes']) && Array.isArray(obj['edges'])) {
    return { nodes: obj['nodes'].length, edges: obj['edges'].length };
  }

  // Petri Net shape: { places: [...], transitions: [...], arcs: [...] }
  if (Array.isArray(obj['places']) && Array.isArray(obj['transitions'])) {
    const places = (obj['places'] as unknown[]).length;
    const transitions = (obj['transitions'] as unknown[]).length;
    const arcs = Array.isArray(obj['arcs']) ? (obj['arcs'] as unknown[]).length : 0;
    return { nodes: places + transitions, edges: arcs };
  }

  // Edge-set shape (genetic / ant-colony): { edges: [{from, to}] }
  if (Array.isArray(obj['edges'])) {
    return { nodes: 0, edges: (obj['edges'] as unknown[]).length };
  }

  return { nodes: 0, edges: 0 };
}

/**
 * Run the model metrics WASM function to get variants, density, complexity.
 */
function extractModelMetrics(
  wasm: Record<string, CallableFunction>,
  logHandle: string,
  activityKey: string,
): { variants: number; density: number; complexity: number } {
  try {
    const raw = wasm['compute_model_metrics'](logHandle, activityKey);
    const obj = (typeof raw === 'string' ? JSON.parse(raw) : raw) as Record<string, unknown>;
    return {
      variants: (obj['num_variants'] as number) ?? 0,
      density: (obj['density'] as number) ?? 0,
      complexity: (obj['complexity_score'] as number) ?? 0,
    };
  } catch {
    return { variants: 0, density: 0, complexity: 0 };
  }
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
    description: 'Run two or more algorithms on the same XES log and print a side-by-side comparison table',
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
    const formatter = getFormatter({
      format: ctx.args.format as 'human' | 'json',
      verbose: ctx.args.verbose,
      quiet: ctx.args.quiet,
    });

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
        formatter.error(
          `Unknown algorithm(s): ${invalid.join(', ')}. Available: ${Object.keys(ALGORITHM_CLI_ALIASES).join(', ')}`,
        );
        process.exit(EXIT_CODES.source_error);
      }

      if (resolved.length < 2) {
        formatter.error('Please specify at least two algorithms to compare.');
        process.exit(EXIT_CODES.source_error);
      }

      const algos = resolved as Algorithm[];

      // Validate input file
      const inputPath = ctx.args.input as string;
      try {
        await fs.access(inputPath);
      } catch {
        formatter.error(`Input file not found: ${inputPath}`);
        process.exit(EXIT_CODES.source_error);
      }

      const activityKey = (ctx.args['activity-key'] as string) || 'concept:name';

      // Load WASM
      if (formatter instanceof HumanFormatter) {
        formatter.info(`Comparing algorithms: ${algos.join(', ')}`);
      }

      const loader = WasmLoader.getInstance();
      await loader.init();
      const wasm = loader.get() as Record<string, CallableFunction>;

      // Parse XES and load log
      const xesContent = await fs.readFile(inputPath, 'utf-8');
      const logHandle: string = wasm['load_eventlog_from_xes'](xesContent) as string;

      // Get shared metrics (variants, density, complexity) once from the log
      const sharedMetrics = extractModelMetrics(wasm, logHandle, activityKey);

      // Run each algorithm
      const stats: ModelStats[] = [];
      for (const algo of algos) {
        if (formatter instanceof HumanFormatter) {
          formatter.debug(`Running ${algo}...`);
        }
        try {
          const { raw, elapsedMs } = runDiscovery(wasm, algo, logHandle, activityKey);
          const { nodes, edges } = extractStats(raw);
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
          if (formatter instanceof HumanFormatter) {
            formatter.warn(
              `Algorithm "${algo}" failed: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
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

      // Free log handle
      try { wasm['delete_object'](logHandle); } catch { /* best-effort */ }

      // Output
      if (formatter instanceof JSONFormatter) {
        (formatter as JSONFormatter).success('Algorithm comparison', {
          input: inputPath,
          activityKey,
          algorithms: stats,
        });
        process.exit(EXIT_CODES.success);
      }

      // Human-readable side-by-side table with sparklines
      const humanFormatter = formatter as HumanFormatter;
      humanFormatter.log('');
      humanFormatter.success(`Algorithm comparison — ${inputPath}`);
      humanFormatter.log(`  Activity key: ${activityKey}  |  Log variants: ${sharedMetrics.variants}`);
      humanFormatter.log('');

      // Compute ranges for sparklines
      const validStats = stats.filter((s) => s.nodes >= 0);
      const minNodes = Math.min(...validStats.map((s) => s.nodes));
      const maxNodes = Math.max(...validStats.map((s) => s.nodes));
      const minEdges = Math.min(...validStats.map((s) => s.edges));
      const maxEdges = Math.max(...validStats.map((s) => s.edges));
      const minTime = Math.min(...validStats.map((s) => s.elapsedMs));
      const maxTime = Math.max(...validStats.map((s) => s.elapsedMs));

      // Table header
      humanFormatter.log(
        `  ${'Algorithm'.padEnd(20)}  ${'Nodes'.padStart(6)}  ${'Edges'.padStart(6)}  ${'Time(ms)'.padStart(9)}  ${'Nodes'.padEnd(10)}  ${'Edges'.padEnd(10)}  ${'Time'.padEnd(10)}`,
      );
      humanFormatter.log(
        `  ${'─'.repeat(20)}  ${'─'.repeat(6)}  ${'─'.repeat(6)}  ${'─'.repeat(9)}  ${'(bar)'.padEnd(10)}  ${'(bar)'.padEnd(10)}  ${'(bar)'.padEnd(10)}`,
      );

      for (const s of stats) {
        const algoCol = col(s.algorithm, 20);
        if (s.nodes < 0) {
          humanFormatter.log(`  ${algoCol}  ${'ERROR'.padStart(6)}  ${'─'.padStart(6)}  ${'─'.padStart(9)}`);
          continue;
        }
        const nodesStr = numCol(s.nodes, 6);
        const edgesStr = numCol(s.edges, 6);
        const timeStr = numCol(s.elapsedMs, 9, 1);
        const nodesBar = sparkBar(s.nodes, minNodes, maxNodes).padEnd(10);
        const edgesBar = sparkBar(s.edges, minEdges, maxEdges).padEnd(10);
        const timeBar = sparkBar(s.elapsedMs, minTime, maxTime).padEnd(10);
        humanFormatter.log(
          `  ${algoCol}  ${nodesStr}  ${edgesStr}  ${timeStr}  ${nodesBar}  ${edgesBar}  ${timeBar}`,
        );
      }

      humanFormatter.log('');
      humanFormatter.log(
        '  Legend: ▓▓▓▓▓▓▓▓ = max  ░░░░░░░░ = min   bars are relative within this comparison',
      );
      humanFormatter.log('');

      // Print cache statistics if requested
      if (ctx.args['cache-stats'] && typeof wasm.get_cache_stats === 'function') {
        try {
          const statsRaw = wasm.get_cache_stats();
          const stats = typeof statsRaw === 'string' ? JSON.parse(statsRaw) : statsRaw;
          const hitRate =
            stats.parse_hits + stats.parse_misses > 0
              ? ((stats.parse_hits / (stats.parse_hits + stats.parse_misses)) * 100).toFixed(1)
              : 'N/A';
          humanFormatter.info('Cache statistics:');
          humanFormatter.info(`  Parse hits: ${stats.parse_hits}`);
          humanFormatter.info(`  Parse misses: ${stats.parse_misses}`);
          humanFormatter.info(`  Hit rate: ${hitRate}%`);
          humanFormatter.info(`  Columnar entries: ${stats.columnar_entries}`);
          humanFormatter.info(`  Interner entries: ${stats.interner_entries}`);
        } catch {
          // best-effort — cache stats not available
        }
      }

      process.exit(EXIT_CODES.success);
    } catch (error) {
      if (formatter instanceof JSONFormatter) {
        (formatter as JSONFormatter).error('Comparison failed', error);
      } else {
        formatter.error(
          `Comparison failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      process.exit(EXIT_CODES.execution_error);
    }
  },
});
