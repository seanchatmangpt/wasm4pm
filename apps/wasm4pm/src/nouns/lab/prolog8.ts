/**
 * wpm lab prolog8 — experimental forwarding shim over `commands/prolog8.ts`
 * (657 lines; show/query/replay subcommands; unchanged behavior). Note
 * `wpm evidence replay` also forwards here for the specific `replay`
 * subcommand — this verb is the full surface, including `show`/`query`.
 */
import { defineVerb } from '@wasm4pm/noun-verb';
import { prolog8 } from '../../commands/prolog8.js';
import { invokeLegacyCommandAsJson } from '../_bridge.js';

export const prolog8Verb = defineVerb({
  noun: 'lab',
  verb: 'prolog8',
  summary: 'Byte-capped proof engine: show | query | replay (was: wpm prolog8)',
  stability: 'experimental',
  handler: async (_args, ctx) => invokeLegacyCommandAsJson(prolog8, [...ctx.rawArgs]),
});
