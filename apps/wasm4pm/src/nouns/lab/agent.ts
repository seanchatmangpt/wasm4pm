/**
 * wpm lab agent — experimental forwarding shim over `commands/agent.ts`
 * (execute/list/audit/status/register/switch/reset subcommands; unchanged
 * behavior).
 */
import { defineVerb } from '@wasm4pm/noun-verb';
import { agent } from '../../commands/agent.js';
import { invokeLegacyCommandAsJson } from '../_bridge.js';

export const agentVerb = defineVerb({
  noun: 'lab',
  verb: 'agent',
  summary: 'Van der Aalst process-mining agents and RL autonomic agents (was: wpm agent)',
  stability: 'experimental',
  handler: async (_args, ctx) => invokeLegacyCommandAsJson(agent, [...ctx.rawArgs]),
});
