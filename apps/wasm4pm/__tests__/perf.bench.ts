import { bench, describe } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { withSpan } from '../src/commands/_otel.js';
import { saveCommandReceipt, blake3Hex, newReceipt } from '../src/receipts/_shared.js';

const DIR = mkdtempSync(join(tmpdir(), 'wpm-bench-'));
const mk = (input_hash: string) => ({
  ...newReceipt('bench'),
  command: 'bench',
  input_hash,
  output_hash: blake3Hex('{}'),
  status: 'success' as const,
});

describe('Surface Y baselines', () => {
  bench('withSpan empty body', async () => {
    await withSpan('bench.empty', { algo: 'dfg' }, async () => null);
  });
  bench('blake3Hex 1KB', () => { blake3Hex(Buffer.alloc(1024, 0x41)); });
  bench('blake3Hex 1MB', () => { blake3Hex(Buffer.alloc(1_000_000, 0x41)); });
  // 50MB skipped from default run — too slow for CI; document as opt-in
  bench('saveCommandReceipt small', () => {
    saveCommandReceipt(mk('a'.repeat(64)), DIR);
  });
});
