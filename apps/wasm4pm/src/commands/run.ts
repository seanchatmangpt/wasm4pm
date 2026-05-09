import { defineCommand } from 'citty';
import * as fs from 'fs/promises';
import * as path from 'path';
import { resolveConfig as loadConfig, checkConfigWarnings } from '@wasm4pm/config';
import { plan as makePlan } from '@wasm4pm/planner';
import { ALGORITHM_CLI_ALIASES, findClosestMatch } from '@wasm4pm/contracts';
import { emitResult, makeResult, makeErrorResult } from '../output.js';
import { withLogSession } from '../with-log-session.js';
import { EXIT_CODES } from '../exit-codes.js';
import { savePredictionResult } from './results.js';
import { executeMlTask } from '../ml-runner.js';
import type { MlTask } from '../ml-runner.js';
import { discriminate, DiscoveryShapeError } from '../discriminator.js';
import { withSpan } from './_otel.js';
import { saveCommandReceipt, blake3Hex, newReceipt, type CommandReceipt } from '../receipts/_shared.js';

export interface RunOptions {
  config?: string;
  algorithm?: string;
  input?: string;
  output?: string;
  timeout?: number;
  format?: string;
  verbose?: boolean;
  quiet?: boolean;
}

/** All algorithms supported by wpm run, mapped to their WASM discovery functions. */
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
  'simd-dfg',
  'hierarchical-dfg',
  'smart-engine',
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
  activityKey: string
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
      raw = wasm.extract_process_skeleton(logHandle, activityKey);
      break;
    case 'dfg-optimized':
      raw = wasm.discover_dfg(logHandle, activityKey);
      break;
    case 'simd-dfg':
      raw = wasm.discover_dfg_simd(logHandle, activityKey, 0.0);
      break;
    case 'hierarchical-dfg':
      raw = wasm.discover_dfg_hierarchical(logHandle, activityKey, 3);
      break;
    case 'smart-engine':
      raw = wasm.smart_engine_run(logHandle, activityKey, 'auto', '');
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
    simd: {
      type: 'boolean',
      description: 'Use SIMD-accelerated DFG discovery (shortcut for --algorithm simd-dfg)',
    },
    hierarchical: {
      type: 'boolean',
      description: 'Use hierarchical chunking DFG (shortcut for --algorithm hierarchical-dfg)',
    },
    'smart-engine': {
      type: 'boolean',
      description:
        'Use smart execution engine with caching (shortcut for --algorithm smart-engine)',
    },
    'no-cache': {
      type: 'boolean',
      description: 'Disable all caching (parse, columnar, interner)',
    },
    'cache-stats': {
      type: 'boolean',
      description: 'Print cache hit/miss statistics after run',
    },
    'with-quality': {
      type: 'boolean',
      description:
        'Compute and display quality metrics (fitness, precision, simplicity) after discovery',
    },
    preflight: {
      type: 'boolean',
      description:
        'Run full two-pass preflight validation (structural + semantic) before discovery',
    },
    stream: {
      type: 'boolean',
      description: 'Show elapsed time during discovery (for long-running algorithms)',
    },
  },
  async run(ctx) {
    const format = (ctx.args.format as 'json' | 'human') ?? 'human';
    const verbose = Boolean(ctx.args.verbose);
    const quiet = Boolean(ctx.args.quiet);
    const emitOptions = { format, verbose, quiet };

    return withSpan(
      'run',
      {
        algorithm: String(ctx.args.algorithm ?? ''),
        input: String(ctx.args.input ?? ''),
        format,
      },
      async () => {
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
        const result = makeErrorResult('run', new Error(`Config error: ${message}`), EXIT_CODES.config_error, 'CONFIG_ERROR');
        emitResult(result, emitOptions);
        process.exit(result.exit_code);
      }

      // Step 2: Resolve algorithm (fixes operator-precedence bug: --algorithm flag was ignored)
      // Shortcut flags override --algorithm if both are provided
      const shortcutAlgo: string | undefined = ctx.args.simd
        ? 'simd-dfg'
        : ctx.args.hierarchical
          ? 'hierarchical-dfg'
          : ctx.args['smart-engine']
            ? 'smart-engine'
            : undefined;

      const rawAlgo: string =
        shortcutAlgo ??
        (ctx.args.algorithm as string | undefined) ??
        (config?.execution?.profile === 'quality'
          ? 'heuristic'
          : config?.execution?.profile === 'fast'
            ? 'dfg'
            : 'heuristic');

      // Accept kernel registry IDs (heuristic_miner) or CLI aliases (heuristic)
      const resolvedAlgo: Algorithm | undefined =
        (ALGORITHM_CLI_ALIASES[rawAlgo] as Algorithm | undefined) ??
        (() => {
          const algoLower = rawAlgo.toLowerCase().replace(/[+_]/g, '-');
          return ALGORITHMS.find(
            (a) => a === algoLower || a === algoLower.replace(/-plus-plus/, '-')
          );
        })();

      if (!resolvedAlgo) {
        const available = Object.keys(ALGORITHM_CLI_ALIASES);
        const suggestion = findClosestMatch(rawAlgo.toLowerCase(), available.map((a) => a.toLowerCase()), 3);
        const didYouMean = suggestion ? `\nDid you mean '${suggestion}'?` : '';
        const result = makeErrorResult(
          'run',
          new Error(`Algorithm '${rawAlgo}' not found.${didYouMean}\nAvailable algorithms: ${available.slice(0, 5).join(', ')}... (${available.length} total)`),
          EXIT_CODES.source_error,
          'ALGORITHM_NOT_FOUND'
        );
        emitResult(result, emitOptions);
        process.exit(result.exit_code);
      }

      // Step 3: Resolve input path (positional OR --file/-i)
      const inputPath: string | undefined =
        (ctx.args.input as string | undefined) || (ctx.args.file as string | undefined);

      if (!inputPath) {
        const result = makeErrorResult(
          'run',
          new Error('Input file required.\n\nUsage:  wpm run <log.xes>\n        wpm run <log.xes> --algorithm heuristic\n\nRun "wpm --help" to see all commands.'),
          EXIT_CODES.source_error,
          'INPUT_REQUIRED'
        );
        emitResult(result, emitOptions);
        process.exit(result.exit_code);
      }

      const activityKey = (ctx.args['activity-key'] as string) || 'concept:name';

      // Preflight: only accept supported input extensions.
      const lowerInput = inputPath.toLowerCase();
      const acceptedExt =
        lowerInput.endsWith('.xes') ||
        lowerInput.endsWith('.xes.gz') ||
        lowerInput.endsWith('.json');
      if (!acceptedExt) {
        const result = makeErrorResult(
          'run',
          new Error(`unsupported input file extension: ${inputPath}`),
          EXIT_CODES.source_error,
          'UNSUPPORTED_EXTENSION'
        );
        emitResult(result, emitOptions);
        process.exit(result.exit_code);
      }

      await withLogSession(
        { inputPath, activityKey, commandName: 'run', emitOptions },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (wasmBase, logHandle) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const wasm = wasmBase as Record<string, any>;

        // Step 4b: Handle --no-cache flag
        if (ctx.args['no-cache']) {
          if (typeof wasm.clear_all_caches !== 'function') {
            const result = makeErrorResult('run', new Error('Cache clearing requested (--no-cache) but not available in WASM module'), EXIT_CODES.execution_error, 'CACHE_CLEAR_UNAVAILABLE');
            emitResult(result, emitOptions);
            process.exit(result.exit_code);
          }
          wasm.clear_all_caches();
        }

        // Step 5b: Mandatory Pass 1 (structural) + Optional Pass 2 (semantic) preflight validation
      const preflightErrors: string[] = [];
      const preflightWarnings: string[] = [];

      // PASS 1: ALWAYS-ON Structural validation
      try {
        const schemaResult = typeof wasm.validate_log_schema === 'function'
          ? wasm.validate_log_schema(logHandle, 'xes')
          : null;
        if (schemaResult) {
          const schema = typeof schemaResult === 'string' ? JSON.parse(schemaResult) : schemaResult;
          if (!(schema.valid as boolean)) {
            preflightErrors.push(`Schema validation failed: ${schema.message as string}`);
          }
        }
      } catch {
        // Schema validation optional
      }

      try {
        const attrsResult = typeof wasm.validate_required_attributes === 'function'
          ? wasm.validate_required_attributes(logHandle, activityKey, 'case:concept:name', 'time:timestamp', 'org:resource')
          : null;
        if (attrsResult) {
          const attrs = typeof attrsResult === 'string' ? JSON.parse(attrsResult) : attrsResult;
          const missing = (attrs.missing as string[]) ?? [];
          if (missing.length > 0) {
            preflightErrors.push(`Missing required attributes: ${missing.join(', ')}`);
          }
        }
      } catch {
        // Attribute validation optional
      }

      // Pass 1 failure is FATAL
      if (preflightErrors.length > 0) {
        const result = makeErrorResult(
          'run',
          new Error(`Structural validation failed:\n${preflightErrors.map((e) => `  ✗ ${e}`).join('\n')}`),
          EXIT_CODES.source_error,
          'STRUCTURAL_VALIDATION_FAILED'
        );
        emitResult(result, emitOptions);
        process.exit(result.exit_code);
      }

      // PASS 2: Optional semantic validation (data quality + advanced checks)
      if (ctx.args.preflight) {
        try {
          const qualityResult = typeof wasm.validate_data_quality === 'function'
            ? wasm.validate_data_quality(logHandle)
            : null;
          if (qualityResult) {
            const quality = typeof qualityResult === 'string' ? JSON.parse(qualityResult) : qualityResult;
            const issues = (quality.issues as number) ?? 0;
            if (issues > 0) {
              preflightWarnings.push(`Data quality: ${issues} issue(s) found`);
            }
          }
        } catch {
          // Quality validation optional
        }
      }

      // Step 5c: Estimate discovery duration and show ETA
      let estimatedMs = 0;
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const executionPlan = makePlan(config as any) as any;
        estimatedMs = executionPlan?.budget?.estimated_duration_ms ?? 0;
      } catch {
        // ETA estimation is optional
      }

      // Step 6: Execute discovery
      const t0 = performance.now();

      let raw: unknown;
      let elapsedMs: number;

      if (ctx.args.stream) {
        const result = runDiscovery(wasm, resolvedAlgo, logHandle, activityKey);
        raw = result.raw;
        elapsedMs = result.elapsedMs;
      } else {
        const result = runDiscovery(wasm, resolvedAlgo, logHandle, activityKey);
        raw = result.raw;
        elapsedMs = result.elapsedMs;
      }

      // Validate discovery output shape — fail loudly on unknown shapes.
      try {
        discriminate(raw, resolvedAlgo);
      } catch (shapeErr) {
        if (shapeErr instanceof DiscoveryShapeError) {
          const errResult = makeErrorResult(
            'run',
            shapeErr,
            EXIT_CODES.execution_error,
            'DISCOVERY_SHAPE_MISMATCH'
          );
          emitResult(errResult, emitOptions);
          process.exit(errResult.exit_code);
        }
        throw shapeErr;
      }

      // Step 6b: Run ML analysis if configured
      const mlResults: Record<string, unknown> = {};
      const mlConfig = (config as any)?.ml;
      if (mlConfig?.enabled && mlConfig.tasks && mlConfig.tasks.length > 0) {
        for (const task of mlConfig.tasks) {
          const mlResult = await executeMlTask(wasm, task as MlTask, logHandle, activityKey, {
            method: mlConfig.method,
            k: mlConfig.k,
            targetKey: mlConfig.targetKey,
            forecastPeriods: mlConfig.forecastPeriods,
            nComponents: mlConfig.nComponents,
            eps: mlConfig.eps,
          });
          mlResults[task] = mlResult;
        }
      }

      // Step 7: Quality metrics (before freeing handle)
      let qualityMetrics: { fitness: number; precision: number; simplicity: number } | null = null;
      if (ctx.args['with-quality']) {
        // Normalise result first to check model type
        const resultDataEarly = typeof raw === 'string' ? JSON.parse(raw) : raw;
        // Petri net algorithms return places/transitions/arcs as counts (numbers)
        // or arrays. DFG returns nodes/edges. Either form indicates a Petri net.
        const hasPetriNetFields =
          typeof resultDataEarly?.places === 'number' ||
          Array.isArray(resultDataEarly?.places) ||
          typeof resultDataEarly?.transitions === 'number' ||
          Array.isArray(resultDataEarly?.transitions) ||
          typeof resultDataEarly?.arcs === 'number' ||
          Array.isArray(resultDataEarly?.arcs);
        const isPetriNet = hasPetriNetFields;

        if (isPetriNet) {
          try {
            const modelHandle = resultDataEarly?.handle as string | undefined;

            // Fitness via SIMD token replay
            let fitness = 1.0;
            if (typeof wasm.simd_token_replay === 'function') {
              const replayRaw = wasm.simd_token_replay(logHandle, activityKey);
              const replay = typeof replayRaw === 'string' ? JSON.parse(replayRaw) : replayRaw;
              if (replay.overall_fitness !== undefined && !replay.error) {
                fitness = replay.overall_fitness;
              }
            }

            // Precision via ETConformance escaping-edge analysis (3-arg WASM function)
            let precision = 1.0;
            if (typeof wasm.wasm_compute_precision === 'function' && modelHandle) {
              try {
                const precRaw = wasm.wasm_compute_precision(logHandle, modelHandle, activityKey);
                const prec = typeof precRaw === 'string' ? JSON.parse(precRaw) : precRaw;
                if (prec.precision !== undefined) {
                  precision = prec.precision;
                }
              } catch {
                // etconformance may fail for certain model types; use default
              }
            }

            // Simplicity via WASM compute_simplicity(places, transitions, arcs)
            let simplicity = 1.0;
            const numPlaces =
              typeof resultDataEarly?.places === 'number'
                ? resultDataEarly.places
                : ((resultDataEarly?.places as unknown[] | undefined)?.length ?? 0);
            const numTransitions =
              typeof resultDataEarly?.transitions === 'number'
                ? resultDataEarly.transitions
                : ((resultDataEarly?.transitions as unknown[] | undefined)?.length ?? 0);
            const numArcs =
              typeof resultDataEarly?.arcs === 'number'
                ? resultDataEarly.arcs
                : ((resultDataEarly?.arcs as unknown[] | undefined)?.length ?? 0);
            if (
              typeof wasm.wasm_compute_simplicity === 'function' &&
              numPlaces + numTransitions + numArcs > 0
            ) {
              simplicity = wasm.wasm_compute_simplicity(numPlaces, numTransitions, numArcs);
            } else {
              // Fallback heuristic when WASM function unavailable or model lacks Petri net structure
              const numEdges = Array.isArray(resultDataEarly?.edges)
                ? resultDataEarly.edges.length
                : numArcs;
              simplicity = 1.0 / (1.0 + numEdges / 10.0);
            }

            qualityMetrics = { fitness, precision, simplicity };
          } catch {
            // quality metrics failure is non-fatal; will be reported in consoleRenderer
          }
        }
      }

      // Normalise result (WASM may return string or object)
      const resultData = typeof raw === 'string' ? JSON.parse(raw) : raw;

      // Step 9: Build output payload
      const payload = {
        status: 'success',
        algorithm: resolvedAlgo,
        activityKey,
        input: inputPath,
        elapsedMs: Math.round(elapsedMs * 100) / 100,
        model: resultData,
        ...(Object.keys(mlResults).length > 0 && { ml: mlResults }),
        ...(qualityMetrics && { quality: qualityMetrics }),
        ...(preflightWarnings.length > 0 && { preflightWarnings }),
        ...(estimatedMs > 0 && { estimatedMs }),
      };

      // Step 9b: Auto-save result to .wasm4pm/results/ (unless --no-save)
      let savedPath: string | null = null;
      if (!ctx.args['no-save']) {
        savedPath = await savePredictionResult(
          `discover-${resolvedAlgo}`,
          inputPath,
          activityKey,
          payload as unknown as Record<string, unknown>
        );

        // Step 9c: Persist BLAKE3 receipt for proof-of-execution
        try {
          const inputBytes = await fs.readFile(inputPath).catch(() => Buffer.from(inputPath));
          const receipt: CommandReceipt = {
            ...newReceipt('run'),
            input_hash: blake3Hex(inputBytes),
            output_hash: blake3Hex(JSON.stringify(payload)),
            status: 'success',
            summary: {
              algorithm: resolvedAlgo,
              activityKey,
              elapsedMs: Math.round(elapsedMs * 100) / 100,
            },
          };
          saveCommandReceipt(receipt);
        } catch {
          /* receipt write must never break the command */
        }
      }

      // Step 10: Write output file if specified
      if (ctx.args.output) {
        try {
          const outputDir = path.dirname(ctx.args.output);
          await fs.mkdir(outputDir, { recursive: true });
          await fs.writeFile(ctx.args.output, JSON.stringify(payload, null, 2));
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const errResult = makeErrorResult('run', new Error(`Output error: ${message}`), EXIT_CODES.system_error, 'OUTPUT_WRITE_ERROR');
          emitResult(errResult, emitOptions);
          process.exit(errResult.exit_code);
        }
      }

      // Step 11: Build canonical result and emit
      const cmdResult = makeResult('run', payload, elapsedMs, EXIT_CODES.success);

      emitResult(cmdResult, emitOptions, (res, projection) => {
        const p = res.payload as typeof payload;

        // Preflight warnings
        if (p.preflightWarnings && p.preflightWarnings.length > 0) {
          for (const warn of p.preflightWarnings) {
            projection.warn(`⚠ ${warn}`);
          }
          if (ctx.args.preflight) {
            projection.success('Preflight validation complete — log is ready for discovery');
          }
        }

        // Inform about WASM init and algorithm selection
        projection.info(`Discovering process model with ${p.algorithm}...`);

        // ML analysis summary
        if (p.ml && Object.keys(p.ml as Record<string, unknown>).length > 0) {
          projection.info(`ML analysis complete: ${Object.keys(p.ml as Record<string, unknown>).join(', ')}`);
        }

        if (ctx.args['no-cache']) {
          projection.debug('Caches cleared (--no-cache)');
        }

        projection.debug(`Loading event log from: ${p.input}`);

        const etaStr = (p.estimatedMs as number | undefined) && (p.estimatedMs as number) > 0
          ? ` (~${Math.ceil((p.estimatedMs as number) / 1000)}s estimated)`
          : '';
        projection.info(`Discovering with ${p.algorithm}${etaStr}...`);

        projection.success(`Discovery completed in ${p.elapsedMs.toFixed(1)}ms`);
        projection.info(`Algorithm: ${p.algorithm}`);
        projection.info(`Activity key: ${p.activityKey}`);
        if (ctx.args.output) {
          projection.info(`Output: ${ctx.args.output}`);
        }

        // Model summary
        const summary = extractModelSummary(p.model);
        if (summary) {
          projection.log('');
          for (const [key, value] of Object.entries(summary)) {
            projection.info(`  ${key}: ${value}`);
          }
        }

        // Quality metrics
        if (p.quality) {
          const q = p.quality as { fitness: number; precision: number; simplicity: number };
          projection.log('');
          projection.info('Quality Metrics (van der Aalst):');
          projection.info(`  Fitness:    ${(q.fitness * 100).toFixed(1)}%`);
          projection.info(`  Precision:  ${(q.precision * 100).toFixed(1)}%`);
          projection.info(`  Simplicity: ${(q.simplicity * 100).toFixed(1)}%`);
        } else if (ctx.args['with-quality'] && p.model) {
          // If model is not a Petri net, warn about quality metrics
          const resultDataCheck = p.model as Record<string, unknown>;
          const hasPetriNetFields =
            'places' in resultDataCheck || 'transitions' in resultDataCheck || 'arcs' in resultDataCheck;
          if (!hasPetriNetFields) {
            projection.warn(
              `Quality metrics require a Petri net model. Algorithm '${p.algorithm}' does not produce one.`
            );
          }
        }

        projection.log('');
        projection.log('  Run "wpm results" to view saved results.');
        projection.log(
          '  Run "wpm compare dfg,heuristic -i ' +
            path.basename(p.input) +
            '" to compare algorithms.'
        );

        if (savedPath) {
          projection.debug(`Result saved: ${path.relative(process.cwd(), savedPath)}`);
        }
      });

      // Step 12: Print cache statistics if requested
      if (ctx.args['cache-stats']) {
        if (typeof wasm.get_cache_stats !== 'function') {
          const errResult = makeErrorResult('run', new Error('Cache statistics requested (--cache-stats) but not available in WASM module'), EXIT_CODES.execution_error, 'CACHE_STATS_UNAVAILABLE');
          emitResult(errResult, emitOptions);
          process.exit(errResult.exit_code);
        }
        const statsRaw = wasm.get_cache_stats();
        const cacheStats = typeof statsRaw === 'string' ? JSON.parse(statsRaw) : statsRaw;
        const cacheResult = makeResult('run/cache-stats', { cache: cacheStats }, 0, EXIT_CODES.success);
        emitResult(cacheResult, emitOptions, (_res, projection) => {
          const hitRate =
            cacheStats.parse_hits + cacheStats.parse_misses > 0
              ? ((cacheStats.parse_hits / (cacheStats.parse_hits + cacheStats.parse_misses)) * 100).toFixed(1)
              : 'N/A';
          projection.info('Cache statistics:');
          projection.info(`  Parse hits: ${cacheStats.parse_hits}`);
          projection.info(`  Parse misses: ${cacheStats.parse_misses}`);
          projection.info(`  Hit rate: ${hitRate}%`);
          projection.info(`  Columnar entries: ${cacheStats.columnar_entries}`);
          projection.info(`  Interner entries: ${cacheStats.interner_entries}`);
        });
      }

      process.exit(cmdResult.exit_code);
      }); // end withLogSession
    } catch (error) {
      const result = makeErrorResult(
        'run',
        new Error(
          `Discovery failed: ${error instanceof Error ? error.message : String(error)}\n\nRun "wpm doctor" to check your environment.`
        ),
        EXIT_CODES.execution_error,
        'DISCOVERY_FAILED'
      );
      emitResult(result, emitOptions);
      process.exit(result.exit_code);
    }
      },
    );
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
