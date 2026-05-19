import { defineCommand } from 'citty';
import { configShow } from './config/show.js';
import { configCheck } from './config/check.js';
import { configVerify } from './config/verify.js';
import { configExport } from './config/export.js';
import { exitWithFlush } from '../otel/exit.js';
import { withSpanRaw } from './_otel.js';

export const config = defineCommand({
  meta: {
    name: 'config',
    description: 'Inspect and manage wasm4pm configuration. Example: wpm config show --detailed',
  },
  async run() {
    return withSpanRaw('config.help', {}, async () => {
      process.stdout.write(`
  wpm config — Configuration Management  (verb8 grammar)

  Subcommands:
    wpm config show   [--detailed]        Display config values with source + provenance
    wpm config check                      Warn check — exit non-zero if warnings exist
    wpm config verify                     Schema + provenance + hash + zero warnings gate
    wpm config export [--format toml|json|env]  Export resolved config
                      [--registry]        Export algorithm registry as JSON Schema

  Run "wpm config <subcommand> --help" for detailed usage.
`);
      return await exitWithFlush(0);
    });
  },
  subCommands: {
    show: configShow,
    check: configCheck,
    verify: configVerify,
    export: configExport,
  },
});
