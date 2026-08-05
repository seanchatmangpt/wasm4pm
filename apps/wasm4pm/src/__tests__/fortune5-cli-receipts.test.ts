import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { NounVerbError } from '@wasm4pm/noun-verb';
import {
  admitCliInvocation,
  cliOptions,
  recordCliFatal,
  resetCliInvocationForTests,
} from '../cli.js';
import {
  readAndVerifyCommandReceipt,
  verifyCommandReceiptChain,
  type PersistedCommandReceipt,
} from '../receipts/_shared.js';

const roots: string[] = [];

function workspace(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wasm4pm-cli-receipts-'));
  roots.push(root);
  return root;
}

function persistedReceipts(directory: string): PersistedCommandReceipt[] {
  const receipts = fs
    .readdirSync(directory)
    .filter((name) => name.endsWith('.json') && name !== 'latest.json')
    .map((name) => {
      const result = readAndVerifyCommandReceipt(path.join(directory, name));
      expect(result.valid).toBe(true);
      return result.receipt!;
    });
  const admission = receipts.find((receipt) => receipt.phase === 'admission');
  expect(admission).toBeTruthy();
  const ordered = [admission!];
  while (ordered.length < receipts.length) {
    const next = receipts.find(
      (receipt) =>
        !ordered.includes(receipt) &&
        receipt.predecessor_hash === ordered[ordered.length - 1]!.receipt_hash
    );
    expect(next).toBeTruthy();
    ordered.push(next!);
  }
  return ordered;
}

afterEach(() => {
  resetCliInvocationForTests();
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('published CLI receipt lifecycle', () => {
  it('admits before dispatch and links a successful outcome', async () => {
    const directory = path.join(workspace(), 'receipts');
    const admission = admitCliInvocation(['config', 'show'], {
      receiptDirectory: directory,
      invocationId: 'invocation-success',
      runId: 'admission-success',
      now: () => new Date('2030-01-01T00:00:00.000Z'),
    });

    await cliOptions.onResult?.({
      noun: 'config',
      verb: 'show',
      args: {},
      result: { ok: true },
      durationMs: 3,
    });

    const receipts = persistedReceipts(directory);
    expect(receipts).toHaveLength(2);
    expect(receipts[0]).toEqual(admission);
    expect(receipts[1]).toMatchObject({
      session_id: 'invocation-success',
      phase: 'outcome',
      predecessor_hash: admission.receipt_hash,
      status: 'success',
    });
    expect(verifyCommandReceiptChain(receipts)).toMatchObject({ valid: true, issues: [] });
  });

  it('records typed failure without manufacturing success', async () => {
    const directory = path.join(workspace(), 'receipts');
    admitCliInvocation(['model', 'run'], {
      receiptDirectory: directory,
      invocationId: 'invocation-failure',
      runId: 'admission-failure',
    });

    await cliOptions.onError?.({
      noun: 'model',
      verb: 'run',
      args: { source: 'fixture' },
      error: NounVerbError.executionError('boundary failed'),
      durationMs: 4,
    });

    // Exercise a second failure on the same admitted chain.
    recordCliFatal(new Error('process boundary failed'));
    const receipts = persistedReceipts(directory);
    expect(receipts[0]?.phase).toBe('admission');
    expect(receipts[receipts.length - 1]).toMatchObject({ phase: 'outcome', status: 'failed' });
    expect(verifyCommandReceiptChain(receipts)).toMatchObject({ valid: true, issues: [] });
  });

  it('refuses dispatch when admission evidence cannot be persisted', () => {
    const root = workspace();
    const blocked = path.join(root, 'blocked');
    fs.writeFileSync(blocked, 'not a directory');

    expect(() =>
      admitCliInvocation(['config', 'show'], {
        receiptDirectory: path.join(blocked, 'receipts'),
        invocationId: 'blocked',
        runId: 'blocked-admission',
      })
    ).toThrow(/RECEIPT_ADMISSION_BLOCKED/);
  });

  it('refuses a result when no admission session exists', async () => {
    await expect(
      cliOptions.onResult?.({
        noun: 'config',
        verb: 'show',
        args: {},
        result: { ok: true },
        durationMs: 1,
      })
    ).rejects.toThrow(/RECEIPT_ADMISSION_MISSING/);
  });
});
