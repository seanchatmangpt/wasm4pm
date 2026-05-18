import { defineCommand } from 'citty';
import { resolveConfig, configToToml, configToEnv } from '@wasm4pm/config';
import { registryToJsonSchema } from '@wasm4pm/kernel';
import { emitResult, makeResult, makeErrorResult } from '../../output.js';
import { EXIT_CODES } from '../../exit-codes.js';
import { exitWithFlush } from '../../otel/exit.js';
import { withSpanRaw } from '../_otel.js';

export const configExport = defineCommand({
  meta: {
    name: 'export',
    description: 'Export current resolved config as TOML, JSON, or .env format',
  },
  args: {
    format: {
      type: 'string',
      default: 'toml',
      description: 'Export format: toml (default), json, env',
    },
    registry: {
      type: 'boolean',
      description: 'Export algorithm registry as JSON Schema (ignores --format, always JSON)',
    },
    quiet: { type: 'boolean', alias: 'q' },
  },
  async run(ctx) {
    const t0 = performance.now();
    const fmt = (ctx.args.format ?? 'toml').toLowerCase();
    const quiet = ctx.args.quiet ?? false;
    const exportRegistry = ctx.args.registry ?? false;

    return withSpanRaw('config.export', { 'config.format': fmt, 'export.registry': exportRegistry }, async () => {
      try {
        let content: string;

        // Handle --registry flag (exports algorithm JSON Schema)
        if (exportRegistry) {
          const schemas = registryToJsonSchema();
          content = JSON.stringify({
            $schema: 'http://json-schema.org/draft-07/schema#',
            title: 'wasm4pm Algorithm Registry',
            description: 'JSON Schema definitions for all wasm4pm registered algorithms',
            algorithms: schemas,
          }, null, 2);
          // Export commands write artifact content directly to stdout — the content IS the machine output
          process.stdout.write(content + '\n');
          return await exitWithFlush(EXIT_CODES.success);
        }

        // Standard config export
        const config = await resolveConfig();
        if (fmt === 'toml') {
          content = configToToml(config);
        } else if (fmt === 'env') {
          content = configToEnv(config);
        } else if (fmt === 'json') {
          content = JSON.stringify(config, null, 2);
        } else {
          const result = makeErrorResult(
            'config export',
            `Unknown format: ${fmt}. Use toml, json, or env.`,
            EXIT_CODES.config_error,
            'CONFIG_ERROR'
          );
          emitResult(result, { format: 'human', quiet });
          return await exitWithFlush(EXIT_CODES.config_error);
        }

        // Export commands write artifact content directly to stdout — the content IS the machine output
        process.stdout.write(content + '\n');
        return await exitWithFlush(EXIT_CODES.success);
      } catch (e) {
        const result = makeErrorResult(
          'config export',
          e,
          EXIT_CODES.execution_error,
          'EXPORT_ERROR'
        );
        emitResult(result, { format: 'human', quiet });
        return await exitWithFlush(EXIT_CODES.execution_error);
      }
    });
  },
});
