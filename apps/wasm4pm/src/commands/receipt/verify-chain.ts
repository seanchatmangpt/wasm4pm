import { defineCommand } from 'citty';
import { WasmLoader } from '@wasm4pm/engine';

export const verifyChain = defineCommand({
  meta: {
    name: 'verify-chain',
    description: 'Verifies the integrity of the receipt chain',
  },
  args: {
    dir: {
      type: 'string',
      default: '.wasm4pm/receipts',
      description: 'Directory containing receipt JSON files',
    },
    json: { type: 'boolean', default: false, description: 'Machine-readable JSON output' },
  },
  async run(ctx) {
    const dir = ctx.args.dir as string;
    const jsonOutput = ctx.args.json as boolean;

    const loader = WasmLoader.getInstance();
    await loader.init();
    const wasm = loader.get();

    const resultRaw = (wasm.wasm_verify_receipt_chain as (dir: string) => string)(dir);
    const result: unknown = JSON.parse(resultRaw);

    if (jsonOutput) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      const r = result as { valid?: boolean; broken?: boolean; message?: string };
      if (r.valid === true || r.broken === false) {
        console.log(`Chain VALID  dir=${dir}`);
      } else {
        console.log(`Chain BROKEN  dir=${dir}  ${r.message ?? ''}`);
        process.exit(1);
      }
    }
  },
});
