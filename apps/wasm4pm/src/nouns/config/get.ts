/**
 * wpm config get — migrated from `commands/config/get.ts`.
 */
import { defineVerb, NounVerbError } from '@wasm4pm/noun-verb';
import { resolveConfig } from '@wasm4pm/config';
import { withSpanRaw } from '../../commands/_otel.js';

function getValueByPath(obj: unknown, dotPath: string): { found: boolean; value: unknown } {
  const parts = dotPath.split('.');
  let cur: unknown = obj;
  for (const part of parts) {
    if (cur === null || cur === undefined || typeof cur !== 'object') {
      return { found: false, value: undefined };
    }
    cur = (cur as Record<string, unknown>)[part];
  }
  return { found: cur !== undefined, value: cur };
}

export const getVerb = defineVerb({
  noun: 'config',
  verb: 'get',
  summary: 'Get a single resolved config value by dot-path (e.g. algorithm.name)',
  args: {
    field: { type: 'positional', description: 'Dot-path to config field', required: true },
  } as const,
  handler: async (args) => {
    const fieldPath = (args.field as string | undefined)?.trim();
    if (!fieldPath) {
      throw NounVerbError.invalidInput('Missing field path. Usage: wpm config get <field.path>');
    }
    return withSpanRaw('config.get', { 'config.field': fieldPath }, async () => {
      const config = await resolveConfig({});
      const { found, value } = getValueByPath(config, fieldPath);
      if (!found) {
        throw NounVerbError.invalidInput(`Unknown config field: "${fieldPath}". Run "wpm config show" to see available fields.`);
      }
      const provenance = (
        (config as { metadata?: { provenance?: Record<string, { source: string; path?: string }> } }).metadata
          ?.provenance
      )?.[fieldPath];
      return { field: fieldPath, value, source: provenance?.source ?? 'unknown', source_path: provenance?.path };
    });
  },
});
