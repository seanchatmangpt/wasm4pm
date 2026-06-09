/**
 * Example: CLI Workflow Integration
 */

import { Kernel } from 'wasm4pm';

async function runIntegration(): Promise<void> {
  console.log('📊 Starting CLI Workflow Integration Example...\\n');
  const wasm = await import('wasm4pm');
  const kernel = new Kernel(wasm as any);
  await kernel.init();
  console.log('✓ Kernel initialized');
  console.log('✅ Integration completed successfully.');
}

runIntegration().catch(console.error);