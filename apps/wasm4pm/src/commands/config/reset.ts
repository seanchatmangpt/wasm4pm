import { defineCommand } from 'citty';
import * as fs from 'node:fs/promises';
import * as fss from 'node:fs';
import * as path from 'node:path';
import { getExampleTomlConfig } from '@wasm4pm/config';
import { emitResult, makeResult, makeErrorResult } from '../../output.js';
import { EXIT_CODES } from '../../exit-codes.js';
import { exitWithFlush } from '../../otel/exit.js';
import { withSpanRaw } from '../_otel.js';

export const configReset = defineCommand({
  meta: {
    name: 'reset',
    description:
      'Reset wasm4pm.toml to default values.\n' +
      'Creates a new wasm4pm.toml with documented defaults. Does not overwrite without --force.\n' +
      'Examples: wpm config reset  |  wpm config reset --force',
  },
  args: {
    force: {
      type: 'boolean',
      default: false,
      description: 'Overwrite existing wasm4pm.toml without confirmation',
    },
    format: {
      type: 'string',
      default: 'human',
      description: 'Output format: human | json',
    },
    quiet: {
      type: 'boolean',
      alias: 'q',
      description: 'Suppress non-error output',
    },
  },
  async run(ctx) {
    const t0 = performance.now();
    const format = (ctx.args.format as 'json' | 'human') ?? 'human';
    const force = Boolean(ctx.args.force);
    const quiet = Boolean(ctx.args.quiet);

    return withSpanRaw('config.reset', { 'config.force': force }, async () => {
      const tomlPath = path.join(process.cwd(), 'wasm4pm.toml');
      const alreadyExists = fss.existsSync(tomlPath);

      try {
        if (alreadyExists && !force) {
          const result = makeErrorResult(
            'config reset',
            new Error(
              `wasm4pm.toml already exists at ${tomlPath}.\n` +
              `  Use --force to overwrite: wpm config reset --force`
            ),
            EXIT_CODES.config_error,
            'CONFIG_ERROR'
          );
          emitResult(result, { format, quiet });
          return await exitWithFlush(EXIT_CODES.config_error);
        }

        // Back up existing file if overwriting
        if (alreadyExists && force) {
          const backupPath = `${tomlPath}.bak`;
          await fs.copyFile(tomlPath, backupPath);
        }

        const defaultToml = getExampleTomlConfig();
        await fs.writeFile(tomlPath, defaultToml, 'utf-8');

        const payload = {
          path: tomlPath,
          backed_up: alreadyExists && force,
          backup_path: alreadyExists && force ? `${tomlPath}.bak` : null,
          created: !alreadyExists,
          reset: alreadyExists,
        };
        const result = makeResult('config reset', payload, performance.now() - t0);

        emitResult(result, { format, quiet }, (res, projection) => {
          const p = res.payload;
          if (p.backed_up) {
            projection.info(`Backed up existing config to ${p.backup_path}`);
          }
          projection.success(
            `${p.created ? 'Created' : 'Reset'} wasm4pm.toml at ${p.path}`
          );
          projection.log('');
          projection.log('Default config written. Edit wasm4pm.toml or run "wpm config set <field> <value>" to customize.');
        });

        return await exitWithFlush(EXIT_CODES.success);
      } catch (error) {
        const result = makeErrorResult(
          'config reset',
          error,
          EXIT_CODES.config_error,
          'CONFIG_ERROR'
        );
        emitResult(result, { format, quiet });
        return await exitWithFlush(EXIT_CODES.config_error);
      }
    });
  },
});
