/**
 * wpm lab oracle — experimental forwarding shim over `commands/oracle.ts`
 * (conform/attest subcommands; unchanged behavior — including the known
 * defect #2 vacuous-admit bug in `conform`'s episode grouping). This is
 * intentionally kept available under `lab` (with the experimental banner)
 * as the legacy reference implementation; the FIXED replacement is
 * `wpm model check --mode oracle`, which every caller should prefer.
 */
import { defineVerb } from '@wasm4pm/noun-verb';
import { oracle } from '../../commands/oracle.js';
import { invokeLegacyCommandAsJson } from '../_bridge.js';

export const oracleVerb = defineVerb({
  noun: 'lab',
  verb: 'oracle',
  summary: '[legacy, has known defects] OCEL episode conformance: conform | attest — prefer "model check --mode oracle" (was: wpm oracle)',
  stability: 'experimental',
  handler: async (_args, ctx) => invokeLegacyCommandAsJson(oracle, [...ctx.rawArgs]),
});
