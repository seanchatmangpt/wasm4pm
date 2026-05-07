//! `wpm cognition verify` — verify adversarial gates over one or more receipts.

import { defineCommand } from 'citty';
import { emitResult, makeResult, makeErrorResult } from '../../output.js';
import { EXIT_CODES } from '../../exit-codes.js';
import { ReceiptChain } from '@wasm4pm/cognition';
import { loadReceipt, mapWasmError } from './_shared.js';

export const verify = defineCommand({
  meta: { name: 'verify', description: 'Verify adversarial gates on receipt(s)' },
  args: {
    receipts: { type: 'string', description: 'Comma-separated receipt ids' },
    'receipt-id': { type: 'string', description: 'Single receipt id' },
    'ledger-dir': { type: 'string', default: '.wasm4pm/receipts' },
    'confidence-threshold': { type: 'string', default: '0.85' },
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
      const ids: string[] = (() => {
        const list = (ctx.args.receipts as string | undefined)?.split(',').map((s) => s.trim()).filter(Boolean) ?? [];
        const single = ctx.args['receipt-id'] as string | undefined;
        if (single) list.push(single);
        return Array.from(new Set(list));
      })();
      if (ids.length === 0) {
        const err = new Error('at least one of --receipts or --receipt-id is required');
        (err as Error & { code?: string }).code = 'RECEIPT_ID_REQUIRED';
        throw err;
      }
      const dir = ctx.args['ledger-dir'] as string;
      const findings: Array<{ receipt_id: string; chain_valid: boolean; reason?: string }> = [];
      for (const id of ids) {
        const data = loadReceipt(id, dir) as Record<string, unknown>;
        const chain = new ReceiptChain();
        const links = (data?.links as unknown[] | undefined) ?? [];
        chain.links = links as ReceiptChain['links'];
        const ok = chain.verifyChain();
        findings.push({
          receipt_id: id,
          chain_valid: ok,
          reason: ok ? undefined : 'chain hash mismatch',
        });
      }
      const failing = findings.filter((f) => !f.chain_valid);
      const exitCode = failing.length === 0 ? EXIT_CODES.success : EXIT_CODES.execution_error;
      const result = makeResult(
        'cognition verify',
        { count: ids.length, findings, failing_count: failing.length },
        performance.now() - t0,
        exitCode,
      );
      emitResult(result, { format, verbose, quiet }, (res, p) => {
        const pl = res.payload as { count: number; failing_count: number };
        if (pl.failing_count === 0) p.success(`Verified ${pl.count} receipt(s) — all chains valid`);
        else p.warn(`${pl.failing_count}/${pl.count} receipt(s) failed verification`);
      });
      process.exit(exitCode);
    } catch (err) {
      const { code, exitCode } = mapWasmError(err);
      const result = makeErrorResult('cognition verify', err, exitCode, code);
      emitResult(result, { format, verbose, quiet });
      process.exit(exitCode);
    }
  },
});
