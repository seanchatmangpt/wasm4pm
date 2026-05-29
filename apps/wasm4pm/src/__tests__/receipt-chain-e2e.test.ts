/**
 * receipt-chain-e2e.test.ts
 * End-to-end tests for the BLAKE3 receipt chain.
 *
 * Oracle rank: Rank 1 (Mathematical theorem) for hash properties.
 * Oracle rank: Rank 2 (Domain contract) for receipt structure.
 *
 * Architecture note (critical for understanding what is being tested):
 *
 *   `wpm run --format json` emits a CommandResult envelope to stdout.
 *   The envelope looks like:
 *     { command, status, exit_code, payload, meta }
 *   The PAYLOAD does NOT contain a receipt. Receipts are written to disk:
 *     .wasm4pm/receipts/<run_id>.json  (per-run)
 *     .wasm4pm/receipts/latest.json    (overwritten on every run)
 *
 *   Receipt structure (CommandReceipt from _shared.ts):
 *     run_id      — UUID v4 (unique per execution)
 *     command     — "run"
 *     input_hash  — BLAKE3 hex-64 of the XES file bytes
 *     output_hash — BLAKE3 hex-64 of JSON.stringify(semanticPayload)
 *                   semanticPayload excludes elapsedMs/timing → deterministic
 *     status      — "success" | "partial" | "failed"
 *     timestamp   — ISO-8601 (non-deterministic, by design)
 *     summary     — { algorithm, activityKey, elapsedMs }
 *
 *   SavedResult (written to .wasm4pm/results/) is a separate structure whose
 *   output_hash covers a different (broader) set of fields. The --verify command
 *   validates the SavedResult hash, NOT the receipt hash.
 *
 * Tests:
 *   A — CommandResult envelope shape and required fields
 *   B — Receipt written to disk with correct structure and BLAKE3 hex-64 hashes
 *   C — Receipt output_hash is deterministic across two identical runs
 *   D — Receipt run_id is unique across runs (UUID v4 per execution)
 *   E — Receipt input_hash is stable for the same file across runs
 *   F — wpm results --verify exits 0 with hash_match=true (no tampering)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';
import * as fs from 'fs/promises';

// ─── Paths ────────────────────────────────────────────────────────────────────

const REPO_ROOT = path.resolve(import.meta.dirname, '../../../..');
const CLI = path.resolve(REPO_ROOT, 'apps/wasm4pm/dist/bin/wpm.js');
const XES = path.resolve(REPO_ROOT, 'bench_data/roadtraffic100traces.xes');
const LATEST_RECEIPT = path.resolve(REPO_ROOT, '.wasm4pm/receipts/latest.json');

// ─── CLI helper ───────────────────────────────────────────────────────────────

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
        env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '' },
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

// ─── Prerequisites ────────────────────────────────────────────────────────────

// These checks run once before any test and skip the suite if environment is not ready.
// We do NOT use describe.skipIf because we want descriptive failure messages.
let prereqsMet = true;
let prereqMessage = '';

if (!existsSync(CLI)) {
  prereqsMet = false;
  prereqMessage = `CLI binary not found: ${CLI}. Run: cd apps/wasm4pm && npm run build`;
} else if (!existsSync(XES)) {
  prereqsMet = false;
  prereqMessage = `Bench data not found: ${XES}`;
}

// ─── Run fixtures (captured once for the whole suite) ─────────────────────────

// Captured in beforeAll to avoid redundant invocations.
let run1Result: CliOut;
let run1Json: Record<string, unknown> | null = null;
let run1Receipt: Record<string, unknown> | null = null;

let run2Result: CliOut;
let run2Receipt: Record<string, unknown> | null = null;

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('Receipt chain integrity (E2E)', () => {
  beforeAll(async () => {
    if (!prereqsMet) return;

    // Run 1: with auto-save so receipt is written and results file exists
    run1Result = await wpmRun(['run', XES, '--algorithm', 'dfg', '--format', 'json']);

    if (run1Result.exitCode === 0) {
      try {
        run1Json = JSON.parse(run1Result.stdout) as Record<string, unknown>;
      } catch {
        run1Json = null;
      }

      // Read the receipt that was just written
      if (existsSync(LATEST_RECEIPT)) {
        try {
          run1Receipt = JSON.parse(readFileSync(LATEST_RECEIPT, 'utf-8')) as Record<string, unknown>;
        } catch {
          run1Receipt = null;
        }
      }
    }

    // Run 2: also with auto-save (overwrites latest.json — we capture it immediately)
    run2Result = await wpmRun(['run', XES, '--algorithm', 'dfg', '--format', 'json']);

    if (run2Result.exitCode === 0 && existsSync(LATEST_RECEIPT)) {
      try {
        run2Receipt = JSON.parse(readFileSync(LATEST_RECEIPT, 'utf-8')) as Record<string, unknown>;
      } catch {
        run2Receipt = null;
      }
    }
  });

  // ─── A: CommandResult envelope ──────────────────────────────────────────────

  describe('A — CommandResult envelope', () => {
    it('has exit code 0 (success)', () => {
      if (!prereqsMet) {
        console.warn(`SKIPPED — ${prereqMessage}`);
        return;
      }
      expect(run1Result.exitCode).toBe(0);
    });

    it('stdout is valid JSON', () => {
      if (!prereqsMet || run1Result.exitCode !== 0) return;
      expect(run1Json).not.toBeNull();
    });

    it('envelope.command === "run"', () => {
      if (!prereqsMet || run1Json === null) return;
      expect(run1Json.command).toBe('run');
    });

    it('envelope.status === "ok"', () => {
      if (!prereqsMet || run1Json === null) return;
      expect(run1Json.status).toBe('ok');
    });

    it('envelope.exit_code === 0', () => {
      if (!prereqsMet || run1Json === null) return;
      expect(run1Json.exit_code).toBe(0);
    });

    it('envelope.meta contains run_id, timestamp, duration_ms, version', () => {
      if (!prereqsMet || run1Json === null) return;
      const meta = run1Json.meta as Record<string, unknown>;
      expect(typeof meta).toBe('object');
      expect(typeof meta.run_id).toBe('string');
      expect(typeof meta.timestamp).toBe('string');
      expect(typeof meta.duration_ms).toBe('number');
      expect(typeof meta.version).toBe('string');
    });

    it('meta.run_id is UUID v4', () => {
      if (!prereqsMet || run1Json === null) return;
      const meta = run1Json.meta as Record<string, unknown>;
      const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(meta.run_id as string).toMatch(UUID_V4);
    });

    it('meta.duration_ms >= 0', () => {
      if (!prereqsMet || run1Json === null) return;
      const meta = run1Json.meta as Record<string, unknown>;
      expect(meta.duration_ms as number).toBeGreaterThanOrEqual(0);
    });

    it('payload.status === "success"', () => {
      if (!prereqsMet || run1Json === null) return;
      const payload = run1Json.payload as Record<string, unknown>;
      expect(payload.status).toBe('success');
    });

    it('payload.algorithm is a non-empty string', () => {
      if (!prereqsMet || run1Json === null) return;
      const payload = run1Json.payload as Record<string, unknown>;
      expect(typeof payload.algorithm).toBe('string');
      expect((payload.algorithm as string).length).toBeGreaterThan(0);
    });

    it('payload.model is an object', () => {
      if (!prereqsMet || run1Json === null) return;
      const payload = run1Json.payload as Record<string, unknown>;
      expect(typeof payload.model).toBe('object');
      expect(payload.model).not.toBeNull();
    });
  });

  // ─── B: Receipt on disk ─────────────────────────────────────────────────────

  describe('B — Receipt written to disk', () => {
    it('latest.json exists at .wasm4pm/receipts/latest.json', () => {
      if (!prereqsMet) return;
      expect(existsSync(LATEST_RECEIPT)).toBe(true);
    });

    it('receipt is valid JSON', () => {
      if (!prereqsMet) return;
      expect(run1Receipt).not.toBeNull();
    });

    it('receipt.run_id is a non-empty string', () => {
      if (!prereqsMet || !run1Receipt) return;
      expect(typeof run1Receipt.run_id).toBe('string');
      expect((run1Receipt.run_id as string).length).toBeGreaterThan(0);
    });

    it('receipt.run_id is UUID v4', () => {
      if (!prereqsMet || !run1Receipt) return;
      const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(run1Receipt.run_id as string).toMatch(UUID_V4);
    });

    it('receipt.command === "run"', () => {
      if (!prereqsMet || !run1Receipt) return;
      expect(run1Receipt.command).toBe('run');
    });

    it('receipt.status === "success"', () => {
      if (!prereqsMet || !run1Receipt) return;
      expect(run1Receipt.status).toBe('success');
    });

    it('receipt.input_hash is BLAKE3 hex-64', () => {
      if (!prereqsMet || !run1Receipt) return;
      const BLAKE3_HEX = /^[0-9a-f]{64}$/;
      expect(run1Receipt.input_hash as string).toMatch(BLAKE3_HEX);
    });

    it('receipt.output_hash is BLAKE3 hex-64', () => {
      if (!prereqsMet || !run1Receipt) return;
      const BLAKE3_HEX = /^[0-9a-f]{64}$/;
      expect(run1Receipt.output_hash as string).toMatch(BLAKE3_HEX);
    });

    it('receipt.timestamp is an ISO-8601 string', () => {
      if (!prereqsMet || !run1Receipt) return;
      expect(typeof run1Receipt.timestamp).toBe('string');
      // ISO-8601 basic check: contains T and Z or +offset
      expect(run1Receipt.timestamp as string).toMatch(/T/);
    });

    it('receipt.summary is an object with algorithm field', () => {
      if (!prereqsMet || !run1Receipt) return;
      expect(typeof run1Receipt.summary).toBe('object');
      const summary = run1Receipt.summary as Record<string, unknown>;
      expect(typeof summary.algorithm).toBe('string');
    });
  });

  // ─── C: Determinism ─────────────────────────────────────────────────────────

  describe('C — Receipt output_hash determinism (same input → same hash)', () => {
    it('two runs on the same XES file produce identical receipt output_hash', () => {
      if (!prereqsMet || !run1Receipt || !run2Receipt) return;

      // The semantic payload hashed by the receipt excludes timing fields,
      // so output_hash must be bit-identical for two runs on the same input.
      expect(run1Receipt.output_hash).toBe(run2Receipt.output_hash);
    });

    it('receipt output_hash is a 64-char hex string on both runs', () => {
      if (!prereqsMet || !run1Receipt || !run2Receipt) return;
      const BLAKE3_HEX = /^[0-9a-f]{64}$/;
      expect(run1Receipt.output_hash as string).toMatch(BLAKE3_HEX);
      expect(run2Receipt.output_hash as string).toMatch(BLAKE3_HEX);
    });
  });

  // ─── D: run_id uniqueness ───────────────────────────────────────────────────

  describe('D — run_id uniqueness (each execution gets a fresh UUID)', () => {
    it('two separate runs produce different run_id values', () => {
      if (!prereqsMet || !run1Receipt || !run2Receipt) return;
      expect(run1Receipt.run_id).not.toBe(run2Receipt.run_id);
    });
  });

  // ─── E: input_hash stability ────────────────────────────────────────────────

  describe('E — input_hash stability (same file → same hash)', () => {
    it('two runs on the same XES file produce identical input_hash', () => {
      if (!prereqsMet || !run1Receipt || !run2Receipt) return;
      // input_hash = blake3Hex(file bytes) — must be identical for unchanged file
      expect(run1Receipt.input_hash).toBe(run2Receipt.input_hash);
    });
  });

  // ─── F: wpm results --verify ────────────────────────────────────────────────

  describe('F — wpm results --verify (tamper detection)', () => {
    let verifyResult: CliOut;
    let verifyJson: Record<string, unknown> | null = null;

    beforeAll(async () => {
      if (!prereqsMet) return;
      // The most-recently-saved result is index 1.
      verifyResult = await wpmRun(['results', '--verify', '1', '--format', 'json']);
      if (verifyResult.exitCode === 0) {
        try {
          verifyJson = JSON.parse(verifyResult.stdout) as Record<string, unknown>;
        } catch {
          verifyJson = null;
        }
      }
    });

    it('wpm results --verify 1 exits 0', () => {
      if (!prereqsMet) return;
      expect(verifyResult.exitCode).toBe(0);
    });

    it('verify stdout is valid JSON', () => {
      if (!prereqsMet || verifyResult.exitCode !== 0) return;
      expect(verifyJson).not.toBeNull();
    });

    it('verify payload.hash_match === true (payload matches stored hash)', () => {
      if (!prereqsMet || verifyJson === null) return;
      const payload = verifyJson.payload as Record<string, unknown>;
      expect(payload.hash_match).toBe(true);
    });

    it('verify payload.recomputed_output_hash is BLAKE3 hex-64', () => {
      if (!prereqsMet || verifyJson === null) return;
      const payload = verifyJson.payload as Record<string, unknown>;
      const BLAKE3_HEX = /^[0-9a-f]{64}$/;
      expect(payload.recomputed_output_hash as string).toMatch(BLAKE3_HEX);
    });

    it('verify recomputed_output_hash === stored_output_hash (no tampering)', () => {
      if (!prereqsMet || verifyJson === null) return;
      const payload = verifyJson.payload as Record<string, unknown>;
      expect(payload.recomputed_output_hash).toBe(payload.stored_output_hash);
    });

    it('verify integrity !== "mismatch" (no tampering detected)', () => {
      // integrity values: "ok" | "no_receipt" | "mismatch" | "missing_ocel"
      // "mismatch" means the payload was tampered with — fail loudly.
      // "no_receipt" is acceptable (receipt hash covers different fields than saved result).
      if (!prereqsMet || verifyJson === null) return;
      const payload = verifyJson.payload as Record<string, unknown>;
      expect(payload.integrity).not.toBe('mismatch');
    });
  });
});
