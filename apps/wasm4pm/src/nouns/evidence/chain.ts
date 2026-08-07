/**
 * wpm evidence chain — bridged to `commands/receipt/verify-chain.ts` (40
 * lines verifying the BLAKE3 receipt hash chain).
 */
import { defineVerb } from '@wasm4pm/noun-verb';
import { verifyChain } from '../../commands/receipt/verify-chain.js';
import { invokeLegacyCommandAsJson } from '../_bridge.js';

export const chainVerb = defineVerb({
  noun: 'evidence',
  verb: 'chain',
  summary: 'Verify the BLAKE3 receipt hash chain (was: wpm receipt verify-chain)',
  // Force the underlying command's `--json` path. Its human path checks
  // `result.valid`/`result.broken`, but the WASM verifier returns
  // `{ ok, chain_length }`; the mismatch made it print "Chain BROKEN" and
  // exit 1, so the bridge surfaced the WASM init log as an INVALID_INPUT
  // message. The `--json` branch emits the real `{ ok, chain_length }` object.
  handler: async (_args, ctx) => {
    const args = [...ctx.rawArgs];
    if (!args.includes('--json')) args.push('--json');
    return invokeLegacyCommandAsJson(verifyChain, args);
  },
});
