/**
 * wpm lab trace — experimental forwarding shim over `commands/trace.ts`
 * (2265 lines; trace-to-POWL v2 pipeline: ingest/ocel/powl/conform
 * subcommands; unchanged behavior).
 */
import { defineVerb } from '@wasm4pm/noun-verb';
import { trace } from '../../commands/trace.js';
import { invokeLegacyCommandAsJson } from '../_bridge.js';

export const traceVerb = defineVerb({
  noun: 'lab',
  verb: 'trace',
  summary: 'Trace-to-POWL v2 pipeline: ingest | ocel | powl | conform (was: wpm trace)',
  stability: 'experimental',
  handler: async (_args, ctx) => invokeLegacyCommandAsJson(trace, [...ctx.rawArgs]),
});
