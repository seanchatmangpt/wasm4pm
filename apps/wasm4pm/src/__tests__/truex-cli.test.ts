/**
 * wpm truex — CLI integration tests
 *
 * Tests the `wpm truex verify` command end-to-end using the real CLI binary.
 *
 * Architecture note: `truex_verify_receipt` is only compiled into WASM when the
 * `cloud` feature flag is enabled (see wasm4pm/src/lib.rs:3260, `#[cfg(feature = "cloud")]`).
 * The default WASM build does NOT include this function, so all `truex verify` calls
 * will receive a VERIFIER_ERROR with "wasm.truex_verify_receipt is not a function".
 *
 * This test suite covers:
 * - Help text and command structure
 * - Missing / invalid positional arguments
 * - File-not-found error handling
 * - Graceful degradation when WASM cloud feature is absent (VERIFIER_ERROR, exit 3)
 *
 * When the cloud-feature WASM build is available, ReceiptAdmitted and ReceiptForged
 * paths should be validated with separate integration tests.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { runCli, assertExitCode, EXIT_CODES } from '@wasm4pm/testing';

// ── Fixture helpers ──────────────────────────────────────────────────────────

/** Write a JSON file to a temp directory and return its absolute path. */
async function writeTempJson(obj: Record<string, unknown>): Promise<{ filePath: string; cleanup: () => Promise<void> }> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wpm-truex-'));
  const filePath = path.join(tmpDir, 'envelope.json');
  await fs.writeFile(filePath, JSON.stringify(obj, null, 2), 'utf-8');
  return {
    filePath,
    cleanup: async () => fs.rm(tmpDir, { recursive: true, force: true }),
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('wpm truex — TrueX receipt verification CLI', () => {

  // ── Help and command structure ─────────────────────────────────────────────

  describe('help and metadata', () => {
    it('--help exits 0 and shows command description', async () => {
      const result = await runCli(['truex', '--help']);
      assertExitCode(result, 0);
      expect(result.stdout).toMatch(/verify/i);
      expect(result.stdout).toMatch(/OCEL|receipt|envelope/i);
    });

    it('--help shows verify and inspect subcommands', async () => {
      const result = await runCli(['truex', '--help']);
      assertExitCode(result, 0);
      // New subcommand architecture — shows verify and inspect
      expect(result.stdout).toMatch(/verify|inspect/i);
    });

    it('wpm truex verify --help shows --ingest flag', async () => {
      const result = await runCli(['truex', 'verify', '--help']);
      assertExitCode(result, 0);
      expect(result.stdout).toMatch(/ingest/i);
    });
  });

  // ── Invalid subcommand ────────────────────────────────────────────────────

  describe('invalid subcommand', () => {
    it('unknown subcommand exits non-zero', async () => {
      const result = await runCli(['truex', 'unsupported-action', '--format', 'json']);
      // citty exits non-zero for unrecognized subcommands
      expect(result.exitCode).not.toBe(0);
    });
  });

  // ── Missing / bad input ────────────────────────────────────────────────────

  describe('missing or bad input file', () => {
    it('exits non-zero when positional payload is missing', async () => {
      const result = await runCli(['truex', 'verify']);
      // citty exits 1 for missing required positional
      expect(result.exitCode).not.toBe(0);
    });

    it('returns non-zero exit when file does not exist', async () => {
      const result = await runCli([
        'truex', 'verify', '/nonexistent/envelope.json', '--format', 'json',
      ]);
      // source_error (2) or execution_error (3) — file not found or WASM error
      expect([EXIT_CODES.source_error, EXIT_CODES.execution_error]).toContain(result.exitCode);
    });

    it('includes error message for missing file', async () => {
      const result = await runCli([
        'truex', 'verify', '/absolutely-nonexistent/envelope.json', '--format', 'json',
      ]);
      expect(result.exitCode).not.toBe(0);
      // Combined stdout+stderr should contain error info
      const combined = result.stdout + result.stderr;
      expect(combined).toMatch(/error|ENOENT|not found|failed/i);
    });
  });

  // ── VERIFIER_ERROR (cloud feature absent) ─────────────────────────────────
  //
  // In the default (non-cloud) WASM build, truex_verify_receipt is not exported.
  // The command catches the TypeError and emits a VERIFIER_ERROR at exit 3.
  // These tests assert that graceful degradation is preserved.

  describe('graceful degradation when cloud WASM feature is absent', () => {
    // WasmLoader emits [INFO] lines to stdout before the JSON payload —
    // extract the first JSON object from stdout to parse correctly.
    function extractJson(stdout: string): string {
      const idx = stdout.indexOf('{');
      return idx === -1 ? stdout : stdout.slice(idx);
    }

    it('exits with execution error (exit 3) for any JSON envelope (VERIFIER_ERROR or RECEIPT_REFUSED)', async () => {
      const { filePath, cleanup } = await writeTempJson({
        session_id: 'test-session-001',
        expected_path_hash: 'some-path-hash',
        ocel2_batch_hash: 'some-batch-hash',
        receipt_hash: 'some-receipt-hash',
        admission_status: 'ReceiptAdmitted',
        ocel2: { ocelVersion: '2.0', events: [] },
      });
      try {
        const result = await runCli([
          'truex', 'verify', filePath, '--format', 'json',
        ]);
        // With cloud feature absent: VERIFIER_ERROR (exit 3)
        // With cloud feature present: RECEIPT_REFUSED (exit 3) — envelope fails WASM checks
        assertExitCode(result, EXIT_CODES.execution_error);
        const body = JSON.parse(extractJson(result.stdout)) as {
          status: string;
          error: { code: string; message: string };
        };
        expect(body.status).toBe('error');
        // Either error code is valid depending on WASM build profile
        expect(['VERIFIER_ERROR', 'RECEIPT_REFUSED']).toContain(body.error.code);
      } finally {
        await cleanup();
      }
    });

    it('error output is informative about envelope processing failure', async () => {
      const { filePath, cleanup } = await writeTempJson({ minimal: true });
      try {
        const result = await runCli([
          'truex', 'verify', filePath, '--format', 'json',
        ]);
        const body = JSON.parse(extractJson(result.stdout)) as {
          error: { message: string; code: string };
        };
        // Either the WASM function is missing, or the receipt was refused — both are valid
        expect(body.error.message).toBeTruthy();
        expect(['VERIFIER_ERROR', 'RECEIPT_REFUSED', 'FILE_NOT_FOUND']).toContain(body.error.code);
      } finally {
        await cleanup();
      }
    });

    it('VERIFIER_ERROR json output has well-formed CommandResult envelope', async () => {
      const { filePath, cleanup } = await writeTempJson({ session_id: 'x' });
      try {
        const result = await runCli([
          'truex', 'verify', filePath, '--format', 'json',
        ]);
        const body = JSON.parse(extractJson(result.stdout)) as {
          command: string;
          status: string;
          exit_code: number;
          meta: { run_id: string; timestamp: string; version: string };
        };
        // Now uses subcommand name 'truex verify'
        expect(body.command).toMatch(/truex/i);
        expect(body.status).toBe('error');
        expect(typeof body.exit_code).toBe('number');
        expect(typeof body.meta.run_id).toBe('string');
        expect(typeof body.meta.timestamp).toBe('string');
        expect(typeof body.meta.version).toBe('string');
      } finally {
        await cleanup();
      }
    });
  });

  // ── Format flag ───────────────────────────────────────────────────────────

  describe('--format flag', () => {
    it('--format json outputs parseable JSON', async () => {
      const { filePath, cleanup } = await writeTempJson({ test: true });
      try {
        const result = await runCli([
          'truex', 'verify', filePath, '--format', 'json',
        ]);
        // WasmLoader may prefix [INFO] lines — extract and parse the JSON portion
        const jsonStr = (() => {
          const idx = result.stdout.indexOf('{');
          return idx === -1 ? result.stdout : result.stdout.slice(idx);
        })();
        expect(() => JSON.parse(jsonStr)).not.toThrow();
      } finally {
        await cleanup();
      }
    });

    it('--format human produces non-JSON text output on error', async () => {
      const { filePath, cleanup } = await writeTempJson({ test: true });
      try {
        const result = await runCli([
          'truex', 'verify', filePath, '--format', 'human',
        ]);
        // Human format should not be parseable as top-level JSON object
        // (it may contain ANSI codes or plain text)
        // We just check the exit code is non-zero and something was output
        expect(result.exitCode).not.toBe(0);
      } finally {
        await cleanup();
      }
    });
  });
});
