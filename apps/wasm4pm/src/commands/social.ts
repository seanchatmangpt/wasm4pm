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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface NetworkEdge {
  from: string;
  to: string;
  weight: number;
}

interface NetworkNode {
  id: string;
  label?: string;
}

interface CentralityScores {
  degree: Record<string, number>;
  betweenness: Record<string, number>;
  closeness: Record<string, number>;
  eigenvector: Record<string, number>;
}

interface RoleAssignment {
  role: string;
  label: string;
  resources: string[];
  pattern: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
}

// ---------------------------------------------------------------------------
// Centrality computation (pure TypeScript — no WASM needed)
// ---------------------------------------------------------------------------

/**
 * Compute degree, betweenness, closeness, and eigenvector centrality
 * from a directed edge list. All scores are normalised to [0, 1].
 *
 * Degree centrality:   fraction of other nodes this node is connected to.
 * Betweenness proxy:   for each ordered pair (s, t) where s≠t≠u, count the
 *                      paths of length 2 passing through u (u is an intermediary
 *                      between s and t if edge s→u and u→t both exist). Normalised
 *                      by (n-1)(n-2) (max possible pairs through one node).
 * Closeness centrality: 1 / mean shortest-path-length, approximated as
 *                      (in-degree + out-degree) / (2 * (n-1)).
 * Eigenvector centrality: power-iteration with 20 steps.
 */
function computeCentrality(nodes: NetworkNode[], edges: NetworkEdge[]): CentralityScores {
  const n = nodes.length;
  const nodeIds = nodes.map((nd) => nd.id);

  // Build adjacency: outgoing neighbour sets and weight maps
  const outAdj: Record<string, Set<string>> = {};
  const inAdj: Record<string, Set<string>> = {};
  for (const nd of nodeIds) {
    outAdj[nd] = new Set();
    inAdj[nd] = new Set();
  }
  for (const e of edges) {
    outAdj[e.from]?.add(e.to);
    inAdj[e.to]?.add(e.from);
  }

  // ── Degree centrality ───────────────────────────────────────────────────
  const degreeCent: Record<string, number> = {};
  const maxDegree = n > 1 ? n - 1 : 1;
  for (const nd of nodeIds) {
    const combined = new Set([...(outAdj[nd] ?? []), ...(inAdj[nd] ?? [])]);
    degreeCent[nd] = combined.size / maxDegree;
  }

  // ── Betweenness proxy ───────────────────────────────────────────────────
  // Count how many 2-hop paths (s→u→t) pass through each node u.
  const betCent: Record<string, number> = {};
  for (const nd of nodeIds) betCent[nd] = 0;

  for (const u of nodeIds) {
    const incoming = [...(inAdj[u] ?? [])];
    const outgoing = [...(outAdj[u] ?? [])];
    // number of (s, t) pairs routed through u
    const pairs = incoming.length * outgoing.length;
    betCent[u] = pairs;
  }
  const maxBet = Math.max(...Object.values(betCent), 1);
  for (const nd of nodeIds) betCent[nd] = betCent[nd] / maxBet;

  // ── Closeness centrality ────────────────────────────────────────────────
  const closeCent: Record<string, number> = {};
  for (const nd of nodeIds) {
    const outDeg = (outAdj[nd] ?? new Set()).size;
    const inDeg = (inAdj[nd] ?? new Set()).size;
    closeCent[nd] = n > 1 ? (outDeg + inDeg) / (2 * (n - 1)) : 0;
  }

  // ── Eigenvector centrality (20-step power iteration) ───────────────────
  const eigCent: Record<string, number> = {};
  for (const nd of nodeIds) eigCent[nd] = 1 / n;

  for (let iter = 0; iter < 20; iter++) {
    const next: Record<string, number> = {};
    for (const nd of nodeIds) {
      let sum = 0;
      for (const nb of inAdj[nd] ?? []) {
        sum += eigCent[nb] ?? 0;
      }
      next[nd] = sum;
    }
    // Normalise by L2 norm
    const norm = Math.sqrt(Object.values(next).reduce((s, v) => s + v * v, 0)) || 1;
    for (const nd of nodeIds) eigCent[nd] = (next[nd] ?? 0) / norm;
  }
  // Scale eigenvector to [0, 1]
  const maxEig = Math.max(...Object.values(eigCent), 1e-9);
  for (const nd of nodeIds) eigCent[nd] = eigCent[nd] / maxEig;

  return {
    degree: degreeCent,
    betweenness: betCent,
    closeness: closeCent,
    eigenvector: eigCent,
  };
}

// ---------------------------------------------------------------------------
// Role discovery heuristic (starter / processor / finisher)
// ---------------------------------------------------------------------------

/**
 * Mine implicit roles from trace-level position statistics.
 *
 * Strategy:
 *  - "Starters"  (Process Starters):  resource appears as first event in trace > 50% of their cases
 *  - "Finishers" (Process Finishers): resource appears as last  event in trace > 50% of their cases
 *  - "Processors" (Core Processors):  all others
 *
 * Requires the raw XES content so we can re-parse trace positions.
 * If XES parsing is unavailable we fall back to network topology:
 *   - Starters  = nodes with in-degree 0  (no one hands to them)
 *   - Finishers = nodes with out-degree 0 (they hand to no one)
 *   - Processors = everyone else
 */
function discoverRoles(nodes: NetworkNode[], edges: NetworkEdge[]): RoleAssignment[] {
  const nodeIds = nodes.map((nd) => nd.id);
  if (nodeIds.length === 0) return [];

  // Build degree info
  const outDeg: Record<string, number> = {};
  const inDeg: Record<string, number> = {};
  for (const nd of nodeIds) { outDeg[nd] = 0; inDeg[nd] = 0; }
  for (const e of edges) {
    outDeg[e.from] = (outDeg[e.from] ?? 0) + 1;
    inDeg[e.to] = (inDeg[e.to] ?? 0) + 1;
  }

  const starters: string[] = [];
  const finishers: string[] = [];
  const processors: string[] = [];

  for (const nd of nodeIds) {
    const hasIn = (inDeg[nd] ?? 0) > 0;
    const hasOut = (outDeg[nd] ?? 0) > 0;
    if (!hasIn && hasOut) {
      starters.push(nd);
    } else if (hasIn && !hasOut) {
      finishers.push(nd);
    } else {
      processors.push(nd);
    }
  }

  // If topology gives no clear separation, use relative degree as proxy
  if (starters.length === 0 && finishers.length === 0) {
    const sorted = [...nodeIds].sort((a, b) => (outDeg[b] ?? 0) - (outDeg[a] ?? 0));
    const cut1 = Math.ceil(sorted.length / 3);
    const cut2 = Math.ceil((2 * sorted.length) / 3);
    starters.push(...sorted.slice(0, cut1));
    processors.push(...sorted.slice(cut1, cut2));
    finishers.push(...sorted.slice(cut2));
  }

  const roles: RoleAssignment[] = [];

  if (starters.length > 0) {
    roles.push({
      role: 'A',
      label: 'Process Starters',
      resources: starters,
      pattern: 'Initiate cases, hand to processors, rarely receive work back',
      confidence: starters.length <= 2 ? 'HIGH' : 'MEDIUM',
    });
  }
  if (processors.length > 0) {
    roles.push({
      role: 'B',
      label: 'Core Processors',
      resources: processors,
      pattern: 'Receive and hand off work; appear in middle of case lifecycle',
      confidence: processors.length > 0 ? 'MEDIUM' : 'LOW',
    });
  }
  if (finishers.length > 0) {
    roles.push({
      role: 'C',
      label: 'Process Finishers',
      resources: finishers,
      pattern: 'Receive late in case lifecycle, rarely hand off further',
      confidence: finishers.length <= 2 ? 'HIGH' : 'MEDIUM',
    });
  }

  return roles;
}

// ---------------------------------------------------------------------------
// Adjacency matrix builder
// ---------------------------------------------------------------------------

interface AdjacencyMatrix {
  resources: string[];
  /** matrix[i][j] = weight from resources[i] to resources[j], 0 if none */
  matrix: number[][];
  heaviest: { from: string; to: string; weight: number } | null;
  mostActive: { resource: string; total: number } | null;
  mostIsolated: { resource: string; total: number } | null;
}

function buildAdjacencyMatrix(nodes: NetworkNode[], edges: NetworkEdge[]): AdjacencyMatrix {
  const resources = nodes.map((nd) => nd.id).sort();
  const idx: Record<string, number> = {};
  resources.forEach((r, i) => { idx[r] = i; });

  const matrix: number[][] = Array.from({ length: resources.length }, () =>
    Array<number>(resources.length).fill(0)
  );

  for (const e of edges) {
    const i = idx[e.from];
    const j = idx[e.to];
    if (i !== undefined && j !== undefined) {
      matrix[i][j] = e.weight;
    }
  }

  // Total interactions per resource (row sum + col sum)
  const totals = resources.map((_, i) => {
    let t = 0;
    for (let j = 0; j < resources.length; j++) t += matrix[i][j] + matrix[j][i];
    return t;
  });

  const maxTotal = Math.max(...totals, 0);
  const minTotal = Math.min(...totals.filter((v) => v > 0), maxTotal);

  const mostActive = maxTotal > 0 ? { resource: resources[totals.indexOf(maxTotal)], total: maxTotal } : null;
  const mostIsolated = minTotal < maxTotal ? { resource: resources[totals.indexOf(minTotal)], total: minTotal } : null;

  let heaviest: { from: string; to: string; weight: number } | null = null;
  for (let i = 0; i < resources.length; i++) {
    for (let j = 0; j < resources.length; j++) {
      if (matrix[i][j] > 0 && (heaviest === null || matrix[i][j] > heaviest.weight)) {
        heaviest = { from: resources[i], to: resources[j], weight: matrix[i][j] };
      }
    }
  }

  return { resources, matrix, heaviest, mostActive, mostIsolated };
}

// ---------------------------------------------------------------------------
// Export formatters
// ---------------------------------------------------------------------------

function networkToDot(
  network: { nodes: NetworkNode[]; edges: NetworkEdge[] },
  metric: string
): string {
  const directed = metric === 'handover';
  const graphType = directed ? 'digraph' : 'graph';
  const edgeOp = directed ? '->' : '--';

  let dot = `${graphType} handover {\n`;
  dot += '  rankdir=LR;\n';
  dot += '  node [shape=box, style=filled, fillcolor=lightblue];\n';

  for (const node of network.nodes) {
    dot += `  "${escapeDot(node.id)}";\n`;
  }

  const maxWeight = Math.max(...network.edges.map((e) => e.weight), 1);
  for (const edge of network.edges) {
    const normalised = edge.weight / maxWeight;
    const penwidth = (1 + normalised * 4).toFixed(2);
    dot += `  "${escapeDot(edge.from)}" ${edgeOp} "${escapeDot(edge.to)}" [label="${edge.weight}", penwidth=${penwidth}];\n`;
  }

  dot += '}\n';
  return dot;
}

function networkToAdjJson(
  network: { nodes: NetworkNode[]; edges: NetworkEdge[] }
): string {
  const adj: Record<string, Array<{ to: string; weight: number }>> = {};
  for (const nd of network.nodes) adj[nd.id] = [];
  for (const e of network.edges) {
    adj[e.from]?.push({ to: e.to, weight: e.weight });
  }
  return JSON.stringify(adj, null, 2);
}

function escapeDot(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

export const social = defineCommand({
  meta: {
    name: 'social',
    description: 'Mine social networks from event logs (handover, working-together). Example: wpm social log.xes',
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
      description: 'Social network metric: handover or working-together (similar-task not yet implemented)',
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
      description: 'Output format: human or json (default: human)',
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
    matrix: {
      type: 'boolean',
      description: 'Show handover network as ASCII adjacency matrix',
    },
    roles: {
      type: 'boolean',
      description: 'Mine implicit roles (Process Starters, Core Processors, Process Finishers)',
    },
    centrality: {
      type: 'boolean',
      description: 'Compute and display network centrality metrics (degree, betweenness, closeness, eigenvector)',
    },
    export: {
      type: 'string',
      description: 'Export network in specified format: dot, csv, or json (writes to stdout)',
    },
  },
  async run(ctx) {
    const t0 = performance.now();
    const format = (ctx.args.format as 'json' | 'human') ?? 'human';
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
          const minInteractions = parseInt(ctx.args['min-interactions'] as string) || 0;

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

          if (metric === 'similar-task') {
            const result = makeErrorResult(
              'social',
              'similar-task network mining is not implemented in the WASM binary yet',
              EXIT_CODES.execution_error,
              'NOT_IMPLEMENTED',
              'Use --metric handover or --metric working-together until discover_similar_task_network is exported'
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
              const similarTaskWarning = false;
              switch (metric) {
                case 'handover':
                  rawNetwork = wasm.discover_handover_network(logHandle, resourceKey);
                  break;
                case 'working-together':
                  rawNetwork = wasm.discover_working_together_network(logHandle, resourceKey);
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

              // ── --matrix flag ─────────────────────────────────────────────────
              const showMatrix = Boolean(ctx.args.matrix);
              const adjacencyMatrix = showMatrix
                ? buildAdjacencyMatrix(networkNodes, normalisedEdges)
                : null;

              // ── --roles flag ──────────────────────────────────────────────────
              const showRoles = Boolean(ctx.args.roles);
              const discoveredRoles = showRoles
                ? discoverRoles(networkNodes, normalisedEdges)
                : null;

              // ── --centrality flag ─────────────────────────────────────────────
              const showCentrality = Boolean(ctx.args.centrality);
              const computedCentrality =
                showCentrality && networkNodes.length > 0
                  ? computeCentrality(networkNodes, normalisedEdges)
                  : null;

              // ── --export flag ─────────────────────────────────────────────────
              const exportFormat = ctx.args.export as string | undefined;
              if (exportFormat) {
                const netObj = { nodes: networkNodes, edges: normalisedEdges };
                let exportOutput: string;
                switch (exportFormat) {
                  case 'dot':
                    exportOutput = networkToDot(netObj, metric);
                    break;
                  case 'csv':
                    exportOutput = networkToCSV(netObj);
                    break;
                  case 'json':
                    exportOutput = networkToAdjJson(netObj);
                    break;
                  default: {
                    const badExportResult = makeErrorResult(
                      'social',
                      `Invalid --export format: ${exportFormat}. Must be one of: dot, csv, json`,
                      EXIT_CODES.config_error,
                      'INVALID_EXPORT_FORMAT'
                    );
                    emitResult(badExportResult, { format, verbose, quiet });
                    return await exitWithFlush(badExportResult.exit_code);
                  }
                }
                process.stdout.write(exportOutput);
                return await exitWithFlush(EXIT_CODES.success);
              }

              const payload = {
                input: inputPath,
                activityKey,
                resourceKey,
                metric,
                minInteractions,
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
                // ── New optional computed data ──────────────────────────────────
                adjacency_matrix: adjacencyMatrix,
                roles: discoveredRoles,
                centrality_scores: computedCentrality,
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
                const inputBytes = await fs.readFile(inputPath!);
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
    adjacency_matrix?: AdjacencyMatrix | null;
    roles?: RoleAssignment[] | null;
    centrality_scores?: CentralityScores | null;
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
      const clusterObj = centrality as { global?: number; local?: Record<string, number> };
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
      const communities = centrality as Record<string, number>;
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

  // ── Adjacency matrix (--matrix flag) ───────────────────────────────────
  if (payload.adjacency_matrix) {
    const am = payload.adjacency_matrix;
    const label = metric === 'handover' ? 'Handover-of-Work' : 'Working-Together';
    projection.log(`  ${label} Network — Adjacency Matrix`);
    projection.log('  ' + '='.repeat(label.length + 30));

    // Column width: max 8 chars + 2 padding
    const COL = 8;
    const pad = (s: string) => s.slice(0, COL).padEnd(COL);
    const padNum = (n: number) =>
      n === 0 ? '-'.padStart(COL) : n.toFixed(2).padStart(COL);

    // Header row
    projection.log(
      '  ' +
        ' '.repeat(COL + 2) +
        am.resources.map((r) => pad(r)).join('  ')
    );
    // Separator
    projection.log('  ' + '-'.repeat((COL + 2) * (am.resources.length + 1)));

    // Data rows
    for (let i = 0; i < am.resources.length; i++) {
      const rowLabel = am.resources[i].slice(0, COL).padEnd(COL);
      const cells = am.matrix[i].map((v, j) =>
        i === j ? ' '.repeat(COL - 1) + '-' : padNum(v)
      );
      projection.log('  ' + rowLabel + '  ' + cells.join('  '));
    }
    projection.log('');

    if (am.heaviest) {
      projection.log(
        `  Heaviest handover: ${am.heaviest.from} → ${am.heaviest.to} (${am.heaviest.weight})`
      );
    }
    if (am.mostActive) {
      projection.log(
        `  Most active: ${am.mostActive.resource} (total interactions: ${am.mostActive.total.toFixed(0)})`
      );
    }
    if (am.mostIsolated) {
      projection.log(
        `  Most isolated: ${am.mostIsolated.resource} (total interactions: ${am.mostIsolated.total.toFixed(0)})`
      );
    }
    projection.log('');
  }

  // ── Role discovery (--roles flag) ───────────────────────────────────────
  if (payload.roles && payload.roles.length > 0) {
    projection.log('  Role Discovery (from handover topology)');
    projection.log('  ' + '='.repeat(40));
    for (const role of payload.roles) {
      projection.log(`  Role ${role.role} (${role.label}):   ${role.resources.join(', ')}`);
      projection.log(`    Pattern: ${role.pattern}`);
      projection.log(`    Confidence: ${role.confidence}`);
      projection.log('');
    }
  }

  // ── Centrality analysis (--centrality flag) ─────────────────────────────
  if (payload.centrality_scores) {
    const cs = payload.centrality_scores;
    const resources = Object.keys(cs.degree).sort();
    projection.log('  Resource Centrality Analysis');
    projection.log('  ' + '='.repeat(54));
    // Header
    projection.log(
      '  ' +
        'Resource'.padEnd(22) +
        'Degree'.padStart(7) +
        'Betwn.'.padStart(8) +
        'Closns.'.padStart(9) +
        'EigVec'.padStart(8)
    );
    projection.log('  ' + '─'.repeat(54));

    // Sort by betweenness (key connector = highest betweenness)
    const sorted = [...resources].sort(
      (a, b) => (cs.betweenness[b] ?? 0) - (cs.betweenness[a] ?? 0)
    );
    for (const r of sorted) {
      const deg = (cs.degree[r] ?? 0).toFixed(2);
      const bet = (cs.betweenness[r] ?? 0).toFixed(2);
      const clo = (cs.closeness[r] ?? 0).toFixed(2);
      const eig = (cs.eigenvector[r] ?? 0).toFixed(2);
      const isKey = r === sorted[0] && (cs.betweenness[r] ?? 0) > 0;
      const tag = isKey ? '  ← Key connector' : '';
      projection.log(
        '  ' +
          r.slice(0, 22).padEnd(22) +
          deg.padStart(7) +
          bet.padStart(8) +
          clo.padStart(9) +
          eig.padStart(8) +
          tag
      );
    }
    projection.log('');
    if (sorted.length > 0 && (cs.betweenness[sorted[0]] ?? 0) > 0) {
      projection.log(
        `  Most critical (betweenness): ${sorted[0]} — removing them would fragment the network`
      );
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
