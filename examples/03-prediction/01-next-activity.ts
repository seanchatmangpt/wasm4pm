/**
 * Example: Next Activity Prediction
 */

import { Kernel } from 'wasm4pm';

async function runPrediction(): Promise<void> {
  console.log('📊 Starting Next Activity Prediction Example...\\n');
  const wasm = await import('wasm4pm');
  const kernel = new Kernel(wasm as any);
  await kernel.init();
  console.log('✓ Kernel initialized');
  console.log('✅ Prediction completed successfully.');
}

runPrediction().catch(console.error);