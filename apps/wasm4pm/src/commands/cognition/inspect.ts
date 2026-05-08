//! `wpm cognition inspect` — inspect a cognition artifact (receipt) by id.

import { defineCommand } from 'citty';
import { emitResult, makeResult, makeErrorResult } from '../../output.js';
import { EXIT_CODES } from '../../exit-codes.js';
import { loadReceipt, mapWasmError, emitCognitionSpan } from './_shared.js';

export const inspect = defineCommand({
  meta: { name: 'inspect', description: 'Inspect a cognition artifact by id' },
  args: {
    'artifact-id': { type: 'string', required: true, description: 'Artifact / receipt UUID' },
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
      const id = ctx.args['artifact-id'] as string;
      const dir = ctx.args['ledger-dir'] as string;
      const data = loadReceipt(id, dir);
      const summary = (() => {
        if (data && typeof data === 'object') {
          const obj = data as Record<string, unknown>;
          return {
            keys: Object.keys(obj),
            has_links: Array.isArray(obj.links),
            link_count: Array.isArray(obj.links) ? obj.links.length : 0,
          };
        }
        return { keys: [], has_links: false, link_count: 0 };
      })();
      const result = makeResult(
        'cognition inspect',
        { artifact_id: id, summary, artifact: data },
        (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startMs,
        EXIT_CODES.success,
      );
      emitResult(result, { format, verbose, quiet }, (res, p) => {
        const pl = res.payload as { artifact_id: string; summary: { link_count: number } };
        p.success(`Artifact '${pl.artifact_id}' — ${pl.summary.link_count} link(s)`);
      });
    } catch (err) {
      spanStatus = 'ERROR';
      spanErrMsg = err instanceof Error ? err.message : String(err);
      const { code, exitCode } = mapWasmError(err);
      const result = makeErrorResult('cognition inspect', err, exitCode, code);
      emitResult(result, { format, verbose, quiet });
      finalExitCode = exitCode;
    } finally {
      emitCognitionSpan(
        'inspect',
        startNs,
        (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startMs,
        spanStatus,
        spanErrMsg,
      );
    }
    process.exit(finalExitCode);
  },
});
