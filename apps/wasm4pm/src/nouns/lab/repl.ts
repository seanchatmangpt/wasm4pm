/**
 * wpm lab repl — experimental forwarding shim over `commands/repl.ts`
 * (971 lines interactive REPL; unchanged behavior). Note: an interactive
 * REPL does not fit the "one JSON result" contract at all — this bridge
 * will capture whatever the session prints once it exits, not stream it.
 * Prefer running `wpm lab repl` directly (outside `++` chaining) rather
 * than through introspection/chaining paths.
 */
import { defineVerb } from '@wasm4pm/noun-verb';
import { repl } from '../../commands/repl.js';
import { invokeLegacyCommandAsJson } from '../_bridge.js';

export const replVerb = defineVerb({
  noun: 'lab',
  verb: 'repl',
  summary: 'Interactive REPL: run commands without re-loading WASM each time (was: wpm repl)',
  stability: 'experimental',
  handler: async (_args, ctx) => invokeLegacyCommandAsJson(repl, [...ctx.rawArgs]),
});
