/**
 * Example: Full Workflow
 */

import { Kernel } from 'wasm4pm';

async function runExample(): Promise<void> {
  console.log('📊 Starting Full Workflow Example...\\n');
  const wasm = await import('wasm4pm');
  const kernel = new Kernel(wasm as any);
  await kernel.init();
  console.log('✓ Kernel initialized');
  console.log('✅ Example completed successfully.');
}

runExample().catch(console.error);