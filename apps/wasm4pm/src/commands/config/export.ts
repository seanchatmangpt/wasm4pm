import { defineCommand } from 'citty';
import { resolveConfig, getExampleTomlConfig, getExampleEnvFile } from '@wasm4pm/config';
import { emitResult, makeResult, makeErrorResult } from '../../output.js';
import { EXIT_CODES } from '../../exit-codes.js';
import { exitWithFlush } from '../../otel/exit.js';

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
    quiet: { type: 'boolean', alias: 'q' },
  },
  async run(ctx) {
    const t0 = performance.now();
    const fmt = (ctx.args.format ?? 'toml').toLowerCase();
    const quiet = ctx.args.quiet ?? false;

    try {
      let content: string;
      if (fmt === 'toml' || fmt === 'env') {
        content = fmt === 'toml' ? getExampleTomlConfig() : getExampleEnvFile();
      } else if (fmt === 'json') {
        const config = await resolveConfig();
        content = JSON.stringify(config, null, 2);
      } else {
        const result = makeErrorResult('config export', `Unknown format: ${fmt}. Use toml, json, or env.`,
          EXIT_CODES.config_error, 'CONFIG_ERROR');
        emitResult(result, { format: 'human', quiet });
        return await exitWithFlush(EXIT_CODES.config_error);
        return;
      }

      // Export commands write artifact content directly to stdout — the content IS the machine output
      process.stdout.write(content + '\n');
      return await exitWithFlush(EXIT_CODES.success);
    } catch (e) {
      const result = makeErrorResult('config export', e, EXIT_CODES.execution_error, 'EXPORT_ERROR');
      emitResult(result, { format: 'human', quiet });
      return await exitWithFlush(EXIT_CODES.execution_error);
    }
  },
});
