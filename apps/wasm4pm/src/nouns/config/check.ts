/**
 * wpm config check — migrated from `commands/config/check.ts`. Also the
 * new target for the retired `config validate`/`config verify`/`config
 * doctor` synonyms (see `nouns/_removed.ts`).
 */
import { existsSync } from 'node:fs';
import { defineVerb, NounVerbError } from '@wasm4pm/noun-verb';
import { resolveConfig, checkConfigWarnings } from '@wasm4pm/config';
import { withSpanRaw } from '../../commands/_otel.js';

export const checkVerb = defineVerb({
  noun: 'config',
  verb: 'check',
  summary: 'Run config warnings check — non-zero exit if any warnings exist (was: config validate/verify/doctor)',
  args: {
    config: { type: 'string', description: 'Path to a specific config file' },
  } as const,
  handler: async (args) => {
    return withSpanRaw('config.check', {}, async () => {
      const configPath = args.config as string | undefined;
      const options: { configSearchPaths?: string[] } = {};
      if (configPath) {
        if (!existsSync(configPath)) {
          throw NounVerbError.invalidInput(`Config file not found: ${configPath}`);
        }
        options.configSearchPaths = [configPath];
      }
      const config = await resolveConfig(options);
      const warnings = checkConfigWarnings(config);
      const all_clear = warnings.length === 0;
      if (!all_clear) {
        throw new NounVerbError('EXECUTION_ERROR', `Config has ${warnings.length} warning(s): ${JSON.stringify(warnings)}`, {
          details: { warnings },
        });
      }
      return { warnings, all_clear };
    });
  },
});
