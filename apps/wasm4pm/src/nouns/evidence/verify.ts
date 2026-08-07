/**
 * wpm evidence verify — bridged to `commands/verify.ts`, which runs the
 * parity/determinism certification gate suite (`runCertification` from
 * `@wasm4pm/testing`) and returns `{ passed, gates: [{ gate, passed, ... }] }`.
 * Also the target for the retired `wpm verify` / `wpm truex verify`.
 *
 * Use `wpm evidence chain` to verify the BLAKE3 receipt hash chain and
 * `wpm evidence show <receipt>` to inspect a single receipt's validity.
 */
import { defineVerb } from '@wasm4pm/noun-verb';
import { verify } from '../../commands/verify.js';
import { invokeLegacyCommandAsJson } from '../_bridge.js';

export const verifyVerb = defineVerb({
  noun: 'evidence',
  verb: 'verify',
  summary: 'Run the parity/determinism certification gate suite (was: wpm verify, wpm truex verify)',
  handler: async (_args, ctx) => invokeLegacyCommandAsJson(verify, [...ctx.rawArgs]),
});
