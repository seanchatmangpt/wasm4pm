//! `wpm cognition replay` — replay a receipt by id and verify chain integrity.

import { defineCommand } from 'citty';
import { emitResult, makeResult, makeErrorResult } from '../../output.js';
import { EXIT_CODES } from '../../exit-codes.js';
import { ReceiptChain } from '@wasm4pm/cognition';
import { loadReceipt, mapWasmError } from './_shared.js';
import { exitWithFlush } from '../../otel/exit.js';

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
    const t0 = performance.now();
    const format = (ctx.args.format as 'json' | 'human' | 'sarif' | 'jsonl') ?? 'human';
    const verbose = !!ctx.args.verbose;
    const quiet = !!ctx.args.quiet;
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
      const result = makeResult(
        'cognition replay',
        {
          receipt_id: id,
          link_count: links.length,
          chain_valid: valid,
          replay_pointer: pointer,
          strict,
        },
        performance.now() - t0,
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
      await exitWithFlush(exitCode);
    } catch (err) {
      const { code, exitCode } = mapWasmError(err);
      const result = makeErrorResult('cognition replay', err, exitCode, code);
      emitResult(result, { format, verbose, quiet });
      await exitWithFlush(exitCode);
    }
  },
});
