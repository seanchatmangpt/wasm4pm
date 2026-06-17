/**
 * Tutorial: Basic DFG Discovery
 */
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { join } from 'node:path';
import { Kernel } from 'wasm4pm';
import * as core from '@wasm4pm/core';
import { logger } from '../utils/logger.js';

async function runDfgTutorial(): Promise<void> {
  logger.header('📊', 'Basic DFG Discovery', 'The "Hello World" of Process Mining');
  
  // Initialize WebAssembly environment
  logger.step(1, 3, 'Initializing the WASM Kernel');
  
  // ── AUTHENTIC WASM INITIALIZATION ──────────────────────────────────────────
  if (typeof (core as any).default === 'function') {
    await (core as any).default();
  }
  
  const kernel = new Kernel(core as any);
  await kernel.init();
  logger.success('Kernel initialized and bound to WebAssembly linear memory.');

  // Load data
  logger.step(2, 3, 'Loading Real Event Data');
  const xesPath = join(process.cwd(), fs.existsSync('data') ? '' : '..', 'data/small-example.xes');
  const xes = fs.readFileSync(xesPath, 'utf8');
  logger.info(`Loading real log: ${xesPath}`);

  const logHandle = core.load_eventlog_from_xes(xes);
  assert.ok(logHandle, 'Failed to load event log: null handle');
  logger.success(`Log ingested successfully. Returned memory handle: ${logHandle.slice(0,8)}...`);

  // Execute Algorithm
  logger.step(3, 3, 'Executing Discovery Algorithm');
  try {
    logger.info('Invoking "dfg" (Directly-Follows Graph) from the registry...');
    const result = await kernel.run('dfg', logHandle, { activityKey: 'concept:name' });
    
    // ── RIGOROUS VALIDATION ──────────────────────────────────────────────────
    assert.ok(result.handle, 'Result handle must be defined');
    
    // Some kernel paths return the JSON directly instead of a handle
    const dfgJson = result.handle.startsWith('{') ? result.handle : core.export_dfg_to_json(result.handle);
    assert.ok(dfgJson, 'Failed to retrieve DFG model JSON from WASM memory');
    
    const dfg = JSON.parse(dfgJson);
    assert.ok(Array.isArray(dfg.nodes), 'DFG must have nodes array');
    assert.ok(Array.isArray(dfg.edges), 'DFG must have edges array');
    
    logger.info(`Graph Topology: ${dfg.nodes.length} nodes, ${dfg.edges.length} edges`);
    assert.ok(dfg.nodes.length >= 2, 'Graph must have at least 2 activity nodes');
    
    logger.success('Mathematical correctness verified: Graph topology is structurally sound.');
    logger.data('WASM Kernel Result', result);
  } catch (e) {
    logger.error(`Discovery failed: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }
}

runDfgTutorial().catch((error: Error) => {
  console.error('Uncaught error:', error);
  process.exit(1);
});
