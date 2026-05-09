//! `wpm cognition explain` — explain a cognition decision.

import { defineCommand } from 'citty';
import { emitResult, makeResult, makeErrorResult } from '../../output.js';
import { EXIT_CODES } from '../../exit-codes.js';
import { runContract } from '@wasm4pm/cognition';
import type { BreedInput } from '@wasm4pm/cognition';
import { parseInputJson, mapWasmError } from './_shared.js';

export const explain = defineCommand({
  meta: { name: 'explain', description: 'Explain a cognition decision (eliminations, rationale)' },
  args: {
    contract: { type: 'string', required: true },
    input: { type: 'string', required: true },
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
      const input = parseInputJson<BreedInput>(ctx.args.input as string);
      const breed = ctx.args.contract as string;
      const cresult = await runContract(breed, input);
      const eliminations =
        (cresult.output?.candidates ?? []).filter((c) => c.eliminated).map((c) => ({
          id: c.id,
          reason: c.elimination_reason ?? 'unspecified',
        }));
      const result = makeResult(
        'cognition explain',
        {
          contract: ctx.args.contract,
          breed: cresult.output?.breed,
          selected: cresult.output?.selected,
          explanation: cresult.output?.explanation ?? '',
          eliminations,
        },
        performance.now() - t0,
        EXIT_CODES.success,
      );
      emitResult(result, { format, verbose, quiet }, (res, p) => {
        const payload = res.payload as { breed?: string; explanation: string };
        p.success(`Explanation for breed '${payload.breed ?? '?'}'`);
        if (payload.explanation) p.log(payload.explanation);
      });
      process.exit(EXIT_CODES.success);
    } catch (err) {
      const { code, exitCode } = mapWasmError(err);
      const result = makeErrorResult('cognition explain', err, exitCode, code);
      emitResult(result, { format, verbose, quiet });
      process.exit(exitCode);
    }
  },
});
