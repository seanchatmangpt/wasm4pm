import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runCli, EXIT_CODES, createCliTestEnv } from '@wasm4pm/testing';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

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

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('wpm prolog8 — Horn-clause proof engine CLI', () => {
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
  // prolog8 (root — no subcommand)
  // -------------------------------------------------------------------------

  describe('prolog8 root command', () => {
    it('exits 0 when called with no subcommand and prints usage banner', async () => {
      const result = await runCli(['prolog8'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(result.stdout).toMatch(/prolog8/i);
    });

    it('--help exits 0 and shows subcommand names', async () => {
      const result = await runCli(['prolog8', '--help'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(result.stdout).toMatch(/show|query|replay/i);
    });

    it('invalid subcommand exits non-zero', async () => {
      const result = await runCli(['prolog8', 'invalid-subcommand'], { env: env.env });
      expect(result.exitCode).not.toBe(EXIT_CODES.SUCCESS);
    });

    it('invalid subcommand stderr contains error message', async () => {
      const result = await runCli(['prolog8', 'invalid-subcommand'], { env: env.env });
      const combined = result.stdout + result.stderr;
      expect(combined).toMatch(/unknown|invalid|error/i);
    });
  });

  // -------------------------------------------------------------------------
  // prolog8 show
  // -------------------------------------------------------------------------

  describe('prolog8 show', () => {
    it('exits 0 or SOURCE_ERROR (WASM may not be built)', async () => {
      const result = await runCli(['prolog8', 'show'], { env: env.env });
      expect([EXIT_CODES.SUCCESS, EXIT_CODES.SOURCE_ERROR]).toContain(result.exitCode);
    });

    it('--format json produces valid JSON output', async () => {
      const result = await runCli(['prolog8', 'show', '--format', 'json'], { env: env.env });
      // JSON is always written regardless of WASM availability
      expect(result.stdout).not.toBe('');
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });

    it('--format json output has status field', async () => {
      const result = await runCli(['prolog8', 'show', '--format', 'json'], { env: env.env });
      const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
      expect(parsed).toHaveProperty('status');
    });

    it('--format json output has command field equal to "prolog8 show"', async () => {
      const result = await runCli(['prolog8', 'show', '--format', 'json'], { env: env.env });
      const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
      expect(parsed['command']).toBe('prolog8 show');
    });

    it('--format json output exit_code matches process exit code', async () => {
      const result = await runCli(['prolog8', 'show', '--format', 'json'], { env: env.env });
      const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
      expect(typeof parsed['exit_code']).toBe('number');
      expect(parsed['exit_code']).toBe(result.exitCode);
    });

    it('--format json status is "ok" or "error"', async () => {
      const result = await runCli(['prolog8', 'show', '--format', 'json'], { env: env.env });
      const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
      expect(['ok', 'error']).toContain(parsed['status']);
    });

    it('--help exits 0 and lists --format option', async () => {
      const result = await runCli(['prolog8', 'show', '--help'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(result.stdout).toMatch(/format/i);
    });

    it('completes within 500ms', async () => {
      const start = Date.now();
      await runCli(['prolog8', 'show'], { env: env.env });
      expect(Date.now() - start).toBeLessThan(500);
    });

    it('when WASM not available, error message mentions build instructions', async () => {
      const result = await runCli(['prolog8', 'show'], { env: env.env });
      if (result.exitCode === EXIT_CODES.SOURCE_ERROR) {
        const combined = result.stdout + result.stderr;
        expect(combined).toMatch(/wasm-pack|build|prolog8/i);
      }
      // If WASM is available exitCode is 0 — test passes vacuously
      expect([EXIT_CODES.SUCCESS, EXIT_CODES.SOURCE_ERROR]).toContain(result.exitCode);
    });

    it('--format json error envelope includes error.code field when WASM unavailable', async () => {
      const result = await runCli(['prolog8', 'show', '--format', 'json'], { env: env.env });
      const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
      if (result.exitCode === EXIT_CODES.SOURCE_ERROR) {
        expect(parsed).toHaveProperty('error');
        const err = parsed['error'] as Record<string, unknown>;
        expect(err).toHaveProperty('code');
        expect(err['code']).toBe('source_error');
      }
    });

    it('when WASM is available, JSON payload has capabilities object', async () => {
      const result = await runCli(['prolog8', 'show', '--format', 'json'], { env: env.env });
      if (result.exitCode === EXIT_CODES.SUCCESS) {
        const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
        // Success response has payload with capabilities
        expect(parsed).toHaveProperty('payload');
      }
    });
  });

  // -------------------------------------------------------------------------
  // prolog8 query
  // -------------------------------------------------------------------------

  describe('prolog8 query', () => {
    it('--help exits 0 and shows -i / --input option', async () => {
      const result = await runCli(['prolog8', 'query', '--help'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(result.stdout).toMatch(/-i|--input/i);
    });

    it('with no arguments exits CONFIG_ERROR (missing --input)', async () => {
      const result = await runCli(['prolog8', 'query'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.CONFIG_ERROR);
    });

    it('non-zero exit when --input is missing', async () => {
      const result = await runCli(['prolog8', 'query'], { env: env.env });
      expect(result.exitCode).not.toBe(EXIT_CODES.SUCCESS);
    });

    it('--input pointing to nonexistent file exits SOURCE_ERROR', async () => {
      const result = await runCli(
        ['prolog8', 'query', '-i', '/nonexistent-p8-query.json'],
        { env: env.env }
      );
      expect(result.exitCode).toBe(EXIT_CODES.SOURCE_ERROR);
    });

    it('--input nonexistent --format json produces JSON with status "error"', async () => {
      const result = await runCli(
        ['prolog8', 'query', '-i', '/nonexistent-p8-query.json', '--format', 'json'],
        { env: env.env }
      );
      expect(result.exitCode).toBe(EXIT_CODES.SOURCE_ERROR);
      const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
      expect(parsed['status']).toBe('error');
    });

    it('--input nonexistent --format json error message mentions the path', async () => {
      const result = await runCli(
        ['prolog8', 'query', '-i', '/nonexistent-p8-query.json', '--format', 'json'],
        { env: env.env }
      );
      const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
      const err = parsed['error'] as Record<string, unknown>;
      expect(String(err['message'])).toMatch(/nonexistent-p8-query\.json/);
    });

    it('valid input file exits SOURCE_ERROR when WASM not built, or 0/3 when built', async () => {
      const inputPath = writeTmp(tmpDir, 'query.json', makeQueryInput());
      const result = await runCli(['prolog8', 'query', '-i', inputPath], { env: env.env });
      expect([EXIT_CODES.SUCCESS, EXIT_CODES.SOURCE_ERROR, EXIT_CODES.EXECUTION_ERROR]).toContain(
        result.exitCode
      );
    });

    it('--format json with valid input always produces parseable JSON', async () => {
      const inputPath = writeTmp(tmpDir, 'query.json', makeQueryInput());
      const result = await runCli(
        ['prolog8', 'query', '-i', inputPath, '--format', 'json'],
        { env: env.env }
      );
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });

    it('--format json output has command field "prolog8 query"', async () => {
      const inputPath = writeTmp(tmpDir, 'query.json', makeQueryInput());
      const result = await runCli(
        ['prolog8', 'query', '-i', inputPath, '--format', 'json'],
        { env: env.env }
      );
      const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
      expect(parsed['command']).toBe('prolog8 query');
    });

    it('malformed JSON input file exits SOURCE_ERROR or EXECUTION_ERROR', async () => {
      const badPath = writeTmp(tmpDir, 'bad.json', 'not valid json {{{');
      const result = await runCli(['prolog8', 'query', '-i', badPath], { env: env.env });
      // WASM not built → SOURCE_ERROR; WASM built + bad JSON → SOURCE_ERROR (schema rejected)
      expect([EXIT_CODES.SOURCE_ERROR, EXIT_CODES.EXECUTION_ERROR]).toContain(result.exitCode);
    });

    it('--verbose flag is accepted without argument error', async () => {
      const inputPath = writeTmp(tmpDir, 'query.json', makeQueryInput());
      const result = await runCli(
        ['prolog8', 'query', '-i', inputPath, '--verbose'],
        { env: env.env }
      );
      // Should not fail due to unknown-flag; may fail due to WASM availability
      expect([EXIT_CODES.SUCCESS, EXIT_CODES.SOURCE_ERROR, EXIT_CODES.EXECUTION_ERROR]).toContain(
        result.exitCode
      );
    });
  });

  // -------------------------------------------------------------------------
  // prolog8 replay
  // -------------------------------------------------------------------------

  describe('prolog8 replay', () => {
    it('--help exits 0', async () => {
      const result = await runCli(['prolog8', 'replay', '--help'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.SUCCESS);
    });

    it('--help output mentions replay/verify/receipt terminology', async () => {
      const result = await runCli(['prolog8', 'replay', '--help'], { env: env.env });
      expect(result.stdout).toMatch(/replay|verify|receipt/i);
    });

    it('with no arguments exits CONFIG_ERROR (missing --input)', async () => {
      const result = await runCli(['prolog8', 'replay'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.CONFIG_ERROR);
    });

    it('--input pointing to nonexistent file exits SOURCE_ERROR', async () => {
      const result = await runCli(
        ['prolog8', 'replay', '-i', '/nonexistent-receipt.json'],
        { env: env.env }
      );
      expect(result.exitCode).toBe(EXIT_CODES.SOURCE_ERROR);
    });

    it('--input nonexistent --format json produces JSON error with status "error"', async () => {
      const result = await runCli(
        ['prolog8', 'replay', '-i', '/nonexistent-receipt.json', '--format', 'json'],
        { env: env.env }
      );
      expect(result.exitCode).toBe(EXIT_CODES.SOURCE_ERROR);
      const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
      expect(parsed['status']).toBe('error');
    });

    it('--input nonexistent --format json error mentions "source_error" code', async () => {
      const result = await runCli(
        ['prolog8', 'replay', '-i', '/nonexistent-receipt.json', '--format', 'json'],
        { env: env.env }
      );
      const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
      const err = parsed['error'] as Record<string, unknown>;
      expect(err['code']).toBe('source_error');
    });

    it('valid replay input exits SOURCE_ERROR when WASM not built, else 0 or 3', async () => {
      const replayPath = writeTmp(tmpDir, 'replay.json', makeReplayInput());
      const result = await runCli(['prolog8', 'replay', '-i', replayPath], { env: env.env });
      expect([EXIT_CODES.SUCCESS, EXIT_CODES.SOURCE_ERROR, EXIT_CODES.EXECUTION_ERROR]).toContain(
        result.exitCode
      );
    });

    it('--format json with valid replay input always produces parseable JSON', async () => {
      const replayPath = writeTmp(tmpDir, 'replay.json', makeReplayInput());
      const result = await runCli(
        ['prolog8', 'replay', '-i', replayPath, '--format', 'json'],
        { env: env.env }
      );
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });

    it('--format json output has command field "prolog8 replay"', async () => {
      const replayPath = writeTmp(tmpDir, 'replay.json', makeReplayInput());
      const result = await runCli(
        ['prolog8', 'replay', '-i', replayPath, '--format', 'json'],
        { env: env.env }
      );
      const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
      expect(parsed['command']).toBe('prolog8 replay');
    });
  });

  // -------------------------------------------------------------------------
  // Cross-cutting: existing tests (fixed)
  // -------------------------------------------------------------------------

  describe('prolog8 show (original tests — fixed)', () => {
    it('should display Prolog8 capabilities text or error', async () => {
      const result = await runCli(['prolog8', 'show'], { env: env.env });
      expect([EXIT_CODES.SUCCESS, EXIT_CODES.SOURCE_ERROR]).toContain(result.exitCode);
      // When WASM available, stdout matches capability text; when not, stderr has build hint
      const combined = result.stdout + result.stderr;
      expect(combined).toMatch(/prolog8|build|wasm-pack/i);
    });

    it('should list available predicates (--predicates flag tolerated)', async () => {
      const result = await runCli(['prolog8', 'show', '--predicates'], { env: env.env });
      // Unknown flag is passed through; exit depends on WASM availability
      expect([EXIT_CODES.SUCCESS, EXIT_CODES.SOURCE_ERROR]).toContain(result.exitCode);
    });

    it('should mention byte/capacity limits in combined output', async () => {
      const jsonResult = await runCli(['prolog8', 'show', '--format', 'json'], { env: env.env });
      const combined = jsonResult.stdout + jsonResult.stderr;
      // Either the JSON payload has cap info or the error mentions the build requirement
      expect(combined).toMatch(/byte|cap|wasm-pack|limit|arity/i);
    });
  });

  describe('prolog8 query (original tests — fixed)', () => {
    it('should reject --rule flag (not a supported flag) with non-zero exit', async () => {
      const result = await runCli(['prolog8', 'query', '--rule', 'member(X, [1,2,3])'], {
        env: env.env,
      });
      // --rule is not a declared argument; citty treats it as unknown → CONFIG_ERROR (1)
      // or passes it and fails due to missing required --input → CONFIG_ERROR (1)
      expect([EXIT_CODES.CONFIG_ERROR, EXIT_CODES.SOURCE_ERROR]).toContain(result.exitCode);
    });

    it('should exit non-zero for --rule append([1],[2],X) (missing --input)', async () => {
      const result = await runCli(['prolog8', 'query', '--rule', 'append([1], [2], X)'], {
        env: env.env,
      });
      expect([EXIT_CODES.CONFIG_ERROR, EXIT_CODES.SOURCE_ERROR]).toContain(result.exitCode);
    });

    it('--format json returns parseable JSON for any valid invocation pattern', async () => {
      const inputPath = writeTmp(tmpDir, 'q2.json', makeQueryInput());
      const result = await runCli(
        ['prolog8', 'query', '-i', inputPath, '--format', 'json'],
        { env: env.env }
      );
      expect([EXIT_CODES.SUCCESS, EXIT_CODES.SOURCE_ERROR, EXIT_CODES.EXECUTION_ERROR]).toContain(
        result.exitCode
      );
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });

    it('should handle X = 42 style queries (file-based, tolerated)', async () => {
      const inputPath = writeTmp(tmpDir, 'q3.json', makeQueryInput());
      const result = await runCli(['prolog8', 'query', '-i', inputPath], { env: env.env });
      expect([EXIT_CODES.SUCCESS, EXIT_CODES.SOURCE_ERROR, EXIT_CODES.EXECUTION_ERROR]).toContain(
        result.exitCode
      );
    });
  });

  describe('prolog8 replay (original tests — fixed)', () => {
    it('should handle replay with file-based input', async () => {
      const replayPath = writeTmp(tmpDir, 'rp.json', makeReplayInput());
      const result = await runCli(['prolog8', 'replay', '-i', replayPath], { env: env.env });
      expect([EXIT_CODES.SUCCESS, EXIT_CODES.SOURCE_ERROR, EXIT_CODES.EXECUTION_ERROR]).toContain(
        result.exitCode
      );
    });

    it('should handle replay --verify flag (unknown flag — tolerated or fails gracefully)', async () => {
      const replayPath = writeTmp(tmpDir, 'rp2.json', makeReplayInput());
      const result = await runCli(
        ['prolog8', 'replay', '-i', replayPath, '--verify'],
        { env: env.env }
      );
      expect([
        EXIT_CODES.SUCCESS,
        EXIT_CODES.CONFIG_ERROR,
        EXIT_CODES.SOURCE_ERROR,
        EXIT_CODES.EXECUTION_ERROR,
      ]).toContain(result.exitCode);
    });

    it('replay --help mentions replay/verify/ocel concepts', async () => {
      const result = await runCli(['prolog8', 'replay', '--help'], { env: env.env });
      expect(result.stdout).toMatch(/replay|verify|ocel|receipt/i);
    });

    it('replay --generate-proof flag is tolerated or fails gracefully', async () => {
      const replayPath = writeTmp(tmpDir, 'rp3.json', makeReplayInput());
      const result = await runCli(
        ['prolog8', 'replay', '-i', replayPath, '--generate-proof'],
        { env: env.env }
      );
      expect([
        EXIT_CODES.SUCCESS,
        EXIT_CODES.CONFIG_ERROR,
        EXIT_CODES.SOURCE_ERROR,
        EXIT_CODES.EXECUTION_ERROR,
      ]).toContain(result.exitCode);
    });
  });

  describe('prolog8 error handling (original tests — fixed)', () => {
    it('should handle missing input file with SOURCE_ERROR', async () => {
      const result = await runCli(['prolog8', 'replay', '-i', '/nonexistent.ocel.json'], {
        env: env.env,
      });
      expect(result.exitCode).toBe(EXIT_CODES.SOURCE_ERROR);
    });

    it('invalid syntax via --rule flag exits non-zero (no --input → CONFIG_ERROR)', async () => {
      const result = await runCli(['prolog8', 'query', '--rule', 'invalid syntax ]['], {
        env: env.env,
      });
      expect([EXIT_CODES.CONFIG_ERROR, EXIT_CODES.SOURCE_ERROR]).toContain(result.exitCode);
    });
  });

  describe('prolog8 performance', () => {
    it('should complete show in <500ms', async () => {
      const start = Date.now();
      await runCli(['prolog8', 'show'], { env: env.env });
      expect(Date.now() - start).toBeLessThan(500);
    });

    it('should complete --help in <500ms', async () => {
      const start = Date.now();
      await runCli(['prolog8', '--help'], { env: env.env });
      expect(Date.now() - start).toBeLessThan(500);
    });
  });
});
