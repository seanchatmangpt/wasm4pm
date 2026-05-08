//! `wpm cognition replay` — replay a receipt by id and verify chain integrity.

import { defineCommand } from 'citty';
import { emitResult, makeResult, makeErrorResult } from '../../output.js';
import { EXIT_CODES } from '../../exit-codes.js';
import { ReceiptChain } from '@wasm4pm/cognition';
import { loadReceipt, mapWasmError, emitCognitionSpan } from './_shared.js';

export const replay = defineCommand({
  meta: { name: 'replay', description: 'Replay a receipt and verify chain integrity' },
  args: {
    'receipt-id': { type: 'string', required: true },
    'ledger-dir': { type: 'string', default: '.wasm4pm/receipts' },
    strict: { type: 'boolean', default: false, description: 'Fail on any chain anomaly' },
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
      const id = ctx.args['receipt-id'] as string;
      const dir = ctx.args['ledger-dir'] as string;
      const strict = !!ctx.args.strict;
      const data = loadReceipt(id, dir) as Record<string, unknown>;
      const chain = new ReceiptChain();
      const links = (data?.links as unknown[] | undefined) ?? [];
      chain.links = links as ReceiptChain['links'];
      const valid = chain.verifyChain();
      const pointer = chain.replayPointer();
      const exitCode =
        valid || !strict ? EXIT_CODES.success : EXIT_CODES.execution_error;
      finalExitCode = exitCode;
      const result = makeResult(
        'cognition replay',
        {
          receipt_id: id,
          link_count: links.length,
          chain_valid: valid,
          replay_pointer: pointer,
          strict,
        },
        (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startMs,
        exitCode,
      );
      emitResult(result, { format, verbose, quiet }, (res, p) => {
        const pl = res.payload as {
          receipt_id: string;
          chain_valid: boolean;
          replay_pointer: string;
        };
        if (pl.chain_valid) p.success(`Replay '${pl.receipt_id}' OK → pointer ${pl.replay_pointer}`);
        else p.warn(`Replay '${pl.receipt_id}' FAILED → pointer ${pl.replay_pointer}`);
      });
    } catch (err) {
      spanStatus = 'ERROR';
      spanErrMsg = err instanceof Error ? err.message : String(err);
      const { code, exitCode } = mapWasmError(err);
      const result = makeErrorResult('cognition replay', err, exitCode, code);
      emitResult(result, { format, verbose, quiet });
      finalExitCode = exitCode;
    } finally {
      emitCognitionSpan(
        'replay',
        startNs,
        (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startMs,
        spanStatus,
        spanErrMsg,
      );
    }
    process.exit(finalExitCode);
  },
});
