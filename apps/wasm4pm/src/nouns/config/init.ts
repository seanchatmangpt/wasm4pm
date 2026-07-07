/**
 * wpm config init — bridged to the existing `commands/init.ts` body (598
 * lines scaffolding wasm4pm.toml + .env.example; not re-derived in this
 * pass — see the migration report). Absorbs the old top-level `wpm init`.
 */
import { defineVerb } from '@wasm4pm/noun-verb';
import { init } from '../../commands/init.js';
import { invokeLegacyCommandAsJson } from '../_bridge.js';

export const initVerb = defineVerb({
  noun: 'config',
  verb: 'init',
  summary: 'Scaffold wasm4pm.toml + .env.example in the current directory (was: wpm init)',
  handler: async (_args, ctx) => invokeLegacyCommandAsJson(init, [...ctx.rawArgs]),
});
