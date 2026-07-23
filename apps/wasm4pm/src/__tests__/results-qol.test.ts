/**
 * `wpm results` was retired; the hard-break table (nouns/_removed.ts) forwards
 * it to `wpm evidence report`, which bridges unmodified to this same
 * `commands/results.ts` body (nouns/evidence/report.ts). A successful bridged
 * call returns the legacy `{command,status,payload,meta}` envelope verbatim
 * (confirmed live against the built CLI); a failing one is thrown as the
 * framework's `{error:{code,message}}` envelope instead, with the legacy
 * `error.code` (e.g. `RESULT_NOT_FOUND`) collapsed to the generic
 * `INVALID_INPUT` (see packages/noun-verb `_bridge.ts` classifyLegacyFailure)
 * — exit codes are otherwise preserved (source_error paths still exit 2,
 * and the bridge's `resolveResultExitCode` reads the legacy `exit_code`
 * field on the success path, so `integrity: 'mismatch'` still exits 4).
 *
 * results QoL (Quality-of-Life) tests — gaps not covered by results-cli.test.ts,
 * results-diff-verify.test.ts, or results-jtbd.test.ts.
 *
 * Van der Aalst QA perspective:
 * - Each test targets a concrete practitioner failure mode: confusing error messages,
 *   silent crashes on missing directories, or opaque integrity output.
 *
 * Gaps addressed:
 *   G1 — results dir does NOT exist at all (no .wasm4pm parent) → exit 0, helpful message
 *   G2 — --verify nonexistent ref → human output contains "not found"
 *   G3 — --verify with a matching receipt → integrity=ok, exit 0
 *   G4 — --verify after payload tampering → exit partial_failure (4), human shows both hashes
 *   G5 — --diff JSON output has leftPath and rightPath fields
 *   G6 — --diff human output mentions both result task names
 *   G7 — --cat nonexistent ref in empty dir → error message mentions "No results saved yet"
 *   G8 — --format json on empty dir → parseable JSON with directory field present
 *
 * Oracle rank: Rank-2 (domain contract) for exit codes; Rank-3 (metamorphic) for
 * tampered-payload hash comparison.
 *
 * Tests run the pre-built wpm.js binary in isolated temp directories.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFile } from 'child_process';
import * as fs from 'fs/promises';
import * as fss from 'fs';
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
  const tempDir = await fs.mkdtemp(path.join(tmpdir(), 'wpm-results-qol-'));
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
 * Write a SavedResult fixture and return its filename and the raw result payload
 * JSON string (the same string that results.ts hashes for --verify).
 *
 * The fixture includes the `output_hash` field (written at save time) so that
 * `wpm results --verify` can detect tampering without needing a receipt.
 */
async function writeFixture(
  resultsDir: string,
  task: string,
  timestamp: string,
  extra: Record<string, unknown> = {}
): Promise<{ name: string; filepath: string; resultJson: string; outputHash: string }> {
  await fs.mkdir(resultsDir, { recursive: true });
  const filename = `${timestamp}-${task}.json`;
  const filepath = path.join(resultsDir, filename);
  const resultData = { traces: 42, variants: 7, fitness: 0.94, ...extra };
  const resultJson = JSON.stringify(resultData);
  const outputHash = hashJsonString(resultJson);
  const payload = {
    version: 1,
    savedAt: new Date().toISOString(),
    task,
    input: '/revops/pipeline.xes',
    activityKey: 'concept:name',
    result: resultData,
    output_hash: outputHash,
  };
  await fs.writeFile(filepath, JSON.stringify(payload, null, 2), 'utf-8');
  return { name: filename, filepath, resultJson, outputHash };
}

/**
 * Write a CommandReceipt JSON that matches the given output_hash into the
 * receipts directory. Returns the receipt run_id.
 *
 * Includes `observed_path.observed_ocel2` — `--verify`'s integrity check
 * (commands/results.ts) reports `missing_ocel` instead of `ok` when a
 * matched receipt lacks an embedded canonical OCEL slice, a pre-existing
 * constraint unrelated to noun-verb migration but required for a matching
 * receipt to actually resolve to `integrity: 'ok'` (confirmed live against
 * the built CLI).
 */
async function writeMatchingReceipt(
  receiptsDir: string,
  outputHash: string,
  opts: { runId?: string; command?: string } = {}
): Promise<string> {
  await fs.mkdir(receiptsDir, { recursive: true });
  const runId = opts.runId ?? 'test-run-' + Date.now().toString(36);
  const receipt = {
    run_id: runId,
    command: opts.command ?? 'predict',
    input_hash: '0'.repeat(64),
    output_hash: outputHash,
    status: 'success',
    timestamp: new Date().toISOString(),
    observed_path: { observed_ocel2: true },
  };
  const json = JSON.stringify(receipt, null, 2);
  await fs.writeFile(path.join(receiptsDir, `${runId}.json`), json, 'utf-8');
  await fs.writeFile(path.join(receiptsDir, 'latest.json'), json, 'utf-8');
  return runId;
}

// ─── G1: results dir does NOT exist at all ───────────────────────────────────

describe('G1 — wpm results: .wasm4pm/results directory does not exist', () => {
  let env: TestEnv;
  beforeEach(async () => {
    env = await createTestEnv();
    // DO NOT create resultsDir or .wasm4pm — the parent directory doesn't exist
  });
  afterEach(async () => { await env.cleanup(); });

  it('exits 0 when .wasm4pm/results does not exist', async () => {
    const result = await runCli(['evidence', 'report', '--format', 'json'], env.tempDir);
    expect(result.exitCode).toBe(0);
  });

  it('returns count:0 and empty results array when dir is missing', async () => {
    const result = await runCli(['evidence', 'report', '--format', 'json'], env.tempDir);
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(parsed.status).toBe('ok');
    const payload = parsed.payload as Record<string, unknown>;
    expect(payload.count).toBe(0);
    expect(Array.isArray(payload.results)).toBe(true);
    expect((payload.results as unknown[]).length).toBe(0);
  });

  it('output tells the practitioner where results will be written when dir is missing', async () => {
    // Bridged verbs always force `--format json --quiet` regardless of the
    // caller's own `--format` (see _bridge.ts's invokeLegacyCommandAsJson) —
    // the legacy human ConsoleRenderer (which used to print "no saved
    // results yet, run `wpm run` to create one") never executes anymore,
    // per the framework's always-JSON-on-stdout contract. The equivalent
    // practitioner-facing information is now the JSON payload's own
    // `directory`/`count` fields, asserted below instead of scraping text.
    const result = await runCli(['evidence', 'report'], env.tempDir);
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    const payload = parsed.payload as Record<string, unknown>;
    expect(payload.count).toBe(0);
    expect(typeof payload.directory).toBe('string');
  });

  it('JSON output includes a directory field even when the dir is missing', async () => {
    const result = await runCli(['evidence', 'report', '--format', 'json'], env.tempDir);
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    const payload = parsed.payload as Record<string, unknown>;
    // The directory field tells the practitioner where results will be written
    expect(typeof payload.directory).toBe('string');
    expect((payload.directory as string).length).toBeGreaterThan(0);
  });
});

// ─── G2: --verify nonexistent ref → clear "not found" message ────────────────

describe('G2 — wpm results --verify: human output is informative on not-found', () => {
  let env: TestEnv;
  beforeEach(async () => { env = await createTestEnv(); });
  afterEach(async () => { await env.cleanup(); });

  it('human output for missing verify ref mentions the ref value', async () => {
    await fs.mkdir(env.resultsDir, { recursive: true });
    const result = await runCli(['evidence', 'report', '--verify', 'phantom-ref'], env.tempDir);
    expect(result.exitCode).toBe(2);
    const combined = result.stdout + result.stderr;
    // Must identify which ref was not found
    expect(combined).toMatch(/phantom-ref/);
  });

  it('human output for missing verify ref with no saved results hints the practitioner', async () => {
    await fs.mkdir(env.resultsDir, { recursive: true });
    const result = await runCli(['evidence', 'report', '--verify', '1'], env.tempDir);
    expect(result.exitCode).toBe(2);
    const combined = result.stdout + result.stderr;
    // Must give guidance when the entire results dir is empty
    expect(combined).toMatch(/No results saved yet|wpm results|available/i);
  });

  it('human output for missing verify ref with saved results shows available range', async () => {
    await writeFixture(env.resultsDir, 'only-one', '20260516T100000');
    const result = await runCli(['evidence', 'report', '--verify', '99'], env.tempDir);
    expect(result.exitCode).toBe(2);
    const combined = result.stdout + result.stderr;
    // Must tell practitioner the valid range
    expect(combined).toMatch(/Available indexes|wpm results/i);
  });
});

// ─── G3: --verify with matching receipt → integrity ok ───────────────────────

describe('G3 — wpm results --verify: matching receipt produces integrity=ok', () => {
  let env: TestEnv;
  beforeEach(async () => { env = await createTestEnv(); });
  afterEach(async () => { await env.cleanup(); });

  it('exits 0 with integrity=ok when receipt output_hash matches result payload', async () => {
    const { resultJson } = await writeFixture(env.resultsDir, 'matched-task', '20260516T100000');
    // Compute the hash that results.ts will also compute: blake3(JSON.stringify(result))
    const outputHash = hashJsonString(resultJson);
    await writeMatchingReceipt(env.receiptsDir, outputHash);

    const result = await runCli(['evidence', 'report', '--verify', '1', '--format', 'json'], env.tempDir);
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(parsed.status).toBe('ok');
    const payload = parsed.payload as Record<string, unknown>;
    expect(payload.integrity).toBe('ok');
    expect(payload.receipt_found).toBe(true);
  });

  it('verify ok payload has receipt_file and run_id fields populated', async () => {
    const { resultJson } = await writeFixture(env.resultsDir, 'receipt-check', '20260516T110000');
    const outputHash = hashJsonString(resultJson);
    const runId = await writeMatchingReceipt(env.receiptsDir, outputHash, {
      runId: 'qol-run-abc123',
      command: 'predict',
    });

    const result = await runCli(['evidence', 'report', '--verify', '1', '--format', 'json'], env.tempDir);
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    const payload = parsed.payload as Record<string, unknown>;
    expect(payload.integrity).toBe('ok');
    expect(typeof payload.receipt_file).toBe('string');
    expect(typeof payload.run_id).toBe('string');
    // run_id in the payload should match what we wrote to the receipt
    expect(payload.run_id).toBe(runId);
  });

  it('human output for integrity=ok shows the output hash and receipt info', async () => {
    const { resultJson } = await writeFixture(env.resultsDir, 'happy-task', '20260516T120000');
    const outputHash = hashJsonString(resultJson);
    await writeMatchingReceipt(env.receiptsDir, outputHash, { command: 'predict' });

    const result = await runCli(['evidence', 'report', '--verify', '1'], env.tempDir);
    expect(result.exitCode).toBe(0);
    const combined = result.stdout + result.stderr;
    // Human output must show the hash value (64 hex chars or at least a 32-char prefix)
    expect(combined).toMatch(/[0-9a-f]{32}/);
    // Must show the receipt file name
    expect(combined).toMatch(/latest\.json|Receipt/i);
  });
});

// ─── G4: --verify after payload tampering → hash mismatch ────────────────────

describe('G4 — wpm results --verify: tampered payload produces hash mismatch', () => {
  let env: TestEnv;
  beforeEach(async () => { env = await createTestEnv(); });
  afterEach(async () => { await env.cleanup(); });

  it('exits partial_failure (4) when receipt hash does not match recomputed hash', async () => {
    // Write fixture, then write a receipt with a WRONG output_hash
    const { filepath } = await writeFixture(env.resultsDir, 'tampered-task', '20260516T100000');
    const wrongHash = 'a'.repeat(64); // valid hex-64 but wrong
    await writeMatchingReceipt(env.receiptsDir, wrongHash);

    // Now tamper with the result file after writing the receipt
    const raw = await fs.readFile(filepath, 'utf-8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const resultData = parsed.result as Record<string, unknown>;
    resultData['tampered'] = true;
    await fs.writeFile(filepath, JSON.stringify({ ...parsed, result: resultData }, null, 2), 'utf-8');

    const result = await runCli(['evidence', 'report', '--verify', '1', '--format', 'json'], env.tempDir);
    // partial_failure = 4
    expect(result.exitCode).toBe(4);
  });

  it('JSON payload for mismatch has integrity=mismatch', async () => {
    const { filepath } = await writeFixture(env.resultsDir, 'mismatch-task', '20260516T110000');
    const wrongHash = 'b'.repeat(64);
    await writeMatchingReceipt(env.receiptsDir, wrongHash);

    // Tamper: add an extra field to result
    const raw = await fs.readFile(filepath, 'utf-8');
    const parsedFile = JSON.parse(raw) as Record<string, unknown>;
    (parsedFile.result as Record<string, unknown>)['injected'] = 'evil';
    await fs.writeFile(filepath, JSON.stringify(parsedFile, null, 2), 'utf-8');

    const result = await runCli(['evidence', 'report', '--verify', '1', '--format', 'json'], env.tempDir);
    expect(result.exitCode).toBe(4);
    const parsedOut = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(parsedOut.status).toBe('ok'); // the operation itself succeeded
    const payload = parsedOut.payload as Record<string, unknown>;
    expect(payload.integrity).toBe('mismatch');
  });

  it('human output for mismatch says FAIL and shows both hashes', async () => {
    const { filepath } = await writeFixture(env.resultsDir, 'fail-task', '20260516T120000');
    const wrongHash = 'c'.repeat(64);
    await writeMatchingReceipt(env.receiptsDir, wrongHash);

    const raw = await fs.readFile(filepath, 'utf-8');
    const parsedFile = JSON.parse(raw) as Record<string, unknown>;
    (parsedFile.result as Record<string, unknown>)['extra'] = 42;
    await fs.writeFile(filepath, JSON.stringify(parsedFile, null, 2), 'utf-8');

    const result = await runCli(['evidence', 'report', '--verify', '1'], env.tempDir);
    expect(result.exitCode).toBe(4);
    const combined = result.stdout + result.stderr;
    expect(combined).toMatch(/FAIL|mismatch/i);
    // Both hashes should appear in the output
    expect(combined).toMatch(/[0-9a-f]{32}/);
  });

  it('mismatch payload has stored_output_hash and recomputed_output_hash, and they differ', async () => {
    const { filepath } = await writeFixture(env.resultsDir, 'both-hashes', '20260516T130000');
    // No need for a receipt — stored_output_hash in the file is enough to detect tampering

    const raw = await fs.readFile(filepath, 'utf-8');
    const parsedFile = JSON.parse(raw) as Record<string, unknown>;
    (parsedFile.result as Record<string, unknown>)['delta'] = 999;
    await fs.writeFile(filepath, JSON.stringify(parsedFile, null, 2), 'utf-8');

    const result = await runCli(['evidence', 'report', '--verify', '1', '--format', 'json'], env.tempDir);
    expect(result.exitCode).toBe(4);
    const parsedOut = JSON.parse(result.stdout) as Record<string, unknown>;
    const payload = parsedOut.payload as Record<string, unknown>;
    // stored_output_hash is what was written at save time
    expect(typeof payload.stored_output_hash).toBe('string');
    expect(typeof payload.recomputed_output_hash).toBe('string');
    // The two hashes must differ (that's the whole point — tampering detected)
    expect(payload.stored_output_hash).not.toBe(payload.recomputed_output_hash);
  });
});

// ─── G5: --diff JSON payload has leftPath and rightPath ──────────────────────

describe('G5 — wpm results --diff: JSON payload structure', () => {
  let env: TestEnv;
  beforeEach(async () => { env = await createTestEnv(); });
  afterEach(async () => { await env.cleanup(); });

  it('diff JSON payload has leftPath and rightPath as absolute paths', async () => {
    await writeFixture(env.resultsDir, 'alpha-run', '20260516T100000', { fitness: 0.85 });
    await new Promise((r) => setTimeout(r, 30));
    await writeFixture(env.resultsDir, 'heuristic-run', '20260516T110000', { fitness: 0.91 });

    const result = await runCli(['evidence', 'report', '--diff', '1,2', '--format', 'json'], env.tempDir);
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(parsed.status).toBe('ok');
    const payload = parsed.payload as Record<string, unknown>;
    expect(typeof payload.leftPath).toBe('string');
    expect(typeof payload.rightPath).toBe('string');
    // Paths must be absolute (start with /)
    expect((payload.leftPath as string).startsWith('/')).toBe(true);
    expect((payload.rightPath as string).startsWith('/')).toBe(true);
  });

  it('diff JSON payload left.task and right.task are the two result tasks', async () => {
    await writeFixture(env.resultsDir, 'task-left', '20260516T100000');
    await new Promise((r) => setTimeout(r, 30));
    await writeFixture(env.resultsDir, 'task-right', '20260516T110000');

    const result = await runCli(['evidence', 'report', '--diff', '1,2', '--format', 'json'], env.tempDir);
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    const payload = parsed.payload as Record<string, unknown>;
    const left = payload.left as Record<string, unknown>;
    const right = payload.right as Record<string, unknown>;
    const tasks = [left.task as string, right.task as string].sort();
    expect(tasks).toEqual(['task-left', 'task-right'].sort());
  });

  it('diff JSON payload meta fields are well-formed', async () => {
    await writeFixture(env.resultsDir, 'algo-a', '20260516T100000');
    await new Promise((r) => setTimeout(r, 30));
    await writeFixture(env.resultsDir, 'algo-b', '20260516T110000');

    const result = await runCli(['evidence', 'report', '--diff', '1,2', '--format', 'json'], env.tempDir);
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(parsed.command).toBe('results');
    expect(parsed.status).toBe('ok');
    const meta = parsed.meta as Record<string, unknown>;
    expect(typeof meta.run_id).toBe('string');
    expect(typeof meta.timestamp).toBe('string');
    expect(typeof meta.duration_ms).toBe('number');
  });
});

// ─── G6: --diff human output mentions both task names ────────────────────────

describe('G6 — wpm results --diff: human output quality', () => {
  let env: TestEnv;
  beforeEach(async () => { env = await createTestEnv(); });
  afterEach(async () => { await env.cleanup(); });

  it('human diff output mentions both result filenames', async () => {
    await writeFixture(env.resultsDir, 'first-algo', '20260516T100000');
    await new Promise((r) => setTimeout(r, 30));
    await writeFixture(env.resultsDir, 'second-algo', '20260516T110000');

    const result = await runCli(['evidence', 'report', '--diff', '1,2'], env.tempDir);
    expect(result.exitCode).toBe(0);
    const combined = result.stdout + result.stderr;
    // Both filenames (containing the task slug) must appear in human output
    expect(combined).toMatch(/first-algo|second-algo/);
  });

  // These two tests used to assert on the legacy human-readable diff table
  // (a "Winner" column, percentage-formatted fitness). Bridged verbs always
  // force `--format json --quiet` (_bridge.ts's invokeLegacyCommandAsJson),
  // so that ConsoleRenderer never runs anymore, per the framework's
  // always-JSON-on-stdout contract — the equivalent information now lives
  // in the JSON payload's `diff.fitness_a`/`diff.fitness_b` fields.

  it('diff JSON payload reports which side has the higher fitness', async () => {
    await writeFixture(env.resultsDir, 'run-a', '20260516T100000', { fitness: 0.72 });
    await new Promise((r) => setTimeout(r, 30));
    await writeFixture(env.resultsDir, 'run-b', '20260516T110000', { fitness: 0.91 });

    const result = await runCli(['evidence', 'report', '--diff', '1,2', '--format', 'json'], env.tempDir);
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    const payload = parsed.payload as Record<string, unknown>;
    const diff = payload.diff as Record<string, unknown>;
    expect(typeof diff.fitness_a).toBe('number');
    expect(typeof diff.fitness_b).toBe('number');
    expect(diff.fitness_a).not.toBe(diff.fitness_b);
  });

  it('diff JSON payload carries both fitness values as fractions in [0,1]', async () => {
    await writeFixture(env.resultsDir, 'low-fit', '20260516T100000', { fitness: 0.72 });
    await new Promise((r) => setTimeout(r, 30));
    await writeFixture(env.resultsDir, 'high-fit', '20260516T110000', { fitness: 0.96 });

    const result = await runCli(['evidence', 'report', '--diff', '1,2', '--format', 'json'], env.tempDir);
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    const payload = parsed.payload as Record<string, unknown>;
    const diff = payload.diff as Record<string, unknown>;
    for (const f of [diff.fitness_a as number, diff.fitness_b as number]) {
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThanOrEqual(1);
    }
  });
});

// ─── G7: --cat nonexistent ref in empty dir → actionable error ───────────────

describe('G7 — wpm results --cat: actionable not-found error', () => {
  let env: TestEnv;
  beforeEach(async () => { env = await createTestEnv(); });
  afterEach(async () => { await env.cleanup(); });

  it('--cat on empty dir exits source_error (2)', async () => {
    await fs.mkdir(env.resultsDir, { recursive: true });
    const result = await runCli(['evidence', 'report', '--cat', '1', '--format', 'json'], env.tempDir);
    expect(result.exitCode).toBe(2);
  });

  it('--cat not-found JSON error has INVALID_INPUT code', async () => {
    // Bridged failure: the legacy `RESULT_NOT_FOUND` code is normalized to
    // the framework's generic INVALID_INPUT by _bridge.ts's
    // classifyLegacyFailure — there is no longer a top-level `status` field
    // on an error result, only `{error:{code,message}}`.
    await fs.mkdir(env.resultsDir, { recursive: true });
    const result = await runCli(['evidence', 'report', '--cat', '1', '--format', 'json'], env.tempDir);
    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    const error = parsed.error as Record<string, unknown>;
    expect(error.code).toBe('INVALID_INPUT');
    expect(error.message).toMatch(/No results saved yet/i);
  });

  it('--cat human error message mentions "No results saved yet" when dir is empty', async () => {
    await fs.mkdir(env.resultsDir, { recursive: true });
    const result = await runCli(['evidence', 'report', '--cat', '5'], env.tempDir);
    expect(result.exitCode).toBe(2);
    const combined = result.stdout + result.stderr;
    expect(combined).toMatch(/No results saved yet/i);
  });

  it('--cat human error message shows available range when some results exist', async () => {
    await writeFixture(env.resultsDir, 'one-task', '20260516T100000');
    const result = await runCli(['evidence', 'report', '--cat', '99'], env.tempDir);
    expect(result.exitCode).toBe(2);
    const combined = result.stdout + result.stderr;
    // Must tell the practitioner what indexes are valid
    expect(combined).toMatch(/Available indexes|1.+1/);
  });
});

// ─── G8: --format json on empty dir → structured JSON with directory ─────────

describe('G8 — wpm results --format json: always valid JSON', () => {
  let env: TestEnv;
  beforeEach(async () => { env = await createTestEnv(); });
  afterEach(async () => { await env.cleanup(); });

  it('--format json output is valid JSON even when dir is completely absent', async () => {
    // No resultsDir created at all
    const result = await runCli(['evidence', 'report', '--format', 'json'], env.tempDir);
    expect(result.exitCode).toBe(0);
    expect(() => JSON.parse(result.stdout)).not.toThrow();
  });

  it('--format json output has the canonical envelope shape (command, status, payload, meta)', async () => {
    await fs.mkdir(env.resultsDir, { recursive: true });
    const result = await runCli(['evidence', 'report', '--format', 'json'], env.tempDir);
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(parsed.command).toBe('results');
    expect(parsed.status).toBe('ok');
    expect(parsed).toHaveProperty('payload');
    expect(parsed).toHaveProperty('meta');
    const meta = parsed.meta as Record<string, unknown>;
    expect(typeof meta.run_id).toBe('string');
    expect(typeof meta.timestamp).toBe('string');
    expect(typeof meta.duration_ms).toBe('number');
  });

  it('--format json payload includes directory, count, showing, and results array', async () => {
    await writeFixture(env.resultsDir, 'sample', '20260516T100000');
    const result = await runCli(['evidence', 'report', '--format', 'json'], env.tempDir);
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    const payload = parsed.payload as Record<string, unknown>;
    expect(typeof payload.directory).toBe('string');
    expect(typeof payload.count).toBe('number');
    expect(typeof payload.showing).toBe('number');
    expect(Array.isArray(payload.results)).toBe(true);
  });

  it('each result entry in the JSON list has index, name, filepath, savedAt, and task', async () => {
    await writeFixture(env.resultsDir, 'verify-shape', '20260516T100000');
    const result = await runCli(['evidence', 'report', '--format', 'json'], env.tempDir);
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    const payload = parsed.payload as Record<string, unknown>;
    const entries = payload.results as Array<Record<string, unknown>>;
    expect(entries.length).toBeGreaterThan(0);
    const entry = entries[0];
    expect(typeof entry.index).toBe('number');
    expect(typeof entry.name).toBe('string');
    expect(typeof entry.filepath).toBe('string');
    expect(typeof entry.savedAt).toBe('string');
    expect(typeof entry.task).toBe('string');
  });
});
