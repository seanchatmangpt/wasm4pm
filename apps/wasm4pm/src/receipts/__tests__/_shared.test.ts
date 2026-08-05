import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { saveCommandReceipt, validateCommandReceipt } from '../_shared.js';

const roots: string[] = [];

function temporaryDirectory(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wasm4pm-receipt-'));
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('command receipt persistence', () => {
  it('persists only schema-valid receipts atomically', () => {
    const root = temporaryDirectory();
    const receipt = {
      run_id: 'valid-run',
      command: 'doctor capabilities',
      input_hash: 'a'.repeat(64),
      output_hash: 'b'.repeat(64),
      status: 'success' as const,
      timestamp: '2030-01-01T00:00:00.000Z',
    };

    expect(() => validateCommandReceipt(receipt)).not.toThrow();
    const file = saveCommandReceipt(receipt, root);
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual(receipt);
    expect(JSON.parse(fs.readFileSync(path.join(root, 'latest.json'), 'utf8'))).toEqual(receipt);
  });

  it('refuses malformed hashes before creating receipt artifacts', () => {
    const parent = temporaryDirectory();
    const target = path.join(parent, 'receipts');
    expect(() =>
      saveCommandReceipt(
        {
          run_id: 'invalid-run',
          command: 'doctor capabilities',
          input_hash: 'not-a-hash',
          output_hash: 'b'.repeat(64),
          status: 'success',
          timestamp: '2030-01-01T00:00:00.000Z',
        },
        target
      )
    ).toThrow(/input_hash/);
    expect(fs.existsSync(target)).toBe(false);
  });
});
