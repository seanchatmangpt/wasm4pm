import { defineCommand } from 'citty';
import { resolveConfig } from '@wasm4pm/config';
import { emitResult, makeResult, makeErrorResult } from '../../output.js';
import { EXIT_CODES } from '../../exit-codes.js';
import { exitWithFlush } from '../../otel/exit.js';
import { withSpanRaw } from '../_otel.js';

/**
 * Get a single config value by dot-path.
 *
 * Examples:
 *   wpm config get algorithm.name
 *   wpm config get execution.profile
 *   wpm config get observability.logLevel
 */
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

export const configGet = defineCommand({
  meta: {
    name: 'get',
    description:
      'Get a single resolved config value by dot-path.\n' +
      'Examples: wpm config get algorithm.name  |  wpm config get execution.profile',
  },
  args: {
    _: {
      type: 'positional',
      description: 'Dot-path to config field (e.g. algorithm.name)',
      required: true,
    },
    format: {
      type: 'string',
      default: 'human',
      description: 'Output format: human | json',
    },
    source: {
      type: 'boolean',
      default: false,
      description: 'Show the provenance source alongside the value',
    },
  },
  async run(ctx) {
    const t0 = performance.now();
    const format = (ctx.args.format as 'json' | 'human') ?? 'human';
    const showSource = Boolean(ctx.args.source);
    // citty puts positional args in ctx.args._
    const fieldPath = String(ctx.args._ ?? '').trim();

    return withSpanRaw('config.get', { 'config.field': fieldPath }, async () => {
      if (!fieldPath) {
        const result = makeErrorResult(
          'config get',
          'Missing field path. Usage: wpm config get <field.path>',
          EXIT_CODES.config_error,
          'CONFIG_ERROR'
        );
        emitResult(result, { format, quiet: false });
        return await exitWithFlush(EXIT_CODES.config_error);
      }

      try {
        const config = await resolveConfig({});
        const { found, value } = getValueByPath(config, fieldPath);

        if (!found) {
          const result = makeErrorResult(
            'config get',
            `Unknown config field: "${fieldPath}". Run "wpm config show" to see available fields.`,
            EXIT_CODES.config_error,
            'CONFIG_ERROR'
          );
          emitResult(result, { format, quiet: false });
          return await exitWithFlush(EXIT_CODES.config_error);
        }

        const provenance = (config.metadata?.provenance as Record<string, { source: string; path?: string }> | undefined)?.[fieldPath];

        const payload = {
          field: fieldPath,
          value,
          source: provenance?.source ?? 'unknown',
          source_path: provenance?.path,
        };

        const result = makeResult('config get', payload, performance.now() - t0);

        emitResult(result, { format, quiet: false }, (_res, projection) => {
          if (showSource) {
            const src = provenance?.source ?? 'unknown';
            const pathNote = provenance?.path ? ` (${provenance.path})` : '';
            projection.log(`${String(value)}  [from: ${src}${pathNote}]`);
          } else {
            projection.log(String(value));
          }
        });

        return await exitWithFlush(EXIT_CODES.success);
      } catch (error) {
        const result = makeErrorResult(
          'config get',
          error,
          EXIT_CODES.config_error,
          'CONFIG_ERROR'
        );
        emitResult(result, { format, quiet: false });
        return await exitWithFlush(EXIT_CODES.config_error);
      }
    });
  },
});
