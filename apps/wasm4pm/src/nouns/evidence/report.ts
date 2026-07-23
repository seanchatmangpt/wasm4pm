/**
 * wpm evidence report — bridged to `commands/results.ts` (1808 lines
 * viewing saved discovery/prediction results; not re-derived in this pass).
 * Also the target for the retired `wpm proof` (promote a proof-work pack —
 * a different kind of report over the same evidence directory).
 */
import { defineVerb } from '@wasm4pm/noun-verb';
import { results } from '../../commands/results.js';
import { invokeLegacyCommandAsJson } from '../_bridge.js';

export const reportVerb = defineVerb({
  noun: 'evidence',
  verb: 'report',
  summary: 'View saved discovery/prediction results and evidence reports (was: wpm results, wpm proof)',
  handler: async (_args, ctx) => invokeLegacyCommandAsJson(results, [...ctx.rawArgs]),
});
