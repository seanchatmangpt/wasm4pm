import { defineCommand } from 'citty';
import * as fs from 'fs/promises';
import * as path from 'path';
import { EXIT_CODES } from '../exit-codes.js';
import { withSpan } from './_otel.js';

export const truex = defineCommand({
  meta: {
    name: 'truex',
    description: 'Truex OCEL 2.0 Trust Layer (Verify Receipts)',
  },
  args: {
    action: {
      type: 'positional',
      description: 'Action to perform (e.g. verify)',
      required: true,
    },
    payload: {
      type: 'positional',
      description: 'Path to the Truex Envelope JSON payload',
      required: true,
    },
  },
  async run(ctx) {
    if (ctx.args.action !== 'verify') {
      console.error(`Unknown action: ${ctx.args.action}. Supported: verify`);
      process.exit(EXIT_CODES.invalid_argument);
    }
    const targetPath = ctx.args.payload;
    return withSpan('truex', { targetPath }, async () => {
      try {
        const { WasmLoader } = await import('@wasm4pm/engine');
        const loader = WasmLoader.getInstance();
        await loader.init();
        const wasm = loader.get() as Record<string, any>;

        const fullPath = path.resolve(process.cwd(), targetPath);
        console.log(`[WASM Verifier] Reading envelope from: ${fullPath}`);
        
        const payload = await fs.readFile(fullPath, 'utf8');
        console.log(`[DEBUG] WASM keys:`, Object.keys(wasm));
        
        const t0 = performance.now();
        const resultJson = wasm.truex_verify_receipt(payload);
        const result = JSON.parse(resultJson);
        const status = result.status;
        
        const t1 = performance.now();
        const duration = (t1 - t0).toFixed(2);
        
        if (status === 'ReceiptAdmitted') {
          console.log(`\n======================================================`);
          console.log(` ✅ RECEIPT VERIFIED (WASM)`);
          console.log(`    Status:            ${status}`);
          console.log(`    Equivalence Class: ${result.equivalence_class}`);
          console.log(`    Time:              ${duration}ms`);
          console.log(`======================================================\n`);
          process.exit(0);
        } else {
          console.error(`\n======================================================`);
          console.error(` ❌ RECEIPT FORGED OR REFUSED (INTEGRITY COMPROMISED)`);
          console.error(`    Status:            ${status}`);
          if (result.equivalence_class) {
            console.error(`    Equivalence Class: ${result.equivalence_class}`);
          }
          if (result.computed_batch_hash) {
            console.error(`    Computed Batch Hash:   ${result.computed_batch_hash}`);
          }
          if (result.computed_receipt_hash) {
            console.error(`    Computed Receipt Hash: ${result.computed_receipt_hash}`);
          }
          console.error(`    Time:   ${duration}ms`);
          console.error(`======================================================\n`);
          process.exit(EXIT_CODES.execution_error);
        }
      } catch (err: any) {
        console.error(`\n❌ [Verifier Error] Failed to process payload: ${err.message || err}`);
        process.exit(EXIT_CODES.execution_error);
      }
    });
  },
});
