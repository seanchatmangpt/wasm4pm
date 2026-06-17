/**
 * Example: ML Throughput Forecasting
 * 
 * Demonstrates how to forecast process throughput over time.
 */
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { join } from 'node:path';
import { Kernel } from 'wasm4pm';
import * as core from '@wasm4pm/core';
import { logger } from './utils/logger.js';

async function runForecastExample(): Promise<void> {
  logger.header('📈', 'ML Forecast Example', 'Predicting process throughput via Exponential Smoothing');
  
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

  logger.step(2, 2, 'Executing Throughput Forecast');
  // @ts-ignore - discover_ml_forecast is a direct WASM export not in kernel.run registry yet
  const resultJson = core.discover_ml_forecast(logHandle, 'concept:name');
  const result = JSON.parse(resultJson);
  
  logger.data('Forecast Result', result);
  
  assert.strictEqual(result.algorithm, 'ml_forecast', 'Algorithm ID mismatch');
  assert.ok(result.forecast, 'Should return forecast object');
  
  logger.success(`Forecast complete. Predicted next window throughput: ${result.forecast.next_window.toFixed(2)}`);
  logger.info(`Confidence Score: ${(result.forecast.confidence * 100).toFixed(1)}% (based on RMSE)`);
}

runForecastExample().catch((error: Error) => {
  logger.error(error.message);
  process.exit(1);
});
