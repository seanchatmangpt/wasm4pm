/**
 * wpm lab temporal — experimental forwarding shim over
 * `commands/temporal.ts` (775 lines; unchanged behavior).
 */
import { defineVerb } from '@wasm4pm/noun-verb';
import { temporal } from '../../commands/temporal.js';
import { invokeLegacyCommandAsJson } from '../_bridge.js';

export const temporalVerb = defineVerb({
  noun: 'lab',
  verb: 'temporal',
  summary: 'Analyze temporal profiles and performance patterns (was: wpm temporal)',
  stability: 'experimental',
  handler: async (_args, ctx) => invokeLegacyCommandAsJson(temporal, [...ctx.rawArgs]),
});
