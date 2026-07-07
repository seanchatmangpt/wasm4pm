/**
 * wpm model simulate — bridged to the existing `commands/simulate.ts` body
 * (1264 lines of Monte Carlo simulation / process-tree playout; not
 * re-derived in this pass — see the migration report).
 */
import { defineVerb } from '@wasm4pm/noun-verb';
import { simulate } from '../../commands/simulate.js';
import { invokeLegacyCommandAsJson } from '../_bridge.js';

export const simulateVerb = defineVerb({
  noun: 'model',
  verb: 'simulate',
  summary: 'Monte Carlo simulation and process-tree playout (was: wpm simulate)',
  handler: async (_args, ctx) => invokeLegacyCommandAsJson(simulate, [...ctx.rawArgs]),
});
