/**
 * cognition-e2e.integration.test.ts
 *
 * End-to-end coverage for `wpm lab cognition` (the CLI surface the MU
 * prototype calls for process/cognitive intelligence). No mocking — every
 * test spawns the real built CLI binary against the real Rust/WASM
 * cognition kernel. FM-5: this file intentionally does NOT mock init.js;
 * it is the "real WASM" file for its test directory.
 *
 * Oracle rank: Rank 2 (domain contract) for the ContractResult shape
 * (`.claude/rules/cognition-contracts.md`, enforced live by
 * `packages/cognition/src/contract/guard.ts`). Rank 1 (mathematical) for
 * the BLAKE3 hex-64 hash format and the replay_pointer/output_hash prefix
 * invariant.
 *
 * Command surface note (verified live against current `main`): the verb
 * family documented as `wpm cognition <verb>` in
 * `.claude/rules/cognition-contracts.md` and `apps/wasm4pm/src/commands/
 * cognition.ts` now lives at `wpm lab cognition <verb>` — `wpm cognition`
 * itself exits with "was removed — use 'wpm lab cognition'". Bridged verbs
 * wrap payloads in `{command, status, message, exit_code, payload, meta}`;
 * the ContractResult fields (`run_id`, `output_hash`, `replay_pointer`,
 * `options_profile`, `breed`, `status`, `output`) live under `payload`.
 *
 * `--input` takes a BARE BreedInput JSON file (`{intent, candidates,
 * facts, cases, rules, goals, state}`) — NOT wrapped in `{contract: ...}`.
 * The CLI supplies the `{breed, contract, options}` WASM envelope itself
 * from `--contract` + the file contents (verified live: wrapping the file
 * in `{contract: {...}}` produces "missing field `intent`").
 *
 * Breed sample (80/20 — not all 55): one breed per major domain cluster,
 * chosen so every field of the universal BreedInput envelope is exercised
 * by at least one fixture. Fixtures are the repo's existing, already
 * result-verified examples under `examples/cognition/<breed>/intent.json`.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync } from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';

// ─── Paths ──────────────────────────────────────────────────────────────

const REPO_ROOT = path.resolve(import.meta.dirname, '../../../..');
const CLI = path.resolve(REPO_ROOT, 'apps/wasm4pm/dist/bin/wpm.js');

const BLAKE3_HEX = /^[0-9a-f]{64}$/;

const BREED_SAMPLE = [
  'strips', // planning: rules+goals+state populated
  'bayesian_network', // uncertainty: facts-as-CPT
  'sat_cdcl', // constraint/search: facts-as-clauses, minimal envelope
  'mycin', // expert system: facts + certainty-weighted rules
  'dendral', // expert system: candidates+constraints, no rules
  'ltl_monitor', // temporal/verification: facts-as-trace
  'cbr', // case-based: exercises `cases`
  'prolog', // logic core reference/baseline breed
] as const;

function fixtureFor(breed: string): string {
  return path.resolve(REPO_ROOT, 'examples/cognition', breed, 'intent.json');
}

// ─── CLI helper (matches receipt-chain-e2e.test.ts's wpmRun pattern) ─────

interface CliOut {
  exitCode: number;
  stdout: string;
  stderr: string;
}

function wpmRun(args: string[]): Promise<CliOut> {
  return new Promise((resolve) => {
    const child = execFile(
      process.execPath,
      [CLI, ...args],
      {
        cwd: REPO_ROOT,
        env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', NODE_ENV: 'test' },
        timeout: 30_000,
        maxBuffer: 10 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        const exitCode =
          error && 'code' in error && typeof error.code === 'number' ? error.code : error ? 1 : 0;
        resolve({ exitCode, stdout: stdout ?? '', stderr: stderr ?? '' });
      }
    );
    if (child.stdin) child.stdin.end();
    child.on('error', () => resolve({ exitCode: 5, stdout: '', stderr: 'process failed to start' }));
  });
}

function parseBridgedJson(stdout: string): Record<string, unknown> {
  // `lab cognition` prints an "[experimental] ..." advisory line before
  // the JSON body on stderr in some environments, but stdout is JSON-only
  // per the CLI's one-JSON-stdout contract — parse the whole thing.
  return JSON.parse(stdout) as Record<string, unknown>;
}

// ─── Prerequisites ────────────────────────────────────────────────────

let prereqsMet = true;
let prereqMessage = '';

if (!existsSync(CLI)) {
  prereqsMet = false;
  prereqMessage = `CLI binary not found: ${CLI}. Run: pnpm --filter "@wasm4pm/cli..." build`;
}

for (const breed of BREED_SAMPLE) {
  if (!existsSync(fixtureFor(breed))) {
    prereqsMet = false;
    prereqMessage = `Fixture not found for breed "${breed}": ${fixtureFor(breed)}`;
  }
}

const maybeDescribe = prereqsMet ? describe : describe.skip;

// ─── Suite ──────────────────────────────────────────────────────────────

maybeDescribe('wpm lab cognition — e2e (real CLI, real WASM)', () => {
  beforeAll(() => {
    if (!prereqsMet) {
      // eslint-disable-next-line no-console
      console.warn(`Skipping cognition e2e suite: ${prereqMessage}`);
    }
  });

  describe.each(BREED_SAMPLE)('breed: %s', (breed) => {
    it('run → receipt → verify lifecycle holds against the real CLI/WASM', async () => {
      // 1. run
      const runResult = await wpmRun([
        'lab',
        'cognition',
        'run',
        '--contract',
        breed,
        '--input',
        fixtureFor(breed),
        '--format',
        'json',
      ]);
      expect(runResult.exitCode).toBe(0);

      const runJson = parseBridgedJson(runResult.stdout);
      expect(runJson.status).toBe('ok');
      const payload = runJson.payload as Record<string, unknown>;

      // Contract shape enforced elsewhere by
      // packages/cognition/src/contract/guard.ts — re-verified here at the
      // CLI/subprocess boundary, not just the in-process TS layer.
      expect(payload.status).toBe('ok');
      expect(payload.breed).toBe(breed);
      expect(typeof payload.run_id).toBe('string');
      expect(payload.run_id as string).toMatch(BLAKE3_HEX);
      expect(typeof payload.output_hash).toBe('string');
      expect(payload.output_hash as string).toMatch(BLAKE3_HEX);
      const replayPointer = payload.replay_pointer as string;
      expect(replayPointer).toHaveLength(16);
      expect((payload.output_hash as string).startsWith(replayPointer)).toBe(true);
      expect(payload.output).toBeTruthy();

      const runId = payload.run_id as string;

      // 2. receipt — round-trips the just-written receipt
      const receiptResult = await wpmRun([
        'lab',
        'cognition',
        'receipt',
        '--receipt-id',
        runId,
        '--format',
        'json',
      ]);
      expect(receiptResult.exitCode).toBe(0);
      const receiptJson = parseBridgedJson(receiptResult.stdout);
      const receiptPayload = receiptJson.payload as Record<string, unknown>;
      expect(receiptPayload.receipt_id).toBe(runId);
      const chain = receiptPayload.chain as Record<string, unknown>;
      expect(chain.run_id).toBe(runId);
      expect(chain.output_hash).toBe(payload.output_hash);
      expect(chain.breed).toBe(breed);
      expect(chain.status).toBe('ok');

      // 3. verify — adversarial/schema/hash verification layers must pass,
      // never report the nonexistent 'rejected' status
      // (cognition-wasm-gate.sh blocks that literal outright).
      const verifyResult = await wpmRun([
        'lab',
        'cognition',
        'verify',
        '--receipt-id',
        runId,
        '--format',
        'json',
      ]);
      expect(verifyResult.exitCode).toBe(0);
      const verifyJson = parseBridgedJson(verifyResult.stdout);
      const verifyPayload = verifyJson.payload as Record<string, unknown>;
      const findings = verifyPayload.findings as Array<Record<string, unknown>>;
      expect(findings.length).toBeGreaterThan(0);
      for (const finding of findings) {
        expect(finding.receipt_id).toBe(runId);
        const layers = finding.layers as Array<Record<string, unknown>>;
        for (const layer of layers) {
          expect(layer.passed).toBe(true);
        }
      }
    });

    it('is deterministic: two independent runs of the same input produce the same output_hash', async () => {
      const args = [
        'lab',
        'cognition',
        'run',
        '--contract',
        breed,
        '--input',
        fixtureFor(breed),
        '--format',
        'json',
      ];
      const [first, second] = await Promise.all([wpmRun(args), wpmRun(args)]);
      expect(first.exitCode).toBe(0);
      expect(second.exitCode).toBe(0);

      const firstPayload = (parseBridgedJson(first.stdout).payload as Record<string, unknown>);
      const secondPayload = (parseBridgedJson(second.stdout).payload as Record<string, unknown>);

      // run_id is a content hash here (not a random UUID) — two runs of
      // identical input independently produce the same run_id/output_hash.
      // This is the caching/dedup guarantee MU depends on: same input,
      // same admitted process, safe to treat as cache-equivalent.
      expect(secondPayload.output_hash).toBe(firstPayload.output_hash);
      expect(secondPayload.run_id).toBe(firstPayload.run_id);
    });
  });

  it('adversarial catalogue is intact (fixed detector count)', async () => {
    const result = await wpmRun(['lab', 'cognition', 'adversarial', '--format', 'json']);
    expect(result.exitCode).toBe(0);
    const json = parseBridgedJson(result.stdout);
    const payload = json.payload as Record<string, unknown>;
    const detectors = payload.detectors as unknown[];
    // Verified live against current main: 10 detectors (not the 8 that
    // scripts/cognition-smoke.sh's stale step 6 expects — that script is
    // out of date relative to this repo state as of this test).
    expect(payload.count).toBe(10);
    expect(detectors).toHaveLength(10);
  });

  it('fails closed on malformed input: non-zero exit, structured refusal, no crash', async () => {
    // `--input` requires a bare BreedInput; wrapping it in {contract: ...}
    // is a schema violation the Rust side rejects (verified live: "schema
    // rejected: missing field `intent`").
    const badInputPath = path.resolve(
      REPO_ROOT,
      'apps/wasm4pm/src/__tests__/fixtures/cognition-bad-input.json'
    );
    const result = await wpmRun([
      'lab',
      'cognition',
      'run',
      '--contract',
      'strips',
      '--input',
      badInputPath,
      '--format',
      'json',
    ]);

    expect(result.exitCode).not.toBe(0);
    expect(result.exitCode).toBe(3); // EXIT_CODES.execution_error

    const json = parseBridgedJson(result.stdout);
    expect(json.error).toBeTruthy();
    const error = json.error as Record<string, unknown>;
    expect(error.code).toBe('EXECUTION_ERROR');
    expect(typeof error.message).toBe('string');
  });
});
