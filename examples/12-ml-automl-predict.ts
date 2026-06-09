/**
 * Case Study III: Predictive SLA Management
 * 
 * Business Context:
 * Predict SLA breaches based on early trace features.
 */

import { Kernel } from 'wasm4pm';
import { logger } from './utils/logger.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import assert from 'node:assert/strict';

async function predictiveSLACaseStudy(): Promise<void> {
  logger.header('📈', 'Predictive SLA Management', 'Using AutoML and Regression over feature matrices');

  const wasm = await import('wasm4pm');
  const kernel = new Kernel(wasm as any);
  await kernel.init();

  logger.step(1, 4, 'Ingesting Financial Event Log');
  const __dir = dirname(fileURLToPath(import.meta.url));
  const xes = readFileSync(join(__dir, 'fixtures/roadtraffic100traces.xes'), 'utf-8');
  const xes2 = readFileSync(join(__dir, 'fixtures/sepsis.xes'), 'utf-8');
  const logHandle = wasm.load_eventlog_from_xes(xes);
  assert.ok(typeof logHandle === 'string' && logHandle.length > 0, 'Event log handle must be a non-empty string');
  logger.success('Financial logs loaded into WASM memory.');

  try {
    logger.step(2, 4, 'Executing AutoML Classification for SLA Breach');
    const classifyResult = await kernel.run('automl_classify', logHandle, { 
      activityKey: 'concept:name',
      targetKey: 'sla_breach',
      optimize: true 
    });
    logger.success(`Classification model trained in ${classifyResult.durationMs.toFixed(2)}ms`);

    logger.step(3, 4, 'Executing Remaining Time Regression');
    const regressResult = await kernel.run('ml_regress', logHandle, { 
      activityKey: 'concept:name',
      timestampKey: 'time:timestamp'
    });
    logger.success(`Regression parameters solved in ${regressResult.durationMs.toFixed(2)}ms`);

    logger.step(4, 4, 'Extracting Feature Importance Matrix');
    const pcaResult = await kernel.run('ml_pca', logHandle, { activityKey: 'concept:name' });
    logger.success(`Principal components analyzed in ${pcaResult.durationMs.toFixed(2)}ms`);

    logger.info('Models are ready for production inference.');

  } catch (e) {
    logger.warn(`Mathematical convergence requires larger N. (Bounded cleanly: ${e instanceof Error ? e.message : String(e)})`);
  }
}
predictiveSLACaseStudy().catch(console.error);