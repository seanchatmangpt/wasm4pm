import { defineCommand } from 'citty';
import { resolveConfig, checkConfigWarnings } from '@wasm4pm/config';
import { HumanFormatter, JSONFormatter } from '../../output.js';
import { EXIT_CODES } from '../../exit-codes.js';

export const configCheck = defineCommand({
  meta: {
    name: 'check',
    description: 'Run config warnings check — exit non-zero if any warnings exist',
  },
  args: {
    format: { type: 'string', description: 'Output format: human (default) or json' },
    quiet: { type: 'boolean', alias: 'q' },
  },
  async run(ctx) {
    const isJson = ctx.args.format === 'json';

    try {
      const config = await resolveConfig();
      const warnings = checkConfigWarnings(config);

      if (isJson) {
        const out = { warnings, all_clear: warnings.length === 0 };
        process.stdout.write(JSON.stringify(out, null, 2) + '\n');
      } else {
        if (warnings.length === 0) {
          if (!ctx.args.quiet) process.stderr.write('  ✓ Config check passed — no warnings.\n');
        } else {
          for (const w of warnings) {
            process.stderr.write(`  ✗ ${w.field}: ${w.warning}\n`);
          }
        }
      }

      process.exit(warnings.length > 0 ? EXIT_CODES.execution_error : EXIT_CODES.success);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (isJson) {
        process.stdout.write(JSON.stringify({ error: msg }) + '\n');
      } else {
        process.stderr.write(`  Config resolution failed: ${msg}\n`);
      }
      process.exit(EXIT_CODES.config_error);
    }
  },
});
