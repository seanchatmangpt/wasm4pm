/**
 * wpm evidence verify — bridged to `commands/verify.ts` (167 lines
 * re-hashing and validating a saved receipt). Also the target for the
 * retired `wpm truex verify` (receipt-shaped verification of a Truex
 * envelope — same "verify a receipt" family).
 */
import { defineVerb } from '@wasm4pm/noun-verb';
import { verify } from '../../commands/verify.js';
import { invokeLegacyCommandAsJson } from '../_bridge.js';

export const verifyVerb = defineVerb({
  noun: 'evidence',
  verb: 'verify',
  summary: 'Re-hash and validate a saved receipt for tamper detection (was: wpm verify, wpm truex verify)',
  handler: async (_args, ctx) => invokeLegacyCommandAsJson(verify, [...ctx.rawArgs]),
});
