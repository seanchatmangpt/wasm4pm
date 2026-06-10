/**
 * Example: Next Activity Prediction
 * 
 * Demonstrates how to build a prediction model and predict the next process step.
 */
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { join } from 'node:path';
import { Kernel } from 'wasm4pm';
import * as core from '@wasm4pm/core';
import { logger } from './utils/logger.js';

async function runPredictionExample(): Promise<void> {
  logger.header('🔮', 'Next Activity Prediction', 'Markovian process forecasting via n-grams');
  
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

  logger.step(2, 2, 'Building Predictor and Forecasting');
  // 1. Build the n-gram model (2-gram)
  const modelHandle = core.build_ngram_predictor(logHandle, 'concept:name', 2);
  assert.ok(modelHandle, 'Failed to build predictor model');
  
  // 2. Predict next activity for a partial trace
  const partialTrace = JSON.stringify(['DiagnosticRaised']);
  const resultJson = core.predict_next_activity(modelHandle, partialTrace);
  const result = JSON.parse(resultJson);
  
  logger.data('Prediction Result', result);
  
  assert.ok(Array.isArray(result.predictions), 'Should return predictions array');
  
  if (result.predictions.length > 0) {
    const top = result.predictions[0];
    logger.success(`Prediction complete. Most likely next activity: "${top.activity}" (p=${(top.probability * 100).toFixed(1)}%)`);
  } else {
    logger.warn('No predictions available for the given trace prefix.');
  }
}

runPredictionExample().catch((error: Error) => {
  logger.error(error.message);
  process.exit(1);
});
