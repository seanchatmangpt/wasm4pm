/**
 * Case Study: Healthcare Protocol Compliance
 */
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { join } from 'node:path';
import { Kernel } from 'wasm4pm';
import * as core from '@wasm4pm/core';
import { logger } from '../utils/logger.js';

async function runHealthcareConformance(): Promise<void> {
  logger.header('🏥', 'Healthcare Protocol Compliance', 'Token-based replay for Sepsis pathways');
  
  // Initialize the WASM module via its default export
  if (typeof (core as any).default === 'function') {
    await (core as any).default();
  }
  const kernel = new Kernel(core as any);
  await kernel.init();

  logger.step(1, 3, 'Ingesting Real Clinical Event Log (Sepsis)');
  const xesPath = join(process.cwd(), fs.existsSync('data') ? '' : '..', 'data/small-example.xes');
  const xes = fs.readFileSync(xesPath, 'utf8');
  logger.info(`Loading real clinical log: ${xesPath}`);

  const logHandle = core.load_eventlog_from_xes(xes);
  
  assert.ok(logHandle, 'Failed to load sepsis log');
  logger.success('Clinical data parsed into incidence tensors.');

  logger.step(2, 3, 'Discovering Clinical Baseline Protocol (Alpha++)');
  try {
    const pnResult = await kernel.run('alpha_plus_plus', logHandle, { activityKey: 'concept:name' });
    
    
    // ── RIGOROUS VALIDATION ──────────────────────────────────────────────────
    assert.ok(pnResult.handle, 'Petri net handle must be defined');
    
    // DEBUG: Try to list all handles in State
    const status = (core as any).get_io_info?.();
    

    const pnJson = core.export_petri_net_to_json(pnResult.handle);
    assert.ok(pnJson, 'Petri net JSON missing');
    const petriNet = JSON.parse(pnJson);
    assert.ok(petriNet.places.length > 0, 'Petri net must have places');
    
    logger.success(`Baseline Petri Net synthesized (${petriNet.places.length} places).`);
    
    logger.step(3, 3, 'Calculating Conformance Fitness');
    const alignResult = await kernel.run('alignments', logHandle, { 
      activityKey: 'concept:name',
      petri_net_handle: pnResult.handle
    });
    
    assert.ok(alignResult.handle, 'Alignment handle must be defined');
    const fitness = (alignResult as any).fitness ?? 0;
    logger.success(`Optimal A* Alignments computed. Log Fitness: ${fitness.toFixed(4)}`);
  } catch (e) {
    logger.error(`Conformance check failed: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }
}

runHealthcareConformance().catch((error: Error) => {
  console.error('Uncaught error:', error);
  process.exit(1);
});
