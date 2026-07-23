/**
 * wpm lab timeout — experimental forwarding shim over
 * `commands/timeout.ts` (237 lines; unchanged behavior).
 */
import { defineVerb } from '@wasm4pm/noun-verb';
import { timeout } from '../../commands/timeout.js';
import { invokeLegacyCommandAsJson } from '../_bridge.js';

export const timeoutVerb = defineVerb({
  noun: 'lab',
  verb: 'timeout',
  summary: 'Adaptive timeout inspection/tuning (was: wpm timeout)',
  stability: 'experimental',
  handler: async (_args, ctx) => invokeLegacyCommandAsJson(timeout, [...ctx.rawArgs]),
});
