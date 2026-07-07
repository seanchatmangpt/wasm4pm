/**
 * wpm config reset — bridged to `commands/config/reset.ts` (104 lines
 * resetting wasm4pm.toml to defaults; bridged to preserve exact semantics).
 */
import { defineVerb } from '@wasm4pm/noun-verb';
import { configReset } from '../../commands/config/reset.js';
import { invokeLegacyCommandAsJson } from '../_bridge.js';

export const resetVerb = defineVerb({
  noun: 'config',
  verb: 'reset',
  summary: 'Reset wasm4pm.toml to defaults (was: wpm config reset)',
  handler: async (_args, ctx) => invokeLegacyCommandAsJson(configReset, [...ctx.rawArgs]),
});
