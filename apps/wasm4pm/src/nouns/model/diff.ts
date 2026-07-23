/**
 * wpm model diff — bridged to the existing `commands/diff.ts` body (844
 * lines of log/model diffing; not re-derived in this pass — see the
 * migration report).
 */
import { defineVerb } from '@wasm4pm/noun-verb';
import { diff } from '../../commands/diff.js';
import { invokeLegacyCommandAsJson } from '../_bridge.js';

export const diffVerb = defineVerb({
  noun: 'model',
  verb: 'diff',
  summary: 'Compare two logs or models — activities, edges, Jaccard distance (was: wpm diff)',
  handler: async (_args, ctx) => invokeLegacyCommandAsJson(diff, [...ctx.rawArgs]),
});
