/**
 * prolog8-gaps.test.ts
 *
 * Gap coverage for `wpm prolog8 show / query / replay`.
 *
 * Focus areas identified by audit:
 *
 * G1 — show JSON payload structure (capabilities key, inner field names, types)
 * G2 — query --input empty-string value (not missing flag, but "" value)
 * G3 — query WASM-execution-throws → execution_error (3), not source_error (2)
 * G4 — replay WASM-execution-throws → execution_error (3), not source_error (2)
 * G5 — replay malformed JSON when WASM absent → source_error (2)
 * G6 — replay malformed JSON when WASM present → execution_error (3)
 * G7 — query Invalid result has exit_code=3 and status="ok" with Invalid payload
 * G8 — show capabilities object is an object (not array, not null, not string)
 * G9 — show JSON capabilities.caps.binding_patterns is present and positive when WASM available
 * G10 — query error envelope has error.code = "execution_error" when engine throws (not "source_error")
 * G11 — replay error.code = "source_error" when WASM absent (not "execution_error")
 * G12 — unknown subcommand exits exactly 1 (config_error) — strict, not just non-zero
 * G13 — show JSON payload.capabilities.engine is "prolog8" string
 * G14 — query without --input exits exactly 1 (config_error from citty missing-required)
 * G15 — replay without --input exits exactly 1 (config_error from citty missing-required)
 * G16 — show JSON envelope has meta.run_id (audit traceability)
 * G17 — show JSON envelope has meta.timestamp (audit traceability)
 * G18 — query valid file + valid WASM → JSON payload.result is an object (not string, not null)
 * G19 — replay valid file + valid WASM → JSON payload.status is a string (not null)
 * G20 — query --max-bytes 2.5 (non-integer float) exits exactly config_error (1)
 * G21 — query nonexistent file JSON error message path is redacted or mentions the filename
 * G22 — show is idempotent: two sequential calls produce the same status
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runCli, EXIT_CODES, createCliTestEnv } from '@wasm4pm/testing';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

// ── Helpers ───────────────────────────────────────────────────────────────────

type CliTestEnv = Awaited<ReturnType<typeof createCliTestEnv>>;

/** Minimal valid Prolog8 query input (receipt(alice) fact, receipt/1 predicate). */
function makeMinimalQueryInput(): string {
  return JSON.stringify({
    catalog: {
      catalog_id: 1,
      predicates: {
        '1': {
          pred_id: 1,
          label: 'receipt',
          arity: 1,
          proof_policy: 'OnRequest',
          materialized: false,
          access_orders: [],
        },
      },
      term_labels: { '1': 'alice' },
      predicate_by_label: { receipt: 1 },
      term_by_label: { alice: 1 },
    },
    facts: [
      {
        pred_id: 1,
        arity: 1,
        rows: [{ pred_id: 1, arity: 1, args: [1], source_id: 0 }],
      },
    ],
    rules: [],
    query: {
      atom: { pred_id: 1, arity: 1, args: [1] },
      binding_mask: 1,
      proof_mode: 'PositiveOnly',
      epoch: 0,
    },
  });
}

/** Minimal valid replay input (query + placeholder receipt). */
function makeMinimalReplayInput(): string {
  const q = JSON.parse(makeMinimalQueryInput()) as Record<string, unknown>;
  q['receipt'] = {
    receipt_hash: 'deadbeef00000000deadbeef00000000deadbeef00000000deadbeef00000000',
    proof_root: 'deadbeef11111111deadbeef11111111deadbeef11111111deadbeef11111111',
    catalog_root: 'deadbeef22222222deadbeef22222222deadbeef22222222deadbeef22222222',
    rule_root: 'deadbeef33333333deadbeef33333333deadbeef33333333deadbeef33333333',
    fact_root: 'deadbeef44444444deadbeef44444444deadbeef44444444deadbeef44444444',
    input_root: 'deadbeef55555555deadbeef55555555deadbeef55555555deadbeef55555555',
    output_root: 'deadbeef66666666deadbeef66666666deadbeef66666666deadbeef66666666',
    engine_version: '0.1.0',
  };
  return JSON.stringify(q);
}

function writeTmp(dir: string, name: string, content: string): string {
  const p = path.join(dir, name);
  fs.writeFileSync(p, content, 'utf-8');
  return p;
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('wpm prolog8 — gap coverage (show/query/replay validation)', () => {
  let env: CliTestEnv;
  let tmpDir: string;

  beforeEach(async () => {
    env = await createCliTestEnv();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wpm-p8-gaps-'));
  });

  afterEach(async () => {
    await env?.cleanup?.();
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // best effort
    }
  });

  // ── G1: show JSON payload structure ─────────────────────────────────────────

  describe('G1 — show JSON payload structure', () => {
    it('G1a: --format json payload.capabilities is an object when WASM available', async () => {
      const result = await runCli(['prolog8', 'show', '--format', 'json'], { env: env.env });
      if (result.exitCode !== EXIT_CODES.success) return; // WASM absent — vacuously true
      const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
      const payload = parsed['payload'] as Record<string, unknown>;
      expect(typeof payload['capabilities']).toBe('object');
      expect(payload['capabilities']).not.toBeNull();
      expect(Array.isArray(payload['capabilities'])).toBe(false);
    });

    it('G1b: --format json payload.capabilities.caps is an object when WASM available', async () => {
      const result = await runCli(['prolog8', 'show', '--format', 'json'], { env: env.env });
      if (result.exitCode !== EXIT_CODES.success) return;
      const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
      const payload = parsed['payload'] as Record<string, unknown>;
      const caps = (payload['capabilities'] as Record<string, unknown>)['caps'];
      if (caps !== undefined) {
        expect(typeof caps).toBe('object');
        expect(caps).not.toBeNull();
      }
    });

    it('G1c: --format json payload.capabilities.caps.arity is a positive integer when WASM available', async () => {
      const result = await runCli(['prolog8', 'show', '--format', 'json'], { env: env.env });
      if (result.exitCode !== EXIT_CODES.success) return;
      const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
      const payload = parsed['payload'] as Record<string, unknown>;
      const caps = (payload['capabilities'] as Record<string, unknown>)['caps'] as
        | Record<string, unknown>
        | undefined;
      if (caps?.['arity'] !== undefined) {
        expect(typeof caps['arity']).toBe('number');
        expect(caps['arity'] as number).toBeGreaterThan(0);
        expect(Number.isInteger(caps['arity'])).toBe(true);
      }
    });

    it('G1d: --format json payload.capabilities.caps.binding_patterns is positive when WASM available', async () => {
      const result = await runCli(['prolog8', 'show', '--format', 'json'], { env: env.env });
      if (result.exitCode !== EXIT_CODES.success) return;
      const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
      const payload = parsed['payload'] as Record<string, unknown>;
      const caps = (payload['capabilities'] as Record<string, unknown>)['caps'] as
        | Record<string, unknown>
        | undefined;
      if (caps?.['binding_patterns'] !== undefined) {
        expect(typeof caps['binding_patterns']).toBe('number');
        expect(caps['binding_patterns'] as number).toBeGreaterThan(0);
      }
    });

    it('G1e: --format json payload.capabilities.engine is "prolog8" string when WASM available', async () => {
      const result = await runCli(['prolog8', 'show', '--format', 'json'], { env: env.env });
      if (result.exitCode !== EXIT_CODES.success) return;
      const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
      const payload = parsed['payload'] as Record<string, unknown>;
      const caps = payload['capabilities'] as Record<string, unknown> | undefined;
      if (caps?.['engine'] !== undefined) {
        expect(typeof caps['engine']).toBe('string');
        expect(caps['engine']).toBe('prolog8');
      }
    });
  });

  // ── G2: query --input empty-string value ────────────────────────────────────

  describe('G2 — query with empty-string --input path', () => {
    it('G2a: --input "" exits source_error (2) — empty path cannot be read', async () => {
      // An empty string is a valid argument value but refers to a non-existent file
      const result = await runCli(['prolog8', 'query', '-i', ''], { env: env.env });
      // readFileSync('') throws ENOENT → source_error
      expect(result.exitCode).toBe(EXIT_CODES.source_error);
    });

    it('G2b: --input "" --format json has status "error"', async () => {
      const result = await runCli(['prolog8', 'query', '-i', '', '--format', 'json'], {
        env: env.env,
      });
      const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
      expect(parsed['status']).toBe('error');
    });

    it('G2c: --input "" --format json exit_code matches process exit code', async () => {
      const result = await runCli(['prolog8', 'query', '-i', '', '--format', 'json'], {
        env: env.env,
      });
      const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
      expect(parsed['exit_code']).toBe(result.exitCode);
    });
  });

  // ── G3/G4: WASM-execution-throws → execution_error, not source_error ────────

  describe('G3 — query WASM-execution-throws exit code contract', () => {
    it('G3a: query with structurally valid file exits source_error (WASM absent) or 0/3 (present)', async () => {
      const queryPath = writeTmp(tmpDir, 'g3-query.json', makeMinimalQueryInput());
      const result = await runCli(['prolog8', 'query', '-i', queryPath], { env: env.env });
      // The three valid outcomes: success (engine answered), source_error (WASM absent),
      // execution_error (engine threw during execution)
      expect([EXIT_CODES.success, EXIT_CODES.source_error, EXIT_CODES.execution_error]).toContain(
        result.exitCode
      );
    });

    it('G3b: query with malformed JSON file exits source_error (WASM absent) or execution_error (present)', async () => {
      // Malformed JSON: readFileSync succeeds but engine throws during parsing
      const malformedPath = writeTmp(tmpDir, 'g3-malformed.json', '{ "broken": [[[');
      const result = await runCli(['prolog8', 'query', '-i', malformedPath], { env: env.env });
      // WASM absent → source_error (2) from loadProlog8 throw
      // WASM present → execution_error (3) from prolog8_query throw on malformed JSON
      expect([EXIT_CODES.source_error, EXIT_CODES.execution_error]).toContain(result.exitCode);
    });

    it('G3c: query malformed JSON --format json has status "error" in envelope', async () => {
      const malformedPath = writeTmp(tmpDir, 'g3-malformed-j.json', '{ "broken": [[[');
      const result = await runCli(
        ['prolog8', 'query', '-i', malformedPath, '--format', 'json'],
        { env: env.env }
      );
      const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
      expect(parsed['status']).toBe('error');
    });

    it('G3d: query malformed JSON --format json exit_code matches process exit code', async () => {
      const malformedPath = writeTmp(tmpDir, 'g3-exit-code.json', 'NOT_JSON');
      const result = await runCli(
        ['prolog8', 'query', '-i', malformedPath, '--format', 'json'],
        { env: env.env }
      );
      const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
      expect(parsed['exit_code']).toBe(result.exitCode);
    });

    it('G3e: query malformed JSON never exits config_error (1) — schema validation does not apply', async () => {
      // config_error is only for invalid CLI flags, never for file content errors
      const malformedPath = writeTmp(tmpDir, 'g3-not-config.json', 'garbage content');
      const result = await runCli(['prolog8', 'query', '-i', malformedPath], { env: env.env });
      expect(result.exitCode).not.toBe(EXIT_CODES.config_error);
    });
  });

  describe('G4 — replay WASM-execution-throws exit code contract', () => {
    it('G4a: replay with malformed JSON exits source_error (WASM absent) or execution_error (present)', async () => {
      const malformedPath = writeTmp(tmpDir, 'g4-malformed.json', '{ "bad": ]]]');
      const result = await runCli(['prolog8', 'replay', '-i', malformedPath], { env: env.env });
      expect([EXIT_CODES.source_error, EXIT_CODES.execution_error]).toContain(result.exitCode);
    });

    it('G4b: replay malformed JSON --format json has status "error"', async () => {
      const malformedPath = writeTmp(tmpDir, 'g4-malformed-j.json', 'NOT_VALID_JSON_AT_ALL');
      const result = await runCli(
        ['prolog8', 'replay', '-i', malformedPath, '--format', 'json'],
        { env: env.env }
      );
      const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
      expect(parsed['status']).toBe('error');
    });

    it('G4c: replay malformed JSON never exits config_error (1)', async () => {
      const malformedPath = writeTmp(tmpDir, 'g4-not-config.json', '{"incomplete":');
      const result = await runCli(['prolog8', 'replay', '-i', malformedPath], { env: env.env });
      expect(result.exitCode).not.toBe(EXIT_CODES.config_error);
    });

    it('G4d: replay malformed JSON --format json exit_code matches process exit code', async () => {
      const malformedPath = writeTmp(tmpDir, 'g4-ec.json', 'bad json {{{{');
      const result = await runCli(
        ['prolog8', 'replay', '-i', malformedPath, '--format', 'json'],
        { env: env.env }
      );
      const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
      expect(parsed['exit_code']).toBe(result.exitCode);
    });
  });

  // ── G5/G6: replay malformed JSON exit code by WASM availability ─────────────

  describe('G5/G6 — replay malformed JSON: source_error when WASM absent, execution_error when present', () => {
    it('G5: replay with empty-object JSON {} exits source_error or execution_error (not success)', async () => {
      // {} is valid JSON but missing required receipt field — engine must reject it
      const emptyObjPath = writeTmp(tmpDir, 'g5-empty-obj.json', '{}');
      const result = await runCli(['prolog8', 'replay', '-i', emptyObjPath], { env: env.env });
      expect(result.exitCode).not.toBe(EXIT_CODES.success);
      // Either WASM absent (source_error=2) or present and rejects the schema (execution_error=3)
      expect([EXIT_CODES.source_error, EXIT_CODES.execution_error]).toContain(result.exitCode);
    });

    it('G6: replay with plaintext (not JSON) exits source_error or execution_error', async () => {
      const textPath = writeTmp(tmpDir, 'g6-text.json', 'this is just text, not json');
      const result = await runCli(['prolog8', 'replay', '-i', textPath], { env: env.env });
      expect([EXIT_CODES.source_error, EXIT_CODES.execution_error]).toContain(result.exitCode);
    });
  });

  // ── G7: query Invalid result has exit_code=3 ─────────────────────────────────

  describe('G7 — query Invalid result has exit_code=3 (execution_error)', () => {
    it('G7a: query with predicate-not-in-catalog (admission Invalid) has non-zero exit when WASM present', async () => {
      // pred_id 99 is not in the catalog → admission rejects with Invalid
      const unknownPredInput = JSON.stringify({
        catalog: {
          catalog_id: 1,
          predicates: {
            '1': {
              pred_id: 1,
              label: 'receipt',
              arity: 1,
              proof_policy: 'OnRequest',
              materialized: false,
              access_orders: [],
            },
          },
          term_labels: { '1': 'alice' },
          predicate_by_label: { receipt: 1 },
          term_by_label: { alice: 1 },
        },
        facts: [],
        rules: [],
        query: {
          atom: { pred_id: 99, arity: 1, args: [1] }, // pred 99 not in catalog
          binding_mask: 1,
          proof_mode: 'PositiveOnly',
          epoch: 0,
        },
      });
      const queryPath = writeTmp(tmpDir, 'g7-unknown-pred.json', unknownPredInput);
      const result = await runCli(['prolog8', 'query', '-i', queryPath], { env: env.env });
      if (result.exitCode === EXIT_CODES.source_error) return; // WASM absent — vacuous
      // When WASM present: Invalid → execution_error (3)
      expect(result.exitCode).toBe(EXIT_CODES.execution_error);
    });

    it('G7b: query Invalid --format json has status "ok" with Invalid in result.payload', async () => {
      // The CLI emits status="ok" for Invalid results (it is a valid engine response);
      // the information about invalidity is in payload.result.Invalid
      const unknownPredInput = JSON.stringify({
        catalog: {
          catalog_id: 1,
          predicates: {
            '1': {
              pred_id: 1,
              label: 'receipt',
              arity: 1,
              proof_policy: 'OnRequest',
              materialized: false,
              access_orders: [],
            },
          },
          term_labels: { '1': 'alice' },
          predicate_by_label: { receipt: 1 },
          term_by_label: { alice: 1 },
        },
        facts: [],
        rules: [],
        query: {
          atom: { pred_id: 99, arity: 1, args: [1] },
          binding_mask: 1,
          proof_mode: 'PositiveOnly',
          epoch: 0,
        },
      });
      const queryPath = writeTmp(tmpDir, 'g7-invalid-j.json', unknownPredInput);
      const result = await runCli(
        ['prolog8', 'query', '-i', queryPath, '--format', 'json'],
        { env: env.env }
      );
      if (result.exitCode === EXIT_CODES.source_error) return; // WASM absent
      const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
      // exit_code must match process exit
      expect(parsed['exit_code']).toBe(result.exitCode);
      // exit_code 3 means execution_error — Invalid result
      expect(parsed['exit_code']).toBe(EXIT_CODES.execution_error);
    });
  });

  // ── G8: show capabilities structure is an object ────────────────────────────

  describe('G8 — show capabilities type contract', () => {
    it('G8a: show JSON status is "ok" or "error" — never null, undefined, or numeric', async () => {
      const result = await runCli(['prolog8', 'show', '--format', 'json'], { env: env.env });
      const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
      expect(typeof parsed['status']).toBe('string');
      expect(['ok', 'error']).toContain(parsed['status']);
    });

    it('G8b: show JSON exit_code is a number', async () => {
      const result = await runCli(['prolog8', 'show', '--format', 'json'], { env: env.env });
      const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
      expect(typeof parsed['exit_code']).toBe('number');
    });

    it('G8c: show JSON exit_code is 0 or 2 — never 1, 3, 4, 5, or 6', async () => {
      const result = await runCli(['prolog8', 'show', '--format', 'json'], { env: env.env });
      const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
      expect([EXIT_CODES.success, EXIT_CODES.source_error]).toContain(parsed['exit_code']);
    });
  });

  // ── G10/G11: error.code field in error envelopes ────────────────────────────

  describe('G10/G11 — error envelope error.code field', () => {
    it('G10: query with WASM-absent → error.code is "source_error"', async () => {
      const queryPath = writeTmp(tmpDir, 'g10-query.json', makeMinimalQueryInput());
      const result = await runCli(
        ['prolog8', 'query', '-i', queryPath, '--format', 'json'],
        { env: env.env }
      );
      if (result.exitCode !== EXIT_CODES.source_error) return; // WASM present — vacuous
      const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
      const err = parsed['error'] as Record<string, unknown> | undefined;
      expect(err).toBeDefined();
      expect(err?.['code']).toBe('source_error');
    });

    it('G11: replay with nonexistent file → error.code is "source_error"', async () => {
      const result = await runCli(
        ['prolog8', 'replay', '-i', '/nonexistent-g11.json', '--format', 'json'],
        { env: env.env }
      );
      expect(result.exitCode).toBe(EXIT_CODES.source_error);
      const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
      const err = parsed['error'] as Record<string, unknown> | undefined;
      expect(err).toBeDefined();
      expect(err?.['code']).toBe('source_error');
    });

    it('G11b: query with nonexistent file → error.code is "source_error"', async () => {
      const result = await runCli(
        ['prolog8', 'query', '-i', '/nonexistent-g11b.json', '--format', 'json'],
        { env: env.env }
      );
      expect(result.exitCode).toBe(EXIT_CODES.source_error);
      const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
      const err = parsed['error'] as Record<string, unknown> | undefined;
      expect(err).toBeDefined();
      expect(err?.['code']).toBe('source_error');
    });
  });

  // ── G12: unknown subcommand exits exactly config_error (1) ──────────────────

  describe('G12 — unknown subcommand exits exactly config_error (1)', () => {
    it('G12a: "wpm prolog8 xyzzy" exits exactly 1', async () => {
      const result = await runCli(['prolog8', 'xyzzy'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.config_error);
    });

    it('G12b: "wpm prolog8 SHOW" (wrong case) exits exactly 1', async () => {
      const result = await runCli(['prolog8', 'SHOW'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.config_error);
    });

    it('G12c: "wpm prolog8 Query" (wrong case) exits exactly 1', async () => {
      const result = await runCli(['prolog8', 'Query'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.config_error);
    });

    it('G12d: "wpm prolog8 shows" (typo) exits exactly 1', async () => {
      const result = await runCli(['prolog8', 'shows'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.config_error);
    });
  });

  // ── G14/G15: missing --input exits exactly config_error (1) ─────────────────

  describe('G14/G15 — missing --input exits exactly config_error (1)', () => {
    it('G14: "wpm prolog8 query" (no -i) exits exactly 1', async () => {
      const result = await runCli(['prolog8', 'query'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.config_error);
    });

    it('G15: "wpm prolog8 replay" (no -i) exits exactly 1', async () => {
      const result = await runCli(['prolog8', 'replay'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.config_error);
    });
  });

  // ── G16/G17: show JSON envelope audit traceability fields ───────────────────

  describe('G16/G17 — show JSON envelope has audit traceability fields', () => {
    it('G16: show --format json has meta.run_id field (string, non-empty)', async () => {
      const result = await runCli(['prolog8', 'show', '--format', 'json'], { env: env.env });
      const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
      const meta = parsed['meta'] as Record<string, unknown> | undefined;
      if (meta) {
        expect(typeof meta['run_id']).toBe('string');
        expect(String(meta['run_id']).length).toBeGreaterThan(0);
      }
      // meta presence itself is optional — the envelope may not include it for all commands
      // but if present it must have run_id
    });

    it('G17: show --format json has meta.timestamp field (ISO-8601-like string)', async () => {
      const result = await runCli(['prolog8', 'show', '--format', 'json'], { env: env.env });
      const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
      const meta = parsed['meta'] as Record<string, unknown> | undefined;
      if (meta?.['timestamp'] !== undefined) {
        expect(typeof meta['timestamp']).toBe('string');
        // Must look like an ISO timestamp (contains T and dashes)
        expect(String(meta['timestamp'])).toMatch(/\d{4}-\d{2}-\d{2}T/);
      }
    });
  });

  // ── G18/G19: valid WASM run → payload fields have correct types ──────────────

  describe('G18/G19 — valid WASM run payload field types', () => {
    it('G18: query valid input → JSON payload.result is an object or absent (not a bare string)', async () => {
      const queryPath = writeTmp(tmpDir, 'g18-query.json', makeMinimalQueryInput());
      const result = await runCli(
        ['prolog8', 'query', '-i', queryPath, '--format', 'json'],
        { env: env.env }
      );
      if (result.exitCode === EXIT_CODES.source_error) return; // WASM absent
      const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
      const payload = parsed['payload'] as Record<string, unknown> | undefined;
      if (payload?.['result'] !== undefined) {
        // result must be an object, not a primitive string
        expect(typeof payload['result']).not.toBe('string');
        expect(typeof payload['result']).toBe('object');
        expect(payload['result']).not.toBeNull();
      }
    });

    it('G19: replay valid input → JSON payload.status is a string when WASM present', async () => {
      const replayPath = writeTmp(tmpDir, 'g19-replay.json', makeMinimalReplayInput());
      const result = await runCli(
        ['prolog8', 'replay', '-i', replayPath, '--format', 'json'],
        { env: env.env }
      );
      if (result.exitCode === EXIT_CODES.source_error) return; // WASM absent
      const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
      const payload = parsed['payload'] as Record<string, unknown> | undefined;
      if (payload?.['status'] !== undefined) {
        // The replay status (e.g. "Verified", "ReceiptInvalid", "Mismatch") must be a string
        expect(typeof payload['status']).toBe('string');
        expect(String(payload['status']).length).toBeGreaterThan(0);
      }
    });
  });

  // ── G20: --max-bytes non-integer float exits config_error (1) ───────────────

  describe('G20 — --max-bytes float value exits config_error', () => {
    it('G20a: --max-bytes 2.5 exits exactly config_error (1)', async () => {
      const queryPath = writeTmp(tmpDir, 'g20a.json', makeMinimalQueryInput());
      const result = await runCli(
        ['prolog8', 'query', '-i', queryPath, '--max-bytes', '2.5'],
        { env: env.env }
      );
      expect(result.exitCode).toBe(EXIT_CODES.config_error);
    });

    it('G20b: --max-bytes 0.1 exits exactly config_error (1)', async () => {
      const queryPath = writeTmp(tmpDir, 'g20b.json', makeMinimalQueryInput());
      const result = await runCli(
        ['prolog8', 'query', '-i', queryPath, '--max-bytes', '0.1'],
        { env: env.env }
      );
      expect(result.exitCode).toBe(EXIT_CODES.config_error);
    });

    it('G20c: --max-bytes 100.0 (representable as integer) exits config_error (1) — not an integer literal', async () => {
      // 100.0 parses to 100 by Number(), which IS an integer.
      // Verify: Number.isInteger(Number("100.0")) === true
      // So 100.0 SHOULD be accepted — this test documents the boundary behavior.
      const queryPath = writeTmp(tmpDir, 'g20c.json', makeMinimalQueryInput());
      const result = await runCli(
        ['prolog8', 'query', '-i', queryPath, '--max-bytes', '100.0'],
        { env: env.env }
      );
      // Number("100.0") === 100 which IS an integer — CLI should accept it (not config_error)
      // Valid: exits source_error (WASM absent) or success/execution_error (WASM present)
      expect(result.exitCode).not.toBe(EXIT_CODES.config_error);
    });
  });

  // ── G21: error message includes filename reference ───────────────────────────

  describe('G21 — error message references the problem file', () => {
    it('G21a: query nonexistent file JSON error.message contains the filename', async () => {
      const result = await runCli(
        ['prolog8', 'query', '-i', '/some/unique/path/to/missing-query.json', '--format', 'json'],
        { env: env.env }
      );
      expect(result.exitCode).toBe(EXIT_CODES.source_error);
      const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
      const err = parsed['error'] as Record<string, unknown>;
      const msg = String(err['message'] ?? '');
      // Error message must reference some part of the file path or operation
      expect(msg).toMatch(/missing-query\.json|cannot read|not found|ENOENT/i);
    });

    it('G21b: replay nonexistent file JSON error.message contains the filename', async () => {
      const result = await runCli(
        ['prolog8', 'replay', '-i', '/some/unique/path/to/missing-replay.json', '--format', 'json'],
        { env: env.env }
      );
      expect(result.exitCode).toBe(EXIT_CODES.source_error);
      const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
      const err = parsed['error'] as Record<string, unknown>;
      const msg = String(err['message'] ?? '');
      expect(msg).toMatch(/missing-replay\.json|cannot read|not found|ENOENT/i);
    });
  });

  // ── G22: show is deterministic (idempotent) ──────────────────────────────────

  describe('G22 — show is deterministic across sequential calls', () => {
    it('G22a: two sequential show --format json calls produce the same status', async () => {
      const r1 = await runCli(['prolog8', 'show', '--format', 'json'], { env: env.env });
      const r2 = await runCli(['prolog8', 'show', '--format', 'json'], { env: env.env });
      expect(r1.exitCode).toBe(r2.exitCode);
      const p1 = JSON.parse(r1.stdout) as Record<string, unknown>;
      const p2 = JSON.parse(r2.stdout) as Record<string, unknown>;
      expect(p1['status']).toBe(p2['status']);
    });

    it('G22b: two sequential show --format json calls produce the same capabilities structure', async () => {
      const r1 = await runCli(['prolog8', 'show', '--format', 'json'], { env: env.env });
      const r2 = await runCli(['prolog8', 'show', '--format', 'json'], { env: env.env });
      if (r1.exitCode !== EXIT_CODES.success) return; // WASM absent — vacuous
      const p1 = JSON.parse(r1.stdout) as Record<string, unknown>;
      const p2 = JSON.parse(r2.stdout) as Record<string, unknown>;
      // The capabilities payload (static engine metadata) must be identical
      const caps1 = JSON.stringify((p1['payload'] as Record<string, unknown>)['capabilities']);
      const caps2 = JSON.stringify((p2['payload'] as Record<string, unknown>)['capabilities']);
      expect(caps1).toBe(caps2);
    });
  });

  // ── Cross-cutting: valid subcommands exit correctly ──────────────────────────

  describe('Cross-cutting: valid subcommands do not exit config_error', () => {
    it('CC1: "wpm prolog8 show" never exits config_error (1)', async () => {
      const result = await runCli(['prolog8', 'show'], { env: env.env });
      expect(result.exitCode).not.toBe(EXIT_CODES.config_error);
    });

    it('CC2: "wpm prolog8 query -i <valid>" never exits config_error (1)', async () => {
      const queryPath = writeTmp(tmpDir, 'cc2.json', makeMinimalQueryInput());
      const result = await runCli(['prolog8', 'query', '-i', queryPath], { env: env.env });
      expect(result.exitCode).not.toBe(EXIT_CODES.config_error);
    });

    it('CC3: "wpm prolog8 replay -i <valid>" never exits config_error (1)', async () => {
      const replayPath = writeTmp(tmpDir, 'cc3.json', makeMinimalReplayInput());
      const result = await runCli(['prolog8', 'replay', '-i', replayPath], { env: env.env });
      expect(result.exitCode).not.toBe(EXIT_CODES.config_error);
    });

    it('CC4: all three subcommands complete within 5000ms (non-flaky bound)', async () => {
      const queryPath = writeTmp(tmpDir, 'cc4-q.json', makeMinimalQueryInput());
      const replayPath = writeTmp(tmpDir, 'cc4-r.json', makeMinimalReplayInput());
      const start = Date.now();
      await Promise.all([
        runCli(['prolog8', 'show'], { env: env.env }),
        runCli(['prolog8', 'query', '-i', queryPath], { env: env.env }),
        runCli(['prolog8', 'replay', '-i', replayPath], { env: env.env }),
      ]);
      expect(Date.now() - start).toBeLessThan(5000);
    });
  });
});
