import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { saveCommandReceipt, newReceipt } from '../src/receipts/_shared.js';

describe('saveCommandReceipt latest.json atomicity', () => {
  it('parallel writes never produce a corrupted latest.json', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wpm-race-'));
    const N = 50;
    await Promise.all(
      Array.from({ length: N }, (_, i) => Promise.resolve().then(() =>
        saveCommandReceipt({
          ...newReceipt('test'),
          command: 'test',
          input_hash: 'a'.repeat(64),
          output_hash: 'b'.repeat(64),
          status: 'success',
          summary: { i, padding: 'x'.repeat(2048) },
        }, dir)
      ))
    );
    const latest = JSON.parse(readFileSync(join(dir, 'latest.json'), 'utf-8'));
    expect(latest.command).toBe('test');
    expect(latest.run_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(latest.summary).toBeDefined();
    expect(latest.summary.padding).toHaveLength(2048);
    expect(readdirSync(dir).filter(f => f.endsWith('.tmp'))).toEqual([]);
  });
});
