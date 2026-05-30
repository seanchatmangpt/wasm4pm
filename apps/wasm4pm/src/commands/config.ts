import { defineCommand } from 'citty';
import { configShow } from './config/show.js';
import { configCheck } from './config/check.js';
import { configVerify } from './config/verify.js';
import { configExport } from './config/export.js';
import { configGet } from './config/get.js';
import { configSet } from './config/set.js';
import { configValidate } from './config/validate.js';
import { configEnv } from './config/env.js';
import { configDoctor } from './config/doctor.js';
import { configDiff } from './config/diff.js';
import { configReset } from './config/reset.js';
import { exitWithFlush } from '../otel/exit.js';
import { withSpanRaw } from './_otel.js';
import { STANDARD_EXIT_CODE_DOCS } from '../help-standards.js';

export const config = defineCommand({
  meta: {
    name: 'config',
    description: `Inspect and manage wasm4pm configuration. Example: wpm config show --detailed

${STANDARD_EXIT_CODE_DOCS}`,
  },
  async run() {
    return withSpanRaw('config.help', {}, async () => {
      process.stdout.write(`
  wpm config — Configuration Management

  Inspect:
    wpm config show   [--source]          Display config values; --source shows provenance
    wpm config get    <field>             Get a single config value by dot-path
    wpm config env                        Show all WASM4PM_* env vars with SET/NOT SET status

  Modify:
    wpm config set    <field> <value>     Set a value in wasm4pm.toml
    wpm config reset                      Reset wasm4pm.toml to defaults

  Validate:
    wpm config validate                   Validate current config (schema + semantic checks)
    wpm config check                      Warn check — exit non-zero if any warnings exist
    wpm config verify                     Full gate: schema + provenance + hash + zero warnings
    wpm config doctor                     Detect common config problems with recommendations

  Export & Compare:
    wpm config export [--format toml|json|env]  Export resolved config
                      [--registry]              Export algorithm registry as JSON Schema
    wpm config diff   [--env <name>]            Compare configs across environments

  Run "wpm config <subcommand> --help" for detailed usage.
`);
      return await exitWithFlush(0);
    });
  },
  subCommands: {
    show: configShow,
    get: configGet,
    set: configSet,
    validate: configValidate,
    check: configCheck,
    verify: configVerify,
    export: configExport,
    env: configEnv,
    doctor: configDoctor,
    diff: configDiff,
    reset: configReset,
  },
});
