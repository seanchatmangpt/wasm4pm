//! `wpm cognition plan` — show what `cognition run` would do without writing receipts.

import { defineCommand } from 'citty';
import { emitResult, makeResult, makeErrorResult } from '../../output.js';
import { EXIT_CODES } from '../../exit-codes.js';
import type { BreedInput } from '@wasm4pm/cognition';
import { parseInputJson, mapWasmError, emitCognitionSpan } from './_shared.js';

export const plan = defineCommand({
  meta: { name: 'plan', description: 'Plan a cognition run (dry-run preview)' },
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
      const summary = {
        contract: ctx.args.contract,
        intent: input.intent,
        candidate_count: input.candidates?.length ?? 0,
        fact_count: input.facts?.length ?? 0,
        rule_count: input.rules?.length ?? 0,
        goal_count: input.goals?.length ?? 0,
        case_count: input.cases?.length ?? 0,
        state_atom_count: input.state?.length ?? 0,
        steps: [
          'load BreedInput',
          'rank candidates by score',
          'apply elimination rules',
          'select breed',
          'compute receipt chain',
        ],
      };
      const result = makeResult(
        'cognition plan',
        summary,
        (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startMs,
        EXIT_CODES.success,
      );
      emitResult(result, { format, verbose, quiet }, (res, p) => {
        const pl = res.payload as { contract: string; candidate_count: number };
        p.success(`Plan for '${pl.contract}' — ${pl.candidate_count} candidate(s)`);
      });
    } catch (err) {
      spanStatus = 'ERROR';
      spanErrMsg = err instanceof Error ? err.message : String(err);
      const { code, exitCode } = mapWasmError(err);
      const result = makeErrorResult('cognition plan', err, exitCode, code);
      emitResult(result, { format, verbose, quiet });
      finalExitCode = exitCode;
    } finally {
      emitCognitionSpan(
        'plan',
        startNs,
        (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startMs,
        spanStatus,
        spanErrMsg,
      );
    }
    process.exit(finalExitCode);
  },
});
