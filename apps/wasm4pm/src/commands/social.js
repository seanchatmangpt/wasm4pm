import { defineCommand } from 'citty';
import * as fs from 'fs/promises';
import { getFormatter, HumanFormatter, JSONFormatter } from '../output.js';
import { EXIT_CODES } from '../exit-codes.js';
import { WasmLoader } from '@wasm4pm/engine';
import { createQuietObservabilityLayer } from '../observability-util.js';
export const social = defineCommand({
    meta: {
        name: 'social',
        description: 'Mine social networks from event logs (handover, working together, similar tasks)',
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
        metric: {
            type: 'string',
            description: 'Social network metric: handover (default), working-together, or similar-task',
            default: 'handover',
        },
        'resource-key': {
            type: 'string',
            description: 'XES resource attribute key (default: org:resource)',
            default: 'org:resource',
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
                formatter.error('Input file required.\n\nUsage:  wasm4pm social <log.xes>\n        wasm4pm social <log.xes> --metric working-together\n\nRun "wasm4pm social --help" for details.');
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
            const resourceKey = ctx.args['resource-key'] || 'org:resource';
            const metric = ctx.args.metric || 'handover';
            if (!['handover', 'working-together', 'similar-task'].includes(metric)) {
                formatter.error(`Invalid metric: ${metric}. Must be one of: handover, working-together, similar-task`);
                process.exit(EXIT_CODES.config_error);
            }
            if (formatter instanceof HumanFormatter) {
                formatter.info(`Social network mining: ${inputPath}`);
                formatter.debug(`Metric: ${metric}, Resource key: ${resourceKey}`);
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
            // Mine social network based on metric
            let rawNetwork;
            if (formatter instanceof HumanFormatter) {
                formatter.debug(`Mining ${metric} social network...`);
            }
            switch (metric) {
                case 'handover':
                    rawNetwork = wasm.discover_handover_network(logHandle, resourceKey);
                    break;
                case 'working-together':
                    rawNetwork = wasm.discover_working_together_network(logHandle, resourceKey);
                    break;
                case 'similar-task':
                    // No similar_task equivalent exists — return empty network
                    rawNetwork = { nodes: [], edges: [] };
                    if (formatter instanceof HumanFormatter) {
                        formatter.warn('Similar-task metric not available in current WASM build');
                    }
                    break;
                default:
                    throw new Error(`Unknown metric: ${metric}`);
            }
            const network = typeof rawNetwork === 'string' ? JSON.parse(rawNetwork) : rawNetwork;
            // Compute centrality metrics
            let centrality = null;
            try {
                const rawCentrality = wasm.compute_network_centrality(logHandle, activityKey, resourceKey);
                centrality = typeof rawCentrality === 'string' ? JSON.parse(rawCentrality) : rawCentrality;
            }
            catch {
                // Centrality not available
            }
            // Free log handle
            wasm.delete_object(logHandle);
            // Build result
            const result = {
                status: 'success',
                input: inputPath,
                activityKey,
                resourceKey,
                metric,
                network: {
                    nodes: network.nodes ?? [],
                    edges: network.edges ?? [],
                },
                centrality,
            };
            // Output results
            if (formatter instanceof JSONFormatter) {
                formatter.success('Social network mining complete', result);
            }
            else {
                printHumanSocial(formatter, result);
            }
            process.exit(EXIT_CODES.success);
        }
        catch (error) {
            if (formatter instanceof JSONFormatter) {
                formatter.error('Social network mining failed', error);
            }
            else {
                formatter.error(`Social network mining failed: ${error instanceof Error ? error.message : String(error)}`);
            }
            process.exit(EXIT_CODES.execution_error);
        }
    },
});
function printHumanSocial(formatter, result) {
    const network = result.network;
    const centrality = result.centrality;
    const metric = result.metric;
    formatter.log('');
    formatter.success(`Social Network Mining — ${result.input}`);
    formatter.log(`  Activity key: ${result.activityKey}`);
    formatter.log(`  Resource key: ${result.resourceKey}`);
    formatter.log(`  Metric: ${metric}`);
    formatter.log('');
    const nodes = network.nodes;
    const edges = network.edges;
    formatter.log(`  Network statistics:`);
    formatter.log(`    Nodes (resources): ${nodes.length}`);
    formatter.log(`    Edges (interactions): ${edges.length}`);
    formatter.log('');
    if (edges.length > 0) {
        const sortedEdges = [...edges].sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0));
        formatter.log(`  Top interactions (by ${metric}):`);
        for (const edge of sortedEdges.slice(0, 10)) {
            const weight = edge.weight ?? 1;
            formatter.log(`    ${edge.from} ↔ ${edge.to}: ${weight}`);
        }
        if (sortedEdges.length > 10) {
            formatter.log(`    ... and ${sortedEdges.length - 10} more interactions`);
        }
        formatter.log('');
    }
    if (centrality) {
        const centralityScores = centrality.scores;
        if (centralityScores) {
            const sorted = Object.entries(centralityScores).sort((a, b) => b[1] - a[1]);
            formatter.log('  Centrality scores (top 10):');
            for (const [resource, score] of sorted.slice(0, 10)) {
                formatter.log(`    ${resource}: ${score.toFixed(3)}`);
            }
            if (sorted.length > 10) {
                formatter.log(`    ... and ${sorted.length - 10} more resources`);
            }
            formatter.log('');
        }
    }
}
//# sourceMappingURL=social.js.map