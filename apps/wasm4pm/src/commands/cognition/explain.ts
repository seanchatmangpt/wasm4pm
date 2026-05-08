//! `wpm cognition explain` — explain a cognition decision.

import { defineCommand } from 'citty';
import { emitResult, makeResult, makeErrorResult } from '../../output.js';
import { EXIT_CODES } from '../../exit-codes.js';
import { runContract } from '@wasm4pm/cognition';
import type { BreedInput } from '@wasm4pm/cognition';
import { parseInputJson, mapWasmError, emitCognitionSpan } from './_shared.js';

/** `wpm cognition explain` command — runs a contract and returns eliminations + rationale. */
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
    const startNs = Date.now() * 1_000_000;
    const startMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const format = (ctx.args.format as 'json' | 'human' | 'sarif' | 'jsonl') ?? 'human';
    const verbose = !!ctx.args.verbose;
    const quiet = !!ctx.args.quiet;
    let spanStatus: 'OK' | 'ERROR' = 'OK';
    let spanErrMsg: string | undefined;
    let finalExitCode: number = EXIT_CODES.success;
    try {
      const input = parseInputJson<BreedInput>(ctx.args.input as string);
      const cresult = await runContract(input);
      // Derive eliminations: candidates that were eliminated with their reason
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
        (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startMs,
        EXIT_CODES.success,
      );
      emitResult(result, { format, verbose, quiet }, (res, p) => {
        const payload = res.payload as { breed?: string; explanation: string };
        p.success(`Explanation for breed '${payload.breed ?? '?'}'`);
        if (payload.explanation) p.log(payload.explanation);
      });
    } catch (err) {
      spanStatus = 'ERROR';
      spanErrMsg = err instanceof Error ? err.message : String(err);
      const { code, exitCode } = mapWasmError(err);
      const result = makeErrorResult('cognition explain', err, exitCode, code);
      emitResult(result, { format, verbose, quiet });
      finalExitCode = exitCode;
    } finally {
      emitCognitionSpan(
        'explain',
        startNs,
        (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startMs,
        spanStatus,
        spanErrMsg,
      );
    }
    process.exit(finalExitCode);
  },
});
