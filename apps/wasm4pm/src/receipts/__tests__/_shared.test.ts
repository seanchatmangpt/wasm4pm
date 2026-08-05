import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  blake3Hex,
  canonicalJson,
  newReceipt,
  persistCommandReceipt,
  readAndVerifyCommandReceipt,
  verifyCommandReceipt,
  verifyCommandReceiptChain,
} from '../_shared.js';

const roots: string[] = [];

function workspace(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wasm4pm-receipts-'));
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('command receipt persistence', () => {
  it('persists a self-hashed admission and linked outcome atomically', () => {
    const directory = path.join(workspace(), 'receipts');
    const admission = persistCommandReceipt(
      {
        ...newReceipt('wpm invocation', {
          runId: 'admission',
          now: () => new Date('2030-01-01T00:00:00.000Z'),
        }),
        session_id: 'session-1',
        phase: 'admission',
        input_hash: blake3Hex(canonicalJson(['config', 'show'])),
        output_hash: blake3Hex(canonicalJson({ admitted: true })),
        status: 'pending',
      },
      directory
    );
    const outcome = persistCommandReceipt(
      {
        ...newReceipt('config show', {
          runId: 'outcome',
          now: () => new Date('2030-01-01T00:00:01.000Z'),
        }),
        session_id: 'session-1',
        phase: 'outcome',
        predecessor_hash: admission.receipt.receipt_hash,
        input_hash: blake3Hex(canonicalJson({})),
        output_hash: blake3Hex(canonicalJson({ ok: true })),
        status: 'success',
      },
      directory
    );

    expect(readAndVerifyCommandReceipt(admission.path)).toMatchObject({ valid: true, issues: [] });
    expect(readAndVerifyCommandReceipt(outcome.path)).toMatchObject({ valid: true, issues: [] });
    expect(verifyCommandReceiptChain([admission.receipt, outcome.receipt])).toMatchObject({
      valid: true,
      issues: [],
    });
    expect(fs.readFileSync(path.join(directory, 'latest.json'), 'utf-8')).toBe(
      fs.readFileSync(outcome.path, 'utf-8')
    );
  });

  it('refuses invalid hashes before creating a receipt directory', () => {
    const root = workspace();
    const directory = path.join(root, 'receipts');

    expect(() =>
      persistCommandReceipt(
        {
          ...newReceipt('invalid'),
          input_hash: 'not-a-hash',
          output_hash: '0'.repeat(64),
          status: 'success',
        },
        directory
      )
    ).toThrow(/input_hash/);
    expect(fs.existsSync(directory)).toBe(false);
  });

  it('detects content and chain tampering', () => {
    const directory = path.join(workspace(), 'receipts');
    const admission = persistCommandReceipt(
      {
        ...newReceipt('wpm invocation', { runId: 'admission' }),
        session_id: 'session-2',
        phase: 'admission',
        input_hash: '1'.repeat(64),
        output_hash: '2'.repeat(64),
        status: 'pending',
      },
      directory
    );
    const outcome = persistCommandReceipt(
      {
        ...newReceipt('config show', { runId: 'outcome' }),
        session_id: 'session-2',
        phase: 'outcome',
        predecessor_hash: admission.receipt.receipt_hash,
        input_hash: '3'.repeat(64),
        output_hash: '4'.repeat(64),
        status: 'success',
      },
      directory
    );

    const tampered = structuredClone(outcome.receipt);
    tampered.output_hash = '5'.repeat(64);
    expect(verifyCommandReceipt(tampered).issues).toContain('RECEIPT_HASH_MISMATCH');

    const brokenChain = structuredClone(outcome.receipt);
    brokenChain.predecessor_hash = '6'.repeat(64);
    expect(verifyCommandReceiptChain([admission.receipt, brokenChain]).issues).toContain(
      'RECEIPT_CHAIN_PREDECESSOR_MISMATCH:1'
    );
  });


it('refuses unknown receipt fields and multiple admission nodes', () => {
  const directory = path.join(workspace(), 'receipts');
  expect(() =>
    persistCommandReceipt(
      {
        ...newReceipt('unknown-field', { runId: 'unknown-field' }),
        input_hash: '9'.repeat(64),
        output_hash: 'a'.repeat(64),
        status: 'success',
        ambient_authority: true,
      } as never,
      directory
    )
  ).toThrow(/unknown field/);

  const first = persistCommandReceipt(
    {
      ...newReceipt('first', { runId: 'first-admission' }),
      session_id: 'session-multiple',
      phase: 'admission',
      input_hash: 'b'.repeat(64),
      output_hash: 'c'.repeat(64),
      status: 'pending',
    },
    directory
  );
  const second = persistCommandReceipt(
    {
      ...newReceipt('second', { runId: 'second-admission' }),
      session_id: 'session-multiple',
      phase: 'admission',
      predecessor_hash: first.receipt.receipt_hash,
      input_hash: 'd'.repeat(64),
      output_hash: 'e'.repeat(64),
      status: 'pending',
    },
    directory
  );
  expect(verifyCommandReceiptChain([first.receipt, second.receipt]).issues).toContain(
    'RECEIPT_CHAIN_MULTIPLE_ADMISSIONS:1'
  );
});

  it('refuses run-id collisions instead of overwriting evidence', () => {
    const directory = path.join(workspace(), 'receipts');
    const receipt = {
      ...newReceipt('same', { runId: 'collision' }),
      input_hash: '7'.repeat(64),
      output_hash: '8'.repeat(64),
      status: 'success' as const,
    };
    persistCommandReceipt(receipt, directory);
    expect(() => persistCommandReceipt(receipt, directory)).toThrow(/already exists/);
  });
});
