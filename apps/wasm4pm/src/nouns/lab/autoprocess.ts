/**
 * wpm lab autoprocess — experimental forwarding shim over
 * `commands/autoprocess.ts` (568 lines; Perception -> Decision ->
 * Protection -> Optimization control loop; unchanged behavior).
 */
import { defineVerb } from '@wasm4pm/noun-verb';
import { autoprocess } from '../../commands/autoprocess.js';
import { invokeLegacyCommandAsJson } from '../_bridge.js';

export const autoprocessVerb = defineVerb({
  noun: 'lab',
  verb: 'autoprocess',
  summary: 'Full autonomic control loop: Perception -> Decision -> Protection -> Optimization (was: wpm autoprocess)',
  stability: 'experimental',
  handler: async (_args, ctx) => invokeLegacyCommandAsJson(autoprocess, [...ctx.rawArgs]),
});
