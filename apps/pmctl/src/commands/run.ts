import { defineCommand } from 'citty';
import * as fs from 'fs/promises';
import * as path from 'path';
import { resolveConfig as loadConfig } from '@wasm4pm/config';
import { WasmLoader } from '@wasm4pm/engine';
import { ALGORITHM_CLI_ALIASES } from '@wasm4pm/contracts';
import { getFormatter, HumanFormatter, JSONFormatter } from '../output.js';
import { EXIT_CODES } from '../exit-codes.js';
import { savePredictionResult } from './results.js';
import type { OutputOptions } from '../output.js';

export interface RunOptions extends OutputOptions {
  config?: string;
  algorithm?: string;
  input?: string;
  output?: string;
  timeout?: number;
}

/** All algorithms supported by pmctl run, mapped to their WASM discovery functions. */
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
 * Invoke the appropriate WASM discovery function for the given algorithm.
 * Reuses the dispatch table pattern from compare.ts.
 */
function runDiscovery(
  wasm: Record<string, any>,
  algo: Algorithm,
  logHandle: string,
  activityKey: string,
): { raw: unknown; elapsedMs: number } {
  const t0 = performance.now();
  let raw: unknown;

  switch (algo) {
    case 'dfg':
      raw = wasm.discover_dfg(logHandle, activityKey);
      break;
    case 'alpha':
      raw = wasm.discover_alpha_plus_plus(logHandle, activityKey, 0.0);
      break;
    case 'heuristic':
      raw = wasm.discover_heuristic_miner(logHandle, activityKey, 0.5);
      break;
    case 'inductive':
      raw = wasm.discover_inductive_miner(logHandle, activityKey);
      break;
    case 'ilp':
      raw = wasm.discover_ilp_petri_net(logHandle, activityKey);
      break;
    case 'genetic':
      raw = wasm.discover_genetic_algorithm(logHandle, activityKey, 20, 20);
      break;
    case 'pso':
      raw = wasm.discover_pso_algorithm(logHandle, activityKey, 20, 20);
      break;
    case 'astar':
      raw = wasm.discover_astar(logHandle, activityKey, 500);
      break;
    case 'hill-climbing':
      raw = wasm.discover_hill_climbing(logHandle, activityKey);
      break;
    case 'simulated-annealing':
      raw = wasm.discover_simulated_annealing(logHandle, activityKey, 1.0, 0.95);
      break;
    case 'ant-colony':
      raw = wasm.discover_ant_colony(logHandle, activityKey, 20, 20);
      break;
    case 'declare':
      raw = wasm.discover_declare(logHandle, activityKey);
      break;
    case 'skeleton':
      raw = wasm.discover_process_skeleton(logHandle, activityKey);
      break;
    case 'dfg-optimized':
      raw = wasm.discover_dfg_optimized(logHandle, activityKey, 0.5, 0.5);
      break;
    default: {
      const _never: never = algo;
      throw new Error(`Unknown algorithm: ${_never}`);
    }
  }

  const elapsedMs = performance.now() - t0;
  return { raw, elapsedMs };
}

export const run = defineCommand({
  meta: {
    name: 'run',
    description: 'Discover a process model from an XES event log',
  },
  args: {
    input: {
      type: 'positional',
      description: 'Path to XES event log (e.g. process.xes)',
      required: false,
    },
    file: {
      type: 'string',
      description: 'Path to XES event log (named alternative to positional)',
      alias: 'i',
    },
    config: {
      type: 'string',
      description: 'Path to configuration file (wasm4pm.toml or wasm4pm.json)',
    },
    algorithm: {
      type: 'string',
      description: `Discovery algorithm — one of: ${ALGORITHMS.join(', ')} (default: heuristic)`,
      alias: 'a',
    },
    output: {
      type: 'string',
      description: 'Write JSON result to this file path',
      alias: 'o',
    },
    format: {
      type: 'string',
      description: 'Output format: human (default) or json',
    },
    verbose: {
      type: 'boolean',
      description: 'Show model summary (nodes, edges, places, transitions)',
      alias: 'v',
    },
    quiet: {
      type: 'boolean',
      description: 'Suppress all non-error output',
      alias: 'q',
    },
    timeout: {
      type: 'string',
      description: 'Execution timeout in seconds (default: 300)',
    },
    'activity-key': {
      type: 'string',
      description: 'XES activity attribute key (default: concept:name)',
    },
    'no-save': {
      type: 'boolean',
      description: 'Do not auto-save the result to .wasm4pm/results/',
    },
  },
  async run(ctx) {
    const formatter = getFormatter({
      format: ctx.args.format as 'human' | 'json',
      verbose: ctx.args.verbose,
      quiet: ctx.args.quiet,
    });

    try {
      // Step 1: Load and validate configuration
      const configPath = ctx.args.config || process.cwd();
      let config;

      try {
        config = await loadConfig({
          configSearchPaths: [configPath],
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        formatter.error(`Config error: ${message}`);
        process.exit(EXIT_CODES.config_error);
      }

      // Step 2: Resolve algorithm (fixes operator-precedence bug: --algorithm flag was ignored)
      const rawAlgo: string =
        (ctx.args.algorithm as string | undefined) ??
        (config?.execution?.profile === 'quality' ? 'heuristic'
         : config?.execution?.profile === 'fast'    ? 'dfg'
         : 'heuristic');

      // Accept kernel registry IDs (heuristic_miner) or CLI aliases (heuristic)
      const resolvedAlgo: Algorithm | undefined =
        (ALGORITHM_CLI_ALIASES[rawAlgo] as Algorithm | undefined) ??
        (() => {
          const algoLower = rawAlgo.toLowerCase().replace(/[+_]/g, '-');
          return ALGORITHMS.find((a) => a === algoLower || a === algoLower.replace(/-plus-plus/, '-'));
        })();

      if (!resolvedAlgo) {
        formatter.error(
          `Unknown algorithm: "${rawAlgo}"\nAvailable: ${Object.keys(ALGORITHM_CLI_ALIASES).join(', ')}`,
        );
        process.exit(EXIT_CODES.source_error);
      }

      // Step 3: Resolve input path (positional OR --file/-i)
      const inputPath: string | undefined =
        (ctx.args.input as string | undefined) ||
        (ctx.args.file as string | undefined);

      if (!inputPath) {
        formatter.error(
          'Input file required.\n\nUsage:  pmctl run <log.xes>\n        pmctl run <log.xes> --algorithm heuristic\n\nRun "pmctl --help" to see all commands.',
        );
        process.exit(EXIT_CODES.source_error);
      }

      try {
        await fs.access(inputPath);
      } catch {
        formatter.error(
          `Input file not found: ${inputPath}\n\nCheck that the path is correct and the file is readable.`,
        );
        process.exit(EXIT_CODES.source_error);
      }

      // Step 4: Load WASM module
      if (formatter instanceof HumanFormatter) {
        formatter.info(`Discovering process model with ${resolvedAlgo}...`);
      }

      const loader = WasmLoader.getInstance();
      await loader.init();
      const wasm = loader.get();

      // Step 5: Parse XES and load log
      if (formatter instanceof HumanFormatter) {
        formatter.debug(`Loading event log from: ${inputPath}`);
      }

      const activityKey = (ctx.args['activity-key'] as string) || 'concept:name';
      const xesContent = await fs.readFile(inputPath, 'utf-8');
      const logHandle: string = wasm.load_eventlog_from_xes(xesContent);

      // Step 6: Execute discovery
      if (formatter instanceof HumanFormatter) {
        formatter.debug(`Running ${resolvedAlgo} discovery...`);
      }

      const { raw, elapsedMs } = runDiscovery(wasm, resolvedAlgo, logHandle, activityKey);

      // Step 7: Free handle
      try { wasm.delete_object(logHandle); } catch { /* best-effort */ }

      // Normalise result (WASM may return string or object)
      const resultData = typeof raw === 'string' ? JSON.parse(raw) : raw;

      // Step 8: Build output
      const result = {
        status: 'success',
        algorithm: resolvedAlgo,
        activityKey,
        input: inputPath,
        elapsedMs: Math.round(elapsedMs * 100) / 100,
        model: resultData,
      };

      // Step 9: Auto-save result to .wasm4pm/results/ (unless --no-save)
      if (!ctx.args['no-save']) {
        const savedPath = await savePredictionResult(
          `discover-${resolvedAlgo}`,
          inputPath,
          activityKey,
          result as unknown as Record<string, unknown>,
        );
        if (savedPath && formatter instanceof HumanFormatter) {
          formatter.debug(`Result saved: ${path.relative(process.cwd(), savedPath)}`);
        }
      }

      // Step 10: Write output file if specified
      if (ctx.args.output) {
        try {
          const outputDir = path.dirname(ctx.args.output);
          await fs.mkdir(outputDir, { recursive: true });
          await fs.writeFile(ctx.args.output, JSON.stringify(result, null, 2));
          if (formatter instanceof HumanFormatter) {
            formatter.info(`Results written to: ${ctx.args.output}`);
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          formatter.error(`Output error: ${message}`);
          process.exit(EXIT_CODES.system_error);
        }
      }

      // Step 11: Format and output results
      if (formatter instanceof JSONFormatter) {
        formatter.success('Discovery completed', result);
      } else {
        formatter.success(`Discovery completed in ${elapsedMs.toFixed(1)}ms`);
        formatter.info(`Algorithm: ${resolvedAlgo}`);
        formatter.info(`Activity key: ${activityKey}`);
        if (ctx.args.output) {
          formatter.info(`Output: ${ctx.args.output}`);
        }
        // Always show model summary (not just in verbose mode — it's the point of the command)
        const summary = extractModelSummary(resultData);
        if (summary) {
          formatter.log('');
          for (const [key, value] of Object.entries(summary)) {
            formatter.info(`  ${key}: ${value}`);
          }
        }
        formatter.log('');
        formatter.log('  Run "pmctl results" to view saved results.');
        formatter.log('  Run "pmctl compare dfg,heuristic -i ' + path.basename(inputPath) + '" to compare algorithms.');
      }

      process.exit(EXIT_CODES.success);
    } catch (error) {
      if (formatter instanceof JSONFormatter) {
        formatter.error('Discovery failed', error);
      } else {
        formatter.error(
          `Discovery failed: ${error instanceof Error ? error.message : String(error)}\n\nRun "pmctl doctor" to check your environment.`,
        );
      }
      process.exit(EXIT_CODES.execution_error);
    }
  },
});

/**
 * Extract a brief summary from a discovery result.
 */
function extractModelSummary(data: any): Record<string, string> | null {
  if (!data || typeof data !== 'object') return null;

  const summary: Record<string, string> = {};

  // DFG / social-network shape
  if (Array.isArray(data.nodes)) {
    summary['Nodes'] = String(data.nodes.length);
  }
  if (Array.isArray(data.edges)) {
    summary['Edges'] = String(data.edges.length);
  }
  // Petri Net shape
  if (Array.isArray(data.places)) {
    summary['Places'] = String(data.places.length);
  }
  if (Array.isArray(data.transitions)) {
    summary['Transitions'] = String(data.transitions.length);
  }
  if (Array.isArray(data.arcs)) {
    summary['Arcs'] = String(data.arcs.length);
  }

  return Object.keys(summary).length > 0 ? summary : null;
}

/**
 * Maps algorithm name to execution profile
 */
function getProfileFromAlgorithm(algorithm: string): string {
  const profileMap: Record<string, string> = {
    dfg: 'fast',
    alpha: 'balanced',
    'alpha++': 'balanced',
    'alpha-plus-plus': 'balanced',
    heuristic: 'balanced',
    inductive: 'quality',
    genetic: 'quality',
    ilp: 'quality',
    pso: 'quality',
    'a-star': 'quality',
    astar: 'quality',
    aco: 'quality',
    'ant-colony': 'quality',
    'simulated-annealing': 'quality',
    declare: 'balanced',
    skeleton: 'fast',
    'dfg-optimized': 'fast',
    hill: 'balanced',
    'hill-climbing': 'balanced',
  };

  return profileMap[algorithm.toLowerCase()] || 'balanced';
}
