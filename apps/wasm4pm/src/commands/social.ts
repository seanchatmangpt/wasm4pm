import { defineCommand } from 'citty';
import * as fs from 'fs/promises';
import { emitResult, makeResult, makeErrorResult } from '../output.js';
import { EXIT_CODES } from '../exit-codes.js';
import { withLogSession } from '../with-log-session.js';
import { withSpan } from './_otel.js';
import { saveCommandReceipt, blake3Hex, newReceipt, type CommandReceipt } from '../receipts/_shared.js';
import { exitWithFlush } from '../otel/exit.js';

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
      description: 'Social network metric: handover, working-together, centrality, clustering, or community',
      default: 'handover',
    },
    'centrality-type': {
      type: 'string',
      description: 'When metric=centrality: degree, betweenness, closeness, or all (default: all)',
      default: 'all',
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
      description: 'Output format: human, json, graphml, or csv (default: human)',
      default: 'human',
    },
    'min-interactions': {
      type: 'string',
      description: 'Filter edges with weight below this threshold (default: 0)',
      default: '0',
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
    'no-save': {
      type: 'boolean',
      description: 'Skip auto-save and BLAKE3 receipt',
    },
  },
  async run(ctx) {
    const t0 = performance.now();
    const format = (ctx.args.format as 'json' | 'human' | 'graphml' | 'csv') ?? 'human';
    const verbose = Boolean(ctx.args.verbose);
    const quiet = Boolean(ctx.args.quiet);

    return withSpan(
      'social',
      {
        metric: String(ctx.args.metric ?? ''),
        input: String(ctx.args.input ?? ctx.args.file ?? ''),
        activity_key: String(ctx.args['activity-key'] ?? ''),
        resource_key: String(ctx.args['resource-key'] ?? ''),
        format,
      },
      async () => {
    try {
      // Resolve input path (positional OR --file/-i)
      const inputPath: string | undefined =
        (ctx.args.input as string | undefined) || (ctx.args.file as string | undefined);

      if (!inputPath) {
        const result = makeErrorResult(
          'social',
          'Input file required.\n\nUsage:  wpm social <log.xes>\n        wpm social <log.xes> --metric working-together\n\nRun "wpm social --help" for details.',
          EXIT_CODES.source_error,
          'MISSING_INPUT'
        );
        emitResult(result, { format: 'json', verbose, quiet });
        return await exitWithFlush(result.exit_code);
      }

      const activityKey = (ctx.args['activity-key'] as string) || 'concept:name';
      const resourceKey = (ctx.args['resource-key'] as string) || 'org:resource';
      const metric = (ctx.args.metric as string) || 'handover';
      const centralityType = (ctx.args['centrality-type'] as string) || 'all';
      const minInteractions = Math.max(0, Number(ctx.args['min-interactions']) || 0);

      const validMetrics = ['handover', 'working-together', 'similar-task', 'centrality', 'clustering', 'community'];
      const validFormats = ['human', 'json', 'graphml', 'csv'];
      const validCentralityTypes = ['degree', 'betweenness', 'closeness', 'all'];

      if (!validMetrics.includes(metric)) {
        const result = makeErrorResult(
          'social',
          `Invalid metric: ${metric}. Must be one of: ${validMetrics.join(', ')}`,
          EXIT_CODES.source_error,
          'INVALID_METRIC'
        );
        emitResult(result, { format: 'json', verbose, quiet });
        return await exitWithFlush(result.exit_code);
      }

      if (!validFormats.includes(format)) {
        const result = makeErrorResult(
          'social',
          `Invalid format: ${format}. Must be one of: ${validFormats.join(', ')}`,
          EXIT_CODES.source_error,
          'INVALID_FORMAT'
        );
        emitResult(result, { format: 'json', verbose, quiet });
        return await exitWithFlush(result.exit_code);
      }

      if (metric === 'centrality' && !validCentralityTypes.includes(centralityType)) {
        const result = makeErrorResult(
          'social',
          `Invalid centrality-type: ${centralityType}. Must be one of: ${validCentralityTypes.join(', ')}`,
          EXIT_CODES.source_error,
          'INVALID_CENTRALITY_TYPE'
        );
        emitResult(result, { format: 'json', verbose, quiet });
        return await exitWithFlush(result.exit_code);
      }

      // Coerce format for emitResult (which only accepts specific types)
      const emitFormat = (format === 'graphml' || format === 'csv') ? 'json' : (format as 'json' | 'human');

      await withLogSession(
        { inputPath, activityKey, commandName: 'social', emitOptions: { format: emitFormat, verbose, quiet } },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (wasmBase, logHandle) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const wasm = wasmBase as Record<string, any>;

        let rawNetwork: unknown;
        let similarTaskWarning = false;
        let metrics: Record<string, unknown> = {};

        switch (metric) {
          case 'handover':
            rawNetwork = wasm.discover_handover_network(logHandle, resourceKey);
            break;
          case 'working-together':
            rawNetwork = wasm.discover_working_together_network(logHandle, resourceKey);
            break;
          case 'centrality': {
            try {
              const rawMetrics = wasm.compute_network_metrics(logHandle, resourceKey);
              metrics = typeof rawMetrics === 'string' ? JSON.parse(rawMetrics) : rawMetrics;
              // For centrality output, use working-together network as base
              rawNetwork = wasm.discover_working_together_network(logHandle, resourceKey);
            } catch (e) {
              throw new Error(`Failed to compute centrality metrics: ${e}`);
            }
            break;
          }
          case 'clustering': {
            try {
              const rawMetrics = wasm.compute_clustering_coefficient(logHandle, resourceKey);
              metrics = typeof rawMetrics === 'string' ? JSON.parse(rawMetrics) : rawMetrics;
              rawNetwork = wasm.discover_working_together_network(logHandle, resourceKey);
            } catch (e) {
              throw new Error(`Failed to compute clustering metrics: ${e}`);
            }
            break;
          }
          case 'community': {
            try {
              const rawCommunities = wasm.detect_communities(logHandle, resourceKey);
              metrics = typeof rawCommunities === 'string' ? JSON.parse(rawCommunities) : rawCommunities;
              rawNetwork = wasm.discover_working_together_network(logHandle, resourceKey);
            } catch (e) {
              throw new Error(`Failed to detect communities: ${e}`);
            }
            break;
          }
          case 'similar-task':
            rawNetwork = { nodes: [], edges: [] };
            similarTaskWarning = true;
            break;
          default:
            throw new Error(`Unknown metric: ${metric}`);
        }

        const network = typeof rawNetwork === 'string' ? JSON.parse(rawNetwork) : rawNetwork;

        // Filter edges by minimum interactions
        const filteredNetwork = {
          nodes: network.nodes,
          edges: (network.edges as Array<{ from: string; to: string; weight?: number }>)
            .filter((e) => (e.weight ?? 1) >= minInteractions),
        };

        const payload = {
          input: inputPath,
          activityKey,
          resourceKey,
          metric,
          centralityType: metric === 'centrality' ? centralityType : undefined,
          minInteractions,
          similarTaskWarning,
          network: {
            nodes: (filteredNetwork.nodes ?? []) as Array<{ id: string; label?: string }>,
            edges: (filteredNetwork.edges ?? []) as Array<{ from: string; to: string; weight?: number }>,
          },
          metrics: Object.keys(metrics).length > 0 ? metrics : undefined,
        };

        // Format output based on requested format
        let formattedOutput: string | undefined;
        if (format === 'graphml') {
          formattedOutput = networkToGraphML(filteredNetwork);
        } else if (format === 'csv') {
          formattedOutput = networkToCSV(filteredNetwork);
        }

        const result = makeResult('social', payload, performance.now() - t0, EXIT_CODES.success);

        // Handle special output formats
        if (format === 'graphml' || format === 'csv') {
          if (!quiet && formattedOutput) {
            console.log(formattedOutput);
          }
        } else {
          const resultFormat = 'human' as const;
          emitResult(result, { format: resultFormat, verbose, quiet }, (res, projection) => {
            printHumanSocial(projection, res.payload as typeof payload);
          });
        }

        if (!ctx.args['no-save']) {
          try {
            const inputBytes = await fs.readFile(inputPath!).catch(() => Buffer.from(inputPath!));
            const receipt: CommandReceipt = {
              ...newReceipt('social'),
              command: 'social',
              input_hash: blake3Hex(inputBytes),
              output_hash: blake3Hex(JSON.stringify(payload)),
              status: 'success',
              summary: {
                metric,
                resources_count: payload.network.nodes.length,
                edges_count: payload.network.edges.length,
              },
            };
            saveCommandReceipt(receipt);
          } catch {
            /* receipt write must never break the command */
          }
        }

        return await exitWithFlush(result.exit_code);
      });  // end withLogSession
    } catch (error) {
      const result = makeErrorResult('social', error, EXIT_CODES.execution_error);
      const emitFormat = (format === 'graphml' || format === 'csv') ? 'json' : (format as 'json' | 'human');
      emitResult(result, { format: emitFormat, verbose, quiet });
      return await exitWithFlush(result.exit_code);
    }
      },
    );
  },
});

function networkToGraphML(network: { nodes: Array<{ id: string; label?: string }>; edges: Array<{ from: string; to: string; weight?: number }> }): string {
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<graphml xmlns="http://graphml.graphdrawing.org/xmlns">\n';
  xml += '  <key id="weight" for="edge" attr.name="weight" attr.type="long"/>\n';
  xml += '  <graph edgedefault="undirected">\n';

  for (const node of network.nodes) {
    xml += `    <node id="${escapeXml(node.id)}"`;
    if (node.label) {
      xml += ` label="${escapeXml(node.label)}"`;
    }
    xml += '/>\n';
  }

  for (const edge of network.edges) {
    xml += `    <edge source="${escapeXml(edge.from)}" target="${escapeXml(edge.to)}">\n`;
    xml += `      <data key="weight">${edge.weight ?? 1}</data>\n`;
    xml += '    </edge>\n';
  }

  xml += '  </graph>\n</graphml>\n';
  return xml;
}

function networkToCSV(network: { nodes: Array<{ id: string; label?: string }>; edges: Array<{ from: string; to: string; weight?: number }> }): string {
  let csv = 'from,to,weight\n';
  for (const edge of network.edges) {
    csv += `${edge.from},${edge.to},${edge.weight ?? 1}\n`;
  }
  return csv;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function printHumanSocial(
  projection: import('../output.js').ConsoleProjection,
  payload: {
    input: string;
    activityKey: string;
    resourceKey: string;
    metric: string;
    centralityType?: string;
    minInteractions: number;
    similarTaskWarning: boolean;
    network: { nodes: Array<{ id: string; label?: string }>; edges: Array<{ from: string; to: string; weight?: number }> };
    metrics?: Record<string, unknown>;
  }
): void {
  const { network, metrics, metric } = payload;

  projection.log('');
  projection.success(`Social Network Mining — ${payload.input}`);
  projection.log(`  Activity key: ${payload.activityKey}`);
  projection.log(`  Resource key: ${payload.resourceKey}`);
  projection.log(`  Metric: ${metric}`);
  projection.log('');

  if (payload.similarTaskWarning) {
    projection.warn('Similar-task metric not available in current WASM build');
  }

  projection.log(`  Network statistics:`);
  projection.log(`    Nodes (resources): ${network.nodes.length}`);
  projection.log(`    Edges (interactions): ${network.edges.length}`);
  projection.log('');

  if (network.edges.length > 0) {
    const sortedEdges = [...network.edges].sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0));
    projection.log(`  Top interactions (by ${metric}):`);
    for (const edge of sortedEdges.slice(0, 10)) {
      const weight = edge.weight ?? 1;
      projection.log(`    ${edge.from} ↔ ${edge.to}: ${weight}`);
    }
    if (sortedEdges.length > 10) {
      projection.log(`    ... and ${sortedEdges.length - 10} more interactions`);
    }
    projection.log('');
  }

  // Display metrics if computed
  if (metrics) {
    if (metric === 'centrality') {
      const metricsObj = metrics as { degree?: Record<string, number>; betweenness?: Record<string, number>; closeness?: Record<string, number> };

      // Show requested centrality type(s)
      const typesToShow = payload.centralityType === 'all'
        ? ['degree', 'betweenness', 'closeness']
        : [payload.centralityType];

      for (const type of typesToShow) {
        const scores = metricsObj[type as keyof typeof metricsObj] as Record<string, number> | undefined;
        if (scores) {
          const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
          const maxScore = sorted[0]?.[1] ?? 1;
          const typeStr = (type ?? 'unknown').charAt(0).toUpperCase() + (type ?? '').slice(1);
          projection.log(`  ${typeStr} centrality — bar shows score relative to top:`.trim());
          for (const [resource, score] of sorted.slice(0, 10)) {
            const ratio = Math.min(1, score / Math.max(maxScore, 0.0001));
            const filled = Math.round(ratio * 8);
            const bar = '▓'.repeat(filled) + '░'.repeat(8 - filled);
            const label = resource === sorted[0]?.[0] ? '  <- highest' : '';
            projection.log(`    ${bar} ${resource}: ${score.toFixed(3)}${label}`);
          }
          if (sorted.length > 10) {
            projection.log(`    ... and ${sorted.length - 10} more resources`);
          }
          projection.log('');
        }
      }
    } else if (metric === 'clustering') {
      const clusterObj = metrics as { global?: number; local?: Record<string, number> };
      if (clusterObj.global !== undefined) {
        projection.log(`  Global clustering coefficient: ${clusterObj.global.toFixed(3)}`);
        projection.log('    (Measure of how tightly connected resource groups are)');
      }
      if (clusterObj.local) {
        const sorted = Object.entries(clusterObj.local).sort((a, b) => b[1] - a[1]);
        if (sorted.length > 0) {
          projection.log('  Local clustering coefficient by resource (top 10):');
          for (const [resource, coeff] of sorted.slice(0, 10)) {
            const filled = Math.round(coeff * 8);
            const bar = '▓'.repeat(filled) + '░'.repeat(8 - filled);
            projection.log(`    ${bar} ${resource}: ${coeff.toFixed(3)}`);
          }
          if (sorted.length > 10) {
            projection.log(`    ... and ${sorted.length - 10} more resources`);
          }
        }
      }
      projection.log('');
    } else if (metric === 'community') {
      const communities = metrics as Record<string, number>;
      if (Object.keys(communities).length > 0) {
        // Group resources by community
        const byComm: Record<number, string[]> = {};
        for (const [resource, commId] of Object.entries(communities)) {
          if (!byComm[commId]) {
            byComm[commId] = [];
          }
          byComm[commId].push(resource);
        }

        const numCommunities = Object.keys(byComm).length;
        projection.log(`  Detected ${numCommunities} communities:`);
        for (const [commId, resources] of Object.entries(byComm).sort((a, b) => Number(a[0]) - Number(b[0]))) {
          projection.log(`    Community ${commId}: ${resources.join(', ')}`);
        }
        projection.log('');
      }
    }
  }

  if (payload.minInteractions > 0) {
    projection.log(`  (Filtered to interactions with weight ≥ ${payload.minInteractions})`);
    projection.log('');
  }
}
