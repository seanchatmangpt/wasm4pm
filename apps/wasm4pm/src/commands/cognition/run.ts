//! `wpm cognition run` — execute a cognition contract (breed + cost law).

import { defineCommand } from 'citty';
import { emitResult, makeResult, makeErrorResult } from '../../output.js';
import { EXIT_CODES } from '../../exit-codes.js';
import { runContract } from '@wasm4pm/cognition';
import type { BreedInput } from '@wasm4pm/cognition';
import { parseInputJson, saveReceipt, mapWasmError, emitCognitionSpan } from './_shared.js';

/** `wpm cognition run` command — parses a BreedInput JSON, calls runContract, persists receipt. */
export const run = defineCommand({
  meta: {
    name: 'run',
    description: 'Execute cognition contract (breed selection + receipt chain)',
  },
  args: {
    contract: { type: 'string', required: true, description: 'Cognition contract name' },
    input: { type: 'string', required: true, description: 'Path to BreedInput JSON' },
    'evidence-source': { type: 'string', default: 'log' },
    'adversarial-seed': { type: 'string' },
    'trace-parent': { type: 'string' },
    'confidence-threshold': { type: 'string', default: '0.85' },
    'no-save': { type: 'boolean', default: false },
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
      const exitCode =
        cresult.exit_code === 0 ? EXIT_CODES.success : EXIT_CODES.execution_error;
      finalExitCode = exitCode;
      let savedPath: string | undefined;
      if (!ctx.args['no-save'] && cresult.exit_code === 0) {
        savedPath = saveReceipt(cresult.receipt_chain, '.wasm4pm/receipts');
      }
      const result = makeResult(
        'cognition run',
        {
          contract: ctx.args.contract,
          output: cresult.output,
          receipt_chain: cresult.receipt_chain,
          findings: cresult.findings,
          saved_path: savedPath,
        },
        (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startMs,
        exitCode,
      );
      emitResult(result, { format, verbose, quiet }, (res, p) => {
        const breed = (res.payload as { output?: { breed?: string } }).output?.breed ?? '?';
        p.success(`Contract '${(res.payload as { contract: string }).contract}' → breed '${breed}'`);
        if (savedPath) p.info(`Receipt saved: ${savedPath}`);
      });
    } catch (err) {
      spanStatus = 'ERROR';
      spanErrMsg = err instanceof Error ? err.message : String(err);
      const { code, exitCode } = mapWasmError(err);
      const result = makeErrorResult('cognition run', err, exitCode, code);
      emitResult(result, { format, verbose, quiet });
      finalExitCode = exitCode;
    } finally {
      emitCognitionSpan(
        'run',
        startNs,
        (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startMs,
        spanStatus,
        spanErrMsg,
      );
    }
    process.exit(finalExitCode);
  },
});
