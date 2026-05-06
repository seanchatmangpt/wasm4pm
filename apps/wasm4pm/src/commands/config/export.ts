import { defineCommand } from 'citty';
import { resolveConfig, getExampleTomlConfig, getExampleEnvFile } from '@wasm4pm/config';
import { EXIT_CODES } from '../../exit-codes.js';

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
    const fmt = (ctx.args.format ?? 'toml').toLowerCase();

    try {
      if (fmt === 'toml') {
        process.stdout.write(getExampleTomlConfig() + '\n');
      } else if (fmt === 'env') {
        process.stdout.write(getExampleEnvFile() + '\n');
      } else if (fmt === 'json') {
        const config = await resolveConfig();
        process.stdout.write(JSON.stringify(config, null, 2) + '\n');
      } else {
        process.stderr.write(`Unknown format: ${fmt}. Use toml, json, or env.\n`);
        process.exit(EXIT_CODES.config_error);
      }

      process.exit(EXIT_CODES.success);
    } catch (e) {
      process.stderr.write(`Export failed: ${e instanceof Error ? e.message : String(e)}\n`);
      process.exit(EXIT_CODES.execution_error);
    }
  },
});
