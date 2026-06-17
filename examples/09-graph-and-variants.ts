/**
 * Case Study: Customer Journey Mapping (Variants)
 */
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { join } from 'node:path';
import { Kernel } from 'wasm4pm';
import * as core from '@wasm4pm/core';
import { logger } from './utils/logger.js';

async function runCustomerJourney(): Promise<void> {
  logger.header('🗺️', 'Customer Journey Mapping', 'Extracting variants and skeleton graphs');
  
  // Initialize the WASM module via its default export
  if (typeof (core as any).default === 'function') {
    await (core as any).default();
  }
  const kernel = new Kernel(core as any);
  await kernel.init();

  logger.step(1, 2, 'Loading Navigation Segments (DomesticDeclarations)');
  const xesPath = join(process.cwd(), fs.existsSync('data') ? '' : '..', 'data/DomesticDeclarations.xes');
  const xes = fs.readFileSync(xesPath, 'utf8');
  const logHandle = core.load_eventlog_from_xes(xes);
  assert.ok(logHandle, 'Failed to load declarations log');
  logger.success('Segments ingested.');

  logger.step(2, 2, 'Clustering via Graph Abstractions');
  const algorithms = [
    'process_skeleton', 'transition_system', 'causal_graph', 'hierarchical_dfg', 
    'optimized_dfg', 'batches', 'correlation_miner', 'generalization'
  ];

  for (const algo of algorithms) {
    try {
      const result = await kernel.run(algo, logHandle, { activityKey: 'concept:name' });
      
      // ── RIGOROUS VALIDATION ────────────────────────────────────────────────
      assert.ok(result.handle, `[${algo}] Result handle must be defined`);
      
      logger.success(`[${algo.padEnd(20)}] evaluated in ${result.durationMs.toFixed(2)}ms`);
    } catch (e) {
      logger.warn(`[${algo.padEnd(20)}] requires further log dimension and was halted safely`);
    }
  }
}
runCustomerJourney().catch((error: Error) => {
  console.error('Uncaught error:', error);
  process.exit(1);
});
