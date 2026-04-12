import { defineCommand } from 'citty';
import * as fs from 'fs/promises';
import { getFormatter, HumanFormatter, JSONFormatter } from '../output.js';
import { EXIT_CODES } from '../exit-codes.js';
import type { OutputOptions } from '../output.js';
import { WasmLoader } from '@pictl/engine';
import { createQuietObservabilityLayer } from '../observability-util.js';

export interface SocialOptions extends OutputOptions {
  input?: string;
  metric?: 'handover' | 'working-together' | 'similar-task';
  resourceKey?: string;
  activityKey?: string;
}

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
      format: ctx.args.format as 'human' | 'json',
      verbose: ctx.args.verbose,
      quiet: ctx.args.quiet,
    });

    try {
      // Resolve input path (positional OR --file/-i)
      const inputPath: string | undefined =
        (ctx.args.input as string | undefined) || (ctx.args.file as string | undefined);

      if (!inputPath) {
        formatter.error(
          'Input file required.\n\nUsage:  pictl social <log.xes>\n        pictl social <log.xes> --metric working-together\n\nRun "pictl social --help" for details.'
        );
        process.exit(EXIT_CODES.source_error);
      }

      // Validate input file exists
      try {
        await fs.access(inputPath);
      } catch {
        formatter.error(`Input file not found: ${inputPath}`);
        process.exit(EXIT_CODES.source_error);
      }

      const activityKey = (ctx.args['activity-key'] as string) || 'concept:name';
      const resourceKey = (ctx.args['resource-key'] as string) || 'org:resource';
      const metric = (ctx.args.metric as string) || 'handover';

      if (!['handover', 'working-together', 'similar-task'].includes(metric)) {
        formatter.error(
          `Invalid metric: ${metric}. Must be one of: handover, working-together, similar-task`
        );
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
      const logHandle: string = wasm.load_eventlog_from_xes(xesContent);

      // Mine social network based on metric
      let rawNetwork: unknown;
      if (formatter instanceof HumanFormatter) {
        formatter.debug(`Mining ${metric} social network...`);
      }

      switch (metric) {
        case 'handover':
          rawNetwork = wasm.mine_social_network_handover(logHandle, activityKey, resourceKey);
          break;
        case 'working-together':
          rawNetwork = wasm.mine_social_network_working_together(logHandle, activityKey, resourceKey);
          break;
        case 'similar-task':
          rawNetwork = wasm.mine_social_network_similar_task(logHandle, activityKey, resourceKey);
          break;
        default:
          throw new Error(`Unknown metric: ${metric}`);
      }

      const network = typeof rawNetwork === 'string' ? JSON.parse(rawNetwork) : rawNetwork;

      // Compute centrality metrics
      let centrality: Record<string, unknown> | null = null;
      try {
        const rawCentrality = wasm.compute_network_centrality(logHandle, activityKey, resourceKey);
        centrality = typeof rawCentrality === 'string' ? JSON.parse(rawCentrality) : rawCentrality;
      } catch {
        // Centrality not available
      }

      // Free log handle
      try {
        wasm.delete_object(logHandle);
      } catch {
        /* best-effort */
      }

      // Build result
      const result = {
        status: 'success',
        input: inputPath,
        activityKey,
        resourceKey,
        metric,
        network: {
          nodes: (network as Record<string, unknown>).nodes ?? [],
          edges: (network as Record<string, unknown>).edges ?? [],
        },
        centrality,
      };

      // Output results
      if (formatter instanceof JSONFormatter) {
        formatter.success('Social network mining complete', result);
      } else {
        printHumanSocial(formatter as HumanFormatter, result);
      }

      process.exit(EXIT_CODES.success);
    } catch (error) {
      if (formatter instanceof JSONFormatter) {
        formatter.error('Social network mining failed', error);
      } else {
        formatter.error(
          `Social network mining failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
      process.exit(EXIT_CODES.execution_error);
    }
  },
});

function printHumanSocial(formatter: HumanFormatter, result: Record<string, unknown>): void {
  const network = result.network as Record<string, unknown>;
  const centrality = result.centrality as Record<string, unknown> | null;
  const metric = result.metric as string;

  formatter.log('');
  formatter.success(`Social Network Mining — ${result.input as string}`);
  formatter.log(`  Activity key: ${result.activityKey as string}`);
  formatter.log(`  Resource key: ${result.resourceKey as string}`);
  formatter.log(`  Metric: ${metric}`);
  formatter.log('');

  const nodes = network.nodes as Array<{ id: string; label?: string }>;
  const edges = network.edges as Array<{ from: string; to: string; weight?: number }>;

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
    const centralityScores = centrality.scores as Record<string, number>;
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
