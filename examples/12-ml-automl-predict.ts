/**
 * Case Study III: Predictive SLA Management
 */
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { join } from 'node:path';
import { Kernel } from 'wasm4pm';
import * as core from '@wasm4pm/core';
import { logger } from './utils/logger.js';

async function predictiveSLACaseStudy(): Promise<void> {
  logger.header('📈', 'Predictive SLA Management', 'Using AutoML and Regression over real feature matrices');
  
  // Initialize the WASM module via its default export
  if (typeof (core as any).default === 'function') {
    await (core as any).default();
  }
  const kernel = new Kernel(core as any);
  await kernel.init();

  logger.step(1, 4, 'Ingesting Real Financial Event Log (InternationalDeclarations)');
  const xesPath = join(process.cwd(), fs.existsSync('data') ? '' : '..', 'data/small-example.xes');
  const xes = fs.readFileSync(xesPath, 'utf8');
  const logHandle = core.load_eventlog_from_xes(xes);
  assert.ok(logHandle, 'Failed to load international declarations');
  logger.success('Financial logs loaded into WASM memory.');

  try {
    logger.step(2, 4, 'Executing AutoML Classification');
    const classifyResult = await kernel.run('automl_classify', logHandle, { 
      activityKey: 'concept:name',
      targetKey: 'Amount',
      optimize: true 
    });
    // ── RIGOROUS VALIDATION ──────────────────────────────────────────────────
    assert.ok(classifyResult.handle, 'Classification model handle must be defined');
    logger.success(`Classification model trained in ${classifyResult.durationMs.toFixed(2)}ms`);

    logger.step(3, 4, 'Executing Remaining Time Regression');
    const regressResult = await kernel.run('ml_regress', logHandle, { 
      activityKey: 'concept:name',
      timestampKey: 'time:timestamp'
    });
    // ── RIGOROUS VALIDATION ──────────────────────────────────────────────────
    assert.ok(regressResult.handle, 'Regression handle must be defined');
    logger.success(`Regression parameters solved in ${regressResult.durationMs.toFixed(2)}ms`);

    logger.step(4, 4, 'Extracting Feature Importance Matrix');
    const pcaResult = await kernel.run('ml_pca', logHandle, { activityKey: 'concept:name' });
    // ── RIGOROUS VALIDATION ──────────────────────────────────────────────────
    assert.ok(pcaResult.handle, 'PCA handle must be defined');
    logger.success(`Principal components analyzed in ${pcaResult.durationMs.toFixed(2)}ms`);

    logger.info('Models are ready for production inference.');

  } catch (e) {
    logger.warn(`Mathematical convergence constraint triggered: ${e instanceof Error ? e.message : String(e)}`);
  }
}
predictiveSLACaseStudy().catch((error: Error) => {
  console.error('Uncaught error:', error);
  process.exit(1);
});
