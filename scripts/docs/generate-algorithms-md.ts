#!/usr/bin/env npx tsx
/**
 * Generates algorithm reference markdown from the kernel registry.
 *
 * Outputs:
 *   docs/reference/algorithms.md
 *   packages/kernel/ALGORITHMS.md
 *
 * Run: pnpm run docs:algorithms
 */
import fs from 'node:fs';
import path from 'node:path';
import { getRegistry } from '../../packages/kernel/src/registry.js';
import { ALGORITHM_CLI_ALIASES } from '../../packages/contracts/src/templates/algorithm-registry.js';
import type { AlgorithmMetadata } from '../../packages/kernel/src/registry.js';

const ROOT = path.resolve(import.meta.dirname, '../..');

function packageVersion(): string {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'packages/kernel/package.json'), 'utf8')
  ) as { version: string };
  return pkg.version;
}

/** Reverse map: registry id → CLI alias */
function buildAliasMap(): Map<string, string> {
  const map = new Map<string, string>();
  for (const [registryId, alias] of Object.entries(ALGORITHM_CLI_ALIASES)) {
    map.set(registryId, alias);
  }
  return map;
}

const CATEGORY_RULES: Array<{ category: string; match: (id: string) => boolean }> = [
  { category: 'ML Analysis', match: (id) => id.startsWith('ml_') || id.startsWith('automl_') },
  { category: 'OCEL / Object-Centric', match: (id) => id.startsWith('ocel_') },
  { category: 'Prediction', match: (id) => id.startsWith('predict_') || id === 'detect_drift' || id === 'compute_ewma' },
  { category: 'Conformance & Quality', match: (id) =>
      ['alignments', 'generalization', 'etconformance_precision', 'complexity_metrics'].includes(id) },
  { category: 'Import / Export', match: (id) =>
      ['pnml_import', 'bpmn_import', 'powl_to_process_tree', 'yawl_export'].includes(id) },
  { category: 'Simulation', match: (id) =>
      ['playout', 'monte_carlo_simulation'].includes(id) },
  { category: 'Social Network Analysis', match: (id) =>
      ['handover_network', 'working_together_network'].includes(id) },
  { category: 'Discovery Analytics', match: (id) =>
      ['transition_system', 'log_to_trie', 'causal_graph', 'performance_spectrum', 'batches', 'correlation_miner',
       'analyze_variant_complexity', 'compute_activity_transition_matrix', 'analyze_process_speedup',
       'compute_trace_similarity_matrix'].includes(id) },
  { category: 'Streaming & Smart Engine', match: (id) =>
      ['simd_streaming_dfg', 'hierarchical_dfg', 'streaming_log', 'smart_engine'].includes(id) },
  { category: 'Agentic', match: (id) => id === 'agentic_pipeline' },
];

function categorize(id: string): string {
  for (const rule of CATEGORY_RULES) {
    if (rule.match(id)) return rule.category;
  }
  return 'Core Discovery';
}

function groupAlgorithms(algorithms: AlgorithmMetadata[]): Map<string, AlgorithmMetadata[]> {
  const groups = new Map<string, AlgorithmMetadata[]>();
  for (const algo of algorithms) {
    const cat = categorize(algo.id);
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat)!.push(algo);
  }
  for (const list of groups.values()) {
    list.sort((a, b) => a.id.localeCompare(b.id));
  }
  return groups;
}

function renderTable(algorithms: AlgorithmMetadata[], aliasMap: Map<string, string>): string {
  const lines = [
    '| ID | Alias | Output | Speed | Quality | Robust | Scales |',
    '|----|-------|--------|------:|--------:|:------:|:------:|',
  ];
  for (const a of algorithms) {
    const alias = aliasMap.get(a.id) ?? '—';
    const robust = a.robustToNoise ? '✓' : '✗';
    const scales = a.scalesWell ? '✓' : '✗';
    lines.push(
      `| \`${a.id}\` | ${alias === '—' ? alias : `\`${alias}\``} | ${a.outputType} | ${a.speedTier} | ${a.qualityTier} | ${robust} | ${scales} |`
    );
  }
  return lines.join('\n');
}

function renderDocsReference(version: string, count: number, groups: Map<string, AlgorithmMetadata[]>, aliasMap: Map<string, string>): string {
  const categoryOrder = [
    'Core Discovery',
    'Streaming & Smart Engine',
    'Discovery Analytics',
    'Conformance & Quality',
    'Simulation',
    'Import / Export',
    'OCEL / Object-Centric',
    'Prediction',
    'ML Analysis',
    'Social Network Analysis',
    'Agentic',
  ];

  const sections = categoryOrder
    .filter((cat) => groups.has(cat))
    .map((cat) => `## ${cat}\n\n${renderTable(groups.get(cat)!, aliasMap)}`)
    .join('\n\n');

  return `# Reference: Algorithms

> **Generated from kernel registry.** Re-run \`pnpm run docs:algorithms\` after registry changes.
> Version: **v${version}** · Count: **${count}** registered algorithms.

## Listing Algorithms

\`\`\`bash
wpm algorithms
wpm algorithms --tier fast          # fast (<30ms), balanced, quality, stream
wpm algorithms --show-ratings        # Van der Aalst quality dimensions
wpm algorithms --format json
\`\`\`

## Alias Resolution

\`wpm run -a <name>\` and \`wpm compare\` accept CLI aliases (e.g. \`dfg\`, \`inductive\`, \`heuristic\`) or full registry IDs (e.g. \`heuristic_miner\`). Resolution is handled by \`resolveAlgorithmId()\` in \`@wasm4pm/contracts\`.

## Default Algorithm

When no \`-a\` flag is given, \`wpm run\` uses:

1. \`config.algorithm.name\` from \`wasm4pm.toml\` / \`wasm4pm.json\` in the current directory
2. Else the first algorithm for your execution profile (\`balanced\` → \`alpha_plus_plus\`)
3. Else \`heuristic_miner\`

The repo root ships \`wasm4pm.toml\` with \`algorithm.name = "simd_streaming_dfg"\`.

## Compare vs Run

- **\`wpm compare dfg,heuristic,inductive\`** — benchmarks a fixed subset of discovery aliases with sparklines
- **\`wpm run -a <id>\`** — dispatches any registered algorithm below

---

${sections}
`;
}

function renderKernelReference(version: string, count: number, groups: Map<string, AlgorithmMetadata[]>, aliasMap: Map<string, string>): string {
  const categoryOrder = [
    'Core Discovery',
    'Streaming & Smart Engine',
    'Discovery Analytics',
    'Conformance & Quality',
    'Simulation',
    'Import / Export',
    'OCEL / Object-Centric',
    'Prediction',
    'ML Analysis',
    'Social Network Analysis',
    'Agentic',
  ];

  const sections = categoryOrder
    .filter((cat) => groups.has(cat))
    .map((cat) => {
      const rows = groups.get(cat)!;
      const table = renderTable(rows, aliasMap);
      const descriptions = rows
        .map((a) => `- **\`${a.id}\`** (${a.name}): ${a.description}`)
        .join('\n');
      return `## ${cat}\n\n${table}\n\n${descriptions}`;
    })
    .join('\n\n');

  return `# Algorithm Reference

Complete reference for all **${count}** algorithms in the wasm4pm kernel registry.

**Version:** v${version}

> **Auto-generated.** Run \`pnpm run docs:algorithms\` from the repo root to refresh after registry changes.

## Quick Commands

\`\`\`bash
wpm algorithms --format json | jq '.payload.algorithms | length'   # expect ${count}
wpm run log.xes -a dfg
\`\`\`

---

${sections}
`;
}

function main() {
  const version = packageVersion();
  const registry = getRegistry();
  const algorithms = registry.list().sort((a, b) => a.id.localeCompare(b.id));
  const count = algorithms.length;
  const aliasMap = buildAliasMap();
  const groups = groupAlgorithms(algorithms);

  const docsPath = path.join(ROOT, 'docs/reference/algorithms.md');
  const kernelPath = path.join(ROOT, 'packages/kernel/ALGORITHMS.md');

  fs.writeFileSync(docsPath, renderDocsReference(version, count, groups, aliasMap));
  fs.writeFileSync(kernelPath, renderKernelReference(version, count, groups, aliasMap));

  console.log(`Wrote ${docsPath} (${count} algorithms)`);
  console.log(`Wrote ${kernelPath} (${count} algorithms)`);
}

main();
