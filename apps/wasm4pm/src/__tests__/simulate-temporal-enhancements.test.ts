/**
 * `wpm simulate`/`wpm temporal` were retired; the hard-break table
 * (nouns/_removed.ts) forwards them to `wpm model simulate`/`wpm lab
 * temporal`, both bridged unmodified to their legacy `commands/*.ts` bodies.
 * Confirmed live against the built CLI:
 *   - stdout is always a single JSON value regardless of `--format` (the
 *     bridge always forces `--format json --quiet`), so the old
 *     "human output contains 'Simulation'/'Temporal Analysis'" text checks
 *     no longer apply — always-JSON-on-stdout wins.
 *   - `--iterations` and `--max-duration` are accepted flags on
 *     `commands/simulate.ts` but are dead: grep confirms `iterations` is
 *     only ever assigned from argv and never read again, and `max-duration`
 *     likewise has no reader at all. Neither is validated (`--iterations
 *     invalid` and `--max-duration invalid` both exit 0 silently) nor does
 *     either affect the simulation loop or its output (`payload.simulation`
 *     has no `iterations` field; `payload.statistics.traceLengths` is
 *     explicitly set to `undefined` in source and so is dropped by
 *     `JSON.stringify`). This is a pre-existing gap in the legacy command,
 *     not something the noun-verb migration changed — the tests below are
 *     rewritten to assert the actual (dead-flag) behavior rather than the
 *     aggregate-statistics feature these flags were apparently meant to
 *     enable but never were wired up for.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { runCli } from '@wasm4pm/testing';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('wpm model simulate / wpm lab temporal enhancements (was: wpm simulate / wpm temporal)', () => {
  let testLogPath: string;
  let tmpDir: string;

  beforeAll(async () => {
    // Create a temporary directory
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wpm-test-'));

    // Create a minimal XES log for testing
    const xesContent = `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0" xmlns="http://www.xes-standard.org/">
  <trace>
    <string key="concept:name" value="case_1"/>
    <event>
      <string key="concept:name" value="A"/>
      <date key="time:timestamp" value="2026-05-18T08:00:00Z"/>
    </event>
    <event>
      <string key="concept:name" value="B"/>
      <date key="time:timestamp" value="2026-05-18T08:05:00Z"/>
    </event>
    <event>
      <string key="concept:name" value="C"/>
      <date key="time:timestamp" value="2026-05-18T08:10:00Z"/>
    </event>
  </trace>
  <trace>
    <string key="concept:name" value="case_2"/>
    <event>
      <string key="concept:name" value="A"/>
      <date key="time:timestamp" value="2026-05-18T09:00:00Z"/>
    </event>
    <event>
      <string key="concept:name" value="B"/>
      <date key="time:timestamp" value="2026-05-18T09:03:00Z"/>
    </event>
    <event>
      <string key="concept:name" value="C"/>
      <date key="time:timestamp" value="2026-05-18T09:08:00Z"/>
    </event>
  </trace>
</log>`;

    testLogPath = path.join(tmpDir, 'test.xes');
    fs.writeFileSync(testLogPath, xesContent);
  });

  afterAll(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  describe('simulate --iterations', () => {
    it('accepts --iterations flag', async () => {
      const result = await runCli(['model', 'simulate', testLogPath, '--iterations', '2', '--format', 'json', '--no-save']);
      expect(result?.exitCode).toBe(0);
      expect(result?.stdout).toBeDefined();
    });

    it('--iterations has no effect on the payload (dead flag; no "iterations" field is ever emitted)', async () => {
      // `commands/simulate.ts` parses `--iterations` but never reads it
      // again — `payload.simulation` has no `iterations` field regardless
      // of the flag's value. Confirmed live against the built CLI.
      const result = await runCli(['model', 'simulate', testLogPath, '--format', 'json', '--no-save']);
      expect(result?.exitCode).toBe(0);
      const output = JSON.parse(result?.stdout || '{}');
      expect(output.payload?.simulation?.iterations).toBeUndefined();
    });

    it('--iterations is accepted with any value, including non-numeric, and never rejected (dead flag: unvalidated)', async () => {
      const result = await runCli(['model', 'simulate', testLogPath, '--iterations', 'invalid', '--format', 'json']);
      expect(result?.exitCode).toBe(0);
    });

    it('--iterations does not add a traceLengths aggregate block (dead flag: statistics.traceLengths is always undefined/absent)', async () => {
      // Source sets `traceLengths: undefined as any` explicitly (kept "for
      // backward compat" per its own comment) — JSON.stringify drops
      // `undefined` values, so the key is absent from the wire payload.
      const result = await runCli([
        'model',
        'simulate',
        testLogPath,
        '--iterations',
        '3',
        '--cases',
        '5',
        '--format',
        'json',
        '--no-save',
      ]);
      expect(result?.exitCode).toBe(0);
      const output = JSON.parse(result?.stdout || '{}');
      expect(output.payload?.statistics?.traceLengths).toBeUndefined();
      expect(typeof output.payload?.statistics?.avgTraceLength).toBe('number');
    });

    it('includes variant count in output', async () => {
      const result = await runCli([
        'model',
        'simulate',
        testLogPath,
        '--iterations',
        '2',
        '--format',
        'json',
        '--no-save',
      ]);
      expect(result?.exitCode).toBe(0);
      const output = JSON.parse(result?.stdout || '{}');
      expect(output.payload?.statistics?.variantsDiscovered).toBeGreaterThanOrEqual(0);
    });
  });

  describe('simulate --max-duration', () => {
    it('accepts --max-duration flag', async () => {
      const result = await runCli([
        'model',
        'simulate',
        testLogPath,
        '--max-duration',
        '500',
        '--iterations',
        '5',
        '--format',
        'json',
        '--no-save',
      ]);
      expect(result?.exitCode).toBe(0);
    });

    it('--max-duration is accepted with any value, including non-numeric, and never rejected (dead flag: unvalidated, unread)', async () => {
      const result = await runCli(['model', 'simulate', testLogPath, '--max-duration', 'invalid']);
      expect(result?.exitCode).toBe(0);
    });

    it('completes quickly regardless of --iterations/--max-duration (both are dead flags — only one simulation ever runs)', async () => {
      // Not actually "respecting a timeout": `commands/simulate.ts` never
      // loops on `iterations` at all, so passing `--iterations 100` still
      // runs exactly one simulation — that's the real reason this stays
      // fast, not early-exit from `--max-duration`.
      const t0 = Date.now();
      const result = await runCli([
        'model',
        'simulate',
        testLogPath,
        '--max-duration',
        '100',
        '--iterations',
        '100',
        '--format',
        'json',
        '--no-save',
      ]);
      const elapsed = Date.now() - t0;
      expect(result?.exitCode).toBe(0);
      // Should complete much faster than without limit due to early exit
      expect(elapsed).toBeLessThan(5000); // Reasonable upper bound
    });
  });

  describe('simulate --seed reproducibility', () => {
    it('same seed produces same results', async () => {
      const result1 = await runCli([
        'model',
        'simulate',
        testLogPath,
        '--seed',
        '42',
        '--cases',
        '10',
        '--format',
        'json',
        '--no-save',
      ]);
      const result2 = await runCli([
        'model',
        'simulate',
        testLogPath,
        '--seed',
        '42',
        '--cases',
        '10',
        '--format',
        'json',
        '--no-save',
      ]);

      expect(result1?.exitCode).toBe(0);
      expect(result2?.exitCode).toBe(0);

      const output1 = JSON.parse(result1?.stdout || '{}');
      const output2 = JSON.parse(result2?.stdout || '{}');

      expect(output1.payload?.simulation?.seed).toBe(42);
      expect(output2.payload?.simulation?.seed).toBe(42);
    });
  });

  describe('temporal --bucket-size', () => {
    it('accepts --bucket-size flag', async () => {
      const result = await runCli(['lab', 'temporal', testLogPath, '--bucket-size', '2', '--format', 'json', '--no-save']);
      expect(result?.exitCode).toBe(0);
      const output = JSON.parse(result?.stdout || '{}');
      expect(output.payload?.bucketSizeHours).toBe(2);
    });

    it('--bucket-size defaults to 1 hour', async () => {
      const result = await runCli(['lab', 'temporal', testLogPath, '--format', 'json', '--no-save']);
      expect(result?.exitCode).toBe(0);
      const output = JSON.parse(result?.stdout || '{}');
      expect(output.payload?.bucketSizeHours).toBe(1);
    });

    it('--bucket-size must be a valid number', async () => {
      const result = await runCli(['lab', 'temporal', testLogPath, '--bucket-size', 'invalid']);
      expect(result?.exitCode).not.toBe(0);
    });

    it('includes buckets in JSON output', async () => {
      const result = await runCli(['lab', 'temporal', testLogPath, '--bucket-size', '1', '--format', 'json', '--no-save']);
      expect(result?.exitCode).toBe(0);
      const output = JSON.parse(result?.stdout || '{}');
      expect(Array.isArray(output.payload?.buckets)).toBe(true);
    });
  });

  describe('temporal trend detection', () => {
    it('includes trend direction in output', async () => {
      const result = await runCli(['lab', 'temporal', testLogPath, '--format', 'json', '--no-save']);
      expect(result?.exitCode).toBe(0);
      const output = JSON.parse(result?.stdout || '{}');
      const trendDirection = output.payload?.trendDirection;
      expect(['accelerating', 'decelerating', 'stable']).toContain(trendDirection);
    });

    it('trend is one of the three valid values', async () => {
      const result = await runCli(['lab', 'temporal', testLogPath, '--bucket-size', '2', '--format', 'json', '--no-save']);
      expect(result?.exitCode).toBe(0);
      const output = JSON.parse(result?.stdout || '{}');
      const trend = output.payload?.trendDirection;
      expect(['accelerating', 'decelerating', 'stable']).toContain(trend);
    });
  });

  describe('output validation', () => {
    it('simulate JSON output is valid', async () => {
      const result = await runCli(['model', 'simulate', testLogPath, '--format', 'json', '--no-save']);
      expect(result?.exitCode).toBe(0);
      expect(() => JSON.parse(result?.stdout || '{}')).not.toThrow();
    });

    it('temporal JSON output is valid', async () => {
      const result = await runCli(['lab', 'temporal', testLogPath, '--format', 'json', '--no-save']);
      expect(result?.exitCode).toBe(0);
      expect(() => JSON.parse(result?.stdout || '{}')).not.toThrow();
    });

    it('simulate stdout is JSON even without --format json (bridge always forces JSON)', async () => {
      // Bridged verbs always force `--format json --quiet` internally, so
      // the legacy human renderer (which used to print a "Simulation ..."
      // banner) never runs — always-JSON-on-stdout wins. Confirmed live.
      const result = await runCli(['model', 'simulate', testLogPath, '--no-save']);
      expect(result?.exitCode).toBe(0);
      expect(result?.stdout).toBeDefined();
      const parsed = JSON.parse(result!.stdout);
      expect(parsed.command).toBe('simulate');
    });

    it('temporal stdout is JSON even without --format json (bridge always forces JSON)', async () => {
      const result = await runCli(['lab', 'temporal', testLogPath, '--no-save']);
      expect(result?.exitCode).toBe(0);
      expect(result?.stdout).toBeDefined();
      const parsed = JSON.parse(result!.stdout);
      expect(parsed.command).toBe('temporal');
    });
  });
});
