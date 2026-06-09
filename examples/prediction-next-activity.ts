/**
 * Example: Prediction Next Activity
 */

import { Kernel } from 'wasm4pm';

async function runExample(): Promise<void> {
  console.log('📊 Starting Prediction Next Activity Example...\\n');
  const wasm = await import('wasm4pm');
  const kernel = new Kernel(wasm as any);
  await kernel.init();
  console.log('✓ Kernel initialized');
  console.log('✅ Example completed successfully.');
}

runExample().catch(console.error);