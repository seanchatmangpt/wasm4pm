/**
 * wpm model predict — bridged to the existing `commands/predict.ts` body
 * (1332 lines covering all six of van der Aalst's prediction perspectives;
 * not re-derived in this pass — see the migration report).
 */
import { defineVerb } from '@wasm4pm/noun-verb';
import { predict } from '../../commands/predict.js';
import { invokeLegacyCommandAsJson } from '../_bridge.js';

export const predictVerb = defineVerb({
  noun: 'model',
  verb: 'predict',
  summary: 'Predict next-activity, remaining-time, outcome, drift, features, or resource (was: wpm predict)',
  handler: async (_args, ctx) => invokeLegacyCommandAsJson(predict, [...ctx.rawArgs]),
});
