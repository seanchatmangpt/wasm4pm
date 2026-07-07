/**
 * wpm evidence show — bridged to `commands/receipt/show.ts` (307 lines).
 */
import { defineVerb } from '@wasm4pm/noun-verb';
import { show } from '../../commands/receipt/show.js';
import { invokeLegacyCommandAsJson } from '../_bridge.js';

export const showVerb = defineVerb({
  noun: 'evidence',
  verb: 'show',
  summary: 'Show a saved receipt (was: wpm receipt show)',
  handler: async (_args, ctx) => invokeLegacyCommandAsJson(show, [...ctx.rawArgs]),
});
