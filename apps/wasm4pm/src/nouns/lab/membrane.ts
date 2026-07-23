/**
 * wpm lab membrane — experimental forwarding shim over the existing
 * `commands/membrane.ts` command group (1848 lines; show/init/build/check/
 * doctor/replay/verify/export subcommands unchanged). `ctx.rawArgs` is
 * forwarded verbatim so citty's own subcommand resolution inside the
 * legacy group picks the right one — e.g. `wpm lab membrane build log.xes`
 * forwards `['build', 'log.xes']`.
 */
import { defineVerb } from '@wasm4pm/noun-verb';
import { membrane } from '../../commands/membrane.js';
import { invokeLegacyCommandAsJson } from '../_bridge.js';

export const membraneVerb = defineVerb({
  noun: 'lab',
  verb: 'membrane',
  summary: 'AutoMembrane: show | init | build | check | doctor | replay | verify | export (was: wpm membrane)',
  stability: 'experimental',
  handler: async (_args, ctx) => invokeLegacyCommandAsJson(membrane, [...ctx.rawArgs]),
});
