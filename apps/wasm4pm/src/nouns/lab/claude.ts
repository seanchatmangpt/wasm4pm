/**
 * wpm lab claude — experimental forwarding shim over `commands/claude.ts`
 * (817 lines; session/hooks integration status; unchanged behavior).
 */
import { defineVerb } from '@wasm4pm/noun-verb';
import { claude } from '../../commands/claude.js';
import { invokeLegacyCommandAsJson } from '../_bridge.js';

export const claudeVerb = defineVerb({
  noun: 'lab',
  verb: 'claude',
  summary: 'Claude Code integration status: session, hooks, proof audit (was: wpm claude)',
  stability: 'experimental',
  handler: async (_args, ctx) => invokeLegacyCommandAsJson(claude, [...ctx.rawArgs]),
});
