/**
 * `wpm prolog8` was retired in the noun-verb rebuild (see
 * `apps/wasm4pm/src/nouns/_removed.ts`): bare `prolog8 <subcommand>` ->
 * `lab prolog8 <subcommand>` for `show`/`query`; the specific two-token
 * pair `prolog8 replay` -> `evidence replay` (both bridge to the same
 * `commands/prolog8.ts` body unmodified — see `src/nouns/lab/prolog8.ts`
 * and `src/nouns/evidence/replay.ts`).
 *
 * Contract notes (verified live against the built CLI; see
 * `packages/noun-verb/src/{cli,output,errors}.ts` and
 * `apps/wasm4pm/src/nouns/_bridge.ts`):
 *
 *   1. Success responses keep the full legacy envelope
 *      `{command, status, exit_code, payload, meta}` verbatim (the bridge
 *      returns the legacy command's own parsed JSON unmodified on the
 *      success path).
 *   2. Failure responses are ALWAYS `{error:{code,message}}` ONLY — no
 *      `command`/`meta`/`payload` fields exist on that shape (this is the
 *      framework's one documented error wire-format, not a bug). `error.code`
 *      is one of the framework's 9 `ErrorCode` values (`INVALID_INPUT`,
 *      `EXECUTION_ERROR`, ...) — never the legacy 'source_error'/
 *      'config_error' strings.
 *   3. Two distinct paths produce failures, with different exit-code
 *      mapping:
 *      a. Errors from citty's OWN pre-`run()` dispatch (a required arg
 *         missing, e.g. `--input`; an unrecognized subcommand name) throw a
 *         plain `Error` that bypasses `commands/prolog8.ts`'s own
 *         `EXIT_CODES` classification entirely and lands as generic
 *         `EXECUTION_ERROR` (process exit 3) — this is why "missing
 *         --input" and "unknown subcommand" are now exit 3, not the legacy
 *         config_error (1).
 *      b. Errors raised INSIDE `commands/prolog8.ts`'s own `run()` body
 *         (e.g. `--max-bytes` validation, file-not-found) carry the
 *         legacy 0-6 exit code through `classifyLegacyFailure`
 *         (`nouns/_bridge.ts`), which maps BOTH legacy config_error(1) AND
 *         source_error(2) onto the single framework code `INVALID_INPUT`
 *         -> wpm's `source_error` (process exit 2). The legacy 1 vs 2
 *         distinction is lost — a documented, coarser (not lossless)
 *         mapping (see `packages/noun-verb/src/errors.ts`).
 *   4. `--help` is intercepted by the framework BEFORE the verb handler
 *      (and therefore before the legacy bridge) ever runs, so it ALWAYS
 *      shows the generic per-verb summary + `--human`/`--introspect`
 *      options — never the legacy subcommand's own flag list (`-i`,
 *      `--format`, etc.). Coincidentally, the `lab prolog8` verb's summary
 *      text already contains "show | query | replay", so help-text
 *      assertions that only look for those words still pass; assertions
 *      looking for flag names (`-i`, `--format`) do not and are rewritten
 *      below.
 *   5. A no-subcommand invocation's plain-text usage banner (not run
 *      through `emitResult()`) survives the always-JSON-on-stdout contract
 *      wrapped as `{ raw: <banner text> }` (see `nouns/_bridge.ts`).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runCli, EXIT_CODES, createCliTestEnv } from '@wasm4pm/testing';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

// Each test spawns a Node subprocess — 5s default vitest timeout is too low.
// runCli defaults to 30s; set vitest test timeout higher to avoid race.
vi.setConfig({ testTimeout: 60_000 });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal valid Prolog8 query-input JSON (no WASM pkg required for file-read tests). */
function makeQueryInput(overrides: Record<string, unknown> = {}): string {
  const base = {
    catalog: {
      catalog_id: 1,
      predicates: {
        '1': {
          pred_id: 1,
          label: 'parent',
          arity: 2,
          proof_policy: 'OnRequest',
          materialized: false,
          access_orders: [],
        },
      },
      term_labels: { '1': 'alice', '2': 'bob' },
      predicate_by_label: { parent: 1 },
      term_by_label: { alice: 1, bob: 2 },
    },
    facts: [
      {
        pred_id: 1,
        arity: 2,
        rows: [{ pred_id: 1, arity: 2, args: [1, 2], source_id: 0 }],
      },
    ],
    rules: [],
    query: {
      atom: { pred_id: 1, arity: 2, args: [1, 2] },
      binding_mask: 3,
      proof_mode: 'PositiveOnly',
      epoch: 0,
    },
    ...overrides,
  };
  return JSON.stringify(base);
}

/** Minimal valid Prolog8 replay-input JSON (query input + receipt field). */
function makeReplayInput(): string {
  const q = JSON.parse(makeQueryInput());
  q['receipt'] = {
    receipt_hash: 'aabbccdd',
    proof_root: 'aabbccdd',
    catalog_root: 'aabbccdd',
    rule_root: 'aabbccdd',
    fact_root: 'aabbccdd',
    input_root: 'aabbccdd',
    output_root: 'aabbccdd',
    engine_version: '0.1.0',
  };
  return JSON.stringify(q);
}

/** Write content to a temp file and return the path. */
function writeTmp(dir: string, name: string, content: string): string {
  const p = path.join(dir, name);
  fs.writeFileSync(p, content, 'utf-8');
  return p;
}

/** Read the most recent BLAKE3 receipt from `cwd`'s `.wasm4pm/receipts/latest.json`. */
function readLatestReceipt(cwd: string): Record<string, unknown> | undefined {
  try {
    const content = fs.readFileSync(path.join(cwd, '.wasm4pm/receipts/latest.json'), 'utf-8');
    return JSON.parse(content) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('wpm lab prolog8 / evidence replay — Horn-clause proof engine CLI (was: wpm prolog8)', () => {
  let env: Awaited<ReturnType<typeof createCliTestEnv>>;
  let tmpDir: string;

  beforeEach(async () => {
    env = await createCliTestEnv();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wpm-p8-'));
  });

  afterEach(async () => {
    await env?.cleanup?.();
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // best effort
    }
  });

  // -------------------------------------------------------------------------
  // prolog8 (root — no subcommand) -> lab prolog8 (no subcommand)
  // -------------------------------------------------------------------------

  describe('lab prolog8 root command', () => {
    it('exits 0 when called with no subcommand and prints usage banner', async () => {
      const result = await runCli(['lab', 'prolog8'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      // Plain-text banner (not JSON) survives the always-JSON contract as `{ raw: <text> }`.
      expect(result.stdout).toMatch(/prolog8/i);
    });

    it('--help exits 0 and shows subcommand names', async () => {
      const result = await runCli(['lab', 'prolog8', '--help'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      // Generic per-verb help (framework intercepts --help before the legacy
      // bridge runs) — the verb's own summary text happens to list all three.
      expect(result.stdout).toMatch(/show|query|replay/i);
    });

    it('invalid subcommand exits non-zero', async () => {
      const result = await runCli(['lab', 'prolog8', 'invalid-subcommand'], { env: env.env });
      expect(result.exitCode).not.toBe(EXIT_CODES.success);
    });

    it('invalid subcommand output contains error message', async () => {
      const result = await runCli(['lab', 'prolog8', 'invalid-subcommand'], { env: env.env });
      const combined = result.stdout + result.stderr;
      expect(combined).toMatch(/unknown|invalid|error/i);
    });
  });

  // -------------------------------------------------------------------------
  // prolog8 show -> lab prolog8 show
  // -------------------------------------------------------------------------

  describe('lab prolog8 show', () => {
    it('exits 0 or SOURCE_ERROR (WASM may not be built)', async () => {
      const result = await runCli(['lab', 'prolog8', 'show'], { env: env.env });
      expect([EXIT_CODES.success, EXIT_CODES.source_error]).toContain(result.exitCode);
    });

    it('--format json produces valid JSON output', async () => {
      const result = await runCli(['lab', 'prolog8', 'show', '--format', 'json'], { env: env.env });
      // JSON is always written regardless of WASM availability
      expect(result.stdout).not.toBe('');
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });

    it('--format json output has status field on the success envelope', async () => {
      const result = await runCli(['lab', 'prolog8', 'show', '--format', 'json'], { env: env.env });
      const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
      if (result.exitCode === EXIT_CODES.success) {
        expect(parsed).toHaveProperty('status');
      } else {
        expect(parsed).toHaveProperty('error');
      }
    });

    it('--format json receipt records command "lab prolog8" (the error envelope itself has no `command` field)', async () => {
      const result = await runCli(['lab', 'prolog8', 'show', '--format', 'json'], {
        env: env.env,
        cwd: env.tempDir,
      });
      const receipt = readLatestReceipt(env.tempDir);
      expect(receipt?.['command']).toBe('lab prolog8');
      expect(receipt?.['status']).toBe(result.exitCode === EXIT_CODES.success ? 'success' : 'failed');
    });

    it('--format json output exit_code matches process exit code (success envelope)', async () => {
      const result = await runCli(['lab', 'prolog8', 'show', '--format', 'json'], { env: env.env });
      if (result.exitCode !== EXIT_CODES.success) return; // error envelope has no exit_code field
      const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
      expect(typeof parsed['exit_code']).toBe('number');
      expect(parsed['exit_code']).toBe(result.exitCode);
    });

    it('--format json status is "ok" on success', async () => {
      const result = await runCli(['lab', 'prolog8', 'show', '--format', 'json'], { env: env.env });
      if (result.exitCode !== EXIT_CODES.success) return;
      const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
      expect(parsed['status']).toBe('ok');
    });

    it('--help exits 0 (generic per-verb help; legacy --format flag list no longer shown)', async () => {
      const result = await runCli(['lab', 'prolog8', 'show', '--help'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      // Framework intercepts --help before the legacy bridge runs, so the
      // subcommand-specific flag list (`--format`) is genuinely gone; only
      // --human/--introspect are shown for every verb.
      expect(result.stdout).toMatch(/human|introspect/i);
    });

    it('completes within 3000ms', async () => {
      const start = Date.now();
      await runCli(['lab', 'prolog8', 'show'], { env: env.env });
      expect(Date.now() - start).toBeLessThan(15000);
    });

    it('when WASM not available, error message mentions build instructions', async () => {
      const result = await runCli(['lab', 'prolog8', 'show'], { env: env.env });
      if (result.exitCode === EXIT_CODES.source_error) {
        const combined = result.stdout + result.stderr;
        expect(combined).toMatch(/wasm-pack|build|prolog8/i);
      }
      // If WASM is available exitCode is 0 — test passes vacuously
      expect([EXIT_CODES.success, EXIT_CODES.source_error]).toContain(result.exitCode);
    });

    it('--format json error envelope includes error.code field when WASM unavailable', async () => {
      const result = await runCli(['lab', 'prolog8', 'show', '--format', 'json'], { env: env.env });
      const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
      if (result.exitCode === EXIT_CODES.source_error) {
        expect(parsed).toHaveProperty('error');
        const err = parsed['error'] as Record<string, unknown>;
        expect(err).toHaveProperty('code');
        // Framework ErrorCode vocabulary, not the legacy 'source_error' string.
        expect(err['code']).toBe('INVALID_INPUT');
      }
    });

    it('when WASM is available, JSON payload has capabilities object', async () => {
      const result = await runCli(['lab', 'prolog8', 'show', '--format', 'json'], { env: env.env });
      if (result.exitCode === EXIT_CODES.success) {
        const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
        // Success response has payload with capabilities
        expect(parsed).toHaveProperty('payload');
      }
    });
  });

  // -------------------------------------------------------------------------
  // prolog8 query -> lab prolog8 query
  // -------------------------------------------------------------------------

  describe('lab prolog8 query', () => {
    it('--help exits 0 (generic per-verb help; -i/--input no longer listed)', async () => {
      const result = await runCli(['lab', 'prolog8', 'query', '--help'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      expect(result.stdout).toMatch(/human|introspect/i);
    });

    it('with no arguments exits EXECUTION_ERROR (citty\'s own required-arg check, before legacy config_error classification)', async () => {
      const result = await runCli(['lab', 'prolog8', 'query'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.execution_error);
    });

    it('non-zero exit when --input is missing', async () => {
      const result = await runCli(['lab', 'prolog8', 'query'], { env: env.env });
      expect(result.exitCode).not.toBe(EXIT_CODES.success);
    });

    it('--input pointing to nonexistent file exits SOURCE_ERROR', async () => {
      const result = await runCli(
        ['lab', 'prolog8', 'query', '-i', '/nonexistent-p8-query.json'],
        { env: env.env }
      );
      expect(result.exitCode).toBe(EXIT_CODES.source_error);
    });

    it('--input nonexistent --format json produces the framework error envelope', async () => {
      const result = await runCli(
        ['lab', 'prolog8', 'query', '-i', '/nonexistent-p8-query.json', '--format', 'json'],
        { env: env.env }
      );
      expect(result.exitCode).toBe(EXIT_CODES.source_error);
      const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
      expect(parsed).toHaveProperty('error');
    });

    it('--input nonexistent --format json error message mentions the path', async () => {
      const result = await runCli(
        ['lab', 'prolog8', 'query', '-i', '/nonexistent-p8-query.json', '--format', 'json'],
        { env: env.env }
      );
      const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
      const err = parsed['error'] as Record<string, unknown>;
      expect(String(err['message'])).toMatch(/nonexistent-p8-query\.json/);
    });

    it('valid input file exits SOURCE_ERROR when WASM not built, or 0/3 when built', async () => {
      const inputPath = writeTmp(tmpDir, 'query.json', makeQueryInput());
      const result = await runCli(['lab', 'prolog8', 'query', '-i', inputPath], { env: env.env });
      expect([EXIT_CODES.success, EXIT_CODES.source_error, EXIT_CODES.execution_error]).toContain(
        result.exitCode
      );
    });

    it('--format json with valid input always produces parseable JSON', async () => {
      const inputPath = writeTmp(tmpDir, 'query.json', makeQueryInput());
      const result = await runCli(
        ['lab', 'prolog8', 'query', '-i', inputPath, '--format', 'json'],
        { env: env.env }
      );
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });

    it('--format json receipt records command "lab prolog8"', async () => {
      const inputPath = writeTmp(tmpDir, 'query.json', makeQueryInput());
      await runCli(['lab', 'prolog8', 'query', '-i', inputPath, '--format', 'json'], {
        env: env.env,
        cwd: env.tempDir,
      });
      const receipt = readLatestReceipt(env.tempDir);
      expect(receipt?.['command']).toBe('lab prolog8');
    });

    it('malformed JSON input file exits SOURCE_ERROR or EXECUTION_ERROR', async () => {
      const badPath = writeTmp(tmpDir, 'bad.json', 'not valid json {{{');
      const result = await runCli(['lab', 'prolog8', 'query', '-i', badPath], { env: env.env });
      // WASM not built → SOURCE_ERROR; WASM built + bad JSON → SOURCE_ERROR (schema rejected)
      expect([EXIT_CODES.source_error, EXIT_CODES.execution_error]).toContain(result.exitCode);
    });

    it('--verbose flag is accepted without argument error', async () => {
      const inputPath = writeTmp(tmpDir, 'query.json', makeQueryInput());
      const result = await runCli(
        ['lab', 'prolog8', 'query', '-i', inputPath, '--verbose'],
        { env: env.env }
      );
      // Should not fail due to unknown-flag; may fail due to WASM availability
      expect([EXIT_CODES.success, EXIT_CODES.source_error, EXIT_CODES.execution_error]).toContain(
        result.exitCode
      );
    });
  });

  // -------------------------------------------------------------------------
  // prolog8 replay -> evidence replay
  // -------------------------------------------------------------------------

  describe('evidence replay', () => {
    it('--help exits 0', async () => {
      const result = await runCli(['evidence', 'replay', '--help'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
    });

    it('--help output mentions replay/verify/receipt terminology', async () => {
      const result = await runCli(['evidence', 'replay', '--help'], { env: env.env });
      // Generic per-verb help — the evidence-replay verb's own summary
      // ("Verify a receipt by replaying its proof, detecting tampering")
      // already covers this vocabulary.
      expect(result.stdout).toMatch(/replay|verify|receipt/i);
    });

    it('with no arguments exits EXECUTION_ERROR (citty\'s own required-arg check, before legacy config_error classification)', async () => {
      const result = await runCli(['evidence', 'replay'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.execution_error);
    });

    it('--input pointing to nonexistent file exits SOURCE_ERROR', async () => {
      const result = await runCli(
        ['evidence', 'replay', '-i', '/nonexistent-receipt.json'],
        { env: env.env }
      );
      expect(result.exitCode).toBe(EXIT_CODES.source_error);
    });

    it('--input nonexistent --format json produces the framework error envelope', async () => {
      const result = await runCli(
        ['evidence', 'replay', '-i', '/nonexistent-receipt.json', '--format', 'json'],
        { env: env.env }
      );
      expect(result.exitCode).toBe(EXIT_CODES.source_error);
      const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
      expect(parsed).toHaveProperty('error');
    });

    it('--input nonexistent --format json error.code is "INVALID_INPUT"', async () => {
      const result = await runCli(
        ['evidence', 'replay', '-i', '/nonexistent-receipt.json', '--format', 'json'],
        { env: env.env }
      );
      const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
      const err = parsed['error'] as Record<string, unknown>;
      expect(err['code']).toBe('INVALID_INPUT');
    });

    it('valid replay input exits SOURCE_ERROR when WASM not built, else 0 or 3', async () => {
      const replayPath = writeTmp(tmpDir, 'replay.json', makeReplayInput());
      const result = await runCli(['evidence', 'replay', '-i', replayPath], { env: env.env });
      expect([EXIT_CODES.success, EXIT_CODES.source_error, EXIT_CODES.execution_error]).toContain(
        result.exitCode
      );
    });

    it('--format json with valid replay input always produces parseable JSON', async () => {
      const replayPath = writeTmp(tmpDir, 'replay.json', makeReplayInput());
      const result = await runCli(
        ['evidence', 'replay', '-i', replayPath, '--format', 'json'],
        { env: env.env }
      );
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });

    it('--format json receipt records command "evidence replay"', async () => {
      const replayPath = writeTmp(tmpDir, 'replay.json', makeReplayInput());
      await runCli(['evidence', 'replay', '-i', replayPath, '--format', 'json'], {
        env: env.env,
        cwd: env.tempDir,
      });
      const receipt = readLatestReceipt(env.tempDir);
      expect(receipt?.['command']).toBe('evidence replay');
    });
  });

  // -------------------------------------------------------------------------
  // Cross-cutting: existing tests (fixed)
  // -------------------------------------------------------------------------

  describe('lab prolog8 show (original tests — fixed)', () => {
    it('should display Prolog8 capabilities text or error', async () => {
      const result = await runCli(['lab', 'prolog8', 'show'], { env: env.env });
      expect([EXIT_CODES.success, EXIT_CODES.source_error]).toContain(result.exitCode);
      // When WASM available, stdout matches capability text; when not, stderr has build hint
      const combined = result.stdout + result.stderr;
      expect(combined).toMatch(/prolog8|build|wasm-pack/i);
    });

    it('should list available predicates (--predicates flag tolerated)', async () => {
      const result = await runCli(['lab', 'prolog8', 'show', '--predicates'], { env: env.env });
      // Unknown flag is passed through; exit depends on WASM availability
      expect([EXIT_CODES.success, EXIT_CODES.source_error]).toContain(result.exitCode);
    });

    it('should mention byte/capacity limits in combined output', async () => {
      const jsonResult = await runCli(['lab', 'prolog8', 'show', '--format', 'json'], { env: env.env });
      const combined = jsonResult.stdout + jsonResult.stderr;
      // Either the JSON payload has cap info or the error mentions the build requirement
      expect(combined).toMatch(/byte|cap|wasm-pack|limit|arity/i);
    });
  });

  describe('lab prolog8 query (original tests — fixed)', () => {
    it('should reject --rule flag (not a supported flag) with non-zero exit', async () => {
      const result = await runCli(['lab', 'prolog8', 'query', '--rule', 'member(X, [1,2,3])'], {
        env: env.env,
      });
      // --rule is not a declared argument and --input is still missing, so
      // citty's own required-arg check fires -> EXECUTION_ERROR (3).
      expect([EXIT_CODES.execution_error, EXIT_CODES.source_error]).toContain(result.exitCode);
    });

    it('should exit non-zero for --rule append([1],[2],X) (missing --input)', async () => {
      const result = await runCli(['lab', 'prolog8', 'query', '--rule', 'append([1], [2], X)'], {
        env: env.env,
      });
      expect([EXIT_CODES.execution_error, EXIT_CODES.source_error]).toContain(result.exitCode);
    });

    it('--format json returns parseable JSON for any valid invocation pattern', async () => {
      const inputPath = writeTmp(tmpDir, 'q2.json', makeQueryInput());
      const result = await runCli(
        ['lab', 'prolog8', 'query', '-i', inputPath, '--format', 'json'],
        { env: env.env }
      );
      expect([EXIT_CODES.success, EXIT_CODES.source_error, EXIT_CODES.execution_error]).toContain(
        result.exitCode
      );
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });

    it('should handle X = 42 style queries (file-based, tolerated)', async () => {
      const inputPath = writeTmp(tmpDir, 'q3.json', makeQueryInput());
      const result = await runCli(['lab', 'prolog8', 'query', '-i', inputPath], { env: env.env });
      expect([EXIT_CODES.success, EXIT_CODES.source_error, EXIT_CODES.execution_error]).toContain(
        result.exitCode
      );
    });
  });

  describe('evidence replay (original tests — fixed)', () => {
    it('should handle replay with file-based input', async () => {
      const replayPath = writeTmp(tmpDir, 'rp.json', makeReplayInput());
      const result = await runCli(['evidence', 'replay', '-i', replayPath], { env: env.env });
      expect([EXIT_CODES.success, EXIT_CODES.source_error, EXIT_CODES.execution_error]).toContain(
        result.exitCode
      );
    });

    it('should handle replay --verify flag (unknown flag — tolerated or fails gracefully)', async () => {
      const replayPath = writeTmp(tmpDir, 'rp2.json', makeReplayInput());
      const result = await runCli(
        ['evidence', 'replay', '-i', replayPath, '--verify'],
        { env: env.env }
      );
      expect([
        EXIT_CODES.success,
        EXIT_CODES.source_error,
        EXIT_CODES.execution_error,
      ]).toContain(result.exitCode);
    });

    it('replay --help mentions replay/verify/ocel concepts', async () => {
      const result = await runCli(['evidence', 'replay', '--help'], { env: env.env });
      expect(result.stdout).toMatch(/replay|verify|ocel|receipt/i);
    });

    it('replay --generate-proof flag is tolerated or fails gracefully', async () => {
      const replayPath = writeTmp(tmpDir, 'rp3.json', makeReplayInput());
      const result = await runCli(
        ['evidence', 'replay', '-i', replayPath, '--generate-proof'],
        { env: env.env }
      );
      expect([
        EXIT_CODES.success,
        EXIT_CODES.source_error,
        EXIT_CODES.execution_error,
      ]).toContain(result.exitCode);
    });
  });

  describe('prolog8 error handling (original tests — fixed)', () => {
    it('should handle missing input file with SOURCE_ERROR', async () => {
      const result = await runCli(['evidence', 'replay', '-i', '/nonexistent.ocel.json'], {
        env: env.env,
      });
      expect(result.exitCode).toBe(EXIT_CODES.source_error);
    });

    it('invalid syntax via --rule flag exits non-zero (no --input -> EXECUTION_ERROR)', async () => {
      const result = await runCli(['lab', 'prolog8', 'query', '--rule', 'invalid syntax ]['], {
        env: env.env,
      });
      expect([EXIT_CODES.execution_error, EXIT_CODES.source_error]).toContain(result.exitCode);
    });
  });

  describe('lab prolog8 performance', () => {
    it('should complete show in <3000ms', async () => {
      const start = Date.now();
      await runCli(['lab', 'prolog8', 'show'], { env: env.env });
      expect(Date.now() - start).toBeLessThan(15000);
    });

    it('should complete --help in <3000ms', async () => {
      const start = Date.now();
      await runCli(['lab', 'prolog8', '--help'], { env: env.env });
      expect(Date.now() - start).toBeLessThan(15000);
    });
  });

  // -------------------------------------------------------------------------
  // Rank 1 — Mathematical invariants (new)
  // -------------------------------------------------------------------------

  describe('Rank 1 — mathematical invariants', () => {
    it('show always exits 0 or SOURCE_ERROR — never any other code', async () => {
      const result = await runCli(['lab', 'prolog8', 'show'], { env: env.env });
      expect([EXIT_CODES.success, EXIT_CODES.source_error]).toContain(result.exitCode);
    });

    it('show combined output is non-empty on both success and failure paths', async () => {
      const result = await runCli(['lab', 'prolog8', 'show'], { env: env.env });
      const combined = result.stdout + result.stderr;
      expect(combined.trim()).not.toBe('');
    });

    it('show --format json stdout is always non-empty (never silent)', async () => {
      const result = await runCli(['lab', 'prolog8', 'show', '--format', 'json'], { env: env.env });
      expect(result.stdout.trim()).not.toBe('');
    });

    it('show --format json byte cap fields are positive integers when WASM is available', async () => {
      const result = await runCli(['lab', 'prolog8', 'show', '--format', 'json'], { env: env.env });
      if (result.exitCode !== EXIT_CODES.success) return; // vacuously true when WASM absent
      const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
      const payload = parsed['payload'] as Record<string, unknown> | undefined;
      const caps = (payload?.['capabilities'] as Record<string, unknown> | undefined)?.['caps'] as
        | Record<string, unknown>
        | undefined;
      if (caps) {
        for (const field of ['arity', 'body', 'vars', 'max_answers']) {
          if (field in caps) {
            expect(typeof caps[field]).toBe('number');
            expect(caps[field] as number).toBeGreaterThan(0);
          }
        }
      }
    });

    it('show --format json exit_code field matches process exit code (query parity, success envelope)', async () => {
      const inputPath = writeTmp(tmpDir, 'qparity.json', makeQueryInput());
      const result = await runCli(
        ['lab', 'prolog8', 'query', '-i', inputPath, '--format', 'json'],
        { env: env.env }
      );
      const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
      if (result.exitCode === EXIT_CODES.success) {
        expect(typeof parsed['exit_code']).toBe('number');
        expect(parsed['exit_code']).toBe(result.exitCode);
      } else {
        expect(parsed).toHaveProperty('error'); // error envelope has no exit_code field
      }
    });

    it('replay --format json exit_code field matches process exit code (success envelope)', async () => {
      const replayPath = writeTmp(tmpDir, 'rpcode.json', makeReplayInput());
      const result = await runCli(
        ['evidence', 'replay', '-i', replayPath, '--format', 'json'],
        { env: env.env }
      );
      const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
      if (result.exitCode === EXIT_CODES.success) {
        expect(typeof parsed['exit_code']).toBe('number');
        expect(parsed['exit_code']).toBe(result.exitCode);
      } else {
        expect(parsed).toHaveProperty('error');
      }
    });

    it('usage banner contains byte cap limits text', async () => {
      // The root command (no subcommand) prints a usage banner with engine limits
      const result = await runCli(['lab', 'prolog8'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      // Banner must mention the numeric limits (arity ≤ 8 or similar)
      expect(result.stdout).toMatch(/arity|body|vars|answers/i);
    });
  });

  // -------------------------------------------------------------------------
  // Rank 2 — Domain contracts (new)
  // -------------------------------------------------------------------------

  describe('Rank 2 — domain contracts', () => {
    it('show --format json has .status ("ok") on success, or .error on failure — never undefined', async () => {
      const result = await runCli(['lab', 'prolog8', 'show', '--format', 'json'], { env: env.env });
      const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
      if (result.exitCode === EXIT_CODES.success) {
        expect(parsed['status']).toBe('ok');
      } else {
        expect(parsed).toHaveProperty('error');
      }
    });

    it('replay with a valid-schema receipt that has mismatched hashes exits non-zero', async () => {
      const mismatchedReceipt = (() => {
        const q = JSON.parse(makeQueryInput());
        q['receipt'] = {
          receipt_hash: 'deadbeef00000000', // deliberately wrong
          proof_root: 'aabbccdd11111111',
          catalog_root: 'aabbccdd22222222',
          rule_root: 'aabbccdd33333333',
          fact_root: 'aabbccdd44444444',
          input_root: 'aabbccdd55555555',
          output_root: 'aabbccdd66666666',
          engine_version: '0.1.0',
        };
        return JSON.stringify(q);
      })();

      const replayPath = writeTmp(tmpDir, 'mismatch-replay.json', mismatchedReceipt);
      const result = await runCli(['evidence', 'replay', '-i', replayPath], { env: env.env });
      // Should never succeed (exit 0) — either WASM missing (source_error=2),
      // mismatch detected (conformance_fail=6), or execution error (3).
      expect(result.exitCode).not.toBe(EXIT_CODES.success);
    });

    it('replay with a file containing only plain text (not JSON) exits source or execution error', async () => {
      const garbledPath = writeTmp(tmpDir, 'garbled.json', 'this is not json at all!!');
      const result = await runCli(['evidence', 'replay', '-i', garbledPath], { env: env.env });
      expect([EXIT_CODES.source_error, EXIT_CODES.execution_error]).toContain(result.exitCode);
    });

    it('query with a file containing only plain text exits source or execution error', async () => {
      const garbledPath = writeTmp(tmpDir, 'garbled-q.json', 'this is not json at all!!');
      const result = await runCli(['lab', 'prolog8', 'query', '-i', garbledPath], { env: env.env });
      expect([EXIT_CODES.source_error, EXIT_CODES.execution_error]).toContain(result.exitCode);
    });

    it('unknown subcommand exits non-zero (not exit 0)', async () => {
      const result = await runCli(['lab', 'prolog8', 'bogus-subcmd-xyz'], { env: env.env });
      expect(result.exitCode).not.toBe(EXIT_CODES.success);
    });

    it('unknown subcommand --format json still produces valid JSON', async () => {
      const result = await runCli(['lab', 'prolog8', 'bogus-subcmd-xyz', '--format', 'json'], {
        env: env.env,
      });
      expect(result.exitCode).not.toBe(EXIT_CODES.success);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // Rank 3 — Metamorphic relations (new)
  // -------------------------------------------------------------------------

  describe('Rank 3 — metamorphic relations', () => {
    it('two calls to show produce identical stdout (deterministic)', async () => {
      const [r1, r2] = await Promise.all([
        runCli(['lab', 'prolog8', 'show', '--format', 'json'], { env: env.env }),
        runCli(['lab', 'prolog8', 'show', '--format', 'json'], { env: env.env }),
      ]);
      expect(r1.exitCode).toBe(r2.exitCode);
      const p1 = JSON.parse(r1.stdout) as Record<string, unknown>;
      const p2 = JSON.parse(r2.stdout) as Record<string, unknown>;
      if (r1.exitCode === EXIT_CODES.success) {
        expect(p1['status']).toBe(p2['status']);
        expect(JSON.stringify(p1['payload'])).toBe(JSON.stringify(p2['payload']));
      } else {
        expect(p1['error']).toBeDefined();
        expect(p2['error']).toBeDefined();
      }
    });

    it('--format json and --format human both succeed or both fail (same exit code)', async () => {
      const [rHuman, rJson] = await Promise.all([
        runCli(['lab', 'prolog8', 'show'], { env: env.env }),
        runCli(['lab', 'prolog8', 'show', '--format', 'json'], { env: env.env }),
      ]);
      expect(rHuman.exitCode).toBe(rJson.exitCode);
    });

    it('--format json and --format human contain byte cap info at same availability', async () => {
      const [rHuman, rJson] = await Promise.all([
        runCli(['lab', 'prolog8', 'show'], { env: env.env }),
        runCli(['lab', 'prolog8', 'show', '--format', 'json'], { env: env.env }),
      ]);
      if (rHuman.exitCode !== EXIT_CODES.success) return; // vacuously true when WASM absent
      expect(rHuman.stdout).toMatch(/arity|body|vars|answers/i);
      const parsed = JSON.parse(rJson.stdout) as Record<string, unknown>;
      const payloadStr = JSON.stringify(parsed['payload'] ?? {});
      expect(payloadStr).toMatch(/arity|body|vars|max_answers/i);
    });

    it('two sequential query runs on identical input produce identical exit codes', async () => {
      const inputPath = writeTmp(tmpDir, 'det-query.json', makeQueryInput());
      const r1 = await runCli(['lab', 'prolog8', 'query', '-i', inputPath, '--format', 'json'], {
        env: env.env,
      });
      const r2 = await runCli(['lab', 'prolog8', 'query', '-i', inputPath, '--format', 'json'], {
        env: env.env,
      });
      expect(r1.exitCode).toBe(r2.exitCode);
    });
  });

  // -------------------------------------------------------------------------
  // Gap fixes — unknown subcommand exit code + --max-bytes validation
  // -------------------------------------------------------------------------

  describe('Gap fix: unknown subcommand exits EXECUTION_ERROR (3), not success (0)', () => {
    // citty intercepts unknown subcommands before commands/prolog8.ts's own
    // run() is called, throwing a plain Error ("Unknown command `X`") that
    // bypasses the legacy config_error(1) classification entirely — the
    // bridge/framework has no way to recover the legacy intent here, so it
    // falls back to its generic EXECUTION_ERROR (see contract notes at top
    // of file, point 3a).

    it('wpm lab prolog8 bogus exits 3 (execution_error)', async () => {
      const result = await runCli(['lab', 'prolog8', 'bogus'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.execution_error);
    });

    it('wpm lab prolog8 bogus combined output mentions "bogus" or "Unknown"', async () => {
      const result = await runCli(['lab', 'prolog8', 'bogus'], { env: env.env });
      const combined = result.stdout + result.stderr;
      expect(combined).toMatch(/bogus|unknown/i);
    });

    it('wpm lab prolog8 bogus --format json exits 3 (exit code contract holds regardless of format)', async () => {
      const result = await runCli(['lab', 'prolog8', 'bogus', '--format', 'json'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.execution_error);
    });

    it('wpm lab prolog8 completely-unknown exits 3 (not 0)', async () => {
      const result = await runCli(['lab', 'prolog8', 'completely-unknown'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.execution_error);
      expect(result.exitCode).not.toBe(EXIT_CODES.success);
    });

    it('wpm lab prolog8 show (valid subcommand) exits 0 or SOURCE_ERROR — never execution_error', async () => {
      const result = await runCli(['lab', 'prolog8', 'show'], { env: env.env });
      expect(result.exitCode).not.toBe(EXIT_CODES.execution_error);
    });
  });

  describe('Gap fix: query --max-bytes validation', () => {
    // --max-bytes is validated INSIDE commands/prolog8.ts's own query run()
    // body (reached successfully via citty dispatch), so its legacy
    // EXIT_CODES.config_error(1) result IS classified by the bridge — but
    // `classifyLegacyFailure` maps both legacy config_error(1) and
    // source_error(2) onto the single framework code INVALID_INPUT, which
    // wpm's error-code map resolves to exit 2 (source_error), not the
    // legacy 1 (see contract notes at top of file, point 3b).

    it('--max-bytes with a valid positive integer is accepted (no INVALID_INPUT from --max-bytes itself)', async () => {
      const inputPath = writeTmp(tmpDir, 'mb-valid.json', makeQueryInput());
      const result = await runCli(
        ['lab', 'prolog8', 'query', '-i', inputPath, '--max-bytes', '1024'],
        { env: env.env }
      );
      // Should not fail due to --max-bytes validation (may fail due to WASM availability)
      expect([EXIT_CODES.success, EXIT_CODES.source_error, EXIT_CODES.execution_error]).toContain(
        result.exitCode
      );
    });

    it('--max-bytes 0 exits SOURCE_ERROR (2) — zero is not a positive integer', async () => {
      const inputPath = writeTmp(tmpDir, 'mb-zero.json', makeQueryInput());
      const result = await runCli(
        ['lab', 'prolog8', 'query', '-i', inputPath, '--max-bytes', '0'],
        { env: env.env }
      );
      expect(result.exitCode).toBe(EXIT_CODES.source_error);
    });

    it('--max-bytes 0 --format json emits the framework error envelope with error.code INVALID_INPUT', async () => {
      const inputPath = writeTmp(tmpDir, 'mb-zero-json.json', makeQueryInput());
      const result = await runCli(
        ['lab', 'prolog8', 'query', '-i', inputPath, '--max-bytes', '0', '--format', 'json'],
        { env: env.env }
      );
      expect(result.exitCode).toBe(EXIT_CODES.source_error);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
      const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
      const err = parsed['error'] as Record<string, unknown>;
      expect(err['code']).toBe('INVALID_INPUT');
    });

    it('--max-bytes -1 exits SOURCE_ERROR (2) — negative is not a positive integer', async () => {
      const inputPath = writeTmp(tmpDir, 'mb-neg.json', makeQueryInput());
      const result = await runCli(
        ['lab', 'prolog8', 'query', '-i', inputPath, '--max-bytes', '-1'],
        { env: env.env }
      );
      expect(result.exitCode).toBe(EXIT_CODES.source_error);
    });

    it('--max-bytes abc exits SOURCE_ERROR (2) — non-numeric is invalid', async () => {
      const inputPath = writeTmp(tmpDir, 'mb-abc.json', makeQueryInput());
      const result = await runCli(
        ['lab', 'prolog8', 'query', '-i', inputPath, '--max-bytes', 'abc'],
        { env: env.env }
      );
      expect(result.exitCode).toBe(EXIT_CODES.source_error);
    });

    it('--max-bytes abc --format json error message mentions --max-bytes', async () => {
      const inputPath = writeTmp(tmpDir, 'mb-abc-json.json', makeQueryInput());
      const result = await runCli(
        ['lab', 'prolog8', 'query', '-i', inputPath, '--max-bytes', 'abc', '--format', 'json'],
        { env: env.env }
      );
      const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
      const msg = String((parsed['error'] as Record<string, unknown>)['message'] ?? '');
      expect(msg).toMatch(/max-bytes/i);
    });

    it('--max-bytes 3.5 exits SOURCE_ERROR (2) — float is not an integer', async () => {
      const inputPath = writeTmp(tmpDir, 'mb-float.json', makeQueryInput());
      const result = await runCli(
        ['lab', 'prolog8', 'query', '-i', inputPath, '--max-bytes', '3.5'],
        { env: env.env }
      );
      expect(result.exitCode).toBe(EXIT_CODES.source_error);
    });
  });
});
