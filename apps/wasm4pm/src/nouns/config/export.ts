/**
 * wpm config export — bridged to `commands/config/export.ts` (84 lines
 * exporting resolved config as toml/json/env, or the algorithm registry).
 */
import { defineVerb } from '@wasm4pm/noun-verb';
import { configExport } from '../../commands/config/export.js';
import { invokeLegacyCommandAsJson } from '../_bridge.js';

/**
 * Accept a bare positional format (`wpm config export toml`) as an alias for
 * `--format toml`. The legacy command only reads `--format`, so a positional
 * was previously ignored and silently produced the default JSON. If the caller
 * already passed `--format`, the positional is left untouched.
 */
function normalizeExportArgs(rawArgs: readonly string[]): string[] {
  const args = [...rawArgs];
  const hasFormatFlag = args.some((a) => a === '--format' || a.startsWith('--format='));
  if (hasFormatFlag) return args;
  const idx = args.findIndex((a) => ['toml', 'json', 'env'].includes(a.toLowerCase()));
  if (idx === -1) return args;
  const fmt = args[idx]!;
  args.splice(idx, 1);
  args.push(`--format=${fmt}`);
  return args;
}

export const exportVerb = defineVerb({
  noun: 'config',
  verb: 'export',
  summary: 'Export resolved config (toml|json|env) or the algorithm registry as JSON Schema (was: wpm config export)',
  handler: async (_args, ctx) => invokeLegacyCommandAsJson(configExport, normalizeExportArgs(ctx.rawArgs)),
});
