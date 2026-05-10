import { defineCommand } from 'citty';
import { resolveConfig, checkConfigWarnings } from '@wasm4pm/config';
import { emitResult, makeResult, makeErrorResult } from '../../output.js';
import { EXIT_CODES } from '../../exit-codes.js';
import { exitWithFlush } from '../../otel/exit.js';

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
    const t0 = performance.now();
    const format = (ctx.args.format as 'json' | 'human') ?? 'human';
    const quiet = ctx.args.quiet ?? false;

    try {
      const config = await resolveConfig();
      const warnings = checkConfigWarnings(config);
      const all_clear = warnings.length === 0;

      const result = makeResult('config check', { warnings, all_clear }, performance.now() - t0,
        all_clear ? EXIT_CODES.success : EXIT_CODES.execution_error);

      emitResult(result, { format, quiet }, (res, projection) => {
        if (res.payload.all_clear) {
          projection.success('Config check passed — no warnings.');
        } else {
          for (const w of res.payload.warnings) {
            projection.warn(`${(w as any).field}: ${(w as any).warning}`);
          }
        }
      });

      await exitWithFlush(result.exit_code);
    } catch (e) {
      const result = makeErrorResult('config check', e, EXIT_CODES.config_error, 'CONFIG_ERROR');
      emitResult(result, { format, quiet });
      await exitWithFlush(EXIT_CODES.config_error);
    }
  },
});
