/**
 * Example — Trace clustering with @wasm4pm/ml
 *
 * Discovers cohorts of similar traces. Useful for:
 *   - Variant family discovery
 *   - Cohort analysis (e.g. fast-path vs slow-path cases)
 *   - Pre-segmenting data before per-segment discovery
 *
 * Run:
 *   tsx examples/ml-cluster.ts ./sample.xes 4   # k = 4 clusters
 *
 * Docs:
 *   docs/ml-algorithms.md  (`ml_cluster`)
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { getRegistry } from 'wasm4pm';
import { buildFeatureMatrix, clusterTraces } from '@wasm4pm/ml';

async function main(logPath: string, k: number): Promise<void> {
  const xes = readFileSync(resolve(logPath), 'utf8');
  const registry = getRegistry();
  const handle = await kernel.run('load_eventlog_from_xes', null, { xes });

  const matrix = await buildFeatureMatrix(handle as any, {
    activityKey: 'concept:name',
    timestampKey: 'time:timestamp',
  });

  // k-means is fast and works well when k is roughly known.
  // For unknown cohort counts, switch to method: 'dbscan' with eps tuning.
  const result = await clusterTraces(matrix as any, {
    method: 'kmeans',
    k,
    maxIterations: 100,
  });

  console.log(`method        : ${result.method}`);
  console.log(`clusters      : ${result.clusterCount}`);
  console.log(`noise (DBSCAN): ${result.noiseCount}`);

  // Aggregate cluster sizes.
  const sizes = new Map<number, number>();
  for (const a of result.assignments) {
    sizes.set(a.cluster, (sizes.get(a.cluster) ?? 0) + 1);
  }
  console.log('\ncluster sizes:');
  for (const [cluster, size] of [...sizes.entries()].sort((a, b) => a[0] - b[0])) {
    const bar = '█'.repeat(Math.max(1, Math.round((size / matrix.data.length) * 40)));
    console.log(`  cluster ${cluster}: ${String(size).padStart(5)} ${bar}`);
  }

  // Print 2 sample case IDs per cluster.
  console.log('\nsample members:');
  for (const cluster of [...sizes.keys()].sort()) {
    const members = result.assignments
      .filter((a) => a.cluster === cluster)
      .slice(0, 2)
      .map((a) => a.caseId);
    console.log(`  cluster ${cluster}: ${members.join(', ')}`);
  }
}

const logPath = process.argv[2] ?? './sample.xes';
const k = Number.parseInt(process.argv[3] ?? '4', 10);
main(logPath, k).catch((err) => {
  console.error('clustering failed:', err);
  process.exit(1);
});
