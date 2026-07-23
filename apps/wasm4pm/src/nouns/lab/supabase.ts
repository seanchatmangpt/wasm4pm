/**
 * wpm lab supabase — experimental forwarding shim over
 * `commands/supabase.ts` (582 lines; sync-receipts/ingest-truex/doctor/
 * sync-queue subcommands; unchanged behavior).
 */
import { defineVerb } from '@wasm4pm/noun-verb';
import { supabase } from '../../commands/supabase.js';
import { invokeLegacyCommandAsJson } from '../_bridge.js';

export const supabaseVerb = defineVerb({
  noun: 'lab',
  verb: 'supabase',
  summary: 'Supabase sync: sync-receipts | ingest-truex | doctor | sync-queue (was: wpm supabase)',
  stability: 'experimental',
  handler: async (_args, ctx) => invokeLegacyCommandAsJson(supabase, [...ctx.rawArgs]),
});
