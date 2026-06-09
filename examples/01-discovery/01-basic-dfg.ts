/**
 * Tutorial: Basic DFG Discovery
 * 
 * What You'll Learn:
 * - How to initialize the wasm4pm Kernel
 * - How to load an event log safely
 * - How to invoke the baseline 'dfg' algorithm
 * - How to parse the WASM Result object
 */
import assert from 'node:assert/strict';
import { Kernel } from 'wasm4pm';
import { logger } from '../utils/logger.js';

async function runDfgTutorial(): Promise<void> {
  logger.header('📊', 'Basic DFG Discovery', 'The "Hello World" of Process Mining');
  
  // Initialize WebAssembly environment
  logger.step(1, 3, 'Initializing the WASM Kernel');
  const wasm = await import('wasm4pm');
  const kernel = new Kernel(wasm as any);
  await kernel.init();
  logger.success('Kernel initialized and bound to WebAssembly linear memory.');

  // Load data
  logger.step(2, 3, 'Loading Event Data');
  const xes = `<?xml version="1.0" encoding="UTF-8" ?>
<log xes.version="1.0">
  <trace><string key="concept:name" value="Receive Order"/><string key="concept:name" value="Ship Order"/></trace>
  <trace><string key="concept:name" value="Receive Order"/><string key="concept:name" value="Ship Order"/></trace>
</log>`;
  logger.data('Input XES Log', xes, 5);

  const logHandle = wasm.load_eventlog_from_xes(xes);
  logger.success(`Log ingested successfully. Returned memory handle: ${logHandle.slice(0,8)}...`);

  // Execute Algorithm
  logger.step(3, 3, 'Executing Discovery Algorithm');
  try {
    logger.info('Invoking "dfg" (Directly-Follows Graph) from the registry...');
    const result = await kernel.run('dfg', logHandle, { activityKey: 'concept:name' });
    assert.ok(result !== null && result !== undefined, 'DFG result must not be null');
    assert.ok(result.durationMs >= 0, 'Duration must be non-negative');

    logger.success(`Discovery complete in ${result.durationMs.toFixed(2)}ms`);
    logger.data('WASM Kernel Result', result);
  } catch (e) {
    logger.error(`Discovery failed: ${e instanceof Error ? e.message : String(e)}`);
    logger.info('Hint: Ensure your log has matching activity keys.');
  }
}

process.on('uncaughtException', (err) => {
  console.error('Assertion failed:', err.message);
  process.exit(1);
});

runDfgTutorial().catch(console.error);