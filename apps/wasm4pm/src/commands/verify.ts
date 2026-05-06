import { defineCommand } from 'citty';
import { runCertification } from '@wasm4pm/testing';
import { getFormatter, HumanFormatter, JSONFormatter } from '../output.js';
import { EXIT_CODES } from '../exit-codes.js';
import type { OutputOptions } from '../output.js';
import pkg from '../../package.json' assert { type: 'json' };

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
    verbose: {
      type: 'boolean',
      description: 'Show detailed output',
      alias: 'v',
    },
    quiet: {
      type: 'boolean',
      description: 'Suppress non-error output',
      alias: 'q',
    },
  },
  async run(ctx) {
    const formatter = getFormatter({
      format: (ctx.args.format as 'human' | 'json') ?? 'human',
      verbose: ctx.args.verbose,
      quiet: ctx.args.quiet,
    });

    try {
      const version = pkg.version ?? '26.4.23';
      const fast = ctx.args.fast ?? false;

      if (formatter instanceof HumanFormatter) {
        formatter.info('wpm verify — Definition-of-Done gate check');
        formatter.info('');
      }

      const report = await runCertification(version);

      if ((ctx.args.format as string) === 'json') {
        (formatter as JSONFormatter).output({
          status: report.passed ? 'pass' : 'fail',
          gates: report.gates,
          timestamp: new Date().toISOString(),
        });
      } else {
        const humanFormatter = formatter as HumanFormatter;
        const passCount = report.gates.filter((g) => g.passed).length;
        const failCount = report.gates.filter((g) => !g.passed).length;

        for (const gate of report.gates) {
          const status = gate.passed ? '[PASS]' : '[FAIL]';
          const duration = gate.duration_ms ? ` (${gate.duration_ms}ms)` : '';
          humanFormatter.log(`  ${status} ${gate.gate.padEnd(25)} ${duration}   ${gate.details ?? ''}`);
        }

        humanFormatter.log('');
        humanFormatter.log(`${passCount}/${report.gates.length} gates passed`);

        if (failCount > 0) {
          humanFormatter.warn(`${failCount} gate(s) failed`);
          process.exit(EXIT_CODES.execution_error);
        }
      }

      process.exit(EXIT_CODES.success);
    } catch (error) {
      formatter.error(
        `Verification failed: ${error instanceof Error ? error.message : String(error)}`
      );
      process.exit(EXIT_CODES.system_error);
    }
  },
});
