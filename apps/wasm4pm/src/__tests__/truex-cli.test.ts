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

describe('wpm lab truex — TrueX receipt verification CLI', () => {

  // ── Help and command structure ─────────────────────────────────────────────

  // `lab truex` is a thin bridge over `commands/truex.ts` (`nouns/_bridge.ts`):
  // its `defineVerb()` does not redeclare the legacy command's own `args`/
  // `subCommands` schema, and `--help` is intercepted by the noun/verb
  // framework's own citty-generated usage renderer (built from the *verb's*
  // args) before the bridge or the legacy command ever runs. So the banner
  // only ever shows the verb's summary plus the framework's generic
  // `--human`/`--introspect` flags — never legacy per-subcommand text like
  // "verify", "inspect", or "--ingest". This is an accepted trade-off of the
  // thin-bridge migration strategy (see `nouns/_bridge.ts`'s doc comment),
  // not a regression.
  describe('help and metadata', () => {
    it('--help exits 0 and shows command description', async () => {
      const result = await runCli(['lab', 'truex', '--help']);
      assertExitCode(result, 0);
      expect(result.stdout).toMatch(/OCEL|receipt|envelope/i);
    });

    it('--help shows the generic verb usage banner (legacy subcommand list not reproduced by the thin bridge)', async () => {
      const result = await runCli(['lab', 'truex', '--help']);
      assertExitCode(result, 0);
      expect(result.stdout).toMatch(/USAGE|OPTIONS/);
    });

    it('wpm lab truex verify --help shows the generic verb usage banner (legacy --ingest flag help not reproduced)', async () => {
      const result = await runCli(['lab', 'truex', 'verify', '--help']);
      assertExitCode(result, 0);
      expect(result.stdout).toMatch(/USAGE|OPTIONS/);
    });
  });

  // ── Invalid subcommand ────────────────────────────────────────────────────

  describe('invalid subcommand', () => {
    it('unknown subcommand exits non-zero', async () => {
      const result = await runCli(['lab', 'truex', 'unsupported-action']);
      // citty exits non-zero for unrecognized subcommands
      expect(result.exitCode).not.toBe(0);
    });
  });

  // ── Missing / bad input ────────────────────────────────────────────────────

  describe('missing or bad input file', () => {
    it('exits non-zero when positional payload is missing', async () => {
      const result = await runCli(['lab', 'truex', 'verify']);
      // citty exits 1 for missing required positional
      expect(result.exitCode).not.toBe(0);
    });

    it('returns non-zero exit when file does not exist', async () => {
      const result = await runCli([
        'lab', 'truex', 'verify', '/nonexistent/envelope.json',
      ]);
      // source_error (2) or execution_error (3) — file not found or WASM error
      expect([EXIT_CODES.source_error, EXIT_CODES.execution_error]).toContain(result.exitCode);
    });

    it('includes error message for missing file', async () => {
      const result = await runCli([
        'lab', 'truex', 'verify', '/absolutely-nonexistent/envelope.json',
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
  //
  // Error-shape note: `lab truex` is bridged through `nouns/_bridge.ts`, whose
  // `classifyLegacyFailure()` collapses every legacy domain-specific error code
  // (VERIFIER_ERROR, RECEIPT_REFUSED, FILE_NOT_FOUND, ...) onto the noun/verb
  // framework's 9-value generic `ErrorCode` vocabulary — see its doc comment
  // ("best-effort, not lossless"). The wire envelope is now always exactly
  // `{ error: { code, message, action_template? } }` (`packages/noun-verb/src/errors.ts`),
  // with no top-level `status`/`command` fields on the error path (those only
  // ever appeared on a bridged *success* envelope). The domain-specific detail
  // that used to live in `error.code` now only survives in the free-text
  // `error.message`, so these tests assert against the generic code plus the
  // domain detail still visible in the message.
  describe('graceful degradation when cloud WASM feature is absent', () => {
    it('exits with execution error (exit 3) for any error envelope (VERIFIER_ERROR- or RECEIPT_REFUSED-flavored)', async () => {
      const { filePath, cleanup } = await writeTempJson({
        session_id: 'test-session-001',
        expected_path_hash: 'some-path-hash',
        ocel2_batch_hash: 'some-batch-hash',
        receipt_hash: 'some-receipt-hash',
        admission_status: 'ReceiptAdmitted',
        ocel2: { ocelVersion: '2.0', events: [] },
      });
      try {
        const result = await runCli(['lab', 'truex', 'verify', filePath]);
        // With cloud feature absent: VERIFIER_ERROR-flavored message.
        // With cloud feature present: RECEIPT_REFUSED-flavored message — envelope fails WASM checks.
        // Either way the bridge classifies it as a generic EXECUTION_ERROR (exit 3).
        assertExitCode(result, EXIT_CODES.execution_error);
        const body = JSON.parse(result.stdout) as { error: { code: string; message: string } };
        expect(body.error.code).toBe('EXECUTION_ERROR');
        expect(body.error.message).toMatch(/verif|refus|receipt/i);
      } finally {
        await cleanup();
      }
    });

    it('error output is informative about envelope processing failure', async () => {
      const { filePath, cleanup } = await writeTempJson({ minimal: true });
      try {
        const result = await runCli(['lab', 'truex', 'verify', filePath]);
        const body = JSON.parse(result.stdout) as { error: { message: string; code: string } };
        // Either the WASM function is missing, or the receipt was refused, or the
        // input was rejected as invalid — all three collapse onto one of these
        // two generic framework codes.
        expect(body.error.message).toBeTruthy();
        expect(['EXECUTION_ERROR', 'INVALID_INPUT']).toContain(body.error.code);
      } finally {
        await cleanup();
      }
    });

    it('error envelope is well-formed ({ error: { code, message } }, no legacy CommandResult wrapper)', async () => {
      const { filePath, cleanup } = await writeTempJson({ session_id: 'x' });
      try {
        const result = await runCli(['lab', 'truex', 'verify', filePath]);
        const body = JSON.parse(result.stdout) as { error: { code: string; message: string } };
        expect(typeof body.error.code).toBe('string');
        expect(typeof body.error.message).toBe('string');
        expect(body.error.message.length).toBeGreaterThan(0);
      } finally {
        await cleanup();
      }
    });
  });

  // ── Format flag ───────────────────────────────────────────────────────────
  //
  // `--format` is now a no-op passthrough for bridged verbs — `nouns/_bridge.ts`
  // strips any caller-supplied `--format json`/`--format human` and always
  // forces JSON internally (the always-JSON-on-stdout contract), so both
  // values below produce the same parseable-JSON outcome.

  describe('--format flag', () => {
    it('--format json outputs parseable JSON', async () => {
      const { filePath, cleanup } = await writeTempJson({ test: true });
      try {
        const result = await runCli([
          'lab', 'truex', 'verify', filePath, '--format', 'json',
        ]);
        expect(() => JSON.parse(result.stdout)).not.toThrow();
      } finally {
        await cleanup();
      }
    });

    it('--format human still produces parseable JSON on stdout (always-JSON contract)', async () => {
      const { filePath, cleanup } = await writeTempJson({ test: true });
      try {
        const result = await runCli([
          'lab', 'truex', 'verify', filePath, '--format', 'human',
        ]);
        // Old assertion expected non-JSON human text on stdout; bridged verbs now
        // always emit pure JSON on stdout regardless of --format (the framework's
        // always-JSON-on-stdout contract — see nouns/_bridge.ts). Assert the new
        // contract instead of the old one.
        expect(() => JSON.parse(result.stdout)).not.toThrow();
        expect(result.exitCode).not.toBe(0);
      } finally {
        await cleanup();
      }
    });
  });
});
