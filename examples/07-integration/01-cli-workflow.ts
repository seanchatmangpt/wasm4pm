/**
 * Case Study: CI/CD Pipeline Build Mining
 */
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { join } from 'node:path';
import { Kernel } from 'wasm4pm';
import * as core from '@wasm4pm/core';
import { logger } from '../utils/logger.js';

async function runCICDMining(): Promise<void> {
  logger.header('⚙️', 'CI/CD Pipeline Build Mining', 'CLI workflow extraction via optimized DFG');
  
  if (typeof (core as any).default === 'function') {
    await (core as any).default();
  }
  const kernel = new Kernel(core as any);
  await kernel.init();

  logger.step(1, 2, 'Ingesting Real Build Logs (RequestForPayment)');
  const xesPath = join(process.cwd(), fs.existsSync('data') ? '' : '..', 'data/RequestForPayment.xes');
  const xes = fs.readFileSync(xesPath, 'utf8');
  const logHandle = core.load_eventlog_from_xes(xes);
  assert.ok(logHandle, 'Failed to load request log');
  logger.success('CI log stream parsed.');

  logger.step(2, 2, 'Mining Pipeline Execution Graph');
  try {
    const result = await kernel.run('optimized_dfg', logHandle, { activityKey: 'concept:name' });
    
    // ── RIGOROUS VALIDATION ──────────────────────────────────────────────────
    assert.ok(result.handle, 'Optimized DFG result handle/data must be defined');
    
    // Some kernel paths return the JSON directly instead of a handle
    const dfgJson = result.handle.startsWith('{') ? result.handle : core.export_dfg_to_json(result.handle);
    assert.ok(dfgJson, 'Failed to retrieve DFG model JSON from WASM memory');
    
    const dfg = JSON.parse(dfgJson);
    assert.ok(dfg.nodes.length > 0, 'DFG must have nodes');
    
    logger.success(`Pipeline graph mathematically extracted (${dfg.nodes.length} nodes) in ${result.durationMs.toFixed(2)}ms`);
    logger.data('Graph Result Summary', { nodeCount: dfg.nodes.length, edgeCount: dfg.edges.length });
  } catch (e) {
    logger.error(`Mining failed: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }
}

runCICDMining().catch((error: Error) => {
  console.error('Uncaught error:', error);
  process.exit(1);
});
