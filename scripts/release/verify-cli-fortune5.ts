import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import {
  blake3Hex,
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

function verifiedReceipts(directory: string): PersistedCommandReceipt[] {
  return fs
    .readdirSync(directory)
    .filter((name) => name.endsWith('.json') && name !== 'latest.json')
    .map((name) => {
      const file = path.join(directory, name);
      const verification = readAndVerifyCommandReceipt(file);
      assert(
        verification.valid && verification.receipt,
        `receipt verification failed for ${file}: ${verification.issues.join(', ')}`
      );
      return verification.receipt;
    });
}

function orderChain(receipts: readonly PersistedCommandReceipt[]): PersistedCommandReceipt[] {
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

function receiptSessions(directory: string): PersistedCommandReceipt[][] {
  const groups = new Map<string, PersistedCommandReceipt[]>();
  for (const receipt of verifiedReceipts(directory)) {
    assert(receipt.session_id, `receipt ${receipt.run_id} missing session_id`);
    const group = groups.get(receipt.session_id) ?? [];
    group.push(receipt);
    groups.set(receipt.session_id, group);
  }
  return [...groups.values()].map(orderChain);
}

interface ProcessResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

function runBinary(
  binary: string,
  args: readonly string[],
  options: { cwd: string; env: NodeJS.ProcessEnv }
): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [binary, ...args], {
      cwd: options.cwd,
      env: options.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`process timeout: ${args.join(' ')}`));
    }, 30_000);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => { stdout += chunk; });
    child.stderr.on('data', (chunk: string) => { stderr += chunk; });
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('close', (status) => {
      clearTimeout(timer);
      resolve({ status, stdout, stderr });
    });
  });
}

async function main(): Promise<void> {
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
    const expectedEntrypointHash = blake3Hex(fs.readFileSync(binary));

    const success = spawnSync(process.execPath, [binary, 'config', 'show'], {
      cwd: root,
      env: commonEnv,
      encoding: 'utf-8',
      timeout: 30_000,
    });
    assert(success.error === undefined, `config show process failed to launch: ${success.error?.message}`);
    assert(success.status === 0, `config show exited ${success.status}: ${success.stderr}\n${success.stdout}`);
    const successEnvelope = parseJson(success.stdout.trim(), 'config show stdout') as Record<string, unknown>;
    assert(
      successEnvelope &&
        typeof successEnvelope === 'object' &&
        'config' in successEnvelope,
      'config show result missing config object'
    );

    const receiptDirectory = path.join(home, 'receipts');
    const sessions = receiptSessions(receiptDirectory);
    assert(sessions.length === 1, `expected one receipt session, observed ${sessions.length}`);
    const receipts = sessions[0]!;
    assert(receipts.length === 2, `expected admission + outcome receipts, observed ${receipts.length}`);
    assert(
      receipts[0]!.phase === 'admission' && receipts[0]!.status === 'pending',
      'first receipt is not pending admission'
    );
    assert(
      receipts[1]!.phase === 'outcome' && receipts[1]!.status === 'success',
      'second receipt is not successful outcome'
    );
    const chain = verifyCommandReceiptChain(receipts);
    assert(chain.valid, `receipt chain did not replay: ${chain.issues.join(', ')}`);
    const subject = receipts[0]!.summary?.subject as { entrypoint_hash?: string } | undefined;
    assert(
      subject?.entrypoint_hash === expectedEntrypointHash,
      'admission receipt is not bound to the exact built entrypoint'
    );

    const tampered = structuredClone(receipts[1]!);
    tampered.output_hash = '0'.repeat(64);
    const tamperVerification = verifyCommandReceipt(tampered);
    assert(!tamperVerification.valid, 'tampered receipt verified');
    assert(
      tamperVerification.issues.includes('RECEIPT_HASH_MISMATCH'),
      'tamper refusal did not identify receipt hash mismatch'
    );

    // Concurrent writers share only the non-authoritative latest projection.
    // Every immutable session chain must remain complete and replayable.
    const concurrentHome = path.join(root, 'concurrent-home');
    const concurrentEnv = { ...commonEnv, WASM4PM_HOME: concurrentHome };
    const concurrentResults = await Promise.all(
      Array.from({ length: 8 }, () =>
        runBinary(binary, ['config', 'show'], { cwd: root, env: concurrentEnv })
      )
    );
    for (const [index, result] of concurrentResults.entries()) {
      assert(result.status === 0, `concurrent invocation ${index} exited ${result.status}: ${result.stderr}`);
      parseJson(result.stdout.trim(), `concurrent invocation ${index} stdout`);
    }
    const concurrentSessions = receiptSessions(path.join(concurrentHome, 'receipts'));
    assert(
      concurrentSessions.length === 8,
      `expected 8 independent receipt sessions, observed ${concurrentSessions.length}`
    );
    for (const [index, session] of concurrentSessions.entries()) {
      assert(session.length === 2, `concurrent session ${index} is incomplete`);
      const replay = verifyCommandReceiptChain(session);
      assert(replay.valid, `concurrent session ${index} did not replay: ${replay.issues.join(', ')}`);
    }

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
        entrypoint_hash: expectedEntrypointHash,
        node: process.version,
        platform: process.platform,
        arch: process.arch,
      },
      observed: {
        packaged_binary_execution: true,
        json_stdout_contract: true,
        exact_entrypoint_identity: true,
        admission_before_dispatch: true,
        outcome_receipt: true,
        receipt_replay: true,
        tamper_refusal: true,
        concurrent_sessions: 8,
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
}

await main();
