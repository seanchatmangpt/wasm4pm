/**
 * Example: ML Anomaly Detection
 * 
 * Demonstrates how to detect anomalous traces in an event log.
 */
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { join } from 'node:path';
import { Kernel } from 'wasm4pm';
import * as core from '@wasm4pm/core';
import { logger } from './utils/logger.js';

async function runAnomalyExample(): Promise<void> {
  logger.header('🔍', 'ML Anomaly Detection', 'Detecting process outliers via branchless scoring');
  
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

  logger.step(2, 2, 'Executing Anomaly Detection');
  // @ts-ignore - discover_ml_anomaly is a direct WASM export not in kernel.run registry yet
  const resultJson = core.discover_ml_anomaly(logHandle, 'concept:name');
  const result = JSON.parse(resultJson);
  
  logger.data('Anomaly Result', result);
  
  assert.strictEqual(result.algorithm, 'ml_anomaly', 'Algorithm ID mismatch');
  assert.ok(Array.isArray(result.scores), 'Should return scores array');
  
  const anomalies = result.scores.filter((s: number) => s > 0.5).length;
  logger.success(`Anomaly detection complete. Total traces: ${result.scores.length}`);
  logger.info(`Found ${anomalies} traces with anomaly score > 0.5.`);
}

runAnomalyExample().catch((error: Error) => {
  logger.error(error.message);
  process.exit(1);
});
