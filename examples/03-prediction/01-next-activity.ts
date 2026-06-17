/**
 * Case Study: E-Commerce Next Best Action
 */
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { join } from 'node:path';
import { Kernel } from 'wasm4pm';
import * as core from '@wasm4pm/core';
import { logger } from '../utils/logger.js';

async function runPredictionCaseStudy(): Promise<void> {
  logger.header('🛒', 'E-Commerce Next Best Action', 'Case-level predictive forecasting');
  
  // Initialize the WASM module via its default export
  if (typeof (core as any).default === 'function') {
    await (core as any).default();
  }
  const kernel = new Kernel(core as any);
  await kernel.init();

  logger.step(1, 2, 'Loading Real User Journeys (RepairExample)');
  const xesPath = join(process.cwd(), fs.existsSync('data') ? '' : '..', 'data/RepairExample.xes');
  const xes = fs.readFileSync(xesPath, 'utf8');
  const logHandle = core.load_eventlog_from_xes(xes);
  assert.ok(logHandle, 'Failed to load repair log');
  logger.success('User journeys securely loaded into WASM boundary.');

  logger.step(2, 2, 'Training Predictive Model');
  try {
    const predResult = await kernel.run('predict_next_activity', logHandle, { activityKey: 'concept:name' });
    
    // ── RIGOROUS VALIDATION ──────────────────────────────────────────────────
    assert.ok(predResult.handle, 'Prediction model handle must be defined');
    assert.strictEqual(predResult.algorithm, 'predict_next_activity', 'Algorithm ID must match');
    
    logger.success(`Next-activity predictor model trained in ${predResult.durationMs.toFixed(2)}ms`);
    logger.info('Model is ready to receive active cart states for inference.');
  } catch (e) {
    logger.error(`Prediction training failed: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }
}

runPredictionCaseStudy().catch((error: Error) => {
  console.error('Uncaught error:', error);
  process.exit(1);
});
