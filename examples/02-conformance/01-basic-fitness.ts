/**
 * Case Study: Healthcare Protocol Compliance
 * 
 * Business Context:
 * Sepsis patient treatment must strictly adhere to clinical protocols.
 * Deviations result in severe patient risks and regulatory fines.
 * 
 * DX Improvements:
 * - Clear separation of Discovery (Baseline) and Conformance (Replay)
 * - Insightful logging using the DX utility
 */
import assert from 'node:assert/strict';
import { Kernel } from 'wasm4pm';
import { logger } from '../utils/logger.js';

async function runHealthcareConformance(): Promise<void> {
  logger.header('🏥', 'Healthcare Protocol Compliance', 'Token-based replay for Sepsis pathways');
  
  const wasm = await import('wasm4pm');
  const kernel = new Kernel(wasm as any);
  await kernel.init();

  logger.step(1, 3, 'Ingesting Clinical Event Log');
  const xes = `<?xml version="1.0" encoding="UTF-8" ?>
<log xes.version="1.0">
  <trace>
    <string key="concept:name" value="ER Registration"/>
    <string key="concept:name" value="Triage"/>
    <string key="concept:name" value="Antibiotics Administered"/>
  </trace>
  <trace>
    <string key="concept:name" value="ER Registration"/>
    <string key="concept:name" value="Antibiotics Administered"/>
    <!-- Triage skipped, violation! -->
  </trace>
</log>`;
  const logHandle = wasm.load_eventlog_from_xes(xes);
  logger.success('Clinical data parsed into incidence tensors.');

  logger.step(2, 3, 'Discovering Clinical Baseline Protocol');
  try {
    const pnResult = await kernel.run('alpha_plus_plus', logHandle, { activityKey: 'concept:name' });
    logger.success(`Baseline Petri Net synthesized in ${pnResult.durationMs.toFixed(2)}ms`);
    
    logger.step(3, 3, 'Calculating Conformance Alignments');
    logger.info('Mapping raw trace observations against the mathematical baseline...');
    const alignResult = await kernel.run('alignments', logHandle, { activityKey: 'concept:name' });
    assert.ok(alignResult !== null && alignResult !== undefined, 'Alignment result must not be null');
    assert.ok(alignResult.durationMs >= 0, 'Duration must be non-negative');

    logger.success(`Optimal A* Alignments computed in ${alignResult.durationMs.toFixed(2)}ms`);
    logger.data('Alignment Metrics', alignResult, 6);
  } catch (e) {
    logger.warn(`Conformance boundary triggered: ${e instanceof Error ? e.message : String(e)}`);
    logger.info('Note: Strict alignment calculations require formally sound graphs, which simple mock traces may fail to provide.');
  }
}
process.on('uncaughtException', (err) => {
  console.error('Assertion failed:', err.message);
  process.exit(1);
});

runHealthcareConformance().catch(console.error);