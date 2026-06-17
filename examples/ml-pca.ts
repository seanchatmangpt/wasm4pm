/**
 * Example: ML PCA (Principal Component Analysis)
 * 
 * Demonstrates how to run dimensional reduction on an event log.
 */
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { join } from 'node:path';
import { Kernel } from 'wasm4pm';
import * as core from '@wasm4pm/core';
import { logger } from './utils/logger.js';

async function runPcaExample(): Promise<void> {
  logger.header('📊', 'ML PCA Example', 'Nanosecond Dimensionality Reduction');
  
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

  logger.step(2, 2, 'Executing PCA Analysis');
  // @ts-ignore - discover_ml_pca is a direct WASM export not in kernel.run registry yet
  const resultJson = core.discover_ml_pca(logHandle, 'concept:name');
  const result = JSON.parse(resultJson);
  
  logger.data('PCA Result', result);
  
  assert.strictEqual(result.algorithm, 'ml_pca', 'Algorithm ID mismatch');
  assert.ok(Array.isArray(result.explained_variance), 'Should return explained variance array');
  
  logger.success(`PCA complete. Total variance: ${result.total_variance.toFixed(4)}`);
  logger.info(`Top component explains ${(result.explained_variance[0] * 100).toFixed(1)}% of variance.`);
}

runPcaExample().catch((error: Error) => {
  logger.error(error.message);
  process.exit(1);
});
