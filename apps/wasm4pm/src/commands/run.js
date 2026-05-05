import { defineCommand } from 'citty';
import * as fs from 'fs/promises';
import * as path from 'path';
import { resolveConfig as loadConfig } from '@wasm4pm/config';
import { WasmLoader } from '@wasm4pm/engine';
import { ALGORITHM_CLI_ALIASES } from '@wasm4pm/contracts';
import { getFormatter, HumanFormatter, JSONFormatter } from '../output.js';
import { EXIT_CODES } from '../exit-codes.js';
import { savePredictionResult } from './results.js';
import { executeMlTask } from '../ml-runner.js';
/** All algorithms supported by wasm4pm run, mapped to their WASM discovery functions. */
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
];
/**
 * Invoke the appropriate WASM discovery function for the given algorithm.
 * Reuses the dispatch table pattern from compare.ts.
 */
function runDiscovery(wasm, algo, logHandle, activityKey) {
    const t0 = performance.now();
    let raw;
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
            const _never = algo;
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
            description: 'Use smart execution engine with caching (shortcut for --algorithm smart-engine)',
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
            description: 'Compute and display quality metrics (fitness, precision, simplicity) after discovery',
        },
    },
    async run(ctx) {
        const formatter = getFormatter({
            format: ctx.args.format,
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
            }
            catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                formatter.error(`Config error: ${message}`);
                process.exit(EXIT_CODES.config_error);
            }
            // Step 2: Resolve algorithm (fixes operator-precedence bug: --algorithm flag was ignored)
            // Shortcut flags override --algorithm if both are provided
            const shortcutAlgo = ctx.args.simd
                ? 'simd-dfg'
                : ctx.args.hierarchical
                    ? 'hierarchical-dfg'
                    : ctx.args['smart-engine']
                        ? 'smart-engine'
                        : undefined;
            const rawAlgo = shortcutAlgo ??
                ctx.args.algorithm ??
                (config?.execution?.profile === 'quality'
                    ? 'heuristic'
                    : config?.execution?.profile === 'fast'
                        ? 'dfg'
                        : 'heuristic');
            // Accept kernel registry IDs (heuristic_miner) or CLI aliases (heuristic)
            const resolvedAlgo = ALGORITHM_CLI_ALIASES[rawAlgo] ??
                (() => {
                    const algoLower = rawAlgo.toLowerCase().replace(/[+_]/g, '-');
                    return ALGORITHMS.find((a) => a === algoLower || a === algoLower.replace(/-plus-plus/, '-'));
                })();
            if (!resolvedAlgo) {
                formatter.error(`Unknown algorithm: "${rawAlgo}"\nAvailable: ${Object.keys(ALGORITHM_CLI_ALIASES).join(', ')}`);
                process.exit(EXIT_CODES.source_error);
            }
            // Step 3: Resolve input path (positional OR --file/-i)
            const inputPath = ctx.args.input || ctx.args.file;
            if (!inputPath) {
                formatter.error('Input file required.\n\nUsage:  wasm4pm run <log.xes>\n        wasm4pm run <log.xes> --algorithm heuristic\n\nRun "wasm4pm --help" to see all commands.');
                process.exit(EXIT_CODES.source_error);
            }
            try {
                await fs.access(inputPath);
            }
            catch {
                formatter.error(`Input file not found: ${inputPath}\n\nCheck that the path is correct and the file is readable.`);
                process.exit(EXIT_CODES.source_error);
            }
            // Step 4: Load WASM module
            if (formatter instanceof HumanFormatter) {
                formatter.info(`Discovering process model with ${resolvedAlgo}...`);
            }
            const loader = WasmLoader.getInstance();
            await loader.init();
            const wasm = loader.get();
            // Step 4b: Handle --no-cache flag
            if (ctx.args['no-cache']) {
                if (typeof wasm.clear_all_caches !== 'function') {
                    formatter.error('Cache clearing requested (--no-cache) but not available in WASM module');
                    process.exit(EXIT_CODES.execution_error);
                }
                wasm.clear_all_caches();
                if (formatter instanceof HumanFormatter) {
                    formatter.debug('Caches cleared (--no-cache)');
                }
            }
            // Step 5: Parse XES and load log
            if (formatter instanceof HumanFormatter) {
                formatter.debug(`Loading event log from: ${inputPath}`);
            }
            const activityKey = ctx.args['activity-key'] || 'concept:name';
            const xesContent = await fs.readFile(inputPath, 'utf-8');
            const logHandle = wasm.load_eventlog_from_xes(xesContent);
            // Step 6: Execute discovery
            if (formatter instanceof HumanFormatter) {
                formatter.debug(`Running ${resolvedAlgo} discovery...`);
            }
            const { raw, elapsedMs } = runDiscovery(wasm, resolvedAlgo, logHandle, activityKey);
            // Step 6b: Run ML analysis if configured
            const mlResults = {};
            const mlConfig = config?.ml;
            if (mlConfig?.enabled && mlConfig.tasks && mlConfig.tasks.length > 0) {
                if (formatter instanceof HumanFormatter) {
                    formatter.info(`Running ML analysis (${mlConfig.tasks.length} tasks)...`);
                }
                for (const task of mlConfig.tasks) {
                    const mlResult = await executeMlTask(wasm, task, logHandle, activityKey, {
                        method: mlConfig.method,
                        k: mlConfig.k,
                        targetKey: mlConfig.targetKey,
                        forecastPeriods: mlConfig.forecastPeriods,
                        nComponents: mlConfig.nComponents,
                        eps: mlConfig.eps,
                    });
                    mlResults[task] = mlResult;
                }
                if (Object.keys(mlResults).length > 0 && formatter instanceof HumanFormatter) {
                    formatter.info(`ML analysis complete: ${Object.keys(mlResults).join(', ')}`);
                }
            }
            // Step 7: Quality metrics (before freeing handle)
            let qualityMetrics = null;
            if (ctx.args['with-quality']) {
                // Normalise result first to check model type
                const resultDataEarly = typeof raw === 'string' ? JSON.parse(raw) : raw;
                // Petri net algorithms return places/transitions/arcs as counts (numbers)
                // or arrays. DFG returns nodes/edges. Either form indicates a Petri net.
                const hasPetriNetFields = (typeof resultDataEarly?.places === 'number' || Array.isArray(resultDataEarly?.places)) ||
                    (typeof resultDataEarly?.transitions === 'number' || Array.isArray(resultDataEarly?.transitions)) ||
                    (typeof resultDataEarly?.arcs === 'number' || Array.isArray(resultDataEarly?.arcs));
                const isPetriNet = hasPetriNetFields;
                if (!isPetriNet) {
                    if (formatter instanceof HumanFormatter) {
                        formatter.warn(`Quality metrics require a Petri net model. Algorithm '${resolvedAlgo}' does not produce one.`);
                    }
                }
                else {
                    if (formatter instanceof HumanFormatter) {
                        formatter.info('Computing quality metrics...');
                    }
                    try {
                        const modelHandle = resultDataEarly?.handle;
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
                            }
                            catch {
                                // etconformance may fail for certain model types; use default
                            }
                        }
                        // Simplicity via WASM compute_simplicity(places, transitions, arcs)
                        let simplicity = 1.0;
                        const numPlaces = typeof resultDataEarly?.places === 'number'
                            ? resultDataEarly.places
                            : resultDataEarly?.places?.length ?? 0;
                        const numTransitions = typeof resultDataEarly?.transitions === 'number'
                            ? resultDataEarly.transitions
                            : resultDataEarly?.transitions?.length ?? 0;
                        const numArcs = typeof resultDataEarly?.arcs === 'number'
                            ? resultDataEarly.arcs
                            : resultDataEarly?.arcs?.length ?? 0;
                        if (typeof wasm.wasm_compute_simplicity === 'function' && (numPlaces + numTransitions + numArcs) > 0) {
                            simplicity = wasm.wasm_compute_simplicity(numPlaces, numTransitions, numArcs);
                        }
                        else {
                            // Fallback heuristic when WASM function unavailable or model lacks Petri net structure
                            const numEdges = Array.isArray(resultDataEarly?.edges)
                                ? resultDataEarly.edges.length
                                : numArcs;
                            simplicity = 1.0 / (1.0 + numEdges / 10.0);
                        }
                        qualityMetrics = { fitness, precision, simplicity };
                    }
                    catch (qualityError) {
                        if (formatter instanceof HumanFormatter) {
                            formatter.warn(`Quality metrics computation failed: ${qualityError instanceof Error ? qualityError.message : String(qualityError)}`);
                        }
                    }
                }
            }
            // Step 8: Free handle
            wasm.delete_object(logHandle);
            // Normalise result (WASM may return string or object)
            const resultData = typeof raw === 'string' ? JSON.parse(raw) : raw;
            // Step 9: Build output
            const result = {
                status: 'success',
                algorithm: resolvedAlgo,
                activityKey,
                input: inputPath,
                elapsedMs: Math.round(elapsedMs * 100) / 100,
                model: resultData,
                ...(Object.keys(mlResults).length > 0 && { ml: mlResults }),
                ...(qualityMetrics && { quality: qualityMetrics }),
            };
            // Step 9: Auto-save result to .wasm4pm/results/ (unless --no-save)
            if (!ctx.args['no-save']) {
                const savedPath = await savePredictionResult(`discover-${resolvedAlgo}`, inputPath, activityKey, result);
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
                }
                catch (error) {
                    const message = error instanceof Error ? error.message : String(error);
                    formatter.error(`Output error: ${message}`);
                    process.exit(EXIT_CODES.system_error);
                }
            }
            // Step 11: Format and output results
            if (formatter instanceof JSONFormatter) {
                formatter.success('Discovery completed', result);
            }
            else {
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
                // Display quality metrics if computed
                if (qualityMetrics) {
                    formatter.log('');
                    formatter.info('Quality Metrics (van der Aalst):');
                    formatter.info(`  Fitness:    ${(qualityMetrics.fitness * 100).toFixed(1)}%`);
                    formatter.info(`  Precision:  ${(qualityMetrics.precision * 100).toFixed(1)}%`);
                    formatter.info(`  Simplicity: ${(qualityMetrics.simplicity * 100).toFixed(1)}%`);
                }
                formatter.log('');
                formatter.log('  Run "wasm4pm results" to view saved results.');
                formatter.log('  Run "wasm4pm compare dfg,heuristic -i ' +
                    path.basename(inputPath) +
                    '" to compare algorithms.');
            }
            // Step 12: Print cache statistics if requested
            if (ctx.args['cache-stats']) {
                if (typeof wasm.get_cache_stats !== 'function') {
                    formatter.error('Cache statistics requested (--cache-stats) but not available in WASM module');
                    process.exit(EXIT_CODES.execution_error);
                }
                const statsRaw = wasm.get_cache_stats();
                const stats = typeof statsRaw === 'string' ? JSON.parse(statsRaw) : statsRaw;
                if (formatter instanceof JSONFormatter) {
                    formatter.success('Cache statistics', { cache: stats });
                }
                else if (formatter instanceof HumanFormatter) {
                    const hitRate = stats.parse_hits + stats.parse_misses > 0
                        ? ((stats.parse_hits / (stats.parse_hits + stats.parse_misses)) * 100).toFixed(1)
                        : 'N/A';
                    formatter.info('Cache statistics:');
                    formatter.info(`  Parse hits: ${stats.parse_hits}`);
                    formatter.info(`  Parse misses: ${stats.parse_misses}`);
                    formatter.info(`  Hit rate: ${hitRate}%`);
                    formatter.info(`  Columnar entries: ${stats.columnar_entries}`);
                    formatter.info(`  Interner entries: ${stats.interner_entries}`);
                }
            }
            process.exit(EXIT_CODES.success);
        }
        catch (error) {
            if (formatter instanceof JSONFormatter) {
                formatter.error('Discovery failed', error);
            }
            else {
                formatter.error(`Discovery failed: ${error instanceof Error ? error.message : String(error)}\n\nRun "wasm4pm doctor" to check your environment.`);
            }
            process.exit(EXIT_CODES.execution_error);
        }
    },
});
/**
 * Extract a brief summary from a discovery result.
 */
function extractModelSummary(data) {
    if (!data || typeof data !== 'object')
        return null;
    const summary = {};
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
//# sourceMappingURL=run.js.map