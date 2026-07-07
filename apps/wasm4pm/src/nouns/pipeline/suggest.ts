/**
 * wpm pipeline suggest — bridged to `commands/suggest.ts` (393 lines
 * analyzing a log and recommending top algorithms for a goal; not
 * re-derived in this pass).
 */
import { defineVerb } from '@wasm4pm/noun-verb';
import { suggest } from '../../commands/suggest.js';
import { invokeLegacyCommandAsJson } from '../_bridge.js';

export const suggestVerb = defineVerb({
  noun: 'pipeline',
  verb: 'suggest',
  summary: 'Analyze a log and recommend top algorithms for a goal (was: wpm suggest)',
  handler: async (_args, ctx) => invokeLegacyCommandAsJson(suggest, [...ctx.rawArgs]),
});
