//! `wpm cognition run` — execute a cognition contract (breed + cost law).

import { defineCommand } from 'citty';
import { emitResult, makeResult, makeErrorResult } from '../../output.js';
import { EXIT_CODES } from '../../exit-codes.js';
import { runContract } from '@wasm4pm/cognition';
import type { BreedInput } from '@wasm4pm/cognition';
import { parseInputJson, saveReceipt, mapWasmError } from './_shared.js';
import { exitWithFlush } from '../../otel/exit.js';
import { withSpanRaw } from '../_otel.js';

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
    const t0 = performance.now();
    const format = (ctx.args.format as 'json' | 'human' | 'sarif' | 'jsonl') ?? 'human';
    const verbose = !!ctx.args.verbose;
    const quiet = !!ctx.args.quiet;
    const contract = ctx.args.contract as string;
    let outcomeStatus = 'ok';
    return withSpanRaw(
      'wasm4pm.command.cognition.run',
      { 'cognition.contract': contract, 'cognition.format': format },
      async () => {
        try {
          const input = parseInputJson<BreedInput>(ctx.args.input as string);
          const breed = contract;
          const cresult = await runContract(breed, input);
          // Rust `cognition_run` emits `status: "ok"` on success. There is no
          // `exit_code`, `receipt_chain`, or top-level `findings` field.
          const exitCode =
            cresult.status === 'ok' ? EXIT_CODES.success : EXIT_CODES.execution_error;
          outcomeStatus = cresult.status ?? 'error';
          let savedPath: string | undefined;
          if (!ctx.args['no-save'] && cresult.status === 'ok') {
            savedPath = saveReceipt(
              {
                run_id: cresult.run_id,
                output_hash: cresult.output_hash,
                replay_pointer: cresult.replay_pointer,
              },
              '.wasm4pm/receipts',
            );
          }
          const result = makeResult(
            'cognition run',
            {
              contract: ctx.args.contract,
              output: cresult.output,
              run_id: cresult.run_id,
              output_hash: cresult.output_hash,
              replay_pointer: cresult.replay_pointer,
              saved_path: savedPath,
            },
            performance.now() - t0,
            exitCode,
          );
          emitResult(result, { format, verbose, quiet }, (res, p) => {
            const breed = (res.payload as { output?: { breed?: string } }).output?.breed ?? '?';
            p.success(`Contract '${(res.payload as { contract: string }).contract}' → breed '${breed}'`);
            if (savedPath) p.info(`Receipt saved: ${savedPath}`);
          });
          return await exitWithFlush(exitCode);
        } catch (err) {
          outcomeStatus = 'error';
          const { code, exitCode } = mapWasmError(err);
          const result = makeErrorResult('cognition run', err, exitCode, code);
          emitResult(result, { format, verbose, quiet });
          return await exitWithFlush(exitCode);
        }
      },
      () => ({ 'cognition.outcome': outcomeStatus }),
    );
  },
});
