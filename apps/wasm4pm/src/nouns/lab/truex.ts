/**
 * wpm lab truex — experimental forwarding shim over `commands/truex.ts`
 * (725 lines; unchanged behavior).
 */
import { defineVerb } from '@wasm4pm/noun-verb';
import { truex } from '../../commands/truex.js';
import { invokeLegacyCommandAsJson } from '../_bridge.js';

export const truexVerb = defineVerb({
  noun: 'lab',
  verb: 'truex',
  summary: 'Truex envelope lifecycle tooling (was: wpm truex)',
  stability: 'experimental',
  handler: async (_args, ctx) => invokeLegacyCommandAsJson(truex, [...ctx.rawArgs]),
});
