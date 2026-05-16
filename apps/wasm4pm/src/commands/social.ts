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
    'no-save': {
      type: 'boolean',
      description: 'Skip auto-save and BLAKE3 receipt',
    },
  },
  async run(ctx) {
    const t0 = performance.now();
    const format = (ctx.args.format as 'json' | 'human') ?? 'human';
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
        emitResult(result, { format, verbose, quiet });
        return await exitWithFlush(result.exit_code);
      }

      const activityKey = (ctx.args['activity-key'] as string) || 'concept:name';
      const resourceKey = (ctx.args['resource-key'] as string) || 'org:resource';
      const metric = (ctx.args.metric as string) || 'handover';

      if (!['handover', 'working-together', 'similar-task'].includes(metric)) {
        const result = makeErrorResult(
          'social',
          `Invalid metric: ${metric}. Must be one of: handover, working-together, similar-task`,
          EXIT_CODES.source_error,
          'INVALID_METRIC'
        );
        emitResult(result, { format, verbose, quiet });
        return await exitWithFlush(result.exit_code);
      }

      await withLogSession(
        { inputPath, activityKey, commandName: 'social', emitOptions: { format, verbose, quiet } },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (wasmBase, logHandle) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const wasm = wasmBase as Record<string, any>;

        let rawNetwork: unknown;
        let similarTaskWarning = false;
        switch (metric) {
          case 'handover':
            rawNetwork = wasm.discover_handover_network(logHandle, resourceKey);
            break;
          case 'working-together':
            rawNetwork = wasm.discover_working_together_network(logHandle, resourceKey);
            break;
          case 'similar-task':
            rawNetwork = { nodes: [], edges: [] };
            similarTaskWarning = true;
            break;
          default: {
            // metric was validated above; this branch is unreachable but kept for
            // exhaustiveness. If somehow reached, it is a config/argument error (exit 1).
            const _unreachable = metric as string;
            const badMetricResult = makeErrorResult(
              'social',
              `Unknown metric: ${_unreachable}. Must be one of: handover, working-together, similar-task`,
              EXIT_CODES.config_error,
              'INVALID_METRIC'
            );
            emitResult(badMetricResult, { format, verbose, quiet });
            return await exitWithFlush(badMetricResult.exit_code);
          }
        }

        const network = typeof rawNetwork === 'string' ? JSON.parse(rawNetwork) : rawNetwork;

        let centrality: Record<string, unknown> | null = null;
        try {
          const rawCentrality = wasm.compute_network_centrality(logHandle, activityKey, resourceKey);
          centrality = typeof rawCentrality === 'string' ? JSON.parse(rawCentrality) : rawCentrality;
        } catch {
          // Centrality not available
        }

        const payload = {
          input: inputPath,
          activityKey,
          resourceKey,
          metric,
          similarTaskWarning,
          network: {
            nodes: ((network as Record<string, unknown>).nodes ?? []) as Array<{ id: string; label?: string }>,
            edges: ((network as Record<string, unknown>).edges ?? []) as Array<{ from: string; to: string; weight?: number }>,
          },
          centrality,
        };

        const result = makeResult('social', payload, performance.now() - t0, EXIT_CODES.success);
        emitResult(result, { format, verbose, quiet }, (res, projection) => {
          printHumanSocial(projection, res.payload as typeof payload);
        });

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
      emitResult(result, { format, verbose, quiet });
      return await exitWithFlush(result.exit_code);
    }
      },
    );
  },
});

function printHumanSocial(
  projection: import('../output.js').ConsoleProjection,
  payload: {
    input: string;
    activityKey: string;
    resourceKey: string;
    metric: string;
    similarTaskWarning: boolean;
    network: { nodes: Array<{ id: string; label?: string }>; edges: Array<{ from: string; to: string; weight?: number }> };
    centrality: Record<string, unknown> | null;
  }
): void {
  const { network, centrality, metric } = payload;

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

  if (centrality) {
    const centralityScores = centrality.scores as Record<string, number>;
    if (centralityScores) {
      const sorted = Object.entries(centralityScores).sort((a, b) => b[1] - a[1]);
      projection.log('  Centrality scores (top 10):');
      for (const [resource, score] of sorted.slice(0, 10)) {
        projection.log(`    ${resource}: ${score.toFixed(3)}`);
      }
      if (sorted.length > 10) {
        projection.log(`    ... and ${sorted.length - 10} more resources`);
      }
      projection.log('');
    }
  }
}
