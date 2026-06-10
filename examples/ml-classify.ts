/**
 * Example: ML Classification
 * 
 * Demonstrates how to classify traces into short, medium, and long categories.
 */
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { join } from 'node:path';
import { Kernel } from 'wasm4pm';
import * as core from '@wasm4pm/core';
import { logger } from './utils/logger.js';

async function runClassifyExample(): Promise<void> {
  logger.header('🏷️', 'ML Classification Example', 'Categorizing traces via k-NN');
  
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

  logger.step(2, 2, 'Executing Classification');
  // @ts-ignore - discover_ml_classify is a direct WASM export not in kernel.run registry yet
  const resultJson = core.discover_ml_classify(logHandle, 'concept:name');
  const result = JSON.parse(resultJson);
  
  logger.data('Classification Result', result);
  
  assert.strictEqual(result.algorithm, 'ml_classify', 'Algorithm ID mismatch');
  assert.ok(typeof result.accuracy === 'number', 'Should return accuracy score');
  
  logger.success(`Classification complete. Test Accuracy: ${(result.accuracy * 100).toFixed(1)}%`);
  logger.info(`Classes analyzed: ${result.classes.join(', ')}`);
}

runClassifyExample().catch((error: Error) => {
  logger.error(error.message);
  process.exit(1);
});
