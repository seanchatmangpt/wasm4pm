//! `wpm cognition adversarial` — list adversarial detectors.

import { defineCommand } from 'citty';
import { emitResult, makeResult, makeErrorResult } from '../../output.js';
import { EXIT_CODES } from '../../exit-codes.js';
import { getAdversarialCatalogue } from '@wasm4pm/cognition';
import { mapWasmError } from './_shared.js';

const VALID_SEVERITIES = ['fatal', 'error', 'warning', 'all'] as const;
type Severity = (typeof VALID_SEVERITIES)[number];

export const adversarial = defineCommand({
  meta: { name: 'adversarial', description: 'List adversarial detectors and severities' },
  args: {
    severity: { type: 'string', default: 'all', description: 'fatal | error | warning | all' },
    format: { type: 'string', default: 'human' },
    verbose: { type: 'boolean', alias: 'v' },
    quiet: { type: 'boolean', alias: 'q' },
  },
  async run(ctx) {
    const t0 = performance.now();
    const format = (ctx.args.format as 'json' | 'human' | 'sarif' | 'jsonl') ?? 'human';
    const verbose = !!ctx.args.verbose;
    const quiet = !!ctx.args.quiet;
    try {
      const sev = (ctx.args.severity as string) as Severity;
      if (!VALID_SEVERITIES.includes(sev)) {
        const err = new Error(
          `invalid --severity '${sev}' (expected one of ${VALID_SEVERITIES.join(', ')})`,
        );
        (err as Error & { code?: string }).code = 'CONFIG_INVALID';
        throw err;
      }
      const all = await getAdversarialCatalogue();
      const filtered = sev === 'all' ? all : all.filter((d) => d.severity === sev);
      const result = makeResult(
        'cognition adversarial',
        {
          severity: sev,
          total: all.length,
          count: filtered.length,
          detectors: filtered,
        },
        performance.now() - t0,
        EXIT_CODES.success,
      );
      emitResult(result, { format, verbose, quiet }, (res, p) => {
        const pl = res.payload as { count: number; total: number; severity: string };
        p.success(`${pl.count}/${pl.total} adversarial detectors (severity=${pl.severity})`);
      });
      process.exit(EXIT_CODES.success);
    } catch (err) {
      const { code, exitCode } = mapWasmError(err);
      const result = makeErrorResult('cognition adversarial', err, exitCode, code);
      emitResult(result, { format, verbose, quiet });
      process.exit(exitCode);
    }
  },
});
