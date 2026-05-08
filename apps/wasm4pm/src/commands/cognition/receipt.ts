//! `wpm cognition receipt` — inspect a single receipt chain.

import { defineCommand } from 'citty';
import { emitResult, makeResult, makeErrorResult } from '../../output.js';
import { EXIT_CODES } from '../../exit-codes.js';
import { loadReceipt, mapWasmError, emitCognitionSpan } from './_shared.js';

export const receipt = defineCommand({
  meta: { name: 'receipt', description: 'Inspect a receipt chain by id' },
  args: {
    'receipt-id': { type: 'string', required: true, description: 'Receipt id (UUID)' },
    'ledger-dir': { type: 'string', default: '.wasm4pm/receipts' },
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
      const data = loadReceipt(id, dir) as Record<string, unknown>;
      const links = (data?.links as unknown[] | undefined) ?? [];
      const result = makeResult(
        'cognition receipt',
        {
          receipt_id: id,
          link_count: links.length,
          chain: data,
        },
        (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startMs,
        EXIT_CODES.success,
      );
      emitResult(result, { format, verbose, quiet }, (res, p) => {
        const pl = res.payload as { receipt_id: string; link_count: number };
        p.success(`Receipt '${pl.receipt_id}' — ${pl.link_count} link(s)`);
      });
    } catch (err) {
      spanStatus = 'ERROR';
      spanErrMsg = err instanceof Error ? err.message : String(err);
      const { code, exitCode } = mapWasmError(err);
      const result = makeErrorResult('cognition receipt', err, exitCode, code);
      emitResult(result, { format, verbose, quiet });
      finalExitCode = exitCode;
    } finally {
      emitCognitionSpan(
        'receipt',
        startNs,
        (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startMs,
        spanStatus,
        spanErrMsg,
      );
    }
    process.exit(finalExitCode);
  },
});
