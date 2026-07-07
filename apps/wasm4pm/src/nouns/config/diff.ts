/**
 * wpm config diff — bridged to `commands/config/diff.ts` (241 lines
 * comparing configs across environments).
 */
import { defineVerb } from '@wasm4pm/noun-verb';
import { configDiff } from '../../commands/config/diff.js';
import { invokeLegacyCommandAsJson } from '../_bridge.js';

export const diffVerb = defineVerb({
  noun: 'config',
  verb: 'diff',
  summary: 'Compare configs across environments (was: wpm config diff)',
  handler: async (_args, ctx) => invokeLegacyCommandAsJson(configDiff, [...ctx.rawArgs]),
});
