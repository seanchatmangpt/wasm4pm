/**
 * wpm config export — bridged to `commands/config/export.ts` (84 lines
 * exporting resolved config as toml/json/env, or the algorithm registry).
 */
import { defineVerb } from '@wasm4pm/noun-verb';
import { configExport } from '../../commands/config/export.js';
import { invokeLegacyCommandAsJson } from '../_bridge.js';

export const exportVerb = defineVerb({
  noun: 'config',
  verb: 'export',
  summary: 'Export resolved config (toml|json|env) or the algorithm registry as JSON Schema (was: wpm config export)',
  handler: async (_args, ctx) => invokeLegacyCommandAsJson(configExport, [...ctx.rawArgs]),
});
