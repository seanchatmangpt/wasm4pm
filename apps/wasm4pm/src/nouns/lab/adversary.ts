/**
 * wpm lab adversary — experimental forwarding shim over
 * `commands/adversary.ts` (1562 lines; unchanged behavior).
 */
import { defineVerb } from '@wasm4pm/noun-verb';
import { adversary } from '../../commands/adversary.js';
import { invokeLegacyCommandAsJson } from '../_bridge.js';

export const adversaryVerb = defineVerb({
  noun: 'lab',
  verb: 'adversary',
  summary: 'Adversarial proof lifecycle convergence test, 18 probes (was: wpm adversary)',
  stability: 'experimental',
  handler: async (_args, ctx) => invokeLegacyCommandAsJson(adversary, [...ctx.rawArgs]),
});
