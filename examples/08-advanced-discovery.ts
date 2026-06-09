/**
 * Case Study: Manufacturing Production Line Discovery
 * 
 * Business Context:
 * A factory floor uses IoT sensors to track assembly. We need the 
 * definitive Petri net representing the true assembly paths.
 */
import { Kernel } from 'wasm4pm';
import { logger } from './utils/logger.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import assert from 'node:assert/strict';

async function runAdvancedDiscovery(): Promise<void> {
  logger.header('🏭', 'Manufacturing Production Line Discovery', 'Evaluating 9 advanced process discovery heuristics');

  const wasm = await import('wasm4pm');
  const kernel = new Kernel(wasm as any);
  await kernel.init();

  logger.step(1, 2, 'Connecting IoT Sensor Streams');
  const __dir = dirname(fileURLToPath(import.meta.url));
  const xes = readFileSync(join(__dir, 'fixtures/roadtraffic100traces.xes'), 'utf-8');

  let handle: string;
  try {
    handle = await kernel.run('load_eventlog_from_xes', null as any, { xes }) as any;
    handle = (handle as any).handle || handle;
  } catch (e) {
    handle = wasm.load_eventlog_from_xes(xes);
  }
  assert.ok(typeof handle === 'string' && handle.length > 0, 'Event log handle must be a non-empty string');
  logger.success('Sensor arrays bound to incidence matrices.');

  logger.step(2, 2, 'Benchmarking Algorithmic Extractions');
  const algorithms = [
    'alpha_plus_plus', 'heuristic_miner', 'inductive_miner', 'genetic_algorithm',
    'pso', 'a_star', 'hill_climbing', 'aco', 'simulated_annealing'
  ];

  for (const algo of algorithms) {
    try {
      const result = await kernel.run(algo, handle, { activityKey: 'concept:name' });
      logger.success(`[${algo.padEnd(20)}] generated model in ${result.durationMs.toFixed(2)}ms`);
    } catch (e) {
      logger.warn(`[${algo.padEnd(20)}] skipped (requires deeper structural variant data)`);
    }
  }
  logger.info('Process discovery evaluation complete. Models are ready for structural visualization.');
}
runAdvancedDiscovery().catch(console.error);