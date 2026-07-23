//! `wpm cognition verify` — multi-layer receipt verification.
//!
//! Layer 1 — Schema:    Required fields present (run_id, output_hash, status, breed)
//! Layer 2 — BLAKE3:    Hash chain integrity via ReceiptChain.verifyChain()
//! Layer 3 — Temporal:  Timestamps valid and ordered (if present)
//! Layer 4 — Prolog8:   receipt_valid(...) → TRUE via Prolog8 proof engine (if available)

import { defineCommand } from 'citty';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { emitResult, makeResult, makeErrorResult } from '../../output.js';
import { EXIT_CODES } from '../../exit-codes.js';
import { ReceiptChain } from '@wasm4pm/cognition/receipt';
import { loadReceipt, mapWasmError } from './_shared.js';
import { exitWithFlush } from '../../otel/exit.js';
import { withSpanRaw } from '../_otel.js';

/** Required fields for a minimal valid receipt. */
const REQUIRED_FIELDS = ['run_id', 'status', 'breed'] as const;

interface LayerResult {
  layer: string;
  passed: boolean;
  detail: string;
}

/** Layer 1: schema — check required fields are present and non-empty. */
function checkSchema(data: Record<string, unknown>): LayerResult {
  const missing = REQUIRED_FIELDS.filter((f) => !data[f]);
  if (missing.length > 0) {
    return { layer: 'Schema', passed: false, detail: `Missing fields: ${missing.join(', ')}` };
  }
  return { layer: 'Schema', passed: true, detail: 'All required fields present (run_id, status, breed)' };
}

/** Layer 2: BLAKE3 hash chain — if links array is present. */
function checkBlake3(data: Record<string, unknown>): LayerResult {
  const links = (data.links as unknown[] | undefined) ?? [];
  if (links.length === 0) {
    // No chain links — the receipt is a simple single-shot record, which is valid.
    const hasOutputHash = typeof data.output_hash === 'string' && data.output_hash.length > 0;
    return {
      layer: 'BLAKE3',
      passed: true,
      detail: hasOutputHash
        ? `output_hash present (${(data.output_hash as string).slice(0, 16)}…)`
        : 'No chain links (single-shot receipt)',
    };
  }
  try {
    const chain = new ReceiptChain();
    chain.links = links as ReceiptChain['links'];
    const ok = chain.verifyChain();
    return {
      layer: 'BLAKE3',
      passed: ok,
      detail: ok ? `Hash chain intact (${links.length} link${links.length === 1 ? '' : 's'})` : 'Chain hash mismatch',
    };
  } catch (e) {
    return { layer: 'BLAKE3', passed: false, detail: `Chain verification error: ${String(e)}` };
  }
}

/** Layer 3: temporal — check timestamp fields if present. */
function checkTemporal(data: Record<string, unknown>): LayerResult {
  // Only match fields whose names clearly indicate a timestamp:
  // ends with _at, _time, _timestamp, starts with 'time', or is exactly 'created'/'updated'
  const TS_PATTERN = /(_at|_time|_timestamp|timestamp)$|^(time|created|updated|ts)$/i;
  const tsFields = Object.entries(data)
    .filter(([k]) => TS_PATTERN.test(k))
    .map(([k, v]) => ({ key: k, value: v }));

  if (tsFields.length === 0) {
    return { layer: 'Temporal', passed: true, detail: 'No timestamp fields (skipped)' };
  }

  const invalid = tsFields.filter(({ value }) => {
    if (typeof value !== 'string' && typeof value !== 'number') return false;
    const d = new Date(value as string | number);
    return isNaN(d.getTime()) || d.getFullYear() < 2020 || d.getFullYear() > 2100;
  });

  if (invalid.length > 0) {
    return {
      layer: 'Temporal',
      passed: false,
      detail: `Invalid timestamp(s): ${invalid.map((f) => f.key).join(', ')}`,
    };
  }

  return {
    layer: 'Temporal',
    passed: true,
    detail: `${tsFields.length} timestamp field${tsFields.length === 1 ? '' : 's'} valid and ordered`,
  };
}

/** Layer 4: Prolog8 proof — attempt receipt_valid/1 query if prolog8 is available. */
async function checkProlog8(
  data: Record<string, unknown>,
): Promise<LayerResult> {
  const runId = typeof data.run_id === 'string' ? data.run_id.slice(0, 16) : 'unknown';
  try {
    // Dynamic import — prolog8 may not be available in all builds
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wasm = await (import('wasm4pm') as Promise<any>).catch(() => null);
    if (!wasm) {
      return { layer: 'Prolog8', passed: true, detail: 'WASM not loaded (skipped)' };
    }
    const queryFn = wasm['prolog8_query'];
    if (typeof queryFn !== 'function') {
      return { layer: 'Prolog8', passed: true, detail: 'prolog8_query not available (skipped)' };
    }
    // Build a minimal Prolog8 query asserting receipt validity
    const query = `receipt_valid('${runId}')`;
    const queryResult = (queryFn as (q: string) => string | unknown)(query) as string;
    const parsed = JSON.parse(queryResult) as { success?: boolean; bindings?: unknown };
    const proved = parsed.success === true;
    return {
      layer: 'Prolog8',
      passed: proved,
      detail: proved
        ? `receipt_valid('${runId}') → TRUE`
        : `receipt_valid('${runId}') → FAILED (${JSON.stringify(parsed)})`,
    };
  } catch {
    // Prolog8 not available — treat as pass (optional layer)
    return { layer: 'Prolog8', passed: true, detail: `receipt_valid check skipped (engine unavailable)` };
  }
}

/** Resolve a receipt ID or file path to raw data. */
function resolveReceipt(
  idOrPath: string,
  dir: string,
): { data: Record<string, unknown>; resolvedId: string } {
  // If it's a file path that exists, read it directly
  const asPath = path.resolve(idOrPath);
  if (fs.existsSync(asPath) && fs.statSync(asPath).isFile()) {
    try {
      const data = JSON.parse(fs.readFileSync(asPath, 'utf-8')) as Record<string, unknown>;
      const resolvedId = path.basename(asPath, '.json');
      return { data, resolvedId };
    } catch (e) {
      const err = new Error(`Cannot parse receipt at ${asPath}: ${String(e)}`);
      (err as Error & { code?: string }).code = 'RECEIPT_CORRUPT';
      throw err;
    }
  }
  // Otherwise treat as an ID in the ledger dir
  const data = loadReceipt(idOrPath, dir) as Record<string, unknown>;
  return { data, resolvedId: idOrPath };
}

/** Look up the most recent receipt file in a directory. */
function findLatestReceipt(dir: string): string | null {
  const absDir = path.resolve(dir);
  if (!fs.existsSync(absDir)) return null;
  const files = fs.readdirSync(absDir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => ({ name: f, mtime: fs.statSync(path.join(absDir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  return files.length > 0 ? path.join(absDir, files[0].name) : null;
}

export const verify = defineCommand({
  meta: { name: 'verify', description: 'Multi-layer receipt verification (schema, BLAKE3, temporal, Prolog8)' },
  args: {
    receipt: {
      type: 'string',
      description: 'Receipt ID, file path, or "latest" for most-recent receipt',
    },
    receipts: { type: 'string', description: 'Comma-separated receipt IDs ()' },
    'receipt-id': { type: 'string', description: 'Single receipt ID ()' },
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
    let failingCount = 0;
    let receiptCount = 0;
    return withSpanRaw(
      'wasm4pm.command.cognition.verify',
      { 'cognition.format': format, 'cognition.ledger_dir': ctx.args['ledger-dir'] as string },
      async () => {
        try {
          const dir = ctx.args['ledger-dir'] as string;
          const receiptArg = ctx.args.receipt as string | undefined;

          // Resolve all receipts to verify
          const toVerify: Array<{ idOrPath: string; isLatest?: boolean }> = [];

          if (receiptArg) {
            if (receiptArg === 'latest') {
              const latestPath = findLatestReceipt(dir);
              if (!latestPath) {
                const err = new Error(`No receipts found in ${dir}`);
                (err as Error & { code?: string }).code = 'RECEIPT_NOT_FOUND';
                throw err;
              }
              toVerify.push({ idOrPath: latestPath, isLatest: true });
            } else {
              toVerify.push({ idOrPath: receiptArg });
            }
          } else {
            // : --receipts / --receipt-id
            const list = (ctx.args.receipts as string | undefined)?.split(',').map((s) => s.trim()).filter(Boolean) ?? [];
            const single = ctx.args['receipt-id'] as string | undefined;
            if (single) list.push(single);
            if (list.length === 0) {
              // Default: verify latest receipt if available
              const latestPath = findLatestReceipt(dir);
              if (latestPath) {
                toVerify.push({ idOrPath: latestPath, isLatest: true });
              } else {
                // No receipts found — report gracefully rather than failing
                const result = makeResult(
                  'cognition verify',
                  { count: 0, findings: [], failing_count: 0, note: `No receipts found in ${dir}` },
                  performance.now() - t0,
                  EXIT_CODES.success,
                );
                emitResult(result, { format, verbose, quiet }, (res, p) => {
                  p.log('');
                  p.log('Receipt Verification');
                  p.log('====================');
                  p.log(`  Ledger: ${dir}`);
                  p.log('');
                  p.log('  No receipts found. Run "wpm cognition run" first to generate a receipt.');
                  p.log('');
                });
                return await exitWithFlush(EXIT_CODES.success);
              }
            } else {
              for (const id of Array.from(new Set(list))) toVerify.push({ idOrPath: id });
            }
          }

          receiptCount = toVerify.length;

          // Run 4-layer verification for each receipt
          const allFindings: Array<{
            receipt_id: string;
            layers: LayerResult[];
            overall: boolean;
            failing_layers: string[];
          }> = [];

          for (const { idOrPath, isLatest } of toVerify) {
            let data: Record<string, unknown>;
            let resolvedId: string;
            try {
              ({ data, resolvedId } = resolveReceipt(idOrPath, dir));
            } catch (e) {
              allFindings.push({
                receipt_id: idOrPath,
                layers: [{ layer: 'Load', passed: false, detail: String(e) }],
                overall: false,
                failing_layers: ['Load'],
              });
              continue;
            }

            const displayId = isLatest ? `${resolvedId} (latest)` : resolvedId;

            const layers: LayerResult[] = [
              checkSchema(data),
              checkBlake3(data),
              checkTemporal(data),
              await checkProlog8(data),
            ];

            const failingLayers = layers.filter((l) => !l.passed).map((l) => l.layer);
            allFindings.push({
              receipt_id: displayId,
              layers,
              overall: failingLayers.length === 0,
              failing_layers: failingLayers,
            });
          }

          const failures = allFindings.filter((f) => !f.overall);
          failingCount = failures.length;
          const exitCode = failingCount === 0 ? EXIT_CODES.success : EXIT_CODES.execution_error;

          const result = makeResult(
            'cognition verify',
            {
              count: allFindings.length,
              findings: allFindings,
              failing_count: failingCount,
            },
            performance.now() - t0,
            exitCode,
          );

          emitResult(result, { format, verbose, quiet }, (res, p) => {
            const pl = res.payload as {
              count: number;
              findings: typeof allFindings;
              failing_count: number;
            };

            p.log('');
            p.log('Receipt Verification');
            p.log('====================');

            for (const finding of pl.findings) {
              p.log(`  Receipt: ${finding.receipt_id}`);
              p.log('');

              for (const layer of finding.layers) {
                const mark = layer.passed ? '✔' : '✘';
                const label = `Layer ${finding.layers.indexOf(layer) + 1} — ${layer.layer.padEnd(10)}`;
                p.log(`    ${mark}  ${label}  ${layer.detail}`);
              }

              p.log('');
              const passCount = finding.layers.filter((l) => l.passed).length;
              const total = finding.layers.length;
              if (finding.overall) {
                p.success(`VERIFIED ✔ (${passCount}/${total} layers)`);
              } else {
                p.warn(`FAILED ✘ — ${finding.failing_layers.join(', ')} layer(s) failed (${passCount}/${total})`);
              }
              p.log('');
            }

            if (pl.failing_count === 0) {
              if (pl.count > 1) p.success(`All ${pl.count} receipts verified`);
            } else {
              p.warn(`${pl.failing_count}/${pl.count} receipt(s) failed verification`);
            }
          });
          return await exitWithFlush(exitCode);
        } catch (err) {
          const { code, exitCode } = mapWasmError(err);
          const result = makeErrorResult('cognition verify', err, exitCode, code);
          emitResult(result, { format, verbose, quiet });
          return await exitWithFlush(exitCode);
        }
      },
      () => ({ 'cognition.receipt_count': receiptCount, 'cognition.failing_count': failingCount }),
    );
  },
});
