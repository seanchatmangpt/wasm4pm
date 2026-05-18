import { defineCommand } from 'citty';
import * as fs from 'fs/promises';
import { emitResult, makeResult, makeErrorResult } from '../output.js';
import { EXIT_CODES } from '../exit-codes.js';
import { withLogSession } from '../with-log-session.js';
import { withSpan } from './_otel.js';
import {
  saveCommandReceipt,
  blake3Hex,
  newReceipt,
  type CommandReceipt,
} from '../receipts/_shared.js';
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
              EXIT_CODES.config_error,
              'INVALID_METRIC'
            );
            emitResult(result, { format, verbose, quiet });
            return await exitWithFlush(result.exit_code);
          }

          await withLogSession(
            {
              inputPath,
              activityKey,
              commandName: 'social',
              emitOptions: { format, verbose, quiet },
            },
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
                const rawCentrality = wasm.compute_network_centrality(
                  logHandle,
                  activityKey,
                  resourceKey
                );
                centrality =
                  typeof rawCentrality === 'string' ? JSON.parse(rawCentrality) : rawCentrality;
              } catch {
                // Centrality not available
              }

              // Normalise edge weight: Rust emits `handovers` (handover metric) or
              // `co_occurrences` (working-together metric) — map both to `weight`
              // so the rendering layer always has a single field to sort on.
              type RawEdge = {
                from: string;
                to: string;
                weight?: number;
                handovers?: number;
                co_occurrences?: number;
              };
              const rawEdges = ((network as Record<string, unknown>).edges ?? []) as RawEdge[];
              const normalisedEdges = rawEdges.map((e) => ({
                from: e.from,
                to: e.to,
                weight: e.weight ?? e.handovers ?? e.co_occurrences ?? 1,
              }));

              // Bottleneck detection: flag any resource that originates >50% of all handovers.
              // A single resource dominating handovers signals a concentration-of-work risk
              // (Van der Aalst organisational mining — social network bottleneck pattern).
              const totalHandovers = normalisedEdges.reduce((s, e) => s + e.weight, 0);
              const outboundByResource: Record<string, number> = {};
              for (const e of normalisedEdges) {
                outboundByResource[e.from] = (outboundByResource[e.from] ?? 0) + e.weight;
              }
              const bottleneckResources: Array<{ resource: string; share: number }> =
                Object.entries(outboundByResource)
                  .filter(([, count]) => totalHandovers > 0 && count / totalHandovers > 0.5)
                  .map(([resource, count]) => ({ resource, share: count / totalHandovers }));

              const payload = {
                input: inputPath,
                activityKey,
                resourceKey,
                metric,
                similarTaskWarning,
                network: {
                  nodes: ((network as Record<string, unknown>).nodes ?? []) as Array<{
                    id: string;
                    label?: string;
                  }>,
                  edges: normalisedEdges,
                },
                centrality,
                bottleneckResources,
              };

              const result = makeResult(
                'social',
                payload,
                performance.now() - t0,
                EXIT_CODES.success
              );
              emitResult(result, { format, verbose, quiet }, (res, projection) => {
                printHumanSocial(projection, res.payload as typeof payload);
              });

              if (!ctx.args['no-save']) {
                try {
                  const inputBytes = await fs
                    .readFile(inputPath!)
                    .catch(() => Buffer.from(inputPath!));
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
                      bottleneck_count: payload.bottleneckResources.length,
                    },
                  };
                  saveCommandReceipt(receipt);
                } catch {
                  /* receipt write must never break the command */
                }
              }

              return await exitWithFlush(result.exit_code);
            }
          ); // end withLogSession
        } catch (error) {
          const result = makeErrorResult('social', error, EXIT_CODES.execution_error);
          emitResult(result, { format, verbose, quiet });
          return await exitWithFlush(result.exit_code);
        }
      }
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
    network: {
      nodes: Array<{ id: string; label?: string }>;
      edges: Array<{ from: string; to: string; weight: number }>;
    };
    centrality: Record<string, unknown> | null;
    bottleneckResources: Array<{ resource: string; share: number }>;
  }
): void {
  const { network, centrality, metric, bottleneckResources } = payload;

  projection.log('');
  projection.success(`Social Network Mining — ${payload.input}`);
  projection.log(`  Activity key: ${payload.activityKey}`);
  projection.log(`  Resource key: ${payload.resourceKey}`);
  projection.log(`  Metric: ${metric}`);
  projection.log('');

  if (payload.similarTaskWarning) {
    projection.warn('Similar-task metric not available in current WASM build');
  }

  // Bottleneck warning: a single resource originating >50% of handovers
  // is a concentration-of-work signal (Van der Aalst organisational mining)
  if (bottleneckResources.length > 0) {
    for (const b of bottleneckResources) {
      projection.warn(
        `Bottleneck detected: "${b.resource}" originates ${(b.share * 100).toFixed(1)}% of all handovers (>50% threshold)`
      );
    }
    projection.log('');
  }

  projection.log(`  Network statistics:`);
  projection.log(`    Nodes (resources): ${network.nodes.length}`);
  projection.log(`    Edges (interactions): ${network.edges.length}`);
  projection.log('');

  // "Who does the most work" summary: total outbound interactions per resource,
  // sorted descending. This is the organisational-mining equivalent of a
  // bottleneck scan — the resource with the most outbound interactions is
  // carrying the greatest routing load (Van der Aalst, 2016, §9.3).
  const totalByResource: Record<string, number> = {};
  for (const e of network.edges) {
    totalByResource[e.from] = (totalByResource[e.from] ?? 0) + e.weight;
    // For working-together (undirected) also count inbound so both sides
    // contribute to "how much work involves this resource"
    if (metric !== 'handover') {
      totalByResource[e.to] = (totalByResource[e.to] ?? 0) + e.weight;
    }
  }
  const sortedResources = Object.entries(totalByResource).sort((a, b) => b[1] - a[1]);
  if (sortedResources.length > 0) {
    const workLabel = metric === 'handover' ? 'outbound handovers' : 'co-occurrences';
    projection.log(`  Who does the most work (by ${workLabel}):`);
    const maxWeight = sortedResources[0][1];
    const barScale = maxWeight > 0 ? 20 / maxWeight : 0;
    for (const [resource, count] of sortedResources.slice(0, 10)) {
      const filled = Math.round(count * barScale);
      const bar = '▓'.repeat(filled) + '░'.repeat(20 - filled);
      projection.log(`    ${resource.padEnd(25)} [${bar}]  ${count}`);
    }
    if (sortedResources.length > 10) {
      projection.log(`    ... and ${sortedResources.length - 10} more resources`);
    }
    projection.log('');
  }

  if (network.edges.length > 0) {
    const sortedEdges = [...network.edges].sort((a, b) => b.weight - a.weight);
    // Handover metric shows directed arrows; working-together is undirected
    const arrow = metric === 'handover' ? ' → ' : ' ↔ ';
    const relationLabel =
      metric === 'handover'
        ? 'Top handover-of-work relationships (by frequency)'
        : 'Top working-together relationships (by co-occurrence)';
    projection.log(`  ${relationLabel}:`);
    for (const [i, edge] of sortedEdges.slice(0, 10).entries()) {
      const line = `    ${edge.from}${arrow}${edge.to}: ${edge.weight}`;
      if (i === 0 && metric === 'handover' && sortedEdges.length > 1) {
        // Narrative interpretation for the dominant handover path —
        // makes the output actionable without requiring the practitioner
        // to interpret raw counts (Van der Aalst lifecycle: enhancement).
        const totalFlow = network.edges.reduce((s, e) => s + e.weight, 0);
        const sharePct = totalFlow > 0 ? ((edge.weight / totalFlow) * 100).toFixed(0) : '?';
        projection.log(line);
        projection.log(
          `      ^ ${edge.from} hands off to ${edge.to} ${edge.weight} times` +
            ` (${sharePct}% of all handovers) — this is the dominant upstream→downstream` +
            ` path; if ${edge.from} is absent, work for ${edge.to} stalls.`
        );
      } else {
        projection.log(line);
      }
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
      projection.log('  Centrality scores — most connected resources (top 10):');
      projection.log(
        '    High centrality = this resource receives work from many sources and hands off to many'
      );
      projection.log(
        '    targets. If it is also slow, it is a structural bottleneck for the whole network.'
      );
      projection.log('');
      const maxCentrality = sorted.length > 0 ? sorted[0][1] : 1;
      for (const [resource, score] of sorted.slice(0, 10)) {
        const interpretation =
          maxCentrality > 0 && score / maxCentrality >= 0.8
            ? ' ← highest centrality: potential coordination hub / bottleneck'
            : '';
        projection.log(`    ${resource.padEnd(25)} ${score.toFixed(3)}${interpretation}`);
      }
      if (sorted.length > 10) {
        projection.log(`    ... and ${sorted.length - 10} more resources`);
      }
      projection.log('');
    }
  }

  // Working-together: identify tightly coupled resource pairs (always appear together).
  // A pair that co-occurs in a high fraction of shared cases is a team dependency —
  // absence of one blocks the other (Van der Aalst, organisational mining §9.3).
  if (metric === 'working-together' && network.edges.length > 0) {
    const totalCoOccurrences = network.edges.reduce((s, e) => s + e.weight, 0);
    const sortedEdges = [...network.edges].sort((a, b) => b.weight - a.weight);
    const tightlyCoupled = sortedEdges.filter(
      (e) => totalCoOccurrences > 0 && e.weight / totalCoOccurrences >= 0.4
    );
    if (tightlyCoupled.length > 0) {
      projection.log('  Tightly coupled resource pairs (co-occur in >=40% of all interactions):');
      projection.log('    These pairs are likely a team unit — if one is unavailable, the');
      projection.log('    other is blocked. Consider whether this coupling is intentional.');
      projection.log('');
      for (const edge of tightlyCoupled.slice(0, 5)) {
        const pct =
          totalCoOccurrences > 0 ? ((edge.weight / totalCoOccurrences) * 100).toFixed(0) : '?';
        projection.log(
          `    ${edge.from} ↔ ${edge.to}: ${edge.weight} co-occurrences (${pct}% of total)`
        );
      }
      projection.log('');
    }
  }

  // Next-steps: close the Van der Aalst discovery → conformance → enhancement loop.
  // Social network anomalies (bottlenecks, dominant handover paths, tightly coupled pairs)
  // often manifest as conformance deviations and temporal bottlenecks.
  projection.log('  Suggested follow-up:');
  projection.log(`    wpm conformance -i ${payload.input}`);
  projection.log('      → check which traces deviate from the discovered process model');
  if (bottleneckResources.length > 0) {
    projection.log(`    wpm temporal -i ${payload.input}`);
    projection.log(
      `      → check if the bottleneck resource(s) above are driving cycle time increases`
    );
  }
  projection.log('');
}
