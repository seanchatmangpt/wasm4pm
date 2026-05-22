//! `wpm cognition inspect` — inspect a cognition artifact (receipt) by id.

import { defineCommand } from 'citty';
import { emitResult, makeResult, makeErrorResult } from '../../output.js';
import { EXIT_CODES } from '../../exit-codes.js';
import { loadReceipt, mapWasmError } from './_shared.js';
import { exitWithFlush } from '../../otel/exit.js';
import { withSpanRaw } from '../_otel.js';

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
    const t0 = performance.now();
    const format = (ctx.args.format as 'json' | 'human' | 'sarif' | 'jsonl') ?? 'human';
    const verbose = !!ctx.args.verbose;
    const quiet = !!ctx.args.quiet;
    const artifactId = ctx.args['artifact-id'] as string;
    let linkCount = 0;
    return withSpanRaw(
      'wasm4pm.command.cognition.inspect',
      { 'cognition.artifact_id': artifactId, 'cognition.format': format },
      async () => {
        try {
          const dir = ctx.args['ledger-dir'] as string;
          const data = loadReceipt(artifactId, dir);
          const summary = (() => {
            if (data && typeof data === 'object') {
              const obj = data as Record<string, unknown>;
              linkCount = Array.isArray(obj.links) ? obj.links.length : 0;
              return {
                keys: Object.keys(obj),
                has_links: Array.isArray(obj.links),
                link_count: linkCount,
              };
            }
            return { keys: [], has_links: false, link_count: 0 };
          })();
          const result = makeResult(
            'cognition inspect',
            { artifact_id: artifactId, summary, artifact: data },
            performance.now() - t0,
            EXIT_CODES.success,
          );
          emitResult(result, { format, verbose, quiet }, (res, p) => {
            const pl = res.payload as { artifact_id: string; summary: { link_count: number } };
            p.success(`Artifact '${pl.artifact_id}' — ${pl.summary.link_count} link(s)`);
          });
          return await exitWithFlush(EXIT_CODES.success);
        } catch (err) {
          const { code, exitCode } = mapWasmError(err);
          const result = makeErrorResult('cognition inspect', err, exitCode, code);
          emitResult(result, { format, verbose, quiet });
          return await exitWithFlush(exitCode);
        }
      },
      () => ({ 'cognition.link_count': linkCount }),
    );
  },
});
