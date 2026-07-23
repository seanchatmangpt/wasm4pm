/**
 * wpm config set — bridged to `commands/config/set.ts` (220 lines mutating
 * wasm4pm.toml on disk; bridged rather than re-derived so the exact
 * existing write/merge semantics are preserved unmodified).
 */
import { defineVerb } from '@wasm4pm/noun-verb';
import { configSet } from '../../commands/config/set.js';
import { invokeLegacyCommandAsJson } from '../_bridge.js';

export const setVerb = defineVerb({
  noun: 'config',
  verb: 'set',
  summary: 'Set a value in wasm4pm.toml (was: wpm config set)',
  handler: async (_args, ctx) => invokeLegacyCommandAsJson(configSet, [...ctx.rawArgs]),
});
