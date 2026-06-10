/**
 * Example: ML Clustering
 * 
 * Demonstrates how to cluster traces into similar groups using k-Means.
 */
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { join } from 'node:path';
import { Kernel } from 'wasm4pm';
import * as core from '@wasm4pm/core';
import { logger } from './utils/logger.js';

async function runClusterExample(): Promise<void> {
  logger.header('🧬', 'ML Clustering Example', 'Grouping traces via branchless k-Means');
  
  // Initialize the WASM module via its default export
  if (typeof (core as any).default === 'function') {
    await (core as any).default();
  }
  const kernel = new Kernel(core as any);
  await kernel.init();

  logger.step(1, 2, 'Loading Real Event Data');
  const xesPath = join(process.cwd(), fs.existsSync('data') ? '' : '..', 'data/small-example.xes');
  const xes = fs.readFileSync(xesPath, 'utf8');
  const logHandle = core.load_eventlog_from_xes(xes);
  assert.ok(logHandle, 'Failed to load log');
  logger.success('Log ingested successfully.');

  logger.step(2, 2, 'Executing Clustering');
  // @ts-ignore - discover_ml_cluster is a direct WASM export not in kernel.run registry yet
  const resultJson = core.discover_ml_cluster(logHandle, 'concept:name');
  const result = JSON.parse(resultJson);
  
  logger.data('Clustering Result', result);
  
  assert.strictEqual(result.algorithm, 'ml_cluster', 'Algorithm ID mismatch');
  assert.ok(Array.isArray(result.assignments), 'Should return assignments array');
  
  logger.success(`Clustering complete. Discovered ${result.k} clusters over ${result.iterations} iterations.`);
  logger.info(`Mean Silhouette Score: ${result.silhouette.toFixed(4)} (tightness/separation)`);
}

runClusterExample().catch((error: Error) => {
  logger.error(error.message);
  process.exit(1);
});
