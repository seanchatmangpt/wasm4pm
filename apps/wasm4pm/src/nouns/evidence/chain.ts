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
  handler: async (_args, ctx) => invokeLegacyCommandAsJson(verifyChain, [...ctx.rawArgs]),
});
