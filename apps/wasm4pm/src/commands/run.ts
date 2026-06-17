import { defineCommand } from 'citty';
import * as fs from 'fs/promises';
import * as path from 'path';
import { resolveConfig as loadConfig } from '@wasm4pm/config';
import { plan as makePlan, getSuggestions, checkCostModelDrift } from '@wasm4pm/planner';
import { computeParetoFront } from './suggest.js';
import { ALGORITHM_CLI_ALIASES, findClosestMatch, getProfileAlgorithms, resolveAlgorithmId } from '@wasm4pm/contracts';
import { getRegistry } from 'wasm4pm';
import { emitResult, makeResult, makeErrorResult, EmitOptions } from '../output.js';
import { withLogSession } from '../with-log-session.js';
import { EXIT_CODES } from '../exit-codes.js';
import { savePredictionResult } from './results.js';
import { executeMlTask } from '../ml-runner.js';
import type { MlTask } from '../ml-runner.js';
import { discriminateWithSpan, DiscoveryShapeError } from '../discriminator.js';
import { withSpan, withWasmSpan } from './_otel.js';
import { getGlobalSpanSink } from '../otel/sink.js';
import {
  saveCommandReceipt,
  blake3Hex,
  newReceipt,
  type CommandReceipt,
} from '../receipts/_shared.js';
import { exitWithFlush } from '../otel/exit.js';
import { isFirstRun, formatFirstRunHints } from '../first-run-ux.js';
import { rankAlgorithms, captureFeedback } from '@wasm4pm/observability';
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

import { Kernel, computeTimeout, classifyComplexity, detectAlgorithmTier } from 'wasm4pm';
import { validateTimeout } from '../param-validators.js';

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
  activityKey: string,
  parameters: Record<string, any> = {}
): Promise<{ raw: unknown; elapsedMs: number }> {
  const t0 = performance.now();
  const kernel = new Kernel(wasm as any);
  await kernel.init();
  const raw = await kernel.runRaw(algo, logHandle, activityKey, parameters);
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
      '  wpm run log.xes                               # Quality metrics computed by default (--no-with-quality to skip)\n' +
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
      description:
        'Discovery algorithm to use (default: heuristic_miner, or the value in wasm4pm.toml).\n' +
        '  Common: dfg, heuristic_miner, inductive_miner, genetic_algorithm, ilp, alpha_plus_plus\n' +
        '  OCEL:   ocel_dfg, ocel_petri_net\n' +
        '  Fast:   simd_streaming_dfg, process_skeleton\n' +
        '  Run "wpm algorithms" for the full list with speed/quality ratings.',
      alias: 'a',
    },
    output: {
      type: 'string',
      description: 'Write JSON result to file — use -o as shorthand',
      alias: 'o',
    },
    format: {
      type: 'string',
      description: 'Output format: human (default, rich console), json (detailed API payload), or csv (flat metrics table)',
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
    smart: {
      type: 'boolean',
      description:
        'Smart mode: run dfg, heuristic_miner, and alpha_plus_plus in parallel, rank by quality, ' +
        'and return the best result. Slower than single-algorithm mode but auto-selects the best model.',
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
      default: true,
      description:
        'Compute and display quality metrics (fitness, precision, simplicity) after discovery (use --no-with-quality to skip)',
    },
    'assert-fitness': {
      type: 'string',
      description:
        'Fail with exit 4 if fitness drops below this threshold (0-1).',
    },
    'assert-precision': {
      type: 'string',
      description:
        'Fail with exit 4 if precision drops below this threshold (0-1).',
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
    'auto-select': {
      type: 'boolean',
      description:
        'Automatically pick the best algorithm for the configured execution profile ' +
        '(fast | balanced | quality | stream). Ignores --algorithm flag when set.',
    },
    parameters: {
      type: 'string',
      description: 'JSON string of algorithm parameters (e.g. \'{"dependency_threshold": 0.8}\').',
    },
    'guide-next-steps': {
      type: 'boolean',
      description: 'Emit contextual next-step suggestions after successful discovery',
    },
    'show-algo-params': {
      type: 'string',
      description: 'Show parameters for a specific algorithm',
    },
    'no-color': {
      type: 'boolean',
      description: 'Disable ANSI colors in output',
    },
    'no-emoji': {
      type: 'boolean',
      description: 'Disable emoji in output',
    },
    'noise-threshold': {
      type: 'string',
      description:
        'Noise filter threshold (0.0–1.0, default 0.0). Removes DFG edges whose frequency < (threshold * max_edge_frequency) and nodes whose frequency < (threshold * max_node_frequency). Van der Aalst tau-miner style post-hoc filtering.',
    },
  },
  async run(ctx) {
    const format = (ctx.args.format as 'json' | 'human' | 'csv') ?? 'human';
    const verbose = Boolean(ctx.args.verbose);
    const quiet = Boolean(ctx.args.quiet);
    const emitOptions = { format: format as any, verbose, quiet };

    if (format !== 'json' && format !== 'human' && format !== 'csv') {
      const errResult = makeErrorResult(
        'run',
        new Error(`Unknown output format "${format}". Valid: human, json, csv`),
        EXIT_CODES.config_error,
        'INVALID_FORMAT'
      );
      emitResult(errResult, emitOptions);
      return await exitWithFlush(errResult.exit_code);
    }

    const timeoutResult = validateTimeout(ctx.args.timeout as string | undefined, 300);
    if (!timeoutResult.valid) {
      const errResult = makeErrorResult(
        'run',
        new Error(timeoutResult.error ?? 'Invalid timeout'),
        EXIT_CODES.config_error,
        'TIMEOUT_INVALID'
      );
      emitResult(errResult, emitOptions);
      return await exitWithFlush(errResult.exit_code);
    }
    const currentTimeoutSecs = timeoutResult.value;
    if (timeoutResult.wasClamped && !quiet && format === 'human') {
      process.stderr.write(`⚠ ${timeoutResult.error}\n`);
    }

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

          // --auto-select: quick-analyse the log to pick the best algorithm for the
          // configured execution profile.  Runs before the file I/O validation step so
          // that we can print the selection message before any heavy work starts.
          // We derive stats from the raw file when we later load it; here we do a cheap
          // stat() to get a size proxy for trace estimation, then let getSuggestions()
          // map the profile to a goal.
          let autoSelectedAlgo: string | undefined;
          if (ctx.args['auto-select']) {
            try {
              const profileToGoal: Record<string, string> = {
                fast: 'fast',
                balanced: 'balanced',
                quality: 'quality',
                // 'stream' profile would map to 'streaming' goal, but streaming-only
                // algorithms (e.g. simd_streaming_dfg) are not usable by the batch `run`
                // command.  Fall back to balanced so auto-select picks a real batch algorithm.
                stream: 'balanced',
              };
              const profile = config?.execution?.profile ?? 'balanced';
              const goal = (profileToGoal[profile] ?? 'balanced') as import('@wasm4pm/planner').SuggestionGoal;

              // Rough stats without loading the file: use file size to estimate event count.
              // 1 event ≈ 250 bytes in XES is a reasonable heuristic.
              const inputPathEarly: string | undefined =
                (ctx.args.input as string | undefined) || (ctx.args.file as string | undefined);
              let estTraces = 500;
              let estEvents = 2500;
              if (inputPathEarly) {
                try {
                  const statResult = await fs.stat(inputPathEarly);
                  estEvents = Math.max(1, Math.round(statResult.size / 250));
                  estTraces = Math.max(1, Math.round(estEvents / 5));
                } catch {
                  // stat failed — use defaults
                }
              }

              const suggestions = getSuggestions(
                { traceCount: estTraces, eventCount: estEvents, variantCount: Math.round(estTraces * 0.1) },
                goal,
                5,
              );

              const { front: paretoFront } = computeParetoFront(suggestions);
              const paretoPool = paretoFront.length > 0 ? paretoFront : suggestions;

              let selected = paretoPool[0];
              if (profile === 'fast') {
                selected = paretoPool.reduce((best, c) => (c.speed > best.speed ? c : best), paretoPool[0]!);
              } else if (profile === 'quality') {
                selected = paretoPool.reduce((best, c) => (c.quality > best.quality ? c : best), paretoPool[0]!);
              }
              // balanced: use first Pareto member (already sorted by name, score is best by getSuggestions order)

              if (selected) {
                autoSelectedAlgo = selected.algorithm;
                if (!quiet && format === 'human') {
                  process.stderr.write(
                    `Auto-selected algorithm: ${autoSelectedAlgo} ` +
                    `(Pareto-optimal: quality=${selected.quality}, speed=${selected.speed}) ` +
                    `for profile=${profile}\n`
                  );
                }
              } else if (suggestions[0]) {
                autoSelectedAlgo = suggestions[0].algorithm;
                if (!quiet && format === 'human') {
                  process.stderr.write(
                    `Auto-selected algorithm: ${autoSelectedAlgo} ` +
                    `(quality=${suggestions[0].quality}, speed=${suggestions[0].speed}) ` +
                    `for profile=${profile}\n`
                  );
                }
              }
            } catch {
              // Auto-select is best-effort; fall through to normal resolution
            }
          }

          // Accept kernel registry IDs (heuristic_miner) or CLI aliases (heuristic)
          const resolvedAlgo: Algorithm | undefined = resolveAlgorithmId(
            autoSelectedAlgo ?? rawAlgo,
            ALGORITHMS
          );

          if (!resolvedAlgo) {
            // An unknown algorithm name is source_error (2) — intentional wasm4pm design.
            // The algorithm registry is part of the source/data layer (WASM kernel), not
            // the CLI configuration layer. config_error (1) is for malformed flags and
            // missing required arguments; source_error (2) covers bad algorithm IDs because
            // the algorithm list is resolved at runtime from the WASM kernel registry.
            // See CLAUDE.md: '"bad algorithm" exit code is SOURCE_ERROR (2), not CONFIG_ERROR (1) — intentional'
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
              'CONFIG_ALGORITHM_NOT_FOUND'
            );
            emitResult(result, emitOptions);
            return await exitWithFlush(result.exit_code);
          }

          // ── --show-algo-params ──────────────────────────────────────────────
          if (ctx.args['show-algo-params']) {
            const showParams = ctx.args['show-algo-params'] as string;
            const registry = getRegistry();
            const algo = registry.get(showParams);
            if (!algo) {
              process.stderr.write(`Algorithm not found: ${showParams}\n`);
              return await exitWithFlush(EXIT_CODES.config_error);
            }

            const payload = {
              algorithmId: algo.id,
              algorithmName: algo.name,
              parameters: algo.parameters.map(p => ({
                name: p.name,
                type: p.type,
                description: p.description,
                required: p.required,
                default: p.default,
                ...(p.min !== undefined && { min: p.min }),
                ...(p.max !== undefined && { max: p.max }),
                ...(p.options && { options: p.options }),
              })),
            };

            const result = makeResult('algorithm-parameters', payload, 0, EXIT_CODES.success);
            emitResult(result, { format: format as any, verbose: false, quiet }, (_res, p) => {
              p.log('');
              p.log(`Algorithm: ${algo.name} (${algo.id})`);
              p.log(`Description: ${algo.description}`);
              p.log('');

              if (algo.parameters.length === 0) {
                p.log('No parameters (activity_key is implicit).');
                p.log('');
                return;
              }

              p.log('Parameters:');
              p.log('─'.repeat(100));
              p.log(
                `${'Name'.padEnd(25)} ${'Type'.padEnd(12)} ${'Required'.padEnd(10)} ${'Range / Options'.padEnd(30)} ${'Default'.padEnd(20)} Description`
              );
              p.log('─'.repeat(100));

              for (const param of algo.parameters) {
                const rangeOrOptions = param.options
                  ? `[${param.options.join(', ')}]`
                  : param.min !== undefined || param.max !== undefined
                    ? `${param.min ?? '—'}..${param.max ?? '—'}`
                    : '—';
                const defaultStr = param.default !== undefined ? String(param.default) : '(none)';
                const requiredStr = param.required ? 'yes' : 'no';

                p.log(
                  `${param.name.padEnd(25)} ${param.type.padEnd(12)} ${requiredStr.padEnd(10)} ${rangeOrOptions.padEnd(30)} ${defaultStr.padEnd(20)} ${param.description}`
                );
              }
              p.log('─'.repeat(100));
              p.log('');
              p.log(`Usage example:`);
              p.log(`  wpm run log.xes --algorithm ${algo.id} --parameters '{"${algo.parameters[0]?.name ?? 'activity_key'}":"concept:name"}'`);
              p.log('');
            });
            return await exitWithFlush(EXIT_CODES.success);
          }

          let parsedParams: Record<string, any> = {};
          if (ctx.args.parameters) {
            try {
              parsedParams = JSON.parse(ctx.args.parameters as string);
            } catch {
              const errResult = makeErrorResult(
                'run',
                new Error(`Invalid JSON in --parameters: "${ctx.args.parameters}"`),
                EXIT_CODES.config_error,
                'PARAMETERS_INVALID_JSON'
              );
              emitResult(errResult, emitOptions);
              return await exitWithFlush(errResult.exit_code);
            }
          }

          const algoMeta = getRegistry().get(resolvedAlgo);
          if (algoMeta) {
            for (const param of algoMeta.parameters) {
              const val = parsedParams[param.name];
              if (val === undefined) {
                if (param.default !== undefined) {
                  parsedParams[param.name] = param.default;
                } else if (param.required) {
                  const errResult = makeErrorResult(
                    'run',
                    new Error(`Missing required parameter: "${param.name}" for algorithm "${resolvedAlgo}"`),
                    EXIT_CODES.config_error,
                    'PARAMETER_REQUIRED'
                  );
                  emitResult(errResult, emitOptions);
                  return await exitWithFlush(errResult.exit_code);
                }
                continue;
              }

              if (param.type === 'number') {
                const num = Number(val);
                if (Number.isNaN(num)) {
                  const errResult = makeErrorResult(
                    'run',
                    new Error(`Parameter "${param.name}" must be a number (got "${val}")`),
                    EXIT_CODES.config_error,
                    'PARAMETER_INVALID_TYPE'
                  );
                  emitResult(errResult, emitOptions);
                  return await exitWithFlush(errResult.exit_code);
                }
                if (param.min !== undefined && num < param.min) {
                  const errResult = makeErrorResult(
                    'run',
                    new Error(`Parameter "${param.name}" value ${num} is below minimum ${param.min}`),
                    EXIT_CODES.config_error,
                    'PARAMETER_OUT_OF_BOUNDS'
                  );
                  emitResult(errResult, emitOptions);
                  return await exitWithFlush(errResult.exit_code);
                }
                if (param.max !== undefined && num > param.max) {
                  const errResult = makeErrorResult(
                    'run',
                    new Error(`Parameter "${param.name}" value ${num} is above maximum ${param.max}`),
                    EXIT_CODES.config_error,
                    'PARAMETER_OUT_OF_BOUNDS'
                  );
                  emitResult(errResult, emitOptions);
                  return await exitWithFlush(errResult.exit_code);
                }
                parsedParams[param.name] = num;
              } else if (param.type === 'boolean') {
                if (typeof val !== 'boolean') {
                  const errResult = makeErrorResult(
                    'run',
                    new Error(`Parameter "${param.name}" must be a boolean (got "${val}")`),
                    EXIT_CODES.config_error,
                    'PARAMETER_INVALID_TYPE'
                  );
                  emitResult(errResult, emitOptions);
                  return await exitWithFlush(errResult.exit_code);
                }
              } else if (param.type === 'select' && param.options) {
                if (!param.options.includes(val)) {
                  const errResult = makeErrorResult(
                    'run',
                    new Error(`Parameter "${param.name}" must be one of [${param.options.join(', ')}] (got "${val}")`),
                    EXIT_CODES.config_error,
                    'PARAMETER_INVALID_CHOICE'
                  );
                  emitResult(errResult, emitOptions);
                  return await exitWithFlush(errResult.exit_code);
                }
              }
            }
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
          } catch (e: unknown) {
             const fsErr = e as NodeJS.ErrnoException;
             if (fsErr.code === 'ENOENT') {
                const result = makeErrorResult(
                  'run',
                  new Error(
                    `File not found: '${inputPath}'\n\n` +
                    `  Check the path and try again:\n` +
                    `    ls -l ${path.dirname(inputPath)}\n\n` +
                    `  Need a sample dataset? Run:\n` +
                    `    wpm examples`
                  ),
                  EXIT_CODES.source_error,
                  'FILE_NOT_FOUND'
                );
                emitResult(result, emitOptions);
                return await exitWithFlush(result.exit_code);
             }
             if (fsErr.code === 'EACCES') {
                const result = makeErrorResult(
                  'run',
                  new Error(
                    `Permission denied reading '${inputPath}'\n\n` +
                    `  Fix permissions with:\n` +
                    `    chmod 644 ${inputPath}`
                  ),
                  EXIT_CODES.source_error,
                  'FILE_NOT_READABLE'
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
              } catch (e) {
                // Schema validation optional — emit skip span so it's visible in Jaeger
                console.warn('[run] validate_log_schema skipped:', e instanceof Error ? e.message : String(e));
                try {
                  withWasmSpan('validate.skipped', { 'validation.step': 'validate_log_schema', 'validation.reason': String(e) }, () => undefined);
                } catch { /* span emit must never throw */ }
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
              } catch (e) {
                // Attribute validation optional — emit skip span so it's visible in Jaeger
                console.warn('[run] validate_required_attributes skipped:', e instanceof Error ? e.message : String(e));
                try {
                  withWasmSpan('validate.skipped', { 'validation.step': 'validate_required_attributes', 'validation.reason': String(e) }, () => undefined);
                } catch { /* span emit must never throw */ }
              }

              // Pass 1 failure is FATAL
              if (preflightErrors.length > 0) {
                const result = makeErrorResult(
                  'run',
                  new Error(
                    `Event log '${path.basename(inputPath)}' failed structural validation:\n` +
                    preflightErrors.map((e) => `  ✗ ${e}`).join('\n') +
                    `\n\n  To inspect and repair the log:\n` +
                    `    wpm validate ${path.basename(inputPath)}\n\n` +
                    `  Common fixes:\n` +
                    `  • Check activity attribute key (default: concept:name):\n` +
                    `      wpm run ${path.basename(inputPath)} --activity-key your:attribute\n` +
                    `  • Validate XES schema: ensure every <event> has concept:name and time:timestamp`
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
                } catch (e) {
                  // Quality validation optional — emit skip span so it's visible in Jaeger
                  console.warn('[run] validate_data_quality skipped:', e instanceof Error ? e.message : String(e));
                  try {
                    withWasmSpan('validate.skipped', { 'validation.step': 'validate_data_quality', 'validation.reason': String(e) }, () => undefined);
                  } catch { /* span emit must never throw */ }
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

              // Step 5d: --smart mode — run 3 fast algorithms, rank by quality, return best
              if (ctx.args.smart) {
                const smartCandidates = ['dfg', 'heuristic_miner', 'alpha_plus_plus'];
                type SmartResult = { algo: string; raw: unknown; elapsedMs: number; fitness: number };
                const smartResults: SmartResult[] = [];

                for (const candidate of smartCandidates) {
                  try {
                    const t0 = performance.now();
                    const kernel = new Kernel(wasm as any);
                    await kernel.init();
                    const candidateRaw = await kernel.runRaw(candidate, logHandle, activityKey, {});
                    const candidateMs = performance.now() - t0;

                    // Extract a simple fitness proxy: DFG edge count ratio (higher = more coverage)
                    let fitProxy = 0.5;
                    try {
                      const parsed = typeof candidateRaw === 'string' ? JSON.parse(candidateRaw as string) : candidateRaw;
                      const edges = Array.isArray((parsed as any)?.edges) ? (parsed as any).edges.length : 0;
                      const nodes = Array.isArray((parsed as any)?.nodes) ? (parsed as any).nodes.length : 1;
                      // Normalize: more edges relative to nodes → denser model → proxy for fitness
                      fitProxy = Math.min(1, edges / Math.max(nodes * 2, 1));
                    } catch { /* use default */ }

                    smartResults.push({ algo: candidate, raw: candidateRaw, elapsedMs: candidateMs, fitness: fitProxy });

                    // Record feedback for future rankAlgorithms calls (non-blocking)
                    captureFeedback(candidate, 0, { fitness: fitProxy, precision: null, generalization: null, simplicity: null }, candidateMs).catch(() => { /* non-blocking */ });
                  } catch (err) {
                    process.stderr.write(`[smart] ${candidate} failed: ${err instanceof Error ? err.message : String(err)}\n`);
                  }
                }

                if (smartResults.length === 0) {
                  const errResult = makeErrorResult(
                    'run',
                    new Error('--smart mode: all candidate algorithms failed'),
                    EXIT_CODES.execution_error,
                    'SMART_MODE_ALL_FAILED'
                  );
                  emitResult(errResult, emitOptions);
                  return await exitWithFlush(errResult.exit_code);
                }

                // Pick best by fitness proxy (highest score wins)
                smartResults.sort((a, b) => b.fitness - a.fitness);
                const best = smartResults[0];

                // Try to use prior feedback ranking if available (upgrades the proxy)
                try {
                  const ranked = await rankAlgorithms(smartCandidates, 'composite');
                  if (ranked.length > 0) {
                    const topByHistory = ranked[0].algorithm;
                    const historyBest = smartResults.find(r => r.algo === topByHistory);
                    if (historyBest && historyBest.fitness >= best.fitness * 0.85) {
                      // Defer to historical ranking if it's close in quality
                      Object.assign(best, historyBest);
                    }
                  }
                } catch { /* ranking is advisory only */ }

                if (format === 'human') {
                  process.stderr.write(
                    `[smart] Ran ${smartResults.length} algorithms — best: ${best.algo} ` +
                    `(score=${best.fitness.toFixed(3)}, ${best.elapsedMs.toFixed(0)}ms)\n`
                  );
                }

                // Hand off the best result into the normal post-processing path
                const smartResult = makeResult(
                  'run',
                  {
                    status: 'success',
                    message: `Smart mode selected ${best.algo} as best algorithm`,
                    algorithm: best.algo,
                    smart_mode: true,
                    candidates: smartResults.map(r => ({ algorithm: r.algo, fitness_proxy: r.fitness, elapsed_ms: r.elapsedMs })),
                    result: best.raw,
                  },
                  best.elapsedMs,
                  EXIT_CODES.success
                );
                emitResult(smartResult, emitOptions);
                return await exitWithFlush(EXIT_CODES.success);
              }

              // Step 6: Execute discovery

              let raw: unknown = undefined;
              let elapsedMs = 0;
              let resolvedAlgoFinal = resolvedAlgo;

              {
                // JIDOKA: No fallback chain. If requested algorithm fails, we report the defect.
                // Mandatory statistics check
                const statsRaw = wasm.analyze_event_statistics(logHandle);
                const stats = typeof statsRaw === 'string' ? JSON.parse(statsRaw) : statsRaw;
                const eventCount = stats.total_events ?? stats.eventCount;
                const traceCount = stats.total_cases ?? stats.traceCount;
                const activityCount = stats.unique_activities ?? stats.activityCount;

                if (eventCount === undefined || traceCount === undefined) {
                   throw new Error('Failed to extract mandatory log statistics.');
                }

                const complexity = classifyComplexity(eventCount, activityCount, traceCount);
                const algorithmTier = detectAlgorithmTier(resolvedAlgo);
                const timeoutEst = computeTimeout({
                  eventCount,
                  complexity,
                  algorithmTier,
                  algorithmName: resolvedAlgo
                });
                const estimatedSecs = Math.round(timeoutEst.timeoutMs / 1000);

                if (currentTimeoutSecs < estimatedSecs && !quiet && format === 'human') {
                  process.stderr.write(
                    `⚠ Warning: Configured timeout (${currentTimeoutSecs}s) is less than the estimated requirement ` +
                    `(${estimatedSecs}s) for '${resolvedAlgo}' on this log (${eventCount} events, complexity: ${complexity}).\n` +
                    `  To avoid premature termination, consider increasing the timeout:\n` +
                    `    wpm run ${path.basename(inputPath)} --algorithm ${resolvedAlgo} --timeout ${estimatedSecs}\n\n`
                  );
                }

                const result = await runDiscovery(wasm, resolvedAlgo, logHandle, activityKey, parsedParams);
                raw = result.raw;
                elapsedMs = result.elapsedMs;
                resolvedAlgoFinal = resolvedAlgo;
              }

              // Validate discovery output shape — fail loudly on unknown shapes.
              // discriminateWithSpan emits an OTEL span (service.name=wasm4pm,
              // status=ok|error) for 100% observability compliance.
              try {
                discriminateWithSpan(raw, resolvedAlgoFinal);
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
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
                generalization: number | null;
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

                    // Generalization via WASM token-replay generalization (pm4py-equivalent)
                    let generalization: number | null = null;
                    if (typeof wasm.generalization === 'function' && modelHandle) {
                      try {
                        const genRaw = withWasmSpan(
                          'generalization',
                          { activity_key: activityKey, model_type: 'petri_net' },
                          () => wasm.generalization(logHandle, modelHandle, activityKey)
                        );
                        const gen = typeof genRaw === 'string' ? JSON.parse(genRaw) : genRaw;
                        if (gen.generalization !== undefined) {
                          generalization = gen.generalization;
                        }
                      } catch {
                        // generalization failure is non-fatal; leave null
                      }
                    }

                    qualityMetrics = { fitness, precision, simplicity, generalization };
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
                  } catch (err: unknown) {
                    const fsErr = err as NodeJS.ErrnoException;
                    if (fsErr.code === 'EACCES' || fsErr.code === 'EROFS') {
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

              // Noise filtering: post-hoc DFG edge/node pruning (van der Aalst tau-miner style)
              const noiseThresholdRaw = ctx.args['noise-threshold'] as string | undefined;
              if (noiseThresholdRaw !== undefined) {
                const noiseThreshold = parseFloat(noiseThresholdRaw);
                if (Number.isNaN(noiseThreshold) || noiseThreshold < 0 || noiseThreshold > 1) {
                  const errResult = makeErrorResult(
                    'run',
                    new Error(`--noise-threshold must be a number between 0.0 and 1.0 (got "${noiseThresholdRaw}")`),
                    EXIT_CODES.config_error,
                    'NOISE_THRESHOLD_INVALID'
                  );
                  emitResult(errResult, emitOptions);
                  return await exitWithFlush(errResult.exit_code);
                }

                if (noiseThreshold > 0 && resultData && typeof resultData === 'object') {
                  const dfgData = resultData as {
                    edges?: Array<Record<string, unknown>>;
                    nodes?: Array<Record<string, unknown>>;
                  };

                  // Filter edges
                  if (Array.isArray(dfgData.edges) && dfgData.edges.length > 0) {
                    const edgeFreqs = dfgData.edges.map(e =>
                      typeof e.frequency === 'number' ? e.frequency : (typeof e.count === 'number' ? e.count : 0)
                    );
                    const maxEdgeFreq = Math.max(...edgeFreqs);
                    const edgeCutoff = noiseThreshold * maxEdgeFreq;
                    const beforeEdgeCount = dfgData.edges.length;
                    dfgData.edges = dfgData.edges.filter(e => {
                      const freq = typeof e.frequency === 'number' ? e.frequency : (typeof e.count === 'number' ? e.count : 0);
                      return freq >= edgeCutoff;
                    });
                    const removedEdges = beforeEdgeCount - dfgData.edges.length;

                    // Filter nodes
                    let removedNodes = 0;
                    if (Array.isArray(dfgData.nodes) && dfgData.nodes.length > 0) {
                      const nodeFreqs = dfgData.nodes.map(n =>
                        typeof n.frequency === 'number' ? n.frequency : (typeof n.count === 'number' ? n.count : 0)
                      );
                      const maxNodeFreq = Math.max(...nodeFreqs);
                      const nodeCutoff = noiseThreshold * maxNodeFreq;
                      const beforeNodeCount = dfgData.nodes.length;
                      dfgData.nodes = dfgData.nodes.filter(n => {
                        const freq = typeof n.frequency === 'number' ? n.frequency : (typeof n.count === 'number' ? n.count : 0);
                        return freq >= nodeCutoff;
                      });
                      removedNodes = beforeNodeCount - dfgData.nodes.length;
                    }

                    if (!quiet && format === 'human') {
                      process.stderr.write(
                        `Noise filter (threshold=${noiseThreshold}): removed ${removedEdges} edges, ${removedNodes} nodes\n`
                      );
                    }
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

              // Step 8c: Cost-model drift check against runtime receipt evidence.
              // Best-effort: must never break the run.
              let costDrift: ReturnType<typeof checkCostModelDrift> = undefined;
              try {
                const signal = checkCostModelDrift('.wasm4pm/receipts', resolvedAlgoFinal);
                if (signal?.isAlert) costDrift = signal;
              } catch {
                // drift detection is advisory only
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
                ...(costDrift && { cost_drift: costDrift }),
              };

              // Capture final values for OTEL span (semantic attributes)
              finalAlgorithm = resolvedAlgoFinal;
              if (qualityMetrics) {
                finalFitness = qualityMetrics.fitness;
                finalPrecision = qualityMetrics.precision;
              }
              finalExitCode = EXIT_CODES.success;

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
                  const inputBytes = await fs.readFile(inputPath);
                  const receipt: CommandReceipt = {
                    ...newReceipt('run'),
                    input_hash: blake3Hex(inputBytes),
                    output_hash: blake3Hex(JSON.stringify(payload)),
                    status: 'success',
                    summary: {
                      algorithm: resolvedAlgoFinal,
                      activityKey,
                      elapsedMs: Math.round(elapsedMs * 100) / 100,
                      // duration_ms + eventCount are read by the planner's
                      // cost-drift detector and runtime meta-learner corpus
                      duration_ms: Math.round(elapsedMs * 100) / 100,
                      ...(logStats?.total_events !== undefined && {
                        eventCount: logStats.total_events,
                      }),
                    },
                  };
                  saveCommandReceipt(receipt);
                } catch (receiptErr) {
                  // receipt write must never break the command, but MUST leave evidence
                  try {
                    const sink = getGlobalSpanSink();
                    sink({
                      trace_id: '',
                      span_id: '',
                      name: 'receipt.write.failed',
                      kind: 'INTERNAL',
                      start_time: Date.now() * 1_000_000,
                      end_time: Date.now() * 1_000_000,
                      status: { code: 'ERROR', message: String(receiptErr) },
                      attributes: { 'service.name': 'wpm', 'receipt.recovered': true, 'receipt.command': 'run' },
                    } as import('@wasm4pm/cognition').OtelSpan);
                  } catch { /* span emit must never throw */ }
                }
              }

              // Step 10: Write output file if specified
              // Discovery succeeded; a write failure is a sink error → partial_failure (4), not system_error (5).
              if (ctx.args.output) {
                // Security: restrict writes to paths within cwd.
                // Without this guard a user (or malicious config file) could write
                // to arbitrary locations: wpm run log.xes -o /etc/cron.d/pwned
                const resolvedOutput = path.resolve(ctx.args.output as string);
                const cwdForOutput = path.resolve(process.cwd());
                const relativeOutput = path.relative(cwdForOutput, resolvedOutput);
                if (relativeOutput.startsWith('..') || path.isAbsolute(relativeOutput)) {
                  const errResult = makeErrorResult(
                    'run',
                    new Error(
                      `Output path traversal denied: '${ctx.args.output}' resolves outside the working directory.\n\n` +
                        `  Use a relative path within the current project, e.g.:\n` +
                        `    wpm run log.xes -o results/output.json`
                    ),
                    EXIT_CODES.config_error,
                    'OUTPUT_PATH_TRAVERSAL_DENIED'
                  );
                  emitResult(errResult, emitOptions);
                  return await exitWithFlush(errResult.exit_code);
                }
                try {
                  const outputDir = path.dirname(resolvedOutput);
                  await fs.mkdir(outputDir, { recursive: true });
                  await fs.writeFile(resolvedOutput, JSON.stringify(payload, null, 2));
                } catch (error: unknown) {
                  const fsErr = error as NodeJS.ErrnoException;
                  let extraHint = `Check that the destination directory exists and is writable: chmod 755 ${path.dirname(ctx.args.output as string)}`;
                  if (fsErr?.code === 'EACCES' || fsErr?.code === 'EROFS') {
                    extraHint = `Permission denied (${fsErr.code}). If you are running in a container, please check volume mounts and permissions.`;
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

                if (format === 'csv') {
                  const summary = extractModelSummary(p.model) || {};
                  const nodesVal = summary['Nodes'] || summary['Places'] || '';
                  const edgesVal = summary['Edges'] || summary['Transitions'] || '';
                  const q = p.quality as { fitness?: number; precision?: number; simplicity?: number } | undefined;
                  const fitVal = q?.fitness != null ? q.fitness.toFixed(3) : '';
                  const precVal = q?.precision != null ? q.precision.toFixed(3) : '';
                  const simpVal = q?.simplicity != null ? q.simplicity.toFixed(3) : '';
                  projection.log('algorithm,input,elapsed_ms,nodes,edges,fitness,precision,simplicity');
                  projection.log(`${p.algorithm},${p.input},${p.elapsedMs},${nodesVal},${edgesVal},${fitVal},${precVal},${simpVal}`);
                  return;
                }

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

                // Cost-model drift alert (advisory)
                if (p.cost_drift) {
                  const d = p.cost_drift as {
                    actualMeanMs: number;
                    predictedMeanMs: number;
                    ewmaRatio: number;
                    trend: string;
                  };
                  projection.warn(
                    `⚠ Cost model stale for ${p.algorithm}: actual ${d.actualMeanMs.toFixed(1)}ms vs predicted ${d.predictedMeanMs.toFixed(1)}ms (EWMA ratio ${d.ewmaRatio.toFixed(2)}, ${d.trend}) — consider re-running benchmarks`
                  );
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

                // Look up algorithm quality/speed metadata from registry for richer output
                const registry = getRegistry();
                const algoMeta = registry.list().find((a) => a.id === p.algorithm);
                const qualityScore = algoMeta?.qualityTier;
                const speedScore = algoMeta?.speedTier;
                const algoLabel = qualityScore !== undefined
                  ? `${p.algorithm}  (quality score: ${qualityScore}/100, speed score: ${speedScore}/100)`
                  : p.algorithm;

                const etaStr =
                  (p.estimatedMs as number | undefined) && (p.estimatedMs as number) > 0
                    ? ` (~${Math.ceil((p.estimatedMs as number) / 1000)}s estimated)`
                    : '';
                projection.info(`Discovering with ${p.algorithm}${etaStr}...`);

                const timeStr = p.elapsedMs < 1000
                  ? `${p.elapsedMs.toFixed(1)}ms`
                  : `${(p.elapsedMs / 1000).toFixed(2)}s`;
                projection.success(`Discovery completed in ${timeStr}`);
                projection.info(`Algorithm:    ${algoLabel}`);
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
                  projection.log('  Event Log:');
                  if (logStatsData?.total_cases !== undefined) {
                    projection.log(`    Traces:   ${logStatsData.total_cases}`);
                  }
                  if (logStatsData?.total_events !== undefined) {
                    projection.log(`    Events:   ${logStatsData.total_events}`);
                  }
                  if (logStatsData?.unique_variants !== undefined) {
                    const variantRatio = logStatsData.total_cases
                      ? ((logStatsData.unique_variants / logStatsData.total_cases) * 100).toFixed(0)
                      : '?';
                    projection.log(`    Variants: ${logStatsData.unique_variants}  (${variantRatio}% of traces are unique)`);
                  }
                  if (summary && Object.keys(summary).length > 0) {
                    projection.log('');
                    projection.log('  Model:');
                    for (const [key, value] of Object.entries(summary)) {
                      projection.log(`    ${key.padEnd(12)}: ${value}`);
                    }
                  }
                }

                // Quality metrics
                if (p.quality) {
                  const q = p.quality as { fitness: number; precision: number; simplicity: number };
                  const fitnessStatus = q.fitness >= 0.85 ? '✓ excellent' : q.fitness >= 0.7 ? '~ acceptable' : '✗ low';
                  const precisionStatus = q.precision >= 0.8 ? '✓ good' : q.precision >= 0.5 ? '~ medium' : '✗ low';
                  projection.log('');
                  projection.log('  Quality (van der Aalst):');
                  projection.log(`    Fitness:    ${(q.fitness * 100).toFixed(1)}%  ${fitnessStatus}  (target ≥ 85%)`);
                  projection.log(`    Precision:  ${(q.precision * 100).toFixed(1)}%  ${precisionStatus}`);
                  projection.log(`    Simplicity: ${(q.simplicity * 100).toFixed(1)}%`);
                  if (q.fitness < 0.85) {
                    projection.log('');
                    projection.warn(`  Fitness ${(q.fitness * 100).toFixed(0)}% is below the 85% target.`);
                    projection.log(`  Try a higher-quality algorithm: wpm run -i ${path.basename(p.input)} --algorithm genetic_algorithm`);
                  }
                }

                // Quality hints — always shown in human mode after discovery (Task 5).
                // Provides actionable guidance regardless of --with-quality flag.
                {
                  const q = p.quality as { fitness?: number; precision?: number; simplicity?: number } | undefined;
                  const modelData = p.model as Record<string, unknown> | undefined;
                  const uniqueActivities: number = (() => {
                    if (!modelData) return 0;
                    if (Array.isArray(modelData['nodes'])) return (modelData['nodes'] as unknown[]).length;
                    if (Array.isArray(modelData['activities'])) return (modelData['activities'] as unknown[]).length;
                    return 0;
                  })();
                  const variantCount = (p.logStats as { unique_variants?: number } | undefined)?.unique_variants ?? 0;

                  const qualityHints: string[] = [];
                  if (q?.fitness !== undefined) {
                    if (q.fitness < 0.7) {
                      qualityHints.push(`Fitness: ${(q.fitness * 100).toFixed(1)}% (try --algorithm inductive_miner for higher fitness)`);
                    } else if (q.fitness < 0.85) {
                      qualityHints.push(`Fitness: ${(q.fitness * 100).toFixed(1)}% (borderline — consider --algorithm genetic_algorithm)`);
                    } else {
                      qualityHints.push(`Fitness: ${(q.fitness * 100).toFixed(1)}% (good)`);
                    }
                  }
                  if (uniqueActivities > 0) {
                    if (uniqueActivities > 30) {
                      qualityHints.push(`${uniqueActivities} unique activities detected (complex process — consider filtering rare paths)`);
                    } else {
                      qualityHints.push(`${uniqueActivities} unique activities detected`);
                    }
                  }
                  if (variantCount > 0) {
                    if (variantCount > 50) {
                      qualityHints.push(`${variantCount} variants (high diversity — consider --algorithm dfg for overview)`);
                    } else {
                      qualityHints.push(`${variantCount} variants`);
                    }
                  }

                  if (qualityHints.length > 0) {
                    projection.log('');
                    projection.log('  Quality hints:');
                    for (const hint of qualityHints) {
                      projection.log(`    • ${hint}`);
                    }
                  }
                }

                if (!p.quality && ctx.args['with-quality'] && p.model) {
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

                // Auto-insight: plain-English process characterisation
                const qInsight = p.quality as { fitness?: number; precision?: number } | undefined;
                const fit = qInsight?.fitness;
                const nodeCount = summary ? parseInt(summary['Nodes'] || summary['Places'] || '0') : 0;
                if (logStatsData && (fit !== undefined || nodeCount > 0)) {
                  let story = 'Insight: ';
                  if (fit !== undefined) {
                    if (fit >= 0.9) story += `Highly standardised process (fitness ${(fit * 100).toFixed(0)}% — most traces follow the main path). `;
                    else if (fit >= 0.7) story += `Semi-structured process (fitness ${(fit * 100).toFixed(0)}% — notable exceptions exist). `;
                    else story += `Unstructured "spaghetti" process (fitness ${(fit * 100).toFixed(0)}% — high variation, many exceptions). `;
                  } else {
                    story += `Discovered a process model with ${logStatsData.unique_variants || 'multiple'} execution variants. `;
                  }

                  const variantRatio = logStatsData.unique_variants && logStatsData.total_cases
                    ? logStatsData.unique_variants / logStatsData.total_cases
                    : 0;

                  if (nodeCount > 0) {
                    if (nodeCount > 30 || variantRatio > 0.5) story += `${nodeCount} structural nodes with high variant diversity — consider filtering infrequent paths.`;
                    else story += `${nodeCount} structural nodes — manageable complexity.`;
                  }

                  projection.log('');
                  projection.log(`  \x1b[36m${story}\x1b[0m`);
                }

                // First-run UX hints or --guide-next-steps
                if ((isFirstRunResult || ctx.args['guide-next-steps']) && format === 'human') {
                  const hints = formatFirstRunHints(
                    (p.quality as { fitness?: number } | undefined)?.fitness,
                    p.algorithm,
                    p.input,
                    savedPath
                  );
                  if (ctx.args['guide-next-steps']) {
                    projection.log('');
                    projection.log('🎯 Guided Next Steps:');
                  }
                  for (const hint of hints) {
                    if (ctx.args['guide-next-steps'] && hint === '🎯 Process Model Discovered') {
                      continue;
                    }
                    projection.log(hint);
                  }
                } else {
                  projection.log('');
                  projection.log('Next steps:');
                  projection.log(
                    `  wpm conformance -i ${path.basename(p.input)}                    -- measure fitness & precision`
                  );
                  projection.log(
                    `  wpm predict next-activity -i ${path.basename(p.input)}          -- predict what happens next`
                  );
                  projection.log(
                    `  wpm compare dfg,heuristic -i ${path.basename(p.input)}          -- compare algorithms`
                  );
                  projection.log('  wpm results                                              -- browse saved results');

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
          const rawMsg = error instanceof Error ? error.message : String(error);
          // Give actionable hints based on common failure patterns
          let actionableHint = '\n\nRun "wpm doctor" to check your environment.';
          if (rawMsg.toLowerCase().includes('xml') || rawMsg.toLowerCase().includes('parse') || rawMsg.toLowerCase().includes('xes')) {
            actionableHint =
              `\n\nThis looks like an event log parse error. Check that your file is valid XES:\n` +
              `  wpm validate ${finalAlgorithm ? '' : ''}your-log.xes\n\n` +
              `Common causes:\n` +
              `  • Malformed XML (missing closing tag, invalid characters)\n` +
              `  • Wrong file format (CSV or JSON passed as .xes)\n` +
              `  • Encoding issue (file must be UTF-8)\n\n` +
              `Run "wpm doctor" for a full environment check.`;
          } else if (rawMsg.toLowerCase().includes('memory') || rawMsg.toLowerCase().includes('heap')) {
            actionableHint =
              `\n\nOut of memory. For large logs, increase Node.js heap or use streaming mode:\n` +
              `  NODE_OPTIONS="--max-old-space-size=8192" wpm run <log.xes>\n` +
              `  wpm run <log.xes> --algorithm simd_streaming_dfg  -- lower memory usage`;
          } else if (rawMsg.toLowerCase().includes('wasm') || rawMsg.toLowerCase().includes('init')) {
            actionableHint = `\n\nWASM initialisation failed. Run "wpm doctor" to diagnose:\n  wpm doctor`;
          }
          const ctxInput = (ctx.args.input as string | undefined) ?? (ctx.args.file as string | undefined);
          const inputBasename = ctxInput ? path.basename(ctxInput) : '';
          const inputContext = inputBasename ? ` for '${inputBasename}'` : '';
          const algoContext = finalAlgorithm ? ` using '${finalAlgorithm}'` : '';
          const result = makeErrorResult(
            'run',
            new Error(
              `Discovery failed${inputContext}${algoContext}:\n  ${rawMsg}${actionableHint}`
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
  emitOptions: EmitOptions;
  format: 'json' | 'human' | 'csv';
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
  const { inputPath, emitOptions, ctx, format } = opts;

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

  // Load OCEL into WASM — wrapped in OTEL span for visibility in Jaeger
  let ocelHandle: string;
  try {
    ocelHandle = withWasmSpan(
      'ocel.load',
      { 'ocel.input': inputPath, 'service_name': 'wpm', 'status': 'ok' },
      () => wasm['load_ocel_from_json'](ocelContent) as string
    );
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

  // Surface flattening information loss for OCEL algorithms
  if (typeof wasm['measure_ocel_flattening_loss'] === 'function') {
    try {
      const lossRaw = (wasm['measure_ocel_flattening_loss'] as (h: string) => unknown)(ocelHandle);
      const lossData = typeof lossRaw === 'string' ? JSON.parse(lossRaw) : lossRaw;
      if (
        lossData !== null &&
        typeof lossData === 'object' &&
        Array.isArray((lossData as Record<string, unknown>)['flattening_loss'])
      ) {
        const highLoss = (
          (lossData as Record<string, unknown>)['flattening_loss'] as Array<Record<string, unknown>>
        ).filter(
          (r) =>
            typeof r['duplicate_event_ratio'] === 'number' &&
            (r['duplicate_event_ratio'] as number) > 0.05
        );
        if (highLoss.length > 0 && format === 'human') {
          process.stderr.write(
            `[flattening-loss] Warning: ${highLoss.length} object type(s) have >5% event duplication ratio when flattening to case-centric log\n`
          );
        }
      }
    } catch {
      /* non-fatal — flattening loss measurement is informational only */
    }
  }

  // Discover — default: per-type DFG (most informative for OCEL)
  // Each branch is wrapped in a 'wasm4pm.ocel.discover' span so Jaeger shows
  // the discovery step as a distinct child span under the parent 'run' span.
  const t0 = performance.now();
  let raw: unknown;
  let discoveryAlgo = 'ocel_dfg_per_type';

  try {
    if (typeof wasm['discover_ocel_dfg_per_type'] === 'function') {
      raw = withWasmSpan(
        'ocel.discover',
        { 'ocel.algorithm': 'ocel_dfg_per_type', 'service_name': 'wpm', 'status': 'ok' },
        () => wasm['discover_ocel_dfg_per_type'](ocelHandle)
      );
      discoveryAlgo = 'ocel_dfg_per_type';
    } else if (typeof wasm['discover_ocel_dfg'] === 'function') {
      raw = withWasmSpan(
        'ocel.discover',
        { 'ocel.algorithm': 'ocel_dfg', 'service_name': 'wpm', 'status': 'ok' },
        () => wasm['discover_ocel_dfg'](ocelHandle)
      );
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

    const inputBytes = await fs.readFile(inputPath);
    const receipt = {
      ...newReceipt('run'),
      input_hash: blake3Hex(inputBytes),
      input_file: inputPath,
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

  // Write output file if requested (OCEL path)
  if (ctx.args['output']) {
    // Security: same cwd-restriction as the XES output path above.
    const rawOcelOutput = String(ctx.args['output']);
    const resolvedOcelOutput = path.resolve(rawOcelOutput);
    const cwdForOcelOutput = path.resolve(process.cwd());
    const relativeOcelOutput = path.relative(cwdForOcelOutput, resolvedOcelOutput);
    if (relativeOcelOutput.startsWith('..') || path.isAbsolute(relativeOcelOutput)) {
      const errResult = makeErrorResult(
        'run',
        new Error(
          `Output path traversal denied: '${rawOcelOutput}' resolves outside the working directory.\n\n` +
            `  Use a relative path within the current project, e.g.:\n` +
            `    wpm run log.ocel.json -o results/output.json`
        ),
        EXIT_CODES.config_error,
        'OUTPUT_PATH_TRAVERSAL_DENIED'
      );
      emitResult(errResult, emitOptions);
      return exitFlush(errResult.exit_code);
    }
    try {
      const outputDir = path.dirname(resolvedOcelOutput);
      await fs.mkdir(outputDir, { recursive: true });
      await fs.writeFile(resolvedOcelOutput, JSON.stringify(payload, null, 2));
    } catch (writeError: unknown) {
      const fsWriteErr = writeError as NodeJS.ErrnoException;
      let extraHint = ``;
      if (fsWriteErr?.code === 'EACCES' || fsWriteErr?.code === 'EROFS') {
        extraHint = `\n\nPermission denied (${fsWriteErr.code}). If you are running in a container, please check volume mounts and permissions.`;
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
