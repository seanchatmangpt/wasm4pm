/**
 * wpm lab ml — experimental forwarding shim over `commands/ml.ts`
 * (1200 lines; classify/cluster/forecast/anomaly/regress/pca subcommands;
 * unchanged behavior).
 */
import { defineVerb } from '@wasm4pm/noun-verb';
import { ml } from '../../commands/ml.js';
import { invokeLegacyCommandAsJson } from '../_bridge.js';

export const mlVerb = defineVerb({
  noun: 'lab',
  verb: 'ml',
  summary: 'ML analysis: classify | cluster | forecast | anomaly | regress | pca (was: wpm ml)',
  stability: 'experimental',
  handler: async (_args, ctx) => invokeLegacyCommandAsJson(ml, [...ctx.rawArgs]),
});
