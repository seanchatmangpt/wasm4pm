/**
 * wpm lab wasm-server — experimental forwarding shim over
 * `commands/wasm-server.ts` (254 lines; start/stop/status/reset
 * subcommands for the long-lived WASM server; unchanged behavior).
 */
import { defineVerb } from '@wasm4pm/noun-verb';
import { wasmServer } from '../../commands/wasm-server.js';
import { invokeLegacyCommandAsJson } from '../_bridge.js';

export const wasmServerVerb = defineVerb({
  noun: 'lab',
  verb: 'wasm-server',
  summary: 'Long-lived WASM server: start | stop | status | reset (was: wpm wasm-server)',
  stability: 'experimental',
  handler: async (_args, ctx) => invokeLegacyCommandAsJson(wasmServer, [...ctx.rawArgs]),
});
