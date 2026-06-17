/**
 * Example: ML Regression Analysis
 * 
 * Demonstrates how to run linear regression on process metrics.
 */
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { join } from 'node:path';
import { Kernel } from 'wasm4pm';
import * as core from '@wasm4pm/core';
import { logger } from './utils/logger.js';

async function runRegressExample(): Promise<void> {
  logger.header('📉', 'ML Regression Example', 'Modeling process relationships via OLS');
  
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

  logger.step(2, 2, 'Executing Regression Analysis');
  // @ts-ignore - discover_ml_regress is a direct WASM export not in kernel.run registry yet
  const resultJson = core.discover_ml_regress(logHandle, 'concept:name');
  const result = JSON.parse(resultJson);
  
  logger.data('Regression Result', result);
  
  assert.strictEqual(result.algorithm, 'ml_regress', 'Algorithm ID mismatch');
  assert.ok(result.regression, 'Should return regression object');
  
  logger.success(`Regression complete. R²: ${result.regression.r_squared.toFixed(4)}`);
  logger.info(`Model: duration = ${result.regression.slope.toFixed(2)} * length + ${result.regression.intercept.toFixed(2)}`);
}

runRegressExample().catch((error: Error) => {
  logger.error(error.message);
  process.exit(1);
});
