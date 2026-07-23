/**
 * `wpm run` was retired; the hard-break table (nouns/_removed.ts) forwards it
 * to `wpm model discover` (apps/wasm4pm/src/nouns/model/discover.ts), a
 * from-scratch re-derivation — NOT a bridge over the old `commands/run.ts` —
 * with a deliberately much narrower surface (defect #1 fix: no silent
 * *format-crossing* fallback — an OCEL algorithm id never silently
 * substitutes a different one just because the input turned out to be an
 * event log, or vice versa. Short same-algorithm CLI aliases like
 * "heuristic" -> "heuristic_miner" ARE still resolved, via the shared
 * `resolveAlgorithmId()` table — confirmed live against the built CLI).
 * Confirmed live
 * against the built CLI (`--help`) that the following old `run` flags simply
 * do not exist on `model discover` and are silently ignored by citty (no
 * error, no effect): `--file`/`-i`, `--output`/`-o`, `--no-save`,
 * `--with-quality`, `--assert-fitness`, `--assert-precision`,
 * `--set-baseline`, `--assert-improvement`, `--preflight`, `--stream`,
 * `--no-retry`, `--simd`, `--hierarchical`, `--smart-engine`, `--no-cache`,
 * `--cache-stats`, `--config`, `--timeout`, `--format`, `--verbose`/`-v`,
 * `--quiet`/`-q`. `model discover` only accepts: positional `input`,
 * `--algorithm`/`-a`, `--activity-key`, `--case-id-key`, `--timestamp-key`,
 * plus the framework's own `--human`/`--introspect`. Output is always a
 * single JSON value on stdout (no `--format` needed or honored); errors are
 * `{error:{code,message}}`, never the old `{command,status,payload,meta}`
 * envelope. This file is rewritten to test that narrower, intentional
 * contract rather than the removed surface.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runCli, EXIT_CODES, createCliTestEnv } from '@wasm4pm/testing';
import * as path from 'path';
import * as fs from 'fs/promises';

describe('wpm model discover — process discovery CLI (was: wpm run)', () => {
  let env: Awaited<ReturnType<typeof createCliTestEnv>>;
  let testXesPath: string;

  beforeEach(async () => {
    env = await createCliTestEnv();
    const fixtureSource = path.resolve(process.cwd(), 'test/fixtures/small.xes');
    testXesPath = path.join(env.tempDir, 'test.xes');
    try {
      await fs.copyFile(fixtureSource, testXesPath);
    } catch (error) {
      const minimalXes = `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0" xmlns="http://www.xes-standard.org/">
  <trace>
    <string key="concept:name" value="case-1"/>
    <event>
      <string key="concept:name" value="Start"/>
      <date key="time:timestamp" value="2026-04-16T10:00:00Z"/>
    </event>
    <event>
      <string key="concept:name" value="End"/>
      <date key="time:timestamp" value="2026-04-16T10:01:00Z"/>
    </event>
  </trace>
</log>`;
      await fs.writeFile(testXesPath, minimalXes, 'utf-8');
    }
  });

  afterEach(() => {
    env?.cleanup?.();
  });

  describe('model discover (base command)', () => {
    it('should require input file', async () => {
      const result = await runCli(['model', 'discover']);
      expect(result.exitCode).toBe(EXIT_CODES.source_error);
      const parsed = JSON.parse(result.stdout) as { error?: { code?: string; message?: string } };
      expect(parsed.error?.code).toBe('INVALID_INPUT');
      expect(result.stderr + result.stdout).toMatch(/input|file/i);
    });

    it('should reject missing input file', async () => {
      const result = await runCli(['model', 'discover', '/nonexistent/log.xes']);
      expect(result.exitCode).toBe(EXIT_CODES.source_error);
    });

    it('should show help text', async () => {
      const result = await runCli(['model', 'discover', '--help']);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatch(/discover|xes|algorithm|process/i);
    });
  });

  describe('model discover with XES input', () => {
    it('should accept positional input path', async () => {
      const result = await runCli(['model', 'discover', testXesPath]);
      expect(result.exitCode).toBe(0);
      const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
      expect(typeof parsed.algorithm).toBe('string');
      expect(parsed.format).toBe('xes');
    });

    it('--file/-i are not recognized by model discover: input must be positional', async () => {
      // `model discover` has no `--file`/`-i` alias for input (unlike the
      // retired `run`); passing them has no effect and the positional
      // `input` stays undefined, so this now exits source_error.
      const result = await runCli(['model', 'discover', '--file', testXesPath]);
      expect(result.exitCode).toBe(EXIT_CODES.source_error);
      const result2 = await runCli(['model', 'discover', '-i', testXesPath]);
      expect(result2.exitCode).toBe(EXIT_CODES.source_error);
    });
  });

  describe('model discover --algorithm', () => {
    it('should accept dfg algorithm', async () => {
      const result = await runCli(['model', 'discover', testXesPath, '--algorithm', 'dfg']);
      expect(result.exitCode).toBe(0);
      const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
      expect(parsed.algorithm).toBe('dfg');
    });

    it('should accept -a shorthand for algorithm', async () => {
      const result = await runCli(['model', 'discover', testXesPath, '-a', 'dfg']);
      expect(result.exitCode).toBe(0);
      const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
      expect(parsed.algorithm).toBe('dfg');
    });

    it('should accept heuristic_miner algorithm (canonical full id)', async () => {
      const result = await runCli(['model', 'discover', testXesPath, '--algorithm', 'heuristic_miner']);
      expect(result.exitCode).toBe(0);
      const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
      expect(parsed.algorithm).toBe('heuristic_miner');
    });

    it('should accept ilp algorithm', async () => {
      const result = await runCli(['model', 'discover', testXesPath, '--algorithm', 'ilp']);
      expect(result.exitCode).toBe(0);
      const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
      expect(parsed.algorithm).toBe('ilp');
    });

    it('should accept alpha_plus_plus algorithm (canonical full id)', async () => {
      const result = await runCli(['model', 'discover', testXesPath, '--algorithm', 'alpha_plus_plus']);
      expect(result.exitCode).toBe(0);
      const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
      expect(parsed.algorithm).toBe('alpha_plus_plus');
    });

    it('should reject invalid algorithm', async () => {
      const result = await runCli(['model', 'discover', testXesPath, '--algorithm', 'invalid-algo']);
      expect(result.exitCode).toBe(EXIT_CODES.source_error);
      const parsed = JSON.parse(result.stdout) as { error?: { code?: string; message?: string } };
      expect(parsed.error?.code).toBe('INVALID_INPUT');
      expect(parsed.error?.message).toMatch(/Unknown algorithm/i);
    });

    it('accepts the short CLI aliases "heuristic" and "alpha" via the shared resolveAlgorithmId table', async () => {
      // `engines/algorithms.ts`'s `resolveId()` tries an exact id match,
      // then `@wasm4pm/contracts`'s shared `resolveAlgorithmId()` /
      // `ALGORITHM_CLI_ALIASES` table (short aliases like "heuristic" ->
      // "heuristic_miner", "alpha" -> "alpha_plus_plus"), then a
      // `-`/`_`-insensitive normalized match — confirmed live against the
      // built CLI. Unlike defect #1's fix (no *silent format-substitution*
      // fallback for OCEL ids), a short, explicitly-tabled alias for the
      // *same* algorithm is still resolved, it just never falls back to a
      // *different* algorithm than the one requested.
      const r1 = await runCli(['model', 'discover', testXesPath, '--algorithm', 'heuristic']);
      expect(r1.exitCode).toBe(0);
      expect((JSON.parse(r1.stdout) as Record<string, unknown>).algorithm).toBe('heuristic_miner');
      const r2 = await runCli(['model', 'discover', testXesPath, '--algorithm', 'alpha']);
      expect(r2.exitCode).toBe(0);
      expect((JSON.parse(r2.stdout) as Record<string, unknown>).algorithm).toBe('alpha_plus_plus');
    });

    it('should suggest alternatives for typos', async () => {
      const result = await runCli(['model', 'discover', testXesPath, '--algorithm', 'dgf']);
      expect(result.exitCode).toBe(EXIT_CODES.source_error);
      const parsed = JSON.parse(result.stdout) as { error?: { message?: string } };
      expect(parsed.error?.message).toMatch(/did you mean/i);
    });
  });

  describe('model discover --activity-key', () => {
    it('should accept custom activity key', async () => {
      const result = await runCli(['model', 'discover', testXesPath, '--activity-key', 'concept:name']);
      expect(result.exitCode).toBe(0);
    });

    it('should default to concept:name', async () => {
      const result = await runCli(['model', 'discover', testXesPath]);
      expect(result.exitCode).toBe(0);
    });
  });

  describe('model discover output contract', () => {
    it('stdout is always valid JSON (no --format flag exists or is needed)', async () => {
      const result = await runCli(['model', 'discover', testXesPath, '--algorithm', 'dfg']);
      expect(result.exitCode).toBe(0);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });

    it('--output/-o/--no-save/--config/--timeout are unrecognized and have no effect (accepted but ignored)', async () => {
      const outputPath = path.join(env.tempDir, 'result.json');
      const result = await runCli([
        'model', 'discover', testXesPath,
        '--algorithm', 'dfg',
        '--output', outputPath,
        '-o', outputPath,
        '--no-save',
        '--config', path.join(env.tempDir, 'wasm4pm.json'),
        '--timeout', '60',
      ]);
      // None of these flags exist on model discover; citty ignores unknown
      // flags rather than erroring, so the command still succeeds normally.
      expect(result.exitCode).toBe(0);
      await expect(fs.access(outputPath)).rejects.toThrow();
    });

    it('--with-quality/--assert-fitness/--set-baseline/--assert-improvement no longer exist (accepted, no effect)', async () => {
      const result = await runCli([
        'model', 'discover', testXesPath, '--algorithm', 'dfg',
        '--with-quality', '--assert-fitness', '0.85', '--set-baseline', '--assert-improvement',
      ]);
      expect(result.exitCode).toBe(0);
      const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
      expect(parsed.shape).toBeDefined();
      expect(parsed['qualityDimensions']).toBeUndefined();
    });

    it('--preflight/--stream/--no-retry/--simd/--hierarchical/--smart-engine/--no-cache/--cache-stats no longer exist (accepted, no effect)', async () => {
      const result = await runCli([
        'model', 'discover', testXesPath, '--algorithm', 'dfg',
        '--preflight', '--stream', '--no-retry', '--simd', '--hierarchical', '--smart-engine',
        '--no-cache', '--cache-stats',
      ]);
      expect(result.exitCode).toBe(0);
    });

    it('--verbose/-v/--quiet/-q no longer exist; the framework provides --human instead', async () => {
      const result = await runCli(['model', 'discover', testXesPath, '--verbose', '--quiet']);
      expect(result.exitCode).toBe(0);
      // stdout must still be pure JSON regardless of the (unrecognized) flags.
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });
  });

  describe('model discover error handling', () => {
    it('should handle corrupted XES file', async () => {
      const corruptedPath = path.join(env.tempDir, 'corrupted.xes');
      await fs.writeFile(corruptedPath, 'not valid xml', 'utf-8');
      const result = await runCli(['model', 'discover', corruptedPath]);
      expect(result.exitCode).toBe(EXIT_CODES.source_error);
    });

    it('should handle I/O errors gracefully', async () => {
      const result = await runCli(['model', 'discover', '/nonexistent/directory/log.xes']);
      expect(result.exitCode).toBe(EXIT_CODES.source_error);
    });

    it('should complete in reasonable time', async () => {
      const start = Date.now();
      await runCli(['model', 'discover', testXesPath, '--help']);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(5000);
    });
  });

  describe('model discover performance', () => {
    it('should return quickly for help', async () => {
      const start = Date.now();
      await runCli(['model', 'discover', '--help']);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(1000);
    });

    it('should complete discovery on small log in reasonable time', async () => {
      const start = Date.now();
      await runCli(['model', 'discover', testXesPath, '--algorithm', 'dfg']);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(10000);
    });
  });

  describe('model discover exit codes', () => {
    it('should exit 0 on success', async () => {
      const result = await runCli(['model', 'discover', '--help']);
      expect(result.exitCode).toBe(0);
    });

    it('should exit 2 (source_error) on missing input', async () => {
      // `model discover` classifies every input/algorithm validation failure
      // as INVALID_INPUT -> source_error (2); the old command's split between
      // config_error (1) and source_error (2) for this path no longer exists.
      const result = await runCli(['model', 'discover']);
      expect(result.exitCode).toBe(2);
    });

    it('should exit 2 (source_error) for a corrupted/unreadable log, not execution_error', async () => {
      const corruptedPath = path.join(env.tempDir, 'corrupted.xes');
      await fs.writeFile(corruptedPath, 'invalid', 'utf-8');
      const result = await runCli(['model', 'discover', corruptedPath]);
      expect(result.exitCode).toBe(2);
    });
  });

  describe('receipt chain', () => {
    // Receipts land under `<cwd>/.wasm4pm/receipts`. The suite's default
    // `process.cwd()` is shared with every other CLI test file in this
    // package (potentially running concurrently), so these tests run the
    // CLI with `cwd: env.tempDir` and read receipts back from there instead
    // — otherwise a receipt from an unrelated concurrently-running test
    // (e.g. `log validate`) can be the one picked up as "latest".

    it('every invocation writes a receipt named after its run_id (a UUID), not "run-*"', async () => {
      // The old naming convention (`run-<timestamp>.json`) is gone —
      // receipts are now named `<run_id (UUID)>.json` regardless of which
      // noun/verb produced them (see receipts/_shared.ts saveCommandReceipt),
      // confirmed live against the built CLI.
      await runCli(['model', 'discover', testXesPath, '--algorithm', 'dfg'], { cwd: env.tempDir });
      const receiptDir = path.join(env.tempDir, '.wasm4pm', 'receipts');
      const receipts = await fs.readdir(receiptDir).catch(() => []);
      const nonLatest = receipts.filter((f) => f !== 'latest.json' && f.endsWith('.json'));
      expect(nonLatest.length).toBeGreaterThan(0);
      const latest = JSON.parse(
        await fs.readFile(path.join(receiptDir, 'latest.json'), 'utf-8')
      ) as Record<string, unknown>;
      expect(latest.command).toBe('model discover');
      expect(typeof latest.input_hash).toBe('string');
      expect(typeof latest.output_hash).toBe('string');
    });

    it('same algorithm+input produces identical input_hash across runs (deterministic input side)', async () => {
      // `output_hash` is NOT asserted equal here: `DiscoverResult` embeds its
      // own `durationMs` (wall-clock elapsed for the WASM call), which is
      // hashed as part of the result and genuinely varies run to run
      // (confirmed live: 3ms vs 4ms on the same trivial fixture) — unlike
      // the old `run` command, this is not excluded from the hashed payload.
      // `input_hash` (blake3 of the CLI args only) has no such timing
      // dependency and is the correct determinism claim to make here.
      const run1 = await runCli(['model', 'discover', testXesPath, '--algorithm', 'dfg'], { cwd: env.tempDir });
      const run2 = await runCli(['model', 'discover', testXesPath, '--algorithm', 'dfg'], { cwd: env.tempDir });
      expect(run1.exitCode).toBe(0);
      expect(run2.exitCode).toBe(0);

      const receiptDir = path.join(env.tempDir, '.wasm4pm', 'receipts');
      const receipts = (await fs.readdir(receiptDir).catch(() => []))
        .filter((f) => f !== 'latest.json' && f.endsWith('.json'));
      expect(receipts.length).toBeGreaterThanOrEqual(2);
      const sorted = await Promise.all(
        receipts.map(async (f) => {
          const content = JSON.parse(await fs.readFile(path.join(receiptDir, f), 'utf-8')) as {
            timestamp: string;
            input_hash: string;
          };
          return content;
        })
      );
      sorted.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
      const last2 = sorted.slice(-2);
      expect(last2[0].input_hash).toBe(last2[1].input_hash);
    });

    it('changing the algorithm changes both input_hash and output_hash', async () => {
      const run1 = await runCli(['model', 'discover', testXesPath, '--algorithm', 'dfg'], { cwd: env.tempDir });
      const run2 = await runCli(['model', 'discover', testXesPath, '--algorithm', 'heuristic_miner'], {
        cwd: env.tempDir,
      });
      expect(run1.exitCode).toBe(0);
      expect(run2.exitCode).toBe(0);

      const receiptDir = path.join(env.tempDir, '.wasm4pm', 'receipts');
      const receipts = (await fs.readdir(receiptDir).catch(() => []))
        .filter((f) => f !== 'latest.json' && f.endsWith('.json'));
      const sorted = await Promise.all(
        receipts.map(async (f) => {
          const content = JSON.parse(await fs.readFile(path.join(receiptDir, f), 'utf-8')) as {
            timestamp: string;
            input_hash: string;
            output_hash: string;
          };
          return content;
        })
      );
      sorted.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
      const last2 = sorted.slice(-2);
      expect(last2[0].input_hash).not.toBe(last2[1].input_hash);
      expect(last2[0].output_hash).not.toBe(last2[1].output_hash);
    });
  });
});
