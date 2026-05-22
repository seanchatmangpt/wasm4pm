//! `wpm cognition receipt` — inspect a single receipt chain.

import { defineCommand } from 'citty';
import { emitResult, makeResult, makeErrorResult } from '../../output.js';
import { EXIT_CODES } from '../../exit-codes.js';
import { loadReceipt, mapWasmError } from './_shared.js';
import { exitWithFlush } from '../../otel/exit.js';
import { withSpanRaw } from '../_otel.js';

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
    const t0 = performance.now();
    const format = (ctx.args.format as 'json' | 'human' | 'sarif' | 'jsonl') ?? 'human';
    const verbose = !!ctx.args.verbose;
    const quiet = !!ctx.args.quiet;
    const receiptId = ctx.args['receipt-id'] as string;
    let linkCount = 0;
    return withSpanRaw(
      'wasm4pm.command.cognition.receipt',
      { 'cognition.receipt_id': receiptId, 'cognition.format': format },
      async () => {
        try {
          const dir = ctx.args['ledger-dir'] as string;
          const data = loadReceipt(receiptId, dir) as Record<string, unknown>;
          const links = (data?.links as unknown[] | undefined) ?? [];
          linkCount = links.length;
          const result = makeResult(
            'cognition receipt',
            {
              receipt_id: receiptId,
              link_count: links.length,
              chain: data,
            },
            performance.now() - t0,
            EXIT_CODES.success,
          );
          emitResult(result, { format, verbose, quiet }, (res, p) => {
            const pl = res.payload as { receipt_id: string; link_count: number };
            p.success(`Receipt '${pl.receipt_id}' — ${pl.link_count} link(s)`);
          });
          return await exitWithFlush(EXIT_CODES.success);
        } catch (err) {
          const { code, exitCode } = mapWasmError(err);
          const result = makeErrorResult('cognition receipt', err, exitCode, code);
          emitResult(result, { format, verbose, quiet });
          return await exitWithFlush(exitCode);
        }
      },
      () => ({ 'cognition.link_count': linkCount }),
    );
  },
});
