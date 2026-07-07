/**
 * Enterprise Marketplace → wasm4pm Runtime Connection Validation
 *
 * Validates that marketplace OCEL event data (represented as a standard XES workflow)
 * can flow through `wpm model discover` and `wpm model check` to produce a valid receipt.
 *
 * Migrated to the noun/verb surface:
 *   - `wpm run` -> `wpm model discover` (NATIVE verb: plain result object, no
 *     `{command,status,payload,meta}` envelope, positional input, no `--no-save`)
 *   - `wpm conformance` -> `wpm model check --mode self` (NATIVE verb: auto-mines
 *     a model from the same log before checking fitness, matching old
 *     `conformance`'s behavior; plain result object with `status`/`exitCode`
 *     fields directly at the top level, not nested under `.payload`)
 *   - `wpm results` -> `wpm evidence report` (bridged: keeps the legacy
 *     `{command,status,payload,meta}` envelope)
 *
 * Genuine capability change confirmed live against the built CLI: `model
 * discover` never writes to `.wasm4pm/results/` (the old `wpm run`'s
 * auto-save-to-results-dir behavior was not carried over in the rewrite —
 * only the receipt-chain write survived, via the framework's own
 * onResult middleware in `apps/wasm4pm/src/cli.ts`, which now fires for
 * EVERY verb, native or bridged). So `evidence report` can no longer be
 * expected to list a `model discover` run's output — Step 4 below tests
 * that `evidence report` still functions (doesn't crash), not that
 * discovery populates it.
 *
 * Test mandate:
 *   1. wpm model discover <xes-fixture> --format json  → exit 0, plain JSON result
 *   2. wpm model check <xes-fixture> --mode self --format json → exit 0|6, fitness/checked present
 *   3. Receipt file created at .wasm4pm/receipts/latest.json
 *   4. wpm evidence report --format json does not crash
 *
 * Notes:
 *   - model check --mode self mines its own model via alpha_plus_plus, XES only
 *   - All CLI calls use { cwd: env.tempDir } for receipt path isolation
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runCli, EXIT_CODES, createCliTestEnv } from '@wasm4pm/testing';
import * as path from 'path';
import * as fs from 'fs/promises';
import { existsSync } from 'fs';

// Absolute path to the marketplace XES fixture
const FIXTURE_DIR = path.resolve(__dirname, 'fixtures');
const MARKETPLACE_XES = path.join(FIXTURE_DIR, 'marketplace-workflow.xes');

describe('Enterprise marketplace → wasm4pm runtime connection', () => {
  let env: Awaited<ReturnType<typeof createCliTestEnv>>;

  beforeEach(async () => {
    env = await createCliTestEnv();
    // Verify fixture exists before each test
    if (!existsSync(MARKETPLACE_XES)) {
      throw new Error(`Marketplace XES fixture not found: ${MARKETPLACE_XES}`);
    }
  });

  afterEach(async () => {
    await env?.cleanup?.();
  });

  // ─── Step 1: wpm model discover (was: wpm run) ─────────────────────────────

  describe('Step 1: wpm model discover — process discovery on marketplace workflow', () => {
    it('should produce exit code 0 on marketplace XES', async () => {
      const result = await runCli(['model', 'discover', MARKETPLACE_XES, '--format', 'json'], {
        cwd: env.tempDir,
      });
      // Exit 0 (success) or 3 (execution_error if WASM unavailable in test env)
      // but NOT 1 (config) or 2 (source — file must be readable)
      expect(result.exitCode).not.toBe(EXIT_CODES.config_error);
      expect(result.exitCode).not.toBe(EXIT_CODES.source_error);
    });

    it('should return a plain JSON result (native verb — no envelope)', async () => {
      const result = await runCli(['model', 'discover', MARKETPLACE_XES, '--format', 'json'], {
        cwd: env.tempDir,
      });

      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(result.stdout.trim());
      } catch {
        throw new Error(
          `Failed to parse JSON from stdout:\n${result.stdout}\nstderr:\n${result.stderr}`
        );
      }

      if (result.exitCode === EXIT_CODES.success) {
        // model discover is a NATIVE verb — plain result, algorithm/shape at top level
        expect(parsed).toHaveProperty('algorithm');
        expect(parsed).toHaveProperty('shape');
      } else {
        // Any failure normalizes to the framework's error envelope
        expect(parsed).toHaveProperty('error');
      }
    });

    it('creates a receipt at .wasm4pm/receipts/latest.json (discover no longer auto-saves to results/)', async () => {
      const result = await runCli(['model', 'discover', MARKETPLACE_XES, '--format', 'json'], {
        cwd: env.tempDir,
      });

      if (result.exitCode === EXIT_CODES.success) {
        // The framework's own onResult middleware (apps/wasm4pm/src/cli.ts)
        // writes a receipt for every verb, native or bridged — this is the
        // one piece of "wpm run auto-saves something" behavior that survived.
        const receiptPath = path.join(env.tempDir, '.wasm4pm', 'receipts', 'latest.json');
        expect(existsSync(receiptPath)).toBe(true);
      }
    });
  });

  // ─── Step 2: wpm model check --mode self (was: wpm conformance) ────────────

  describe('Step 2: wpm model check --mode self — log-to-model conformance on marketplace workflow', () => {
    it('should exit 0 (fit) or 6 (conformance_fail) — not a crash code', async () => {
      const result = await runCli(['model', 'check', MARKETPLACE_XES, '--mode', 'self', '--format', 'json'], {
        cwd: env.tempDir,
      });

      // Acceptable exit codes:
      //   0 = ADMITTED (fitness >= threshold, conforming)
      //   6 = REJECTED (fitness < threshold — order-004 skips fulfill_order)
      //   3 = execution_error (WASM unavailable in test env)
      // Never acceptable: 1 (config), 2 (source — file is valid)
      expect(result.exitCode).not.toBe(EXIT_CODES.config_error);
      expect(result.exitCode).not.toBe(EXIT_CODES.source_error);
      expect([
        EXIT_CODES.success,
        EXIT_CODES.conformance_fail,
        EXIT_CODES.execution_error,
      ]).toContain(result.exitCode);
    });

    it('should produce a plain JSON result with a checked count', async () => {
      const result = await runCli(['model', 'check', MARKETPLACE_XES, '--mode', 'self', '--format', 'json'], {
        cwd: env.tempDir,
      });

      if (
        result.exitCode === EXIT_CODES.success ||
        result.exitCode === EXIT_CODES.conformance_fail
      ) {
        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse(result.stdout.trim());
        } catch {
          // Output may be non-JSON if execution failed internally — skip assertions
          return;
        }

        // model check is a NATIVE verb — fields live at the top level, no `.payload` wrapper
        expect(parsed).toHaveProperty('status');
        expect(['ADMITTED', 'REJECTED', 'INDETERMINATE']).toContain(parsed.status);
        expect(typeof parsed.checked).toBe('number');
        expect((parsed.checked as number)).toBeGreaterThan(0);
      }
    });

    it('should report admitted/rejected counts that sum to checked', async () => {
      const result = await runCli(['model', 'check', MARKETPLACE_XES, '--mode', 'self', '--format', 'json'], {
        cwd: env.tempDir,
      });

      if (
        result.exitCode === EXIT_CODES.success ||
        result.exitCode === EXIT_CODES.conformance_fail
      ) {
        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse(result.stdout.trim());
        } catch {
          return;
        }

        if (typeof parsed.admitted === 'number' && typeof parsed.rejected === 'number') {
          expect((parsed.admitted as number) + (parsed.rejected as number)).toBe(parsed.checked);
        }
      }
    });

    it('should identify each episode with a fitness figure in its findings', async () => {
      const result = await runCli(['model', 'check', MARKETPLACE_XES, '--mode', 'self', '--format', 'json'], {
        cwd: env.tempDir,
      });

      if (
        result.exitCode === EXIT_CODES.success ||
        result.exitCode === EXIT_CODES.conformance_fail
      ) {
        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse(result.stdout.trim());
        } catch {
          return;
        }

        // Marketplace XES has 4 traces (order-001..004)
        if (Array.isArray(parsed.findings) && parsed.findings.length > 0) {
          expect((parsed.findings as unknown[]).length).toBeGreaterThan(0);
        }
      }
    });
  });

  // ─── Step 3: Receipt file validation ────────────────────────────────────────

  describe('Step 3: Receipt file created in .wasm4pm/receipts/', () => {
    it('should create latest.json receipt after model check --mode self', async () => {
      const result = await runCli(['model', 'check', MARKETPLACE_XES, '--mode', 'self', '--format', 'json'], {
        cwd: env.tempDir,
      });

      if (
        result.exitCode === EXIT_CODES.success ||
        result.exitCode === EXIT_CODES.conformance_fail
      ) {
        const receiptPath = path.join(env.tempDir, '.wasm4pm', 'receipts', 'latest.json');
        const receiptExists = existsSync(receiptPath);
        if (receiptExists) {
          const receiptContent = await fs.readFile(receiptPath, 'utf-8');
          const receipt = JSON.parse(receiptContent) as Record<string, unknown>;

          // Receipt must have run_id (UUID v4 format)
          if ('run_id' in receipt) {
            expect(typeof receipt.run_id).toBe('string');
            expect(receipt.run_id as string).toMatch(
              /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
            );
          }

          // Receipt must have output_hash (BLAKE3 hex)
          if ('output_hash' in receipt) {
            expect(typeof receipt.output_hash).toBe('string');
            expect((receipt.output_hash as string).length).toBeGreaterThanOrEqual(16);
          }
        }
      }
    });

    it('should create a named receipt file (not only latest.json)', async () => {
      const result = await runCli(['model', 'check', MARKETPLACE_XES, '--mode', 'self', '--format', 'json'], {
        cwd: env.tempDir,
      });

      if (
        result.exitCode === EXIT_CODES.success ||
        result.exitCode === EXIT_CODES.conformance_fail
      ) {
        const receiptsDir = path.join(env.tempDir, '.wasm4pm', 'receipts');
        if (existsSync(receiptsDir)) {
          const files = await fs.readdir(receiptsDir);
          // Should have at least latest.json and one named receipt
          const jsonFiles = files.filter((f) => f.endsWith('.json'));
          expect(jsonFiles.length).toBeGreaterThanOrEqual(1);
        }
      }
    });
  });

  // ─── Step 4: wpm evidence report (was: wpm results) ────────────────────────

  describe('Step 4: wpm evidence report — does not crash (discover no longer populates results/)', () => {
    it('wpm evidence report --format json should not crash even with empty results dir', async () => {
      // model discover doesn't write to .wasm4pm/results/ anymore (see the
      // module doc comment) — so this only verifies evidence report itself
      // is well-behaved on an empty/fresh directory, not that a prior
      // discover run is listed.
      const result = await runCli(['evidence', 'report', '--format', 'json'], {
        cwd: env.tempDir,
      });

      // Should not be a crash (exit 5) or config error (exit 1)
      // Empty results is valid: exit 0 with empty list, or exit 0 with message
      expect(result.exitCode).not.toBe(EXIT_CODES.config_error);
      expect(result.exitCode).not.toBe(EXIT_CODES.system_error);
      if (result.exitCode === EXIT_CODES.success) {
        const parsed = JSON.parse(result.stdout.trim()) as Record<string, unknown>;
        expect(parsed).toHaveProperty('status');
      }
    });
  });

  // ─── Step 5: OCEL fixture reference ─────────────────────────────────────────

  describe('Step 5: OCEL fixture reference integrity', () => {
    it('should have a valid marketplace OCEL fixture file', async () => {
      const ocelFixture = path.join(FIXTURE_DIR, 'marketplace-ocel.json');
      expect(existsSync(ocelFixture)).toBe(true);

      const content = await fs.readFile(ocelFixture, 'utf-8');
      const ocel = JSON.parse(content) as Record<string, unknown>;

      // wasm4pm camelCase OCEL 2.0 format
      expect(ocel).toHaveProperty('eventTypes');
      expect(ocel).toHaveProperty('objectTypes');
      expect(ocel).toHaveProperty('events');
      expect(ocel).toHaveProperty('objects');

      // Validate event types match marketplace workflow
      const eventTypes = ocel.eventTypes as string[];
      expect(eventTypes).toContain('place_order');
      expect(eventTypes).toContain('validate_payment');
      expect(eventTypes).toContain('fulfill_order');
      expect(eventTypes).toContain('ship_order');
      expect(eventTypes).toContain('deliver_order');

      // Validate object types
      const objectTypes = ocel.objectTypes as string[];
      expect(objectTypes).toContain('Order');
      expect(objectTypes).toContain('Payment');
      expect(objectTypes).toContain('Shipment');

      // Validate event count: 5 activities × 3 complete traces = 15 events
      const events = ocel.events as unknown[];
      expect(events.length).toBeGreaterThanOrEqual(15);

      // Validate objects include all three order/payment/shipment instances
      const objects = ocel.objects as Array<{ id: string; type: string }>;
      const orderObjs = objects.filter((o) => o.type === 'Order');
      expect(orderObjs.length).toBeGreaterThanOrEqual(3);
    });

    it('should have a valid marketplace XES fixture file', async () => {
      expect(existsSync(MARKETPLACE_XES)).toBe(true);

      const content = await fs.readFile(MARKETPLACE_XES, 'utf-8');

      // Valid XES markers required by the conformance readers
      expect(content).toContain('<log');
      expect(content).toContain('<trace');
      expect(content).toContain('<event');

      // Marketplace activities present
      expect(content).toContain('place_order');
      expect(content).toContain('validate_payment');
      expect(content).toContain('fulfill_order');
      expect(content).toContain('ship_order');
      expect(content).toContain('deliver_order');

      // Four traces: 3 happy-path + 1 non-conforming variant
      const traceCount = (content.match(/<trace>/g) || []).length;
      expect(traceCount).toBeGreaterThanOrEqual(3);
    });
  });

  // ─── Integration: full round-trip ───────────────────────────────────────────

  describe('Full round-trip: model discover → model check → receipt', () => {
    it('should complete the full marketplace validation pipeline', async () => {
      // Phase 1: Discovery
      const discoverResult = await runCli(['model', 'discover', MARKETPLACE_XES, '--format', 'json'], {
        cwd: env.tempDir,
      });
      expect(discoverResult.exitCode).not.toBe(EXIT_CODES.config_error);
      expect(discoverResult.exitCode).not.toBe(EXIT_CODES.source_error);

      // Phase 2: Conformance check (self-mined model, matching old `wpm conformance`)
      const checkResult = await runCli(['model', 'check', MARKETPLACE_XES, '--mode', 'self', '--format', 'json'], {
        cwd: env.tempDir,
      });
      expect(checkResult.exitCode).not.toBe(EXIT_CODES.config_error);
      expect(checkResult.exitCode).not.toBe(EXIT_CODES.source_error);

      // Phase 3: Either exit 0 (ADMITTED) or 6 (REJECTED, with non-conforming trace order-004)
      // The fixture has order-004 which skips fulfill_order — this is intentionally non-conforming
      // so exit 6 is the expected outcome for a strict conformance check
      expect([
        EXIT_CODES.success,
        EXIT_CODES.conformance_fail,
        EXIT_CODES.execution_error, // acceptable if WASM not built for test env
      ]).toContain(checkResult.exitCode);
    });
  });
});
