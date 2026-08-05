import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  readAndVerifyCommandReceipt,
  verifyCommandReceipt,
  verifyCommandReceiptChain,
  type PersistedCommandReceipt,
} from '../../apps/wasm4pm/src/receipts/_shared.js';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function parseJson(value: string, label: string): unknown {
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${(error as Error).message}\n${value.slice(0, 500)}`);
  }
}

function loadReceipts(directory: string): PersistedCommandReceipt[] {
  const receipts = fs
    .readdirSync(directory)
    .filter((name) => name.endsWith('.json') && name !== 'latest.json')
    .map((name) => {
      const file = path.join(directory, name);
      const verification = readAndVerifyCommandReceipt(file);
      assert(verification.valid && verification.receipt, `receipt verification failed for ${file}: ${verification.issues.join(', ')}`);
      return verification.receipt;
    });

  const admission = receipts.find((receipt) => receipt.phase === 'admission');
  assert(admission, 'admission receipt missing');
  const ordered = [admission];
  while (ordered.length < receipts.length) {
    const next = receipts.find(
      (receipt) =>
        !ordered.includes(receipt) &&
        receipt.predecessor_hash === ordered[ordered.length - 1]!.receipt_hash
    );
    assert(next, 'receipt chain is disconnected');
    ordered.push(next);
  }
  return ordered;
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wasm4pm-fortune5-'));
const home = path.join(root, 'home');
const binary = path.resolve('apps/wasm4pm/dist/bin/wpm.js');
const commonEnv = {
  ...process.env,
  WASM4PM_HOME: home,
  WASM4PM_OTEL_ENABLED: 'false',
  NO_COLOR: '1',
};

try {
  assert(fs.existsSync(binary), `published CLI binary missing: ${binary}`);

  const success = spawnSync(process.execPath, [binary, 'config', 'show'], {
    cwd: root,
    env: commonEnv,
    encoding: 'utf-8',
    timeout: 30_000,
  });
  assert(success.error === undefined, `config show process failed to launch: ${success.error?.message}`);
  assert(success.status === 0, `config show exited ${success.status}: ${success.stderr}\n${success.stdout}`);
  const successEnvelope = parseJson(success.stdout.trim(), 'config show stdout') as Record<string, unknown>;
  assert(successEnvelope && typeof successEnvelope === 'object' && 'config' in successEnvelope, 'config show result missing config object');

  const receiptDirectory = path.join(home, 'receipts');
  const receipts = loadReceipts(receiptDirectory);
  assert(receipts.length === 2, `expected admission + outcome receipts, observed ${receipts.length}`);
  assert(receipts[0]!.phase === 'admission' && receipts[0]!.status === 'pending', 'first receipt is not pending admission');
  assert(receipts[1]!.phase === 'outcome' && receipts[1]!.status === 'success', 'second receipt is not successful outcome');
  const chain = verifyCommandReceiptChain(receipts);
  assert(chain.valid, `receipt chain did not replay: ${chain.issues.join(', ')}`);

  const tampered = structuredClone(receipts[1]!);
  tampered.output_hash = '0'.repeat(64);
  const tamperVerification = verifyCommandReceipt(tampered);
  assert(!tamperVerification.valid, 'tampered receipt verified');
  assert(tamperVerification.issues.includes('RECEIPT_HASH_MISMATCH'), 'tamper refusal did not identify receipt hash mismatch');

  const blockedHome = path.join(root, 'blocked-home');
  fs.writeFileSync(blockedHome, 'not a directory');
  const blocked = spawnSync(process.execPath, [binary, 'config', 'show'], {
    cwd: root,
    env: { ...commonEnv, WASM4PM_HOME: blockedHome },
    encoding: 'utf-8',
    timeout: 30_000,
  });
  assert(blocked.error === undefined, `blocked process failed to launch: ${blocked.error?.message}`);
  assert(blocked.status === 5, `blocked admission exited ${blocked.status}, expected 5`);
  const blockedEnvelope = parseJson(blocked.stdout.trim(), 'blocked admission stdout') as {
    error?: { code?: string; message?: string };
  };
  assert(blockedEnvelope.error?.code === 'INTERNAL_ERROR', 'blocked admission did not emit INTERNAL_ERROR');
  assert(
    blockedEnvelope.error?.message?.includes('RECEIPT_FATAL_OUTCOME_BLOCKED') ||
      blockedEnvelope.error?.message?.includes('RECEIPT_ADMISSION_BLOCKED'),
    'blocked admission did not preserve the receipt refusal'
  );
  assert(!blocked.stdout.includes('"config"'), 'handler output appeared after admission refusal');

  const report = {
    schema: 'wasm4pm.cli-fortune5-verifier.v1',
    standing: 'ALIVE',
    subject: {
      commit: process.env.WASM4PM_EXPECTED_SHA ?? 'UNKNOWN',
      binary,
      node: process.version,
      platform: process.platform,
      arch: process.arch,
    },
    observed: {
      packaged_binary_execution: true,
      json_stdout_contract: true,
      admission_before_dispatch: true,
      outcome_receipt: true,
      receipt_replay: true,
      tamper_refusal: true,
      blocked_admission_refusal: true,
    },
    receipt_chain_head: receipts[receipts.length - 1]!.receipt_hash,
  };

  const reportPath = process.env.WASM4PM_FORTUNE5_REPORT;
  if (reportPath) {
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  }
  process.stdout.write(`${JSON.stringify(report)}\n`);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
