/**
 * results-gaps.test.ts — Targeted gap coverage for wpm results
 *
 * Van der Aalst QA perspective — reproducibility requires every result
 * to carry a typed exit code and a structured JSON envelope.  The fields
 * `verified`, `hash_match`, `ref`, `oldest`, and `newest` are audit-trail
 * primitives: a practitioner who cannot assert "this result was not tampered
 * with" or "my oldest result was from epoch X" cannot build a trustworthy
 * process-improvement record.
 *
 * Gaps closed by this file (not covered by results-cli, results-diff-verify,
 * results-qol, results-autoprocess-gaps, run-results-gaps, results-jtbd):
 *
 *  G-A  --verify JSON payload: `verified` boolean field (integrity=ok → true)
 *  G-B  --verify JSON payload: `hash_match` boolean field (no mismatch → true)
 *  G-C  --verify JSON payload: `ref` field echoes the requested ref
 *  G-D  --verify on a legacy file without `output_hash` field (no_receipt, exit 0)
 *  G-E  --verify on a malformed-JSON result file exits source_error (2)
 *  G-F  list payload: `oldest` and `newest` ISO timestamp fields
 *  G-G  list payload: `oldest`/`newest` are null when no results exist
 *  G-H  path-traversal ref rejected by --verify (exits source_error 2)
 *  G-I  path-traversal ref rejected by --diff (exits source_error 2 or config_error 1)
 *  G-J  --cat with ref that lacks `.json` extension still resolves
 *  G-K  --diff where one of the two files is corrupt JSON exits source_error (2)
 *  G-L  --diff with only whitespace between commas (empty refs) exits non-zero
 *  G-M  --verify `hash_match=false` when stored_output_hash differs from recomputed
 *  G-N  list JSON payload has `showing` field even when dir is completely absent
 *
 * Oracle rank: Rank-2 (domain contract) — exit codes are defined in
 * exit-codes.ts; JSON envelope shape is defined in output.ts.
 *
 * Tests run the pre-built wpm.js binary in isolated temp directories.
 * No WASM import needed — results does not call into WASM at all.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFile } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import { tmpdir } from 'os';
import { hashJsonString } from '@wasm4pm/contracts';

// ─── CLI runner ───────────────────────────────────────────────────────────────

interface CliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

const CLI_PATH = path.resolve(__dirname, '../../dist/bin/wpm.js');

function runCli(args: string[], cwd: string, timeoutMs = 15_000): Promise<CliResult> {
  return new Promise((resolve) => {
    const child = execFile(
      process.execPath,
      [CLI_PATH, ...args],
      { timeout: timeoutMs, maxBuffer: 5 * 1024 * 1024, cwd },
      (error, stdout, stderr) => {
        const exitCode =
          error && 'code' in error && typeof error.code === 'number'
            ? error.code
            : error
              ? 1
              : 0;
        resolve({ exitCode, stdout: stdout ?? '', stderr: stderr ?? '' });
      }
    );
    child.on('error', () =>
      resolve({ exitCode: 5, stdout: '', stderr: 'Process failed to start' })
    );
  });
}

// ─── Test env helpers ─────────────────────────────────────────────────────────

interface TestEnv {
  tempDir: string;
  resultsDir: string;
  receiptsDir: string;
  cleanup: () => Promise<void>;
}

async function createTestEnv(): Promise<TestEnv> {
  const tempDir = await fs.mkdtemp(path.join(tmpdir(), 'wpm-results-gaps-'));
  const resultsDir = path.join(tempDir, '.wasm4pm', 'results');
  const receiptsDir = path.join(tempDir, '.wasm4pm', 'receipts');
  return {
    tempDir,
    resultsDir,
    receiptsDir,
    cleanup: async () => {
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch {
        /* best effort */
      }
    },
  };
}

/**
 * Write a valid SavedResult fixture whose `output_hash` matches
 * BLAKE3(JSON.stringify(result)) — identical to what savePredictionResult() writes.
 */
async function writeFixture(
  resultsDir: string,
  task: string,
  timestamp: string,
  opts: {
    withOutputHash?: boolean;
    corruptJson?: boolean;
    resultData?: Record<string, unknown>;
    storedHash?: string;
  } = {}
): Promise<{ name: string; filepath: string; resultData: Record<string, unknown>; outputHash: string }> {
  await fs.mkdir(resultsDir, { recursive: true });
  const filename = `${timestamp}-${task}.json`;
  const filepath = path.join(resultsDir, filename);

  const resultData = opts.resultData ?? { traces: 42, variants: 7, fitness: 0.94 };
  const resultJson = JSON.stringify(resultData);
  const outputHash = opts.storedHash ?? hashJsonString(resultJson);

  if (opts.corruptJson) {
    await fs.writeFile(filepath, '{ this is not valid JSON', 'utf-8');
    return { name: filename, filepath, resultData, outputHash };
  }

  const saved: Record<string, unknown> = {
    version: 1,
    savedAt: new Date().toISOString(),
    task,
    input: '/revops/pipeline.xes',
    activityKey: 'concept:name',
    result: resultData,
  };
  if (opts.withOutputHash !== false) {
    saved['output_hash'] = outputHash;
  }
  await fs.writeFile(filepath, JSON.stringify(saved, null, 2), 'utf-8');
  return { name: filename, filepath, resultData, outputHash };
}

async function writeMatchingReceipt(
  receiptsDir: string,
  outputHash: string,
  opts: { runId?: string } = {}
): Promise<string> {
  await fs.mkdir(receiptsDir, { recursive: true });
  const runId = opts.runId ?? 'gap-run-' + Date.now().toString(36);
  const receipt = {
    run_id: runId,
    command: 'predict',
    input_hash: '0'.repeat(64),
    output_hash: outputHash,
    status: 'success',
    timestamp: new Date().toISOString(),
  };
  const json = JSON.stringify(receipt, null, 2);
  await fs.writeFile(path.join(receiptsDir, `${runId}.json`), json, 'utf-8');
  await fs.writeFile(path.join(receiptsDir, 'latest.json'), json, 'utf-8');
  return runId;
}

// ─── G-A / G-B / G-C: --verify JSON payload booleans and ref ─────────────────

describe('G-A/B/C — --verify JSON payload: verified, hash_match, and ref fields', () => {
  let env: TestEnv;
  beforeEach(async () => { env = await createTestEnv(); });
  afterEach(async () => { await env.cleanup(); });

  it('G-A: verify payload has verified=false when no receipt (integrity=no_receipt)', async () => {
    await writeFixture(env.resultsDir, 'no-receipt-task', '20260518T100000');
    const result = await runCli(['results', '--verify', '1', '--format', 'json'], env.tempDir);
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    const payload = parsed.payload as Record<string, unknown>;
    expect(payload.integrity).toBe('no_receipt');
    // verified is false when no receipt matches
    expect(typeof payload.verified).toBe('boolean');
    expect(payload.verified).toBe(false);
  });

  it('G-A: verify payload has verified=true when receipt matches (integrity=ok)', async () => {
    const { outputHash } = await writeFixture(env.resultsDir, 'receipted-task', '20260518T110000');
    await writeMatchingReceipt(env.receiptsDir, outputHash);
    const result = await runCli(['results', '--verify', '1', '--format', 'json'], env.tempDir);
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    const payload = parsed.payload as Record<string, unknown>;
    expect(payload.integrity).toBe('ok');
    expect(payload.verified).toBe(true);
  });

  it('G-B: verify payload has hash_match=true when no tampering detected', async () => {
    await writeFixture(env.resultsDir, 'clean-task', '20260518T120000');
    const result = await runCli(['results', '--verify', '1', '--format', 'json'], env.tempDir);
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    const payload = parsed.payload as Record<string, unknown>;
    expect(typeof payload.hash_match).toBe('boolean');
    expect(payload.hash_match).toBe(true);
  });

  it('G-B: verify payload has hash_match=false when stored hash differs from recomputed', async () => {
    // Write fixture with a deliberately wrong stored hash so tampering is detected
    const { filepath } = await writeFixture(env.resultsDir, 'tampered-hash', '20260518T130000', {
      storedHash: 'a'.repeat(64),
    });
    // Now alter the result data so the recomputed hash differs from the stored one
    const raw = await fs.readFile(filepath, 'utf-8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    (parsed.result as Record<string, unknown>)['extra'] = 'injected';
    await fs.writeFile(filepath, JSON.stringify(parsed, null, 2), 'utf-8');

    const result = await runCli(['results', '--verify', '1', '--format', 'json'], env.tempDir);
    expect(result.exitCode).toBe(4); // partial_failure
    const out = JSON.parse(result.stdout) as Record<string, unknown>;
    const payload = out.payload as Record<string, unknown>;
    expect(payload.hash_match).toBe(false);
    expect(payload.integrity).toBe('mismatch');
  });

  it('G-C: verify payload echoes the requested ref in the ref field', async () => {
    await writeFixture(env.resultsDir, 'ref-echo', '20260518T140000');
    const result = await runCli(['results', '--verify', '1', '--format', 'json'], env.tempDir);
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    const payload = parsed.payload as Record<string, unknown>;
    expect(typeof payload.ref).toBe('string');
    expect(payload.ref).toBe('1');
  });

  it('G-C: ref field echoes filename ref, not index, when a filename is passed', async () => {
    const fixture = await writeFixture(env.resultsDir, 'fname-ref', '20260518T150000');
    const result = await runCli(
      ['results', '--verify', fixture.name, '--format', 'json'],
      env.tempDir
    );
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    const payload = parsed.payload as Record<string, unknown>;
    expect(payload.ref).toBe(fixture.name);
  });
});

// ─── G-D: --verify on legacy file without output_hash field ──────────────────

describe('G-D — --verify on legacy file without output_hash field', () => {
  let env: TestEnv;
  beforeEach(async () => { env = await createTestEnv(); });
  afterEach(async () => { await env.cleanup(); });

  it('G-D: exits 0 for a legacy file (no output_hash) — integrity=no_receipt', async () => {
    // withOutputHash=false simulates a pre-26.5.17 result file
    await writeFixture(env.resultsDir, 'legacy-task', '20260518T100000', { withOutputHash: false });
    const result = await runCli(['results', '--verify', '1', '--format', 'json'], env.tempDir);
    expect(result.exitCode).toBe(0);
  });

  it('G-D: legacy file has integrity=no_receipt because no stored hash to compare', async () => {
    await writeFixture(env.resultsDir, 'old-file', '20260518T110000', { withOutputHash: false });
    const result = await runCli(['results', '--verify', '1', '--format', 'json'], env.tempDir);
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    const payload = parsed.payload as Record<string, unknown>;
    expect(payload.integrity).toBe('no_receipt');
    // stored_output_hash is null for legacy files
    expect(payload.stored_output_hash).toBeNull();
  });

  it('G-D: legacy file verify still computes recomputed_output_hash', async () => {
    await writeFixture(env.resultsDir, 'legacy-hash', '20260518T120000', { withOutputHash: false });
    const result = await runCli(['results', '--verify', '1', '--format', 'json'], env.tempDir);
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    const payload = parsed.payload as Record<string, unknown>;
    expect(typeof payload.recomputed_output_hash).toBe('string');
    expect((payload.recomputed_output_hash as string).length).toBe(64);
  });
});

// ─── G-E: --verify on malformed JSON exits source_error (2) ──────────────────

describe('G-E — --verify on malformed JSON result file', () => {
  let env: TestEnv;
  beforeEach(async () => { env = await createTestEnv(); });
  afterEach(async () => { await env.cleanup(); });

  it('G-E: exits source_error (2) when the referenced result file contains invalid JSON', async () => {
    await writeFixture(env.resultsDir, 'corrupt-task', '20260518T100000', { corruptJson: true });
    const result = await runCli(['results', '--verify', '1', '--format', 'json'], env.tempDir);
    expect(result.exitCode).toBe(2);
  });

  it('G-E: JSON error envelope has status:error for corrupt result file', async () => {
    await writeFixture(env.resultsDir, 'bad-json', '20260518T110000', { corruptJson: true });
    const result = await runCli(['results', '--verify', '1', '--format', 'json'], env.tempDir);
    expect(result.exitCode).toBe(2);
    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(parsed.status).toBe('error');
    expect(parsed.command).toBe('results');
  });
});

// ─── G-F / G-G: list payload oldest and newest fields ────────────────────────

describe('G-F — list payload: oldest and newest timestamp fields', () => {
  let env: TestEnv;
  beforeEach(async () => { env = await createTestEnv(); });
  afterEach(async () => { await env.cleanup(); });

  it('G-F: list payload has oldest and newest fields when results exist', async () => {
    await writeFixture(env.resultsDir, 'early-run', '20260516T100000');
    await new Promise((r) => setTimeout(r, 40));
    await writeFixture(env.resultsDir, 'late-run', '20260518T120000');

    const result = await runCli(['results', '--format', 'json'], env.tempDir);
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    const payload = parsed.payload as Record<string, unknown>;
    expect(payload).toHaveProperty('oldest');
    expect(payload).toHaveProperty('newest');
    expect(typeof payload.oldest).toBe('string');
    expect(typeof payload.newest).toBe('string');
  });

  it('G-F: newest is a valid ISO timestamp', async () => {
    await writeFixture(env.resultsDir, 'only-run', '20260518T100000');
    const result = await runCli(['results', '--format', 'json'], env.tempDir);
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    const payload = parsed.payload as Record<string, unknown>;
    const d = new Date(payload.newest as string);
    expect(d.getTime()).not.toBeNaN();
  });

  it('G-F: oldest is an ISO timestamp <= newest when two results exist', async () => {
    await writeFixture(env.resultsDir, 'first', '20260516T100000');
    await new Promise((r) => setTimeout(r, 40));
    await writeFixture(env.resultsDir, 'second', '20260518T100000');

    const result = await runCli(['results', '--format', 'json'], env.tempDir);
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    const payload = parsed.payload as Record<string, unknown>;
    const oldestMs = new Date(payload.oldest as string).getTime();
    const newestMs = new Date(payload.newest as string).getTime();
    expect(oldestMs).toBeLessThanOrEqual(newestMs);
  });
});

describe('G-G — list payload: oldest and newest are null when no results', () => {
  let env: TestEnv;
  beforeEach(async () => { env = await createTestEnv(); });
  afterEach(async () => { await env.cleanup(); });

  it('G-G: oldest and newest are null when results directory is empty', async () => {
    await fs.mkdir(env.resultsDir, { recursive: true });
    const result = await runCli(['results', '--format', 'json'], env.tempDir);
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    const payload = parsed.payload as Record<string, unknown>;
    expect(payload.oldest).toBeNull();
    expect(payload.newest).toBeNull();
  });

  it('G-G: oldest and newest are null when results directory does not exist', async () => {
    // No dir creation at all
    const result = await runCli(['results', '--format', 'json'], env.tempDir);
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    const payload = parsed.payload as Record<string, unknown>;
    expect(payload.oldest).toBeNull();
    expect(payload.newest).toBeNull();
  });
});

// ─── G-H: path traversal rejected by --verify ────────────────────────────────

describe('G-H — --verify path traversal is rejected', () => {
  let env: TestEnv;
  beforeEach(async () => { env = await createTestEnv(); });
  afterEach(async () => { await env.cleanup(); });

  it('G-H: --verify ../secret exits source_error (2) or config_error (1), not 0', async () => {
    await writeFixture(env.resultsDir, 'real-file', '20260518T100000');
    // Attempt directory traversal via the ref argument
    const result = await runCli(
      ['results', '--verify', '../secret', '--format', 'json'],
      env.tempDir
    );
    // Must not succeed — the traversal reference should be treated as not-found
    expect(result.exitCode).not.toBe(0);
  });

  it('G-H: --verify ../../etc/passwd exits non-zero', async () => {
    await writeFixture(env.resultsDir, 'real-file', '20260518T110000');
    const result = await runCli(
      ['results', '--verify', '../../etc/passwd', '--format', 'json'],
      env.tempDir
    );
    expect(result.exitCode).not.toBe(0);
    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(parsed.status).toBe('error');
  });
});

// ─── G-I: path traversal rejected by --diff ──────────────────────────────────

describe('G-I — --diff path traversal is rejected', () => {
  let env: TestEnv;
  beforeEach(async () => { env = await createTestEnv(); });
  afterEach(async () => { await env.cleanup(); });

  it('G-I: --diff ../secret,1 exits non-zero', async () => {
    await writeFixture(env.resultsDir, 'real', '20260518T100000');
    const result = await runCli(
      ['results', '--diff', '../secret,1', '--format', 'json'],
      env.tempDir
    );
    expect(result.exitCode).not.toBe(0);
  });

  it('G-I: --diff 1,../../etc/passwd exits non-zero', async () => {
    await writeFixture(env.resultsDir, 'real', '20260518T110000');
    const result = await runCli(
      ['results', '--diff', '1,../../etc/passwd', '--format', 'json'],
      env.tempDir
    );
    expect(result.exitCode).not.toBe(0);
    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(parsed.status).toBe('error');
  });
});

// ─── G-J: --cat resolves ref without .json extension ─────────────────────────

describe('G-J — --cat: ref without .json extension resolves to the file', () => {
  let env: TestEnv;
  beforeEach(async () => { env = await createTestEnv(); });
  afterEach(async () => { await env.cleanup(); });

  it('G-J: --cat with stem (no .json) returns the result successfully', async () => {
    const fixture = await writeFixture(env.resultsDir, 'stem-task', '20260518T100000');
    // stem = filename without .json
    const stem = fixture.name.replace(/\.json$/, '');
    const result = await runCli(['results', '--cat', stem, '--format', 'json'], env.tempDir);
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(parsed.status).toBe('ok');
    const payload = parsed.payload as Record<string, unknown>;
    const cat = payload.cat as Record<string, unknown>;
    expect(cat.task).toBe('stem-task');
  });
});

// ─── G-K: --diff where one file has corrupt JSON ─────────────────────────────

describe('G-K — --diff where one file has corrupt JSON', () => {
  let env: TestEnv;
  beforeEach(async () => { env = await createTestEnv(); });
  afterEach(async () => { await env.cleanup(); });

  it('G-K: exits source_error (2) when the first diff ref is corrupt JSON', async () => {
    await writeFixture(env.resultsDir, 'corrupt-left', '20260518T100000', { corruptJson: true });
    await new Promise((r) => setTimeout(r, 40));
    await writeFixture(env.resultsDir, 'good-right', '20260518T110000');

    // newest first: index 1 = good-right, index 2 = corrupt-left
    const result = await runCli(['results', '--diff', '2,1', '--format', 'json'], env.tempDir);
    expect(result.exitCode).toBe(2);
    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(parsed.status).toBe('error');
  });

  it('G-K: exits source_error (2) when the second diff ref is corrupt JSON', async () => {
    await writeFixture(env.resultsDir, 'good-left', '20260518T100000');
    await new Promise((r) => setTimeout(r, 40));
    await writeFixture(env.resultsDir, 'corrupt-right', '20260518T110000', { corruptJson: true });

    // newest first: index 1 = corrupt-right, index 2 = good-left
    const result = await runCli(['results', '--diff', '2,1', '--format', 'json'], env.tempDir);
    expect(result.exitCode).toBe(2);
    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(parsed.status).toBe('error');
  });
});

// ─── G-L: --diff with empty refs (whitespace-only or bare comma) ──────────────

describe('G-L — --diff with empty or whitespace refs exits non-zero', () => {
  let env: TestEnv;
  beforeEach(async () => { env = await createTestEnv(); });
  afterEach(async () => { await env.cleanup(); });

  it('G-L: --diff with bare comma (two empty refs) exits non-zero', async () => {
    await fs.mkdir(env.resultsDir, { recursive: true });
    const result = await runCli(['results', '--diff', ',', '--format', 'json'], env.tempDir);
    expect(result.exitCode).not.toBe(0);
  });

  it('G-L: --diff with spaces around comma exits non-zero', async () => {
    await fs.mkdir(env.resultsDir, { recursive: true });
    const result = await runCli(['results', '--diff', ' , ', '--format', 'json'], env.tempDir);
    expect(result.exitCode).not.toBe(0);
  });
});

// ─── G-M: hash_match is false when stored hash differs ───────────────────────

describe('G-M — --verify hash_match is false on pure stored-hash mismatch', () => {
  let env: TestEnv;
  beforeEach(async () => { env = await createTestEnv(); });
  afterEach(async () => { await env.cleanup(); });

  it('G-M: hash_match=false when file output_hash field was written with wrong value', async () => {
    // storedHash is deliberately wrong (all-a hex), but result data is untouched.
    // The recomputed hash will differ from the stored hash → mismatch.
    await writeFixture(env.resultsDir, 'wrong-hash', '20260518T100000', {
      storedHash: 'a'.repeat(64),
    });
    const result = await runCli(['results', '--verify', '1', '--format', 'json'], env.tempDir);
    expect(result.exitCode).toBe(4); // partial_failure
    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    const payload = parsed.payload as Record<string, unknown>;
    expect(payload.hash_match).toBe(false);
    expect(payload.integrity).toBe('mismatch');
  });
});

// ─── G-N: showing field present even when results dir is absent ───────────────

describe('G-N — list showing field present regardless of directory state', () => {
  let env: TestEnv;
  beforeEach(async () => { env = await createTestEnv(); });
  afterEach(async () => { await env.cleanup(); });

  it('G-N: showing=0 in JSON payload when results dir does not exist', async () => {
    // No dir created — raw temp dir only
    const result = await runCli(['results', '--format', 'json'], env.tempDir);
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    const payload = parsed.payload as Record<string, unknown>;
    expect(typeof payload.showing).toBe('number');
    expect(payload.showing).toBe(0);
  });

  it('G-N: showing matches the number of entries in results array', async () => {
    await writeFixture(env.resultsDir, 'one', '20260518T100000');
    await writeFixture(env.resultsDir, 'two', '20260518T110000');
    const result = await runCli(['results', '--limit', '1', '--format', 'json'], env.tempDir);
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    const payload = parsed.payload as Record<string, unknown>;
    const entries = payload.results as unknown[];
    expect(payload.showing).toBe(entries.length);
    expect(payload.showing).toBe(1);
  });
});
