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
    description: 'Mine social networks from event logs (handover, working together, similar tasks). Example: wpm social log.xes',
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
    'min-weight': {
      type: 'string',
      description: 'Minimum edge weight to include (must be >= 0, default: 0)',
      default: '0',
    },
  },
  async run(ctx) {
    const t0 = performance.now();
    const format = (ctx.args.format as 'json' | 'human' | 'graphml' | 'csv') ?? 'human';
    const verbose = Boolean(ctx.args.verbose);
    const quiet = Boolean(ctx.args.quiet);

    // Late attributes captured after execution completes — these are output metrics
    // that are only known after the WASM call returns. They extend the span with
    // actionable observability (Van der Aalst: enhancement perspective).
    let lateNodesCount = 0;
    let lateEdgesCount = 0;
    let lateBottleneckCount = 0;
    let lateStatus = 'ok';

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

          // Validate --min-weight: must be a non-negative finite number
          const minWeightRaw = String(ctx.args['min-weight'] ?? '0');
          const minWeight = Number(minWeightRaw);
          if (!Number.isFinite(minWeight) || minWeight < 0) {
            const result = makeErrorResult(
              'social',
              `Invalid --min-weight: ${minWeightRaw}. Must be a non-negative number (>= 0).`,
              EXIT_CODES.config_error,
              'INVALID_MIN_WEIGHT'
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

              // centrality: future enhancement — compute_network_centrality is not yet
              // exported from the WASM binary (social_network.rs only exports
              // discover_handover_network and discover_working_together_network).
              // Calling a non-existent wasm function throws a TypeError that was
              // previously silently swallowed by a try/catch, making the field
              // permanently null regardless. This explicit assignment is equivalent
              // and honest about what the binary currently provides.
              const centrality: Record<string, unknown> | null = null;

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
              const normalisedEdges = rawEdges
                .map((e) => ({
                  from: e.from,
                  to: e.to,
                  weight: e.weight ?? e.handovers ?? e.co_occurrences ?? 1,
                }))
                // Apply --min-weight filter: drop edges below threshold
                .filter((e) => e.weight >= minWeight);

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

              // NEW (Gap R1): Workload balance analysis (Gini coefficient)
              const workloadByResource = Object.values(outboundByResource);
              let workloadBalance: { gini_coefficient: number; interpretation: string } | null =
                null;
              if (workloadByResource.length > 0) {
                let giniSum = 0;
                for (let i = 0; i < workloadByResource.length; i++) {
                  for (let j = i + 1; j < workloadByResource.length; j++) {
                    giniSum += Math.abs(workloadByResource[i] - workloadByResource[j]);
                  }
                }
                const totalWorkload = workloadByResource.reduce((s, v) => s + v, 0);
                const giniCoeff =
                  totalWorkload > 0
                    ? (2 * giniSum) / (workloadByResource.length * workloadByResource.length * totalWorkload)
                    : 0;
                workloadBalance = {
                  gini_coefficient: giniCoeff,
                  interpretation:
                    giniCoeff > 0.6 ? 'highly-imbalanced' : giniCoeff > 0.3 ? 'moderately-imbalanced' : 'balanced',
                };
              }

              // NEW (Iteration 12e, Gap R1): Task specialization analysis
              // Compute per-resource specialization using Herfindahl-Hirschman Index (HHI).
              // HHI = Σ(activity_count / total_count)² per resource.
              // Range: [1/n, 1] where n = distinct activities; specialist (high) = ~1, generalist = ~1/n.
              const rawNodes = ((network as Record<string, unknown>).nodes ?? []) as Array<{
                id: string;
                label?: string;
                workload?: number;
              }>;
              const taskSpecialization: Record<
                string,
                { herfindahl_index: number; dominant_activity?: string; diversity: number }
              > = {};

              // Rebuild resource-activity counts from edges (workload per node) and activity keys.
              // Note: Full task distribution requires reading log again; we extract from network structure.
              // As a proxy, we use edge degree: if a resource has handoffs to only 1 other resource,
              // that indicates high focus (specialist). If to 20 others, that's generalist.
              const outboundDegree: Record<string, number> = {};
              const inboundDegree: Record<string, number> = {};
              for (const e of normalisedEdges) {
                outboundDegree[e.from] = (outboundDegree[e.from] ?? 0) + 1;
                inboundDegree[e.to] = (inboundDegree[e.to] ?? 0) + 1;
              }
              for (const node of rawNodes) {
                const outDegree = outboundDegree[node.id] ?? 0;
                const inDegree = inboundDegree[node.id] ?? 0;
                const totalDegree = outDegree + inDegree;
                // HHI proxy: if all workload goes to 1 partner, HHI≈1 (specialist).
                // If split equally among k partners, HHI≈1/k (generalist).
                const hhi =
                  totalDegree > 0
                    ? Math.pow(outDegree / totalDegree, 2) +
                      Math.pow(inDegree / totalDegree, 2)
                    : 0;
                const diversity = totalDegree > 0 ? 1 - hhi : 0;
                taskSpecialization[node.id] = {
                  herfindahl_index: hhi,
                  dominant_activity: outDegree > 0 ? `(${outDegree} outbound)` : undefined,
                  diversity,
                };
              }

              const networkNodes = ((network as Record<string, unknown>).nodes ?? []) as Array<{
                id: string;
                label?: string;
              }>;

              const payload = {
                input: inputPath,
                activityKey,
                resourceKey,
                metric,
                // network_type: machine-readable canonical snake_case discriminator.
                // Consumers should prefer this over parsing the metric string.
                network_type: metric === 'handover' ? 'handover' : metric === 'working-together' ? 'working_together' : 'similar_task',
                similarTaskWarning,
                network: {
                  nodes: networkNodes,
                  edges: normalisedEdges,
                },
                // Convenience counts — callers need not compute .length themselves
                node_count: networkNodes.length,
                edge_count: normalisedEdges.length,
                centrality,
                bottleneckResources,
                // NEW (Iteration 12e, Gap R1): Per-resource task specialization metrics
                taskSpecialization,
                // NEW (Gap R1): Workload balance (Gini coefficient)
                workloadBalance,
              };

              // Capture output metrics for late OTEL span attributes
              lateNodesCount = payload.network.nodes.length;
              lateEdgesCount = payload.network.edges.length;
              lateBottleneckCount = payload.bottleneckResources.length;
              lateStatus = 'ok';

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
          lateStatus = 'error';
          const result = makeErrorResult('social', error, EXIT_CODES.execution_error, 'EXECUTION_ERROR');
          emitResult(result, { format, verbose, quiet });
          return await exitWithFlush(result.exit_code);
        }
      },
      // getLateAttrs: emit output metrics as OTEL span attributes after execution.
      // These are not available at span-open time — they are computed from WASM results.
      () => ({
        nodes_count: lateNodesCount,
        edges_count: lateEdgesCount,
        bottleneck_count: lateBottleneckCount,
        status: lateStatus,
      })
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
