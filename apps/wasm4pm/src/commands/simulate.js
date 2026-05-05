import { defineCommand } from 'citty';
import * as fs from 'fs/promises';
import { getFormatter, HumanFormatter, JSONFormatter } from '../output.js';
import { EXIT_CODES } from '../exit-codes.js';
import { WasmLoader } from '@wasm4pm/engine';
import { createQuietObservabilityLayer } from '../observability-util.js';
export const simulate = defineCommand({
    meta: {
        name: 'simulate',
        description: 'Monte Carlo simulation and process tree playout to generate synthetic traces',
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
        seed: {
            type: 'string',
            description: 'Random seed for reproducibility (default: random)',
        },
        'activity-key': {
            type: 'string',
            description: 'XES activity attribute key (default: concept:name)',
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
    },
    async run(ctx) {
        const formatter = getFormatter({
            format: ctx.args.format,
            verbose: ctx.args.verbose,
            quiet: ctx.args.quiet,
        });
        try {
            // Resolve input path (positional OR --file/-i)
            const inputPath = ctx.args.input || ctx.args.file;
            if (!inputPath) {
                formatter.error('Input file required.\n\nUsage:  wasm4pm simulate <log.xes>\n        wasm4pm simulate <log.xes> --cases 500\n\nRun "wasm4pm simulate --help" for details.');
                process.exit(EXIT_CODES.source_error);
            }
            // Validate input file exists
            try {
                await fs.access(inputPath);
            }
            catch {
                formatter.error(`Input file not found: ${inputPath}`);
                process.exit(EXIT_CODES.source_error);
            }
            const activityKey = ctx.args['activity-key'] || 'concept:name';
            const rawCases = ctx.args.cases;
            const parsedCases = rawCases != null ? parseInt(rawCases, 10) : undefined;
            if (parsedCases !== undefined && Number.isNaN(parsedCases)) {
                formatter.error('Invalid --cases value: must be a number');
                process.exit(EXIT_CODES.config_error);
            }
            const numCases = parsedCases ?? 100;
            const rawTime = ctx.args.time;
            const parsedTime = rawTime != null ? parseInt(rawTime, 10) : undefined;
            if (parsedTime !== undefined && Number.isNaN(parsedTime)) {
                formatter.error('Invalid --time value: must be a number');
                process.exit(EXIT_CODES.config_error);
            }
            const maxTime = parsedTime ?? 60000;
            const seed = ctx.args.seed ? parseInt(ctx.args.seed, 10) : Math.floor(Math.random() * 2147483647);
            if (formatter instanceof HumanFormatter) {
                formatter.info(`Monte Carlo simulation: ${inputPath}`);
                formatter.debug(`Cases: ${numCases}, Max time: ${maxTime}ms, Seed: ${seed}`);
            }
            // Load WASM module
            const loaderConfig = ctx.args.format === 'json' ? { observability: createQuietObservabilityLayer() } : {};
            const loader = WasmLoader.getInstance(loaderConfig);
            await loader.init();
            const wasm = loader.get();
            // Parse XES and load log
            if (formatter instanceof HumanFormatter) {
                formatter.debug('Loading event log from XES file...');
            }
            const xesContent = await fs.readFile(inputPath, 'utf-8');
            const logHandle = wasm.load_eventlog_from_xes(xesContent);
            // Discover process tree for simulation
            if (formatter instanceof HumanFormatter) {
                formatter.debug('Discovering process tree for simulation...');
            }
            const rawTree = wasm.discover_inductive_miner(logHandle, activityKey);
            const processTree = typeof rawTree === 'string' ? JSON.parse(rawTree) : rawTree;
            // Run Monte Carlo simulation
            if (formatter instanceof HumanFormatter) {
                formatter.debug('Running Monte Carlo simulation...');
            }
            const t0 = performance.now();
            const config = JSON.stringify({
                num_cases: numCases,
                inter_arrival_mean_ms: 1000.0,
                activity_service_time_ms: {},
                resource_capacity: {},
                simulation_time_ms: maxTime,
                random_seed: seed,
            });
            const rawSim = wasm.monte_carlo_simulation(logHandle, '', '', config);
            const elapsedMs = performance.now() - t0;
            const simResult = typeof rawSim === 'string' ? JSON.parse(rawSim) : rawSim;
            // Extract process tree playout results if available
            let playoutResult = null;
            try {
                const rawPlayout = wasm.simulate_process_tree_playout(logHandle, activityKey, numCases, seed);
                playoutResult = typeof rawPlayout === 'string' ? JSON.parse(rawPlayout) : rawPlayout;
            }
            catch {
                // Process tree playout not available
            }
            // Free log handle
            wasm.delete_object(logHandle);
            // Build result
            const result = {
                status: 'success',
                input: inputPath,
                activityKey,
                simulation: {
                    method: 'monte_carlo',
                    casesRequested: numCases,
                    casesCompleted: simResult.completed_cases ?? numCases,
                    elapsedMs: Math.round(elapsedMs * 100) / 100,
                    seed,
                },
                statistics: {
                    avgTraceLength: simResult.avg_trace_length ?? 0,
                    avgSojournTime: simResult.avg_sojourn_time ?? 0,
                    resourceUtilization: simResult.resource_utilization ?? 0,
                },
                traces: simResult.traces ?? [],
                ...(playoutResult && { playout: playoutResult }),
            };
            // Output results
            if (formatter instanceof JSONFormatter) {
                formatter.success('Simulation complete', result);
            }
            else {
                printHumanSimulation(formatter, result);
            }
            process.exit(EXIT_CODES.success);
        }
        catch (error) {
            if (formatter instanceof JSONFormatter) {
                formatter.error('Simulation failed', error);
            }
            else {
                formatter.error(`Simulation failed: ${error instanceof Error ? error.message : String(error)}`);
            }
            process.exit(EXIT_CODES.execution_error);
        }
    },
});
function printHumanSimulation(formatter, result) {
    const sim = result.simulation;
    const stats = result.statistics;
    formatter.log('');
    formatter.success(`Monte Carlo Simulation — ${result.input}`);
    formatter.log(`  Activity key: ${result.activityKey}`);
    formatter.log(`  Seed: ${sim.seed}`);
    formatter.log('');
    formatter.log('  Simulation:');
    formatter.log(`    Cases requested:  ${sim.casesRequested}`);
    formatter.log(`    Cases completed:  ${sim.casesCompleted}`);
    formatter.log(`    Elapsed time:     ${sim.elapsedMs}ms`);
    formatter.log('');
    formatter.log('  Statistics:');
    formatter.log(`    Avg trace length:    ${stats.avgTraceLength}`);
    formatter.log(`    Avg sojourn time:    ${stats.avgSojournTime}`);
    formatter.log(`    Resource utilization: ${(stats.resourceUtilization * 100).toFixed(1)}%`);
    formatter.log('');
    const traces = result.traces;
    if (traces.length > 0 && formatter instanceof HumanFormatter) {
        formatter.log('  Sample traces (first 5):');
        for (const trace of traces.slice(0, 5)) {
            const activities = trace.activities;
            formatter.log(`    ${activities.join(' → ')}`);
        }
        if (traces.length > 5) {
            formatter.log(`    ... and ${traces.length - 5} more traces`);
        }
        formatter.log('');
    }
}
//# sourceMappingURL=simulate.js.map