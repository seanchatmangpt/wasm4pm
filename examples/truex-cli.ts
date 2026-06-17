/**
 * Example: TrueX Receipt Verification
 * 
 * Demonstrates how to verify cryptographic receipts using the TrueX engine.
 */
import assert from 'node:assert/strict';
import { Kernel } from 'wasm4pm';
import * as core from '@wasm4pm/core';
import { logger } from './utils/logger.js';

async function runTrueXExample(): Promise<void> {
  logger.header('🛡️', 'TrueX Receipt Verification', 'Cryptographic proof-of-execution auditing');
  
  // Initialize the WASM module via its default export
  if (typeof (core as any).default === 'function') {
    await (core as any).default();
  }
  const kernel = new Kernel(core as any);
  await kernel.init();

  logger.step(1, 2, 'Simulating Receipt Generation');
  // Create a mock receipt for demonstration
  const receipt = {
    command: 'run',
    algorithm: 'dfg',
    input_hash: 'abc1234567890def',
    output_hash: 'def0987654321abc',
    timestamp: new Date().toISOString(),
    status: 'success'
  };
  const envelope = JSON.stringify(receipt);
  logger.info('Generated receipt envelope for verification.');

  logger.step(2, 2, 'Auditing via TrueX ReceiptDoctor');
  // @ts-ignore - truex_verify_receipt is a direct WASM export
  const resultJson = core.truex_verify_receipt(envelope);
  const result = JSON.parse(resultJson);
  
  logger.data('Verification Report', result);
  
  if (result.status === 'ReceiptAdmitted') {
    logger.success('Receipt verified and admitted by TrueX.');
  } else {
    logger.error(`Receipt refused: ${JSON.stringify(result.findings)}`);
  }
}

runTrueXExample().catch((error: Error) => {
  logger.error(error.message);
  process.exit(1);
});
