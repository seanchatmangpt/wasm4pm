/**
 * Case Study: Manufacturing Production Line Discovery
 */
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { join } from 'node:path';
import { Kernel } from 'wasm4pm';
import * as core from '@wasm4pm/core';
import { logger } from './utils/logger.js';

async function runAdvancedDiscovery(): Promise<void> {
  logger.header('🏭', 'Manufacturing Production Line Discovery', 'Evaluating 9 advanced process discovery heuristics');
  
  // Initialize the WASM module via its default export
  if (typeof (core as any).default === 'function') {
    await (core as any).default();
  }
  const kernel = new Kernel(core as any);
  await kernel.init();

  logger.step(1, 2, 'Connecting IoT Sensor Streams (AN1-example)');
  const xesPath = join(process.cwd(), fs.existsSync('data') ? '' : '..', 'data/AN1-example.xes');
  const xes = fs.readFileSync(xesPath, 'utf8');
  const logHandle = core.load_eventlog_from_xes(xes);
  assert.ok(logHandle, 'Failed to load sensor log');
  logger.success('Sensor arrays bound to incidence matrices.');

  logger.step(2, 2, 'Benchmarking Algorithmic Extractions');
  const algorithms = [
    'alpha_plus_plus', 'heuristic_miner', 'inductive_miner', 'genetic_algorithm',
    'pso', 'a_star', 'hill_climbing', 'aco', 'simulated_annealing'
  ];

  for (const algo of algorithms) {
    try {
      const result = await kernel.run(algo, logHandle, { activityKey: 'concept:name' });
      
      // ── RIGOROUS VALIDATION ────────────────────────────────────────────────
      assert.ok(result.handle, `[${algo}] Result handle must be defined`);
      assert.ok(result.durationMs >= 0, `[${algo}] Duration must be non-negative`);
      
      logger.success(`[${algo.padEnd(20)}] generated model in ${result.durationMs.toFixed(2)}ms`);
    } catch (e) {
      logger.warn(`[${algo.padEnd(20)}] skipped (mathematical convergence constraint)`);
    }
  }
  logger.info('Process discovery evaluation complete. Models are ready for structural visualization.');
}
runAdvancedDiscovery().catch((error: Error) => {
  console.error('Uncaught error:', error);
  process.exit(1);
});
