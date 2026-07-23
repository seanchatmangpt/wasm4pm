/**
 * wpm log dedupe — bridged to the existing `commands/deduplicate.ts` body
 * (253 lines managing a persistent content-hash database across
 * scan/report/clear/load subcommands; not re-derived in this pass — see
 * the migration report).
 */
import { defineVerb } from '@wasm4pm/noun-verb';
import deduplicate from '../../commands/deduplicate.js';
import { invokeLegacyCommandAsJson } from '../_bridge.js';

export const dedupeVerb = defineVerb({
  noun: 'log',
  verb: 'dedupe',
  summary: 'Identify and manage duplicate logs by content hash: scan | report | clear | load (was: wpm deduplicate)',
  handler: async (_args, ctx) => invokeLegacyCommandAsJson(deduplicate, [...ctx.rawArgs]),
});
