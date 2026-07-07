/**
 * wpm lab feedback — experimental forwarding shim over
 * `commands/feedback.ts` (895 lines; unchanged behavior).
 */
import { defineVerb } from '@wasm4pm/noun-verb';
import { feedback } from '../../commands/feedback.js';
import { invokeLegacyCommandAsJson } from '../_bridge.js';

export const feedbackVerb = defineVerb({
  noun: 'lab',
  verb: 'feedback',
  summary: 'Algorithm feedback capture/ranking tooling (was: wpm feedback)',
  stability: 'experimental',
  handler: async (_args, ctx) => invokeLegacyCommandAsJson(feedback, [...ctx.rawArgs]),
});
