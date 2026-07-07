/**
 * wpm lab cognition — experimental forwarding shim over
 * `commands/cognition.ts` (run/verify/watch/doctor/receipt/explain/plan/
 * replay/inspect/adversarial subcommands; unchanged behavior).
 */
import { defineVerb } from '@wasm4pm/noun-verb';
import { cognition } from '../../commands/cognition.js';
import { invokeLegacyCommandAsJson } from '../_bridge.js';

export const cognitionVerb = defineVerb({
  noun: 'lab',
  verb: 'cognition',
  summary: 'Cognition breed run/verify/watch/doctor/receipt/explain/plan/replay/inspect/adversarial (was: wpm cognition)',
  stability: 'experimental',
  handler: async (_args, ctx) => invokeLegacyCommandAsJson(cognition, [...ctx.rawArgs]),
});
