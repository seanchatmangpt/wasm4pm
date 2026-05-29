import { defineCommand } from 'citty';
import * as fs from 'fs/promises';
import * as path from 'path';
import { resolveConfig as loadConfig } from '@wasm4pm/config';
import { plan as makePlan } from '@wasm4pm/planner';
import { ALGORITHM_CLI_ALIASES, findClosestMatch, getProfileAlgorithms, resolveAlgorithmId } from '@wasm4pm/contracts';
import { getRegistry } from 'wasm4pm';
import { emitResult, makeResult, makeErrorResult } from '../output.js';
import { withLogSession } from '../with-log-session.js';
import { EXIT_CODES } from '../exit-codes.js';
import { savePredictionResult } from './results.js';
import { executeMlTask } from '../ml-runner.js';
import type { MlTask } from '../ml-runner.js';
import { discriminate, DiscoveryShapeError } from '../discriminator.js';
import { withSpan, withWasmSpan } from './_otel.js';
import {
  saveCommandReceipt,
  blake3Hex,
  newReceipt,
  type CommandReceipt,
} from '../receipts/_shared.js';
import { exitWithFlush } from '../otel/exit.js';
import { isFirstRun, formatFirstRunHints } from '../first-run-ux.js';
import { STANDARD_EXIT_CODE_DOCS } from '../help-standards.js';

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

import { Kernel } from 'wasm4pm';

/** All algorithms supported by wpm run, sourced dynamically from the registry. */
export const ALGORITHMS = getRegistry().list().map(a => a.id);

export type Algorithm = string;

/**
 * Invoke the appropriate WASM discovery function for the given algorithm dynamically via Kernel.
 * Wraps each discovery call in an OTEL span for observability.
 */
export async function runDiscovery(
  wasm: Record<string, any>,
  algo: Algorithm,
  logHandle: string,
  activityKey: string
): Promise<{ raw: unknown; elapsedMs: number }> {
  const t0 = performance.now();
  const kernel = new Kernel(wasm as any);
  await kernel.init();
  const raw = await kernel.runRaw(algo, logHandle, activityKey, {});
  const elapsedMs = performance.now() - t0;
  return { raw, elapsedMs };
}

export const run = defineCommand({
  meta: {
    name: 'run',
    description:
      'Discover a process model from an event log (XES, CSV, or OCEL 2.0).\n\n' +
      'EXAMPLES:\n' +
      '  wpm run log.xes                               # Default discovery (Heuristic Miner)\n' +
      '  wpm run log.xes -a inductive                  # Discover using Inductive Miner\n' +
      '  wpm run log.ocel.json -a ocel_dfg             # Object-centric DFG discovery\n' +
      '  wpm run log.xes --with-quality                # Compute fitness & precision after discovery\n' +
      '  wpm run log.xes -o result.json                # Save output to a specific file\n\n' +
      STANDARD_EXIT_CODE_DOCS,
  },
  args: {
    input: {
      type: 'positional',
      description: 'Path to XES event log (e.g. process.xes)',
      required: false,
    },
    file: {
      type: 'string',
      description: 'Path to XES event log — use -i as shorthand (named alternative to positional)',
      alias: 'i',
    },
    config: {
      type: 'string',
      description: 'Path to configuration file (wasm4pm.toml or wasm4pm.json)',
    },
    algorithm: {
      type: 'string',
      description: `Discovery algorithm — use -a as shorthand — one of: ${ALGORITHMS.join(', ')} (default: config algorithm.name, else profile default, else heuristic_miner)`,
      alias: 'a',
    },
    output: {
      type: 'string',
      description: 'Write JSON result to file — use -o as shorthand',
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
    save: {
      type: 'boolean',
      description: 'Auto-save the result to .wasm4pm/results/ (pass --no-save to disable)',
      default: true,
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
    'assert-fitness': {
      type: 'string',
      description:
        'Fail with exit 4 if fitness drops below this threshold (0-1). Implies --with-quality.',
    },
    'assert-precision': {
      type: 'string',
      description:
        'Fail with exit 4 if precision drops below this threshold (0-1). Implies --with-quality.',
    },
    'set-baseline': {
      type: 'boolean',
      description:
        'Save quality metrics as baseline to .wasm4pm/baseline.json. Use with --with-quality.',
    },
    'assert-improvement': {
      type: 'boolean',
      description:
        'Fail with exit 4 if quality metrics regress versus the stored .wasm4pm/baseline.json.',
    },
    'no-retry': {
      type: 'boolean',
      description:
        'Disable automatic algorithm fallback on execution failure (exit 3 immediately).',
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

    // Detect if this is a first-run for UX hints
    const isFirstRunResult = await isFirstRun().catch(() => false);

    let finalAlgorithm = '';
    let finalFitness = 0;
    let finalPrecision = 0;
    let finalExitCode: number = EXIT_CODES.success;

    return withSpan(
      'run',
      {
        algorithm: String(ctx.args.algorithm ?? ''),
        input: String(ctx.args.input ?? ''),
        format,
        'activity.key': 'concept:name',
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
            const result = makeErrorResult(
              'run',
              new Error(`Config error: ${message}`),
              EXIT_CODES.config_error,
              'CONFIG_ERROR'
            );
            emitResult(result, emitOptions);
            return await exitWithFlush(result.exit_code);
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
            config?.algorithm?.name ??
            (() => {
              const profile = config?.execution?.profile ?? 'balanced';
              // fast profile: always dfg (O(n), no overhead)
              if (profile === 'fast') return 'dfg';
              // all other profiles: first algorithm from the canonical profile registry
              // quality → simulated_annealing (index 0), balanced → alpha_plus_plus, stream → simd_streaming_dfg
              const profileAlgos = getProfileAlgorithms(profile);
              return profileAlgos[0] ?? 'heuristic_miner';
            })();

          // Guard: empty or whitespace-only --algorithm is a config error (not source error).
          // An empty string cannot be resolved and gives a confusing fallthrough message.
          if (!shortcutAlgo && ctx.args.algorithm !== undefined) {
            const trimmed = (ctx.args.algorithm as string).trim();
            if (trimmed.length === 0) {
              const cliAliases = Object.values(ALGORITHM_CLI_ALIASES);
              const emptyResult = makeErrorResult(
                'run',
                new Error(
                  `--algorithm must not be empty.\n\n` +
                    `  Common algorithms: ${cliAliases.slice(0, 8).join(', ')}\n` +
                    `  Run 'wpm algorithms' to list all ${cliAliases.length} available algorithms.`
                ),
                EXIT_CODES.config_error,
                'ALGORITHM_EMPTY'
              );
              emitResult(emptyResult, emitOptions);
              return await exitWithFlush(emptyResult.exit_code);
            }
          }

          // Accept kernel registry IDs (heuristic_miner) or CLI aliases (heuristic)
          const resolvedAlgo: Algorithm | undefined = resolveAlgorithmId(rawAlgo, ALGORITHMS);

          if (!resolvedAlgo) {
            // An unknown algorithm name is a config_error (1): the user specified an
            // invalid value via --algorithm.  source_error (2) is reserved for I/O
            // failures (file not found, unreadable log), not user typos in flag values.
            const cliAliases = Object.values(ALGORITHM_CLI_ALIASES);
            const suggestion = findClosestMatch(rawAlgo.toLowerCase(), cliAliases, 3);
            const didYouMean = suggestion ? `\nDid you mean: '${suggestion}'?` : '';
            // Show a compact grouped list: discovery algorithms first, then others
            const discoveryAliases = cliAliases.slice(0, 8).join(', ');
            const result = makeErrorResult(
              'run',
              new Error(
                `Algorithm '${rawAlgo}' not found.${didYouMean}\n` +
                  `Common algorithms: ${discoveryAliases}\n` +
                  `Run 'wpm algorithms' to list all ${cliAliases.length} available algorithms.`
              ),
              EXIT_CODES.source_error,
              'ALGORITHM_NOT_FOUND'
            );
            emitResult(result, emitOptions);
            return await exitWithFlush(result.exit_code);
          }

          // Step 3: Resolve input path (positional OR --file/-i)
          const inputPath: string | undefined =
            (ctx.args.input as string | undefined) || (ctx.args.file as string | undefined);

          if (!inputPath) {
            const result = makeErrorResult(
              'run',
              new Error(
                'No input file provided.\n\n' +
                '  To get started, provide an event log (XES or OCEL):\n' +
                '    wpm run path/to/process.xes\n' +
                '    wpm run data.ocel.json --algorithm ocel_dfg\n\n' +
                '  Need a sample dataset? Run:\n' +
                '    wpm examples\n\n' +
                '  For full documentation, run:\n' +
                '    wpm run --help'
              ),
              EXIT_CODES.source_error,
              'INPUT_REQUIRED'
            );
            emitResult(result, emitOptions);
            return await exitWithFlush(result.exit_code);
          }

          const activityKey = (ctx.args['activity-key'] as string) || 'concept:name';

          try {
            const stats = await fs.stat(inputPath);
            const MAX_MEMORY_SIZE_MB = 500;
            if (stats.size > MAX_MEMORY_SIZE_MB * 1024 * 1024) {
              const result = makeErrorResult(
                'run',
                new Error(
                  `File size exceeds in-memory parsing limits (${(stats.size / 1024 / 1024).toFixed(1)}MB > ${MAX_MEMORY_SIZE_MB}MB).\n\n` +
                  `  V8 will likely crash with ERR_STRING_TOO_LONG if loaded directly.\n\n` +
                  `  To process massive logs, use the streaming pipeline:\n` +
                  `    wpm batch ${inputPath} --workers 4\n\n` +
                  `  Or increase Node memory: NODE_OPTIONS="--max-old-space-size=8192" wpm run ${inputPath}`
                ),
                EXIT_CODES.source_error,
                'FILE_TOO_LARGE'
              );
              emitResult(result, emitOptions);
              return await exitWithFlush(result.exit_code);
            }
          } catch (e: any) {
             if (e.code === 'ENOENT') {
                const result = makeErrorResult(
                  'run',
                  new Error(`File not found: ${inputPath}`),
                  EXIT_CODES.source_error,
                  'FILE_NOT_FOUND'
                );
                emitResult(result, emitOptions);
                return await exitWithFlush(result.exit_code);
             }
             // Let other fs errors bubble up or be handled by the normal flow
          }

          // Preflight: only accept supported input extensions.
          const lowerInput = inputPath.toLowerCase();
          const isOcelInput =
            lowerInput.endsWith('.ocel.json') ||
            lowerInput.endsWith('.ocel') ||
            (ctx.args as Record<string, unknown>)['format'] === 'ocel';
          const acceptedExt =
            lowerInput.endsWith('.xes') ||
            lowerInput.endsWith('.xes.gz') ||
            lowerInput.endsWith('.json') ||
            isOcelInput;
          if (!acceptedExt) {
            const ext = path.extname(inputPath) || '(no extension)';
            const result = makeErrorResult(
              'run',
              new Error(`Unsupported file extension '${ext}' — wpm run accepts: .xes, .xes.gz, .json, .ocel.json

  Given: ${inputPath}

  For XES event logs: wpm run process.xes
  For OCEL 2.0 logs: wpm run object-log.json --format ocel

  XES is the IEEE standard for process mining event logs.
  OCEL is the IEEE standard for object-centric event logs.
  See: https://www.xes-standard.org/ and https://www.ocel-standard.org/

  Need a sample dataset? Run:
    wpm examples

  To inspect your file's structure, run:
    wpm validate ${inputPath}`),
              EXIT_CODES.source_error,
              'UNSUPPORTED_EXTENSION'
            );
            emitResult(result, emitOptions);
            return await exitWithFlush(result.exit_code);
          }

          // OCEL input path — bypass withLogSession (which is XES-only) and invoke
          // OCEL WASM functions directly.
          if (isOcelInput) {
            return await runOcelDiscovery({
              inputPath,
              activityKey,
              resolvedAlgo,
              ctx,
              emitOptions,
              format,
              verbose,
              quiet,
            });
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
                  const result = makeErrorResult(
                    'run',
                    new Error(
                      'Cache clearing requested (--no-cache) but not available in WASM module'
                    ),
                    EXIT_CODES.execution_error,
                    'CACHE_CLEAR_UNAVAILABLE'
                  );
                  emitResult(result, emitOptions);
                  return await exitWithFlush(result.exit_code);
                }
                wasm.clear_all_caches();
              }

              // Step 5b: Mandatory Pass 1 (structural) + Optional Pass 2 (semantic) preflight validation
              const preflightErrors: string[] = [];
              const preflightWarnings: string[] = [];

              // PASS 1: ALWAYS-ON Structural validation
              try {
                const schemaResult =
                  typeof wasm.validate_log_schema === 'function'
                    ? withWasmSpan('validate_log_schema', { format: 'xes' }, () =>
                        wasm.validate_log_schema(logHandle, 'xes')
                      )
                    : null;
                if (schemaResult) {
                  const schema =
                    typeof schemaResult === 'string' ? JSON.parse(schemaResult) : schemaResult;
                  if (!(schema.valid as boolean)) {
                    preflightErrors.push(`Schema validation failed: ${schema.message as string}`);
                  }
                }
              } catch {
                // Schema validation optional
              }

              try {
                const attrsResult =
                  typeof wasm.validate_required_attributes === 'function'
                    ? withWasmSpan(
                        'validate_required_attributes',
                        { activity_key: activityKey, attributes: 3 },
                        () =>
                          wasm.validate_required_attributes(
                            logHandle,
                            activityKey,
                            'case:concept:name',
                            'time:timestamp',
                            'org:resource'
                          )
                      )
                    : null;
                if (attrsResult) {
                  const attrs =
                    typeof attrsResult === 'string' ? JSON.parse(attrsResult) : attrsResult;
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
                  new Error(
                    `Structural validation failed:\n${preflightErrors.map((e) => `  ✗ ${e}`).join('\n')}`
                  ),
                  EXIT_CODES.source_error,
                  'STRUCTURAL_VALIDATION_FAILED'
                );
                emitResult(result, emitOptions);
                return await exitWithFlush(result.exit_code);
              }

              // PASS 2: Optional semantic validation (data quality + advanced checks)
              if (ctx.args.preflight) {
                try {
                  const qualityResult =
                    typeof wasm.validate_data_quality === 'function'
                      ? withWasmSpan('validate_data_quality', {}, () =>
                          wasm.validate_data_quality(logHandle)
                        )
                      : null;
                  if (qualityResult) {
                    const quality =
                      typeof qualityResult === 'string' ? JSON.parse(qualityResult) : qualityResult;
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

              // Step 6: Execute discovery with intelligent retry
              const MAX_RETRIES = 3;
              const noRetry = Boolean(ctx.args['no-retry']);

              let raw: unknown = undefined;
              let elapsedMs = 0;
              let resolvedAlgoFinal = resolvedAlgo;

              {
                // Build fallback chain: start with requested algorithm, then try simpler ones
                // in the same quality bracket (sorted by ascending speed = simpler/faster).
                const registry = getRegistry();
                const allAlgos = registry.list();
                const requested = allAlgos.find((a) => a.id === resolvedAlgo);
                const qualityBracket = requested
                  ? allAlgos
                      .filter(
                        (a) => a.qualityTier >= requested.qualityTier - 20 && a.id !== resolvedAlgo
                      )
                      .sort((a, b) => a.speedTier - b.speedTier) // simpler first
                      .slice(0, MAX_RETRIES - 1)
                      .map((a) => a.id as typeof resolvedAlgo)
                  : [];
                const chain = [resolvedAlgo, ...qualityBracket];

                let lastError: unknown;
                let succeeded = false;

                for (const algo of chain) {
                  try {
                    const result = await runDiscovery(wasm, algo, logHandle, activityKey);
                    raw = result.raw;
                    elapsedMs = result.elapsedMs;
                    resolvedAlgoFinal = algo;
                    succeeded = true;
                    if (algo !== resolvedAlgo) {
                      process.stderr.write(
                        `⚠ ${resolvedAlgo} failed, succeeded with fallback: ${algo}\n`
                      );
                    }
                    break;
                  } catch (err) {
                    lastError = err;
                    if (noRetry || chain.length === 1) break;
                    process.stderr.write(
                      `⚠ ${algo} failed (${err instanceof Error ? err.message : String(err)}), trying fallback...\n`
                    );
                  }
                }

                if (!succeeded) {
                  throw lastError ?? new Error(`All algorithms failed for ${resolvedAlgo}`);
                }
              }

              // resolvedAlgoFinal holds the algorithm that actually succeeded (may differ from resolvedAlgo)

              // Validate discovery output shape — fail loudly on unknown shapes.
              try {
                discriminate(raw, resolvedAlgoFinal);
              } catch (shapeErr) {
                if (shapeErr instanceof DiscoveryShapeError) {
                  const errResult = makeErrorResult(
                    'run',
                    shapeErr,
                    EXIT_CODES.execution_error,
                    'DISCOVERY_SHAPE_MISMATCH'
                  );
                  emitResult(errResult, emitOptions);
                  return await exitWithFlush(errResult.exit_code);
                }
                throw shapeErr;
              }

              // Step 6b: Run ML analysis if configured
              const mlResults: Record<string, unknown> = {};
              const mlConfig = (config as any)?.ml;
              if (mlConfig?.enabled && mlConfig.tasks && mlConfig.tasks.length > 0) {
                for (const task of mlConfig.tasks) {
                  const mlResult = await executeMlTask(
                    wasm,
                    task as MlTask,
                    logHandle,
                    activityKey,
                    {
                      method: mlConfig.method,
                      k: mlConfig.k,
                      targetKey: mlConfig.targetKey,
                      forecastPeriods: mlConfig.forecastPeriods,
                      nComponents: mlConfig.nComponents,
                      eps: mlConfig.eps,
                    }
                  );
                  mlResults[task] = mlResult;
                }
              }

              // Step 7: Quality metrics (before freeing handle)
              const assertFitness =
                ctx.args['assert-fitness'] !== undefined
                  ? parseFloat(String(ctx.args['assert-fitness']))
                  : undefined;
              const assertPrecision =
                ctx.args['assert-precision'] !== undefined
                  ? parseFloat(String(ctx.args['assert-precision']))
                  : undefined;
              const needsQuality =
                ctx.args['with-quality'] ||
                assertFitness !== undefined ||
                assertPrecision !== undefined ||
                Boolean(ctx.args['assert-improvement']) ||
                Boolean(ctx.args['set-baseline']);

              let qualityMetrics: {
                fitness: number;
                precision: number;
                simplicity: number;
              } | null = null;
              if (needsQuality) {
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
                      const replayRaw = withWasmSpan(
                        'simd_token_replay',
                        { activity_key: activityKey },
                        () => wasm.simd_token_replay(logHandle, activityKey)
                      );
                      const replay =
                        typeof replayRaw === 'string' ? JSON.parse(replayRaw) : replayRaw;
                      if (replay.overall_fitness !== undefined && !replay.error) {
                        fitness = replay.overall_fitness;
                      }
                    }

                    // Precision via ETConformance escaping-edge analysis (3-arg WASM function)
                    let precision = 1.0;
                    if (typeof wasm.wasm_compute_precision === 'function' && modelHandle) {
                      try {
                        const precRaw = withWasmSpan(
                          'wasm_compute_precision',
                          { activity_key: activityKey, model_type: 'petri_net' },
                          () =>
                            wasm.wasm_compute_precision(
                              logHandle,
                              modelHandle,
                              activityKey
                            )
                        );
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
                      simplicity = withWasmSpan(
                        'wasm_compute_simplicity',
                        { places: numPlaces, transitions: numTransitions, arcs: numArcs },
                        () => wasm.wasm_compute_simplicity(numPlaces, numTransitions, numArcs)
                      );
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

              // Step 7b: Conformance regression gate — assert-fitness / assert-precision / assert-improvement
              if (qualityMetrics) {
                const baselinePath = path.join(process.cwd(), '.wasm4pm', 'baseline.json');

                if (ctx.args['set-baseline']) {
                  try {
                    await fs.mkdir(path.dirname(baselinePath), { recursive: true });
                    await fs.writeFile(
                      baselinePath,
                      JSON.stringify(
                        {
                          ...qualityMetrics,
                          algorithm: resolvedAlgoFinal,
                          savedAt: new Date().toISOString(),
                        },
                        null,
                        2
                      )
                    );
                  } catch (err: any) {
                    if (err.code === 'EACCES' || err.code === 'EROFS') {
                      const msg = `Permission denied when writing to ${baselinePath}. ` +
                                  `You are running in a restricted filesystem (e.g. read-only container or Docker). ` +
                                  `Please set WASM4PM_HOME or PMC_CONFIG_PATH to a writable directory.`;
                      throw new Error(msg);
                    }
                    throw err;
                  }
                }

                const violations: string[] = [];

                if (assertFitness !== undefined && qualityMetrics.fitness < assertFitness) {
                  violations.push(
                    `fitness ${(qualityMetrics.fitness * 100).toFixed(1)}% < required ${(assertFitness * 100).toFixed(1)}%`
                  );
                }
                if (assertPrecision !== undefined && qualityMetrics.precision < assertPrecision) {
                  violations.push(
                    `precision ${(qualityMetrics.precision * 100).toFixed(1)}% < required ${(assertPrecision * 100).toFixed(1)}%`
                  );
                }

                if (ctx.args['assert-improvement']) {
                  try {
                    const baselineRaw = await fs.readFile(baselinePath, 'utf8');
                    const baseline = JSON.parse(baselineRaw) as {
                      fitness: number;
                      precision: number;
                    };
                    if (qualityMetrics.fitness < baseline.fitness) {
                      violations.push(
                        `fitness regressed: ${(qualityMetrics.fitness * 100).toFixed(1)}% < baseline ${(baseline.fitness * 100).toFixed(1)}%`
                      );
                    }
                    if (qualityMetrics.precision < baseline.precision) {
                      violations.push(
                        `precision regressed: ${(qualityMetrics.precision * 100).toFixed(1)}% < baseline ${(baseline.precision * 100).toFixed(1)}%`
                      );
                    }
                  } catch {
                    violations.push(
                      '--assert-improvement: no baseline found — run with --set-baseline first'
                    );
                  }
                }

                if (violations.length > 0) {
                  const gateResult = makeErrorResult(
                    'run',
                    new Error(
                      `Quality gate failed:\n${violations.map((v) => `  ✗ ${v}`).join('\n')}`
                    ),
                    EXIT_CODES.partial_failure,
                    'QUALITY_GATE_FAILED'
                  );
                  emitResult(gateResult, emitOptions);
                  return await exitWithFlush(EXIT_CODES.partial_failure);
                }
              }

              // Normalise result (WASM may return string or object)
              const resultData = typeof raw === 'string' ? JSON.parse(raw) : raw;

              // Surface K: add `count` alias for `frequency` so consumers can read either name.
              // Truth lives in WASM (frequency is authoritative); count is a presentation alias.
              if (resultData && Array.isArray((resultData as { edges?: unknown[] }).edges)) {
                const edges = (resultData as { edges: Array<Record<string, unknown>> }).edges;
                for (const e of edges) {
                  if (typeof e.count === 'undefined' && typeof e.frequency === 'number') {
                    e.count = e.frequency;
                  }
                  if (typeof e.frequency === 'undefined' && typeof e.count === 'number') {
                    e.frequency = e.count;
                  }
                }
              }

              // Step 8b: Collect log statistics for the model summary (trace count, event count, variant count)
              let logStats: {
                total_cases?: number;
                total_events?: number;
                unique_variants?: number;
              } | null = null;
              try {
                if (typeof wasm.analyze_event_statistics === 'function') {
                  const statsRaw = withWasmSpan(
                    'analyze_event_statistics',
                    {},
                    () => wasm.analyze_event_statistics(logHandle)
                  );
                  const stats = typeof statsRaw === 'string' ? JSON.parse(statsRaw) : statsRaw;
                  logStats = {
                    total_cases: (stats.total_cases as number) ?? undefined,
                    total_events: (stats.total_events as number) ?? undefined,
                    unique_variants: (stats.unique_variants as number) ?? undefined,
                  };
                }
              } catch {
                // log statistics are best-effort and non-fatal
              }

              // Step 9: Build output payload
              const payload = {
                status: 'success',
                algorithm: resolvedAlgoFinal,
                activityKey,
                input: inputPath,
                elapsedMs: Math.round(elapsedMs * 100) / 100,
                model: resultData,
                ...(logStats && { logStats }),
                ...(Object.keys(mlResults).length > 0 && { ml: mlResults }),
                ...(qualityMetrics && { quality: qualityMetrics }),
                ...(preflightWarnings.length > 0 && { preflightWarnings }),
                ...(estimatedMs > 0 && { estimatedMs }),
              };

              // Capture final values for OTEL span (semantic attributes)
              finalAlgorithm = resolvedAlgoFinal;
              if (qualityMetrics) {
                finalFitness = qualityMetrics.fitness;
                finalPrecision = qualityMetrics.precision;
              }
              finalExitCode = EXIT_CODES.success;

              // Step 9a: Build semantic payload for deterministic hashing (excludes timing metrics)
              const semanticPayload = {
                status: 'success',
                algorithm: resolvedAlgoFinal,
                activityKey,
                input: inputPath,
                model: resultData,
                ...(logStats && { logStats }),
                ...(Object.keys(mlResults).length > 0 && { ml: mlResults }),
                ...(qualityMetrics && { quality: qualityMetrics }),
                ...(preflightWarnings.length > 0 && { preflightWarnings }),
              };

              // Step 9b: Auto-save result to .wasm4pm/results/ (unless --no-save).
              // citty maps --no-save → ctx.args.save === false (strips the 'no-' prefix).
              // Checking ctx.args.save !== false (i.e. the default true case) means we save.
              let savedPath: string | null = null;
              if (ctx.args['save'] !== false) {
                savedPath = await savePredictionResult(
                  `discover-${resolvedAlgoFinal}`,
                  inputPath,
                  activityKey,
                  payload as unknown as Record<string, unknown>
                );

                // Step 9c: Persist BLAKE3 receipt for proof-of-execution
                try {
                  const inputBytes = await fs
                    .readFile(inputPath)
                    .catch(() => Buffer.from(inputPath));
                  const receipt: CommandReceipt = {
                    ...newReceipt('run'),
                    input_hash: blake3Hex(inputBytes),
                    output_hash: blake3Hex(JSON.stringify(semanticPayload)),
                    status: 'success',
                    summary: {
                      algorithm: resolvedAlgoFinal,
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
              // Discovery succeeded; a write failure is a sink error → partial_failure (4), not system_error (5).
              if (ctx.args.output) {
                try {
                  const outputDir = path.dirname(ctx.args.output);
                  await fs.mkdir(outputDir, { recursive: true });
                  await fs.writeFile(ctx.args.output, JSON.stringify(payload, null, 2));
                } catch (error: any) {
                  let extraHint = `Check that the destination directory exists and is writable: chmod 755 ${path.dirname(ctx.args.output as string)}`;
                  if (error?.code === 'EACCES' || error?.code === 'EROFS') {
                    extraHint = `Permission denied (${error.code}). If you are running in a container, please check volume mounts and permissions.`;
                  }
                  
                  const message = error instanceof Error ? error.message : String(error);
                  const errResult = makeErrorResult(
                    'run',
                    new Error(
                      `Failed to write output to '${ctx.args.output}': ${message}\n\n` +
                        `The process model was discovered successfully — only the file write failed.\n` +
                        extraHint
                    ),
                    EXIT_CODES.partial_failure,
                    'SINK_WRITE_FAILED'
                  );
                  emitResult(errResult, emitOptions);
                  return await exitWithFlush(errResult.exit_code);
                }
              }

              // Step 11: Build canonical result and emit
              const cmdResult = makeResult('run', payload, elapsedMs, EXIT_CODES.success);

              // Surface K: additive top-level mirror of payload.model so consumers reading
              // `result.model.edges` (or `result.edges`) work alongside `result.payload.model.edges`.
              // Preserves backward-compat — payload.model is unchanged.
              if (resultData && typeof resultData === 'object') {
                (cmdResult as unknown as Record<string, unknown>).model = resultData;
                const edges = (resultData as { edges?: unknown }).edges;
                if (Array.isArray(edges)) {
                  (cmdResult as unknown as Record<string, unknown>).edges = edges;
                }
              }

              emitResult(cmdResult, emitOptions, (res, projection) => {
                const p = res.payload as typeof payload;

                // Preflight warnings
                if (p.preflightWarnings && p.preflightWarnings.length > 0) {
                  for (const warn of p.preflightWarnings) {
                    projection.warn(`⚠ ${warn}`);
                  }
                  if (ctx.args.preflight) {
                    projection.success(
                      'Preflight validation complete — log is ready for discovery'
                    );
                  }
                }

                // ML analysis summary
                if (p.ml && Object.keys(p.ml as Record<string, unknown>).length > 0) {
                  projection.info(
                    `ML analysis complete: ${Object.keys(p.ml as Record<string, unknown>).join(', ')}`
                  );
                }

                if (ctx.args['no-cache']) {
                  projection.debug('Caches cleared (--no-cache)');
                }

                projection.debug(`Loading event log from: ${p.input}`);

                const etaStr =
                  (p.estimatedMs as number | undefined) && (p.estimatedMs as number) > 0
                    ? ` (~${Math.ceil((p.estimatedMs as number) / 1000)}s estimated)`
                    : '';
                projection.info(`Discovering with ${p.algorithm}${etaStr}...`);

                projection.success(`Discovery completed in ${p.elapsedMs.toFixed(1)}ms`);
                projection.info(`Algorithm: ${p.algorithm}`);
                projection.info(`Activity key: ${p.activityKey}`);
                if (ctx.args.output) {
                  projection.info(`Output: ${ctx.args.output}`);
                }

                // Model summary — log statistics first, then model structure
                const logStatsData = p.logStats as
                  | { total_cases?: number; total_events?: number; unique_variants?: number }
                  | undefined;
                const summary = extractModelSummary(p.model);
                if (logStatsData || summary) {
                  projection.log('');
                  if (logStatsData?.total_cases !== undefined) {
                    projection.info(`  Traces:   ${logStatsData.total_cases}`);
                  }
                  if (logStatsData?.total_events !== undefined) {
                    projection.info(`  Events:   ${logStatsData.total_events}`);
                  }
                  if (logStatsData?.unique_variants !== undefined) {
                    projection.info(`  Variants: ${logStatsData.unique_variants}`);
                  }
                  if (summary) {
                    for (const [key, value] of Object.entries(summary)) {
                      projection.info(`  ${key}: ${value}`);
                    }
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
                    'places' in resultDataCheck ||
                    'transitions' in resultDataCheck ||
                    'arcs' in resultDataCheck;
                  if (!hasPetriNetFields) {
                    projection.warn(
                      `Quality metrics require a Petri net model. Algorithm '${p.algorithm}' does not produce one.`
                    );
                  }
                }

                // 1000x Auto-Insight Generation
                const qInsight = p.quality as { fitness?: number; precision?: number } | undefined;
                const fit = qInsight?.fitness;
                const nodeCount = summary ? parseInt(summary['Nodes'] || summary['Places'] || '0') : 0;
                if (logStatsData && (fit !== undefined || nodeCount > 0)) {
                  let story = "Insight: ";
                  if (fit !== undefined) {
                    if (fit >= 0.9) story += `Discovered a highly standardized process (Fitness: ${(fit * 100).toFixed(0)}%). `;
                    else if (fit >= 0.7) story += `Discovered a semi-structured process (Fitness: ${(fit * 100).toFixed(0)}%). `;
                    else story += `Discovered an unstructured "spaghetti" process (Fitness: ${(fit * 100).toFixed(0)}%). `;
                  } else {
                    story += `Discovered a process model with ${logStatsData.unique_variants || 'multiple'} execution variants. `;
                  }
                  
                  const variantRatio = logStatsData.unique_variants && logStatsData.total_cases 
                     ? logStatsData.unique_variants / logStatsData.total_cases 
                     : 0;
                  
                  if (nodeCount > 0) {
                     if (nodeCount > 30 || variantRatio > 0.5) story += `The graph contains ${nodeCount} structural nodes and high variant diversity, indicating significant complexity.`;
                     else story += `The graph contains ${nodeCount} structural nodes, indicating a manageable complexity level.`;
                  }
                  
                  projection.log('');
                  projection.info(`\x1b[36m${story}\x1b[0m`);
                }

                // First-run UX hints
                if (isFirstRunResult && format === 'human') {
                  const hints = formatFirstRunHints(
                    (p.quality as { fitness?: number } | undefined)?.fitness,
                    p.algorithm,
                    p.input,
                    savedPath
                  );
                  for (const hint of hints) {
                    projection.log(hint);
                  }
                } else {
                  projection.log('');
                  projection.log('Next steps:');
                  projection.log(
                    `  wpm conformance -i ${path.basename(p.input)}   -- measure fitness and precision`
                  );
                  projection.log(
                    `  wpm compare dfg,heuristic -i ${path.basename(p.input)}   -- compare algorithms`
                  );
                  projection.log('  wpm results   -- browse saved results');

                  if (savedPath) {
                    projection.debug(`Result saved: ${path.relative(process.cwd(), savedPath)}`);
                  }
                }
              });

              // Step 12: Print cache statistics if requested
              if (ctx.args['cache-stats']) {
                if (typeof wasm.get_cache_stats !== 'function') {
                  const errResult = makeErrorResult(
                    'run',
                    new Error(
                      'Cache statistics requested (--cache-stats) but not available in WASM module'
                    ),
                    EXIT_CODES.execution_error,
                    'CACHE_STATS_UNAVAILABLE'
                  );
                  emitResult(errResult, emitOptions);
                  return await exitWithFlush(errResult.exit_code);
                }
                const statsRaw = wasm.get_cache_stats();
                const cacheStats = typeof statsRaw === 'string' ? JSON.parse(statsRaw) : statsRaw;
                const cacheResult = makeResult(
                  'run/cache-stats',
                  { cache: cacheStats },
                  0,
                  EXIT_CODES.success
                );
                emitResult(cacheResult, emitOptions, (_res, projection) => {
                  const hitRate =
                    cacheStats.parse_hits + cacheStats.parse_misses > 0
                      ? (
                          (cacheStats.parse_hits /
                            (cacheStats.parse_hits + cacheStats.parse_misses)) *
                          100
                        ).toFixed(1)
                      : 'N/A';
                  projection.info('Cache statistics:');
                  projection.info(`  Parse hits: ${cacheStats.parse_hits}`);
                  projection.info(`  Parse misses: ${cacheStats.parse_misses}`);
                  projection.info(`  Hit rate: ${hitRate}%`);
                  projection.info(`  Columnar entries: ${cacheStats.columnar_entries}`);
                  projection.info(`  Interner entries: ${cacheStats.interner_entries}`);
                });
              }

              return await exitWithFlush(cmdResult.exit_code);
            }
          ); // end withLogSession
        } catch (error) {
          const result = makeErrorResult(
            'run',
            new Error(
              `Discovery failed: ${error instanceof Error ? error.message : String(error)}\n\nRun "wpm doctor" to check your environment.`
            ),
            EXIT_CODES.execution_error,
            'DISCOVERY_FAILED'
          );
          finalExitCode = result.exit_code;
          emitResult(result, emitOptions);
          return await exitWithFlush(result.exit_code);
        }
      },
      () => ({
        'status.code': finalExitCode,
        'status.ok': finalExitCode === EXIT_CODES.success,
        'algorithm.name': finalAlgorithm,
        ...(finalFitness > 0 ? { 'quality.fitness': finalFitness } : {}),
        ...(finalPrecision > 0 ? { 'quality.precision': finalPrecision } : {}),
        'activity.key': 'concept:name',
      })
    );
  },
});

// ─── OCEL discovery helper ────────────────────────────────────────────────────

interface OcelDiscoveryOptions {
  inputPath: string;
  activityKey: string;
  resolvedAlgo: Algorithm;
  ctx: { args: Record<string, unknown> };
  emitOptions: { format: 'json' | 'human'; verbose: boolean; quiet: boolean };
  format: 'json' | 'human';
  verbose: boolean;
  quiet: boolean;
}

/**
 * Discover a process model from an OCEL 2.0 JSON file.
 *
 * Routes through load_ocel_from_json → discover_ocel_dfg_per_type (default)
 * or discover_ocel_dfg (aggregate), bypassing the XES-only withLogSession.
 *
 * Exit codes follow the same contract as wpm run for XES files.
 */
async function runOcelDiscovery(opts: OcelDiscoveryOptions): Promise<void> {
  const { inputPath, emitOptions, ctx } = opts;

  const { WasmLoader } = await import('@wasm4pm/engine');
  const { exitWithFlush: exitFlush } = await import('../otel/exit.js');
  const { saveCommandReceipt, blake3Hex, newReceipt } = await import('../receipts/_shared.js');

  // File existence
  try {
    await fs.access(inputPath);
  } catch {
    const result = makeErrorResult(
      'run',
      new Error(`Input file not found: ${inputPath}`),
      EXIT_CODES.source_error,
      'INPUT_NOT_FOUND'
    );
    emitResult(result, emitOptions);
    return exitFlush(result.exit_code);
  }

  // WASM init
  const loader = WasmLoader.getInstance();
  try {
    await loader.init();
  } catch (initError) {
    const msg = initError instanceof Error ? initError.message : String(initError);
    const result = makeErrorResult(
      'run',
      new Error(`WASM initialization failed: ${msg}\n\nRun "wpm doctor" to diagnose.`),
      EXIT_CODES.execution_error,
      'WASM_INIT_FAILED'
    );
    emitResult(result, emitOptions);
    return exitFlush(result.exit_code);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wasm = loader.get() as Record<string, any>;

  // Check feature availability
  if (typeof wasm['load_ocel_from_json'] !== 'function') {
    const result = makeErrorResult(
      'run',
      new Error(
        'OCEL support is not available in this WASM build.\n\n' +
          '  The loaded WASM binary was compiled without feature-ocel.\n' +
          '  OCEL requires the "fog" or "browser" deployment profile.\n\n' +
          '  To rebuild with OCEL support:\n' +
          '    cd wasm4pm && npm run build   # browser profile (all features)\n' +
          '    cd wasm4pm && npm run build:fog  # fog profile (includes feature-ocel)'
      ),
      EXIT_CODES.execution_error,
      'OCEL_NOT_AVAILABLE'
    );
    emitResult(result, emitOptions);
    return exitFlush(result.exit_code);
  }

  // Read OCEL file
  let ocelContent: string;
  try {
    ocelContent = await fs.readFile(inputPath, 'utf-8');
  } catch (readError) {
    const msg = readError instanceof Error ? readError.message : String(readError);
    const result = makeErrorResult(
      'run',
      new Error(`Failed to read OCEL file: ${msg}`),
      EXIT_CODES.source_error,
      'READ_FAILED'
    );
    emitResult(result, emitOptions);
    return exitFlush(result.exit_code);
  }

  if (!ocelContent.trim()) {
    const result = makeErrorResult(
      'run',
      new Error(`Input file is empty: ${inputPath}`),
      EXIT_CODES.source_error,
      'EMPTY_INPUT'
    );
    emitResult(result, emitOptions);
    return exitFlush(result.exit_code);
  }

  // Parse JSON sanity check
  try {
    JSON.parse(ocelContent);
  } catch {
    const result = makeErrorResult(
      'run',
      new Error(
        `OCEL file is not valid JSON: ${inputPath}\n\n` +
          '  OCEL 2.0 JSON format must be a valid JSON object with keys:\n' +
          '    "event_types", "object_types", "events", "objects"\n'
      ),
      EXIT_CODES.source_error,
      'INVALID_JSON'
    );
    emitResult(result, emitOptions);
    return exitFlush(result.exit_code);
  }

  // Load OCEL into WASM
  let ocelHandle: string;
  try {
    ocelHandle = wasm['load_ocel_from_json'](ocelContent) as string;
  } catch (loadErr) {
    const msg = loadErr instanceof Error ? loadErr.message : String(loadErr);
    const result = makeErrorResult(
      'run',
      new Error(`Failed to parse OCEL: ${msg}`),
      EXIT_CODES.source_error,
      'OCEL_PARSE_FAILED'
    );
    emitResult(result, emitOptions);
    return exitFlush(result.exit_code);
  }

  // Collect OCEL statistics (event/object counts, per-type breakdown) before discovery
  let ocelStats: {
    total_events?: number;
    total_objects?: number;
    object_type_counts?: Record<string, number>;
  } | null = null;
  try {
    if (typeof wasm['analyze_ocel_statistics'] === 'function') {
      const statsRaw = wasm['analyze_ocel_statistics'](ocelHandle);
      const stats = typeof statsRaw === 'string' ? JSON.parse(statsRaw) : statsRaw;
      ocelStats = {
        total_events:
          typeof stats.total_events === 'number' ? (stats.total_events as number) : undefined,
        total_objects:
          typeof stats.total_objects === 'number' ? (stats.total_objects as number) : undefined,
        object_type_counts:
          typeof stats.object_type_counts === 'object' && stats.object_type_counts !== null
            ? (stats.object_type_counts as Record<string, number>)
            : undefined,
      };
    }
  } catch {
    // OCEL statistics are best-effort and non-fatal
  }

  // Discover — default: per-type DFG (most informative for OCEL)
  const t0 = performance.now();
  let raw: unknown;
  let discoveryAlgo = 'ocel_dfg_per_type';

  try {
    if (typeof wasm['discover_ocel_dfg_per_type'] === 'function') {
      raw = wasm['discover_ocel_dfg_per_type'](ocelHandle);
      discoveryAlgo = 'ocel_dfg_per_type';
    } else if (typeof wasm['discover_ocel_dfg'] === 'function') {
      raw = wasm['discover_ocel_dfg'](ocelHandle);
      discoveryAlgo = 'ocel_dfg';
    } else {
      throw new Error('No OCEL discovery function available in this WASM build');
    }
  } catch (discErr) {
    try {
      (wasm['delete_object'] as ((h: string) => void) | undefined)?.(ocelHandle);
    } catch {
      /* best-effort */
    }
    const msg = discErr instanceof Error ? discErr.message : String(discErr);
    const result = makeErrorResult(
      'run',
      new Error(`OCEL discovery failed: ${msg}`),
      EXIT_CODES.execution_error,
      'OCEL_DISCOVERY_FAILED'
    );
    emitResult(result, emitOptions);
    return exitFlush(result.exit_code);
  }

  const elapsedMs = performance.now() - t0;

  // Normalise result
  const resultData: unknown = typeof raw === 'string' ? JSON.parse(raw) : raw;

  // Cleanup WASM handle
  try {
    (wasm['delete_object'] as ((h: string) => void) | undefined)?.(ocelHandle);
  } catch {
    /* best-effort */
  }

  // Build payload
  const payload = {
    status: 'success',
    algorithm: discoveryAlgo,
    activityKey: opts.activityKey,
    input: inputPath,
    inputFormat: 'ocel',
    elapsedMs: Math.round(elapsedMs * 100) / 100,
    model: resultData,
    ...(ocelStats && { ocelStats }),
  };

  // Build semantic payload for deterministic hashing (excludes timing metrics)
  const semanticPayload = {
    status: 'success',
    algorithm: discoveryAlgo,
    activityKey: opts.activityKey,
    input: inputPath,
    inputFormat: 'ocel',
    model: resultData,
    ...(ocelStats && { ocelStats }),
  };

  // Auto-save (citty maps --no-save → ctx.args.save === false)
  let savedPath: string | null = null;
  if (ctx.args['save'] !== false) {
    savedPath = await savePredictionResult(
      `discover-${discoveryAlgo}`,
      inputPath,
      opts.activityKey,
      payload as unknown as Record<string, unknown>
    );

    try {
      const inputBytes = await fs.readFile(inputPath).catch(() => Buffer.from(inputPath));
      const receipt = {
        ...newReceipt('run'),
        input_hash: blake3Hex(inputBytes),
        output_hash: blake3Hex(JSON.stringify(semanticPayload)),
        status: 'success' as const,
        summary: {
          algorithm: discoveryAlgo,
          activityKey: opts.activityKey,
          elapsedMs: Math.round(elapsedMs * 100) / 100,
          inputFormat: 'ocel',
        },
      };
      saveCommandReceipt(receipt);
    } catch {
      /* receipt write must never break the command */
    }
  }

  // Output
  const cmdResult = makeResult('run', payload, elapsedMs, EXIT_CODES.success);
  emitResult(cmdResult, emitOptions, (_res, projection) => {
    projection.info(`Discovering OCEL process model with ${discoveryAlgo}...`);
    projection.success(`Discovery completed in ${elapsedMs.toFixed(1)}ms`);
    projection.info(`Algorithm: ${discoveryAlgo}`);
    projection.info(`Input format: OCEL 2.0 JSON`);
    projection.info(`Input: ${inputPath}`);
    if (ctx.args['output']) {
      projection.info(`Output: ${String(ctx.args['output'])}`);
    }
    if (savedPath) {
      projection.debug(`Result saved: ${path.relative(process.cwd(), savedPath)}`);
    }

    // Object-centric context: event/object counts and per-type breakdown
    const stats = (payload as typeof payload & { ocelStats?: typeof ocelStats }).ocelStats;
    if (stats) {
      projection.log('');
      if (stats.total_events !== undefined) {
        projection.info(`  Events:  ${stats.total_events}`);
      }
      if (stats.total_objects !== undefined) {
        projection.info(`  Objects: ${stats.total_objects}`);
      }
      if (stats.object_type_counts && Object.keys(stats.object_type_counts).length > 0) {
        const typeSummary = Object.entries(stats.object_type_counts)
          .map(([t, c]) => `${t} (${c})`)
          .join(', ');
        projection.info(`  Object types: ${typeSummary}`);
      }
    }

    // Per-type DFG breakdown
    const m = resultData as Record<string, unknown>;
    if (m && typeof m === 'object') {
      const keys = Object.keys(m);
      if (
        keys.length > 0 &&
        typeof (m[keys[0]] as Record<string, unknown>)?.nodes !== 'undefined'
      ) {
        projection.log('');
        projection.info(
          'Object-centric DFG: shows the directly-follows graph for each object type'
        );
        projection.info('(Unlike flat log discovery, each object type gets its own process view)');
        projection.log('');
        for (const k of keys) {
          const dfg = m[k] as { nodes?: unknown[]; edges?: unknown[] };
          projection.info(
            `  ${k}: ${(dfg.nodes ?? []).length} activities, ${(dfg.edges ?? []).length} edges`
          );
        }
      } else if (Array.isArray((m as { nodes?: unknown[] }).nodes)) {
        const dfg = m as { nodes?: unknown[]; edges?: unknown[] };
        projection.info(`Activities: ${(dfg.nodes ?? []).length}`);
        projection.info(`Edges: ${(dfg.edges ?? []).length}`);
      }
    }

    projection.log('');
    projection.log('Next steps:');
    projection.log(
      `  wpm run ${path.basename(inputPath)} --algorithm ocel_dfg   -- aggregate OC-DFG across all types`
    );
    projection.log(
      `  wpm powl discover -i ${path.basename(inputPath)}            -- discover OC-Petri net`
    );
    projection.log('  wpm results   -- browse saved results');
  });

  // Write output file if requested
  if (ctx.args['output']) {
    try {
      const outputDir = path.dirname(String(ctx.args['output']));
      await fs.mkdir(outputDir, { recursive: true });
      await fs.writeFile(String(ctx.args['output']), JSON.stringify(payload, null, 2));
    } catch (writeError: any) {
      let extraHint = ``;
      if (writeError?.code === 'EACCES' || writeError?.code === 'EROFS') {
        extraHint = `\n\nPermission denied (${writeError.code}). If you are running in a container, please check volume mounts and permissions.`;
      }
      const msg = writeError instanceof Error ? writeError.message : String(writeError);
      const errResult = makeErrorResult(
        'run',
        new Error(`Failed to write output: ${msg}${extraHint}`),
        EXIT_CODES.partial_failure,
        'SINK_WRITE_FAILED'
      );
      emitResult(errResult, emitOptions);
      return exitFlush(errResult.exit_code);
    }
  }

  return exitFlush(EXIT_CODES.success);
}

/**
 * Extract a brief summary from a discovery result.
 */
function extractModelSummary(data: unknown): Record<string, string> | null {
  if (!data || typeof data !== 'object') return null;

  const d = data as Record<string, unknown>;
  const summary: Record<string, string> = {};

  // DFG / social-network shape
  if (Array.isArray(d['nodes'])) {
    summary['Nodes'] = String(d['nodes'].length);
  }
  if (Array.isArray(d['edges'])) {
    summary['Edges'] = String(d['edges'].length);
  }
  // Petri Net shape
  if (Array.isArray(d['places'])) {
    summary['Places'] = String(d['places'].length);
  }
  if (Array.isArray(d['transitions'])) {
    summary['Transitions'] = String(d['transitions'].length);
  }
  if (Array.isArray(d['arcs'])) {
    summary['Arcs'] = String(d['arcs'].length);
  }

  return Object.keys(summary).length > 0 ? summary : null;
}
