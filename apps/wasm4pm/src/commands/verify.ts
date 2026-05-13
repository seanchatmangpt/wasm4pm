import { defineCommand } from 'citty';
import { runCertification } from '@wasm4pm/testing';
import { emitResult, makeResult, makeErrorResult } from '../output.js';
import { EXIT_CODES } from '../exit-codes.js';
import { withSpan } from './_otel.js';
import pkg from '../../package.json' with { type: 'json' };
import { exitWithFlush } from '../otel/exit.js';

export const verify = defineCommand({
  meta: {
    name: 'verify',
    description: 'Run definition-of-done certification gates',
  },
  args: {
    fast: {
      type: 'boolean',
      description: 'Skip WASM-dependent checks (schema, parity, perf)',
    },
    format: {
      type: 'string',
      default: 'human',
      description: 'Output format: human | json',
    },
    verbose: { type: 'boolean', alias: 'v' },
    quiet: { type: 'boolean', alias: 'q' },
  },
  async run(ctx) {
    const t0 = performance.now();
    const format = (ctx.args.format as 'json' | 'human') ?? 'human';
    const verbose = ctx.args.verbose ?? false;
    const quiet = ctx.args.quiet ?? false;

    return withSpan('verify', { fast: Boolean(ctx.args.fast), format }, async () => {
    try {
      const version = pkg.version ?? '26.4.23';
      const report = await runCertification(version, { fast: ctx.args.fast ?? false });

      const passCount = report.gates.filter((g) => g.passed).length;
      const failCount = report.gates.filter((g) => !g.passed).length;
      const exitCode = failCount > 0 ? EXIT_CODES.execution_error : EXIT_CODES.success;

      const result = makeResult('verify', {
        passed: report.passed,
        gates: report.gates,
        summary: report.summary,
        pass_count: passCount,
        fail_count: failCount,
      }, performance.now() - t0, exitCode);

      emitResult(result, { format, verbose, quiet }, (res, projection) => {
        projection.info('wpm verify — Definition-of-Done gate check');
        projection.info('');
        for (const gate of res.payload.gates) {
          const status = gate.passed ? '[PASS]' : '[FAIL]';
          const duration = gate.duration_ms ? ` (${gate.duration_ms}ms)` : '';
          projection.log(`  ${status} ${gate.gate.padEnd(25)} ${duration}   ${gate.details ?? ''}`);
        }
        projection.log('');
        projection.log(`${res.payload.pass_count}/${res.payload.gates.length} gates passed`);
        if (res.payload.fail_count > 0) {
          projection.warn(`${res.payload.fail_count} gate(s) failed`);
        }
      });

      return await exitWithFlush(exitCode);
    } catch (error) {
      const result = makeErrorResult('verify', error, EXIT_CODES.system_error, 'VERIFY_ERROR');
      emitResult(result, { format, verbose, quiet });
      return await exitWithFlush(EXIT_CODES.system_error);
    }
    });
  },
});
