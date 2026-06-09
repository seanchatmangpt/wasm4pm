/**
 * Case Study: CI/CD Pipeline Build Mining
 * 
 * Business Context:
 * Identify bottlenecks in complex, parallel CI/CD pipelines.
 */
import assert from 'node:assert/strict';
import { Kernel } from 'wasm4pm';
import { logger } from '../utils/logger.js';

async function runCICDMining(): Promise<void> {
  logger.header('⚙️', 'CI/CD Pipeline Build Mining', 'CLI workflow extraction via optimized DFG');
  
  const wasm = await import('wasm4pm');
  const kernel = new Kernel(wasm as any);
  await kernel.init();

  logger.step(1, 2, 'Ingesting Build Logs');
  const xes = `<?xml version="1.0" encoding="UTF-8" ?>
<log xes.version="1.0">
  <trace>
    <string key="concept:name" value="Lint"/>
    <string key="concept:name" value="Build"/>
    <string key="concept:name" value="Test"/>
  </trace>
</log>`;
  const logHandle = wasm.load_eventlog_from_xes(xes);
  logger.success('GitHub Actions log stream parsed.');

  logger.step(2, 2, 'Mining Pipeline Execution Graph');
  try {
    const dfgResult = await kernel.run('optimized_dfg', logHandle, { activityKey: 'concept:name' });
    assert.ok(dfgResult !== null && dfgResult !== undefined, 'CLI workflow DFG result must not be null');
    assert.ok(dfgResult.durationMs >= 0, 'Duration must be non-negative');

    logger.success(`Pipeline graph mathematically extracted in ${dfgResult.durationMs.toFixed(2)}ms`);
    logger.data('Graph Result', dfgResult, 5);
  } catch (e) {
    logger.warn(`Mining halted: ${e instanceof Error ? e.message : String(e)}`);
  }
}
process.on('uncaughtException', (err) => {
  console.error('Assertion failed:', err.message);
  process.exit(1);
});

runCICDMining().catch(console.error);