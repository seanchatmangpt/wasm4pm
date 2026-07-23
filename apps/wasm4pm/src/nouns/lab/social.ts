/**
 * wpm lab social — experimental forwarding shim over `commands/social.ts`
 * (1110 lines; handover/working-together network mining; unchanged
 * behavior).
 */
import { defineVerb } from '@wasm4pm/noun-verb';
import { social } from '../../commands/social.js';
import { invokeLegacyCommandAsJson } from '../_bridge.js';

export const socialVerb = defineVerb({
  noun: 'lab',
  verb: 'social',
  summary: 'Mine social networks: handover, working-together (was: wpm social)',
  stability: 'experimental',
  handler: async (_args, ctx) => invokeLegacyCommandAsJson(social, [...ctx.rawArgs]),
});
