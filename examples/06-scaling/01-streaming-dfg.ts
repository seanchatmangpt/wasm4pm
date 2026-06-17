/**
 * Case Study: High-Frequency Trading Process Monitoring
 */
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { join } from 'node:path';
import { Kernel } from 'wasm4pm';
import * as core from '@wasm4pm/core';
import { logger } from '../utils/logger.js';

async function runHFTMonitoring(): Promise<void> {
  logger.header('📈', 'High-Frequency Trading Monitoring', 'SIMD-accelerated process streams');
  
  // Initialize the WASM module via its default export
  if (typeof (core as any).default === 'function') {
    await (core as any).default();
  }
  const kernel = new Kernel(core as any);
  await kernel.init();

  logger.step(1, 2, 'Attaching SIMD Streaming Vectors (InternationalDeclarations)');
  const xesPath = join(process.cwd(), fs.existsSync('data') ? '' : '..', 'data/InternationalDeclarations.xes');
  const xes = fs.readFileSync(xesPath, 'utf8');
  const logHandle = core.load_eventlog_from_xes(xes);
  assert.ok(logHandle, 'Failed to load international log');
  logger.success('Market data buffer bound.');

  logger.step(2, 2, 'Evaluating Sub-Millisecond DFG Streams');
  try {
    const streamResult = await kernel.run('simd_streaming_dfg', logHandle, { activityKey: 'concept:name' });
    
    // ── RIGOROUS VALIDATION ──────────────────────────────────────────────────
    assert.ok(streamResult.handle, 'SIMD stream result handle must be defined');
    assert.strictEqual(streamResult.algorithm, 'simd_streaming_dfg', 'Algorithm ID must match');
    
    logger.success(`Stream vector processed and DFG updated in ${streamResult.durationMs.toFixed(2)}ms`);
    logger.info('SIMD streaming allows process extraction without blocking trade execution threads.');
  } catch (e) {
    logger.error(`Streaming DFG failed: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }
}

runHFTMonitoring().catch((error: Error) => {
  console.error('Uncaught error:', error);
  process.exit(1);
});
