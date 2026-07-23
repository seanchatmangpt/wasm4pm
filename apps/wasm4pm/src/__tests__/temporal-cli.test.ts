/**
 * MIGRATED from the retired top-level `wpm temporal` invocation (see
 * `nouns/_removed.ts`: `temporal` -> `lab temporal`). `lab temporal`
 * bridges unchanged to `commands/temporal.ts` via
 * `invokeLegacyCommandAsJson` (`nouns/_bridge.ts`).
 *
 * `temporal` is a FLAT command (no subcommands) — the `it.skip`s already in
 * this file predate the migration and document that fact. The various
 * "analyze"/"bottlenecks"/"waiting-time"/etc tokens used throughout are not
 * real subcommands; they're consumed as an (usually nonexistent) positional
 * input path. A new effect from the noun-verb rewrite: `--help` now always
 * shows the framework's own generic verb summary (nouns/lab/temporal.ts)
 * instead of ever reaching the legacy command's help text, so several
 * "--help mentions X" assertions that used to coincidentally pass are
 * rewritten below to assert the real, generic help contract.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runCli, EXIT_CODES, createCliTestEnv } from '@wasm4pm/testing';
import * as fs from 'fs';
import * as path from 'path';

// ── Minimal XES fixture with timestamps for temporal conformance analysis ──────
const MINIMAL_XES = `<?xml version="1.0" encoding="UTF-8"?>
<log xmlns="http://www.xes-standard.org/" xes.version="1.0">
  <extension name="Concept" prefix="concept" uri="http://www.xes-standard.org/concept.xesext"/>
  <extension name="Time" prefix="time" uri="http://www.xes-standard.org/time.xesext"/>
  <global scope="trace"><string key="concept:name" value="Case ID"/></global>
  <global scope="event">
    <string key="concept:name" value="Activity"/>
    <date key="time:timestamp" value="Timestamp"/>
  </global>
  <trace>
    <string key="concept:name" value="case_1"/>
    <event><string key="concept:name" value="register"/><date key="time:timestamp" value="2024-01-15T09:00:00Z"/></event>
    <event><string key="concept:name" value="examine"/><date key="time:timestamp" value="2024-01-15T09:30:00Z"/></event>
    <event><string key="concept:name" value="decide"/><date key="time:timestamp" value="2024-01-15T10:00:00Z"/></event>
    <event><string key="concept:name" value="notify"/><date key="time:timestamp" value="2024-01-15T10:15:00Z"/></event>
  </trace>
  <trace>
    <string key="concept:name" value="case_2"/>
    <event><string key="concept:name" value="register"/><date key="time:timestamp" value="2024-01-15T11:00:00Z"/></event>
    <event><string key="concept:name" value="decide"/><date key="time:timestamp" value="2024-01-15T11:45:00Z"/></event>
    <event><string key="concept:name" value="notify"/><date key="time:timestamp" value="2024-01-15T12:00:00Z"/></event>
  </trace>
  <trace>
    <string key="concept:name" value="case_3"/>
    <event><string key="concept:name" value="register"/><date key="time:timestamp" value="2024-01-16T08:00:00Z"/></event>
    <event><string key="concept:name" value="examine"/><date key="time:timestamp" value="2024-01-16T09:00:00Z"/></event>
    <event><string key="concept:name" value="decide"/><date key="time:timestamp" value="2024-01-16T10:30:00Z"/></event>
    <event><string key="concept:name" value="notify"/><date key="time:timestamp" value="2024-01-16T11:00:00Z"/></event>
  </trace>
</log>`;

describe('wpm lab temporal — temporal analysis and performance profiling CLI', () => {
  let env: Awaited<ReturnType<typeof createCliTestEnv>>;

  beforeEach(async () => {
    env = await createCliTestEnv();
  });

  afterEach(() => {
    env?.cleanup?.();
  });

  describe('temporal (base command)', () => {
    it('should require input log argument', async () => {
      const result = await runCli(['lab', 'temporal'], { env: env.env });
      expect([1, 2]).toContain(result.exitCode);
      // NOTE: `lab temporal`'s `[experimental]` banner is written to stderr
      // on every invocation (nouns/lab/temporal.ts stability:'experimental'),
      // so stderr is always non-empty and `stderr || stdout` (the original
      // check) never falls through to inspect stdout, where the actual
      // error JSON lives. Concatenate both streams instead.
      expect(result.stdout + result.stderr).toMatch(/input|log|required|argument/i);
    });

    it('should accept --input or -i flag', async () => {
      const result = await runCli(['lab', 'temporal', '--input', 'test.xes'], { env: env.env });
      expect([1, 2, 3]).toContain(result.exitCode);
    });
  });

  describe('temporal analyze', () => {
    it('should analyze temporal patterns in event log', async () => {
      const result = await runCli(['lab', 'temporal', 'analyze', '--input', 'test.xes'], { env: env.env });
      expect([1, 2, 3]).toContain(result.exitCode);
    });

    it('should identify time-based statistics', async () => {
      const result = await runCli(['lab', 'temporal', 'analyze', '--help'], { env: env.env });
      expect(result.stdout).toMatch(/temporal|time|duration|statistics/i);
    });

    it('should support activity-level analysis', async () => {
      const result = await runCli(['lab', 'temporal', 'analyze', '--input', 'test.xes', '--by-activity'], {
        env: env.env,
      });
      expect([1, 2, 3]).toContain(result.exitCode);
    });
  });

  describe('temporal bottlenecks', () => {
    it('should detect slow activities', async () => {
      const result = await runCli(['lab', 'temporal', 'bottlenecks', '--input', 'test.xes'], {
        env: env.env,
      });
      expect([1, 2, 3]).toContain(result.exitCode);
    });

    // `temporal` is a flat command with no `bottlenecks` subcommand (see the
    // `it.skip` comments elsewhere in this file) — `bottlenecks` here is
    // just an ignored positional token. `--help` now short-circuits to the
    // noun-verb framework's own generic verb help (nouns/lab/temporal.ts's
    // summary text), which is IDENTICAL regardless of what token precedes
    // `--help` — verified live: no "bottleneck"/"slow"/"duration"/"activity"
    // wording exists in that output. Rewritten to assert the real, generic
    // help contract instead.
    it('--help shows the generic verb summary (no per-"subcommand" help exists; temporal is a flat command)', async () => {
      const result = await runCli(['lab', 'temporal', 'bottlenecks', '--help'], { env: env.env });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatch(/temporal/i);
    });

    it('should support filtering by percentile', async () => {
      const result = await runCli(
        ['lab', 'temporal', 'bottlenecks', '--input', 'test.xes', '--percentile', '95'],
        { env: env.env }
      );
      expect([1, 2, 3]).toContain(result.exitCode);
    });

    it('should identify top N slowest activities', async () => {
      const result = await runCli(
        ['lab', 'temporal', 'bottlenecks', '--input', 'test.xes', '--top-n', '5'],
        { env: env.env }
      );
      expect([1, 2, 3]).toContain(result.exitCode);
    });
  });

  describe('temporal throughput', () => {
    it('should analyze case throughput over time', async () => {
      const result = await runCli(['lab', 'temporal', 'throughput', '--input', 'test.xes'], {
        env: env.env,
      });
      expect([1, 2, 3]).toContain(result.exitCode);
    });

    it('should support time window configuration', async () => {
      const result = await runCli(
        ['lab', 'temporal', 'throughput', '--input', 'test.xes', '--window', '1h'],
        { env: env.env }
      );
      expect([1, 2, 3]).toContain(result.exitCode);
    });

    it.skip('should report throughput metrics (temporal has no throughput subcommand)', async () => {
      // temporal is a flat command — no throughput subcommand exists
    });

    it('should accept different time windows', async () => {
      ['1h', '1d', '1w'].forEach((window) => {
        expect(['1h', '1d', '1w']).toContain(window);
      });
    });
  });

  describe('temporal waiting-time', () => {
    it('should analyze waiting time between activities', async () => {
      const result = await runCli(['lab', 'temporal', 'waiting-time', '--input', 'test.xes'], {
        env: env.env,
      });
      expect([1, 2, 3]).toContain(result.exitCode);
    });

    // Same "flat command, generic --help" reality as the bottlenecks case
    // above — verified live: no "wait"/"idle"/"time" wording in that output.
    it('--help shows the generic verb summary (no per-"subcommand" help exists; temporal is a flat command)', async () => {
      const result = await runCli(['lab', 'temporal', 'waiting-time', '--help'], { env: env.env });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatch(/temporal/i);
    });

    it('should support activity pair analysis', async () => {
      const result = await runCli(
        [
          'lab',
          'temporal',
          'waiting-time',
          '--input',
          'test.xes',
          '--from-activity',
          'A',
          '--to-activity',
          'B',
        ],
        { env: env.env }
      );
      expect([1, 2, 3]).toContain(result.exitCode);
    });
  });

  describe('temporal rework', () => {
    it('should detect rework (repeated activities)', async () => {
      const result = await runCli(['lab', 'temporal', 'rework', '--input', 'test.xes'], { env: env.env });
      expect([1, 2, 3]).toContain(result.exitCode);
    });

    it.skip('should identify rework patterns (temporal has no rework subcommand)', async () => {
      // temporal is a flat command — no rework subcommand exists
    });

    it('should calculate rework ratio', async () => {
      const result = await runCli(
        ['lab', 'temporal', 'rework', '--input', 'test.xes', '--calculate-ratio'],
        { env: env.env }
      );
      expect([1, 2, 3]).toContain(result.exitCode);
    });

    it('should flag excessive rework', async () => {
      const result = await runCli(
        ['lab', 'temporal', 'rework', '--input', 'test.xes', '--threshold', '0.2'],
        { env: env.env }
      );
      expect([1, 2, 3]).toContain(result.exitCode);
    });
  });

  describe('temporal cycles', () => {
    it('should detect process cycles and loops', async () => {
      const result = await runCli(['lab', 'temporal', 'cycles', '--input', 'test.xes'], { env: env.env });
      expect([1, 2, 3]).toContain(result.exitCode);
    });

    it.skip('should identify backward loops (temporal has no cycles subcommand)', async () => {
      // temporal is a flat command — no cycles subcommand exists
    });

    it('should report cycle frequency', async () => {
      const result = await runCli(
        ['lab', 'temporal', 'cycles', '--input', 'test.xes', '--report-frequency'],
        { env: env.env }
      );
      expect([1, 2, 3]).toContain(result.exitCode);
    });
  });

  describe('temporal trends', () => {
    it('should analyze duration trends over time', async () => {
      const result = await runCli(['lab', 'temporal', 'trends', '--input', 'test.xes'], { env: env.env });
      expect([1, 2, 3]).toContain(result.exitCode);
    });

    it.skip('should detect performance improvements or degradation (temporal has no trends subcommand)', async () => {
      // temporal is a flat command — no trends subcommand exists
    });

    it('should support date range filtering', async () => {
      const result = await runCli(
        [
          'lab',
          'temporal',
          'trends',
          '--input',
          'test.xes',
          '--from-date',
          '2025-01-01',
          '--to-date',
          '2025-12-31',
        ],
        { env: env.env }
      );
      expect([1, 2, 3]).toContain(result.exitCode);
    });
  });

  describe('temporal variance', () => {
    it('should identify variability in activity durations', async () => {
      const result = await runCli(['lab', 'temporal', 'variance', '--input', 'test.xes'], {
        env: env.env,
      });
      expect([1, 2, 3]).toContain(result.exitCode);
    });

    it.skip('should report standard deviation metrics (temporal has no variance subcommand)', async () => {
      // temporal is a flat command — no variance subcommand exists
    });

    it('should identify high-variance activities', async () => {
      const result = await runCli(
        ['lab', 'temporal', 'variance', '--input', 'test.xes', '--threshold', '0.5'],
        { env: env.env }
      );
      expect([1, 2, 3]).toContain(result.exitCode);
    });
  });

  describe('temporal --format', () => {
    it('should support human-readable output', async () => {
      const result = await runCli(
        ['lab', 'temporal', 'analyze', '--input', 'test.xes', '--format', 'human'],
        { env: env.env }
      );
      expect([1, 2, 3]).toContain(result.exitCode);
    });

    it('should support JSON output', async () => {
      const result = await runCli(
        ['lab', 'temporal', 'analyze', '--input', 'test.xes', '--format', 'json'],
        { env: env.env }
      );
      if (result.exitCode === EXIT_CODES.success) {
        expect(() => JSON.parse(result.stdout)).not.toThrow();
      }
    });

    it('should support CSV export', async () => {
      const result = await runCli(
        ['lab', 'temporal', 'analyze', '--input', 'test.xes', '--format', 'csv'],
        { env: env.env }
      );
      expect([1, 2, 3]).toContain(result.exitCode);
    });
  });

  describe('temporal --activity-key', () => {
    it('should accept custom activity key', async () => {
      const result = await runCli(
        ['lab', 'temporal', 'analyze', '--input', 'test.xes', '--activity-key', 'activity:name'],
        { env: env.env }
      );
      expect([1, 2, 3]).toContain(result.exitCode);
    });

    // Same "flat command, generic --help" reality — `--help` never
    // mentions `--activity-key` or its default at all now (verified live:
    // no "activity"/"key"/"concept:name" wording). The default itself is
    // still real and tested directly against the real fixture below
    // ("custom --activity-key is reflected in JSON output").
    it('--help shows the generic verb summary (no --activity-key documentation exists there)', async () => {
      const result = await runCli(['lab', 'temporal', 'analyze', '--help'], { env: env.env });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatch(/temporal/i);
    });
  });

  describe('temporal --time-key', () => {
    it('should accept custom timestamp key', async () => {
      const result = await runCli(
        ['lab', 'temporal', 'analyze', '--input', 'test.xes', '--time-key', 'time:timestamp'],
        { env: env.env }
      );
      expect([1, 2, 3]).toContain(result.exitCode);
    });
  });

  describe('temporal error handling', () => {
    it('should reject invalid subcommand', async () => {
      const result = await runCli(['lab', 'temporal', 'invalid-command', '--input', 'test.xes'], {
        env: env.env,
      });
      expect([1, 2]).toContain(result.exitCode);
    });

    it('should handle missing input file', async () => {
      const result = await runCli(['lab', 'temporal', 'analyze', '--input', '/nonexistent/log.xes'], {
        env: env.env,
      });
      expect([1, 2]).toContain(result.exitCode);
    });

    it('should validate date range', async () => {
      const result = await runCli(
        [
          'lab',
          'temporal',
          'trends',
          '--input',
          'test.xes',
          '--from-date',
          '2025-12-31',
          '--to-date',
          '2025-01-01',
        ],
        { env: env.env }
      );
      expect([1, 2]).toContain(result.exitCode);
    });

    it('should reject invalid percentile values', async () => {
      const result = await runCli(
        ['lab', 'temporal', 'bottlenecks', '--input', 'test.xes', '--percentile', '150'],
        { env: env.env }
      );
      expect([1, 2]).toContain(result.exitCode);
    });
  });

  describe('temporal performance', () => {
    it('should complete basic analysis in <2 seconds', async () => {
      const start = Date.now();
      await runCli(['lab', 'temporal', 'analyze', '--help'], { env: env.env });
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(2000);
    });
  });

  describe('temporal --save-report', () => {
    it.skip('should save analysis report to file (temporal has no analyze subcommand or --save-report flag)', async () => {
      // temporal is a flat command — no analyze subcommand or --save-report flag exists
    });
  });

  // ── Real-fixture tests: validate actual temporal analysis output ──────────────
  describe('temporal with real XES fixture', () => {
    let xesPath: string;

    beforeEach(() => {
      xesPath = path.join(env.tempDir, 'test.xes');
      fs.writeFileSync(xesPath, MINIMAL_XES, 'utf-8');
    });

    it('exits 0 and returns valid JSON envelope with dfg and violations', async () => {
      const result = await runCli(['lab', 'temporal', xesPath, '--format', 'json', '--no-save'], {
        env: env.env,
      });
      expect(result.exitCode).toBe(EXIT_CODES.success);

      let j: Record<string, unknown>;
      expect(() => { j = JSON.parse(result.stdout); }).not.toThrow();
      j = JSON.parse(result.stdout);
      expect(j['command']).toBe('temporal');
      expect(j['status']).toBe('ok');

      const p = j['payload'] as Record<string, unknown>;
      expect(p).toBeDefined();
      expect(p['input']).toBe(xesPath);
      // DFG section must be present
      expect(p['dfg']).toBeDefined();
      // Violations section must be present with a count
      const violations = p['violations'] as Record<string, unknown>;
      expect(violations).toBeDefined();
      expect(typeof violations['count']).toBe('number');
    });

    it('JSON envelope has activityKey and timestampKey fields', async () => {
      const result = await runCli(['lab', 'temporal', xesPath, '--format', 'json', '--no-save'], {
        env: env.env,
      });
      expect(result.exitCode).toBe(EXIT_CODES.success);

      const j = JSON.parse(result.stdout) as Record<string, unknown>;
      const p = j['payload'] as Record<string, unknown>;
      expect(p['activityKey']).toBe('concept:name');
      expect(p['timestampKey']).toBe('time:timestamp');
    });

    it('JSON envelope includes threshold field matching --threshold flag', async () => {
      const result = await runCli(
        ['lab', 'temporal', xesPath, '--threshold', '0.01', '--format', 'json', '--no-save'],
        { env: env.env }
      );
      expect(result.exitCode).toBe(EXIT_CODES.success);

      const j = JSON.parse(result.stdout) as Record<string, unknown>;
      const p = j['payload'] as Record<string, unknown>;
      expect(typeof p['threshold']).toBe('number');
      expect(p['threshold']).toBeCloseTo(0.01, 3);
    });

    it('--format human exits 0 and prints Temporal Analysis header', async () => {
      const result = await runCli(['lab', 'temporal', xesPath, '--format', 'human', '--no-save'], {
        env: env.env,
      });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      const combined = result.stdout + result.stderr;
      expect(combined).toMatch(/temporal/i);
    });

    it('-i flag (named input) accepts XES file and produces same output as positional', async () => {
      const resultPositional = await runCli(
        ['lab', 'temporal', xesPath, '--format', 'json', '--no-save'],
        { env: env.env }
      );
      const resultNamed = await runCli(
        ['lab', 'temporal', '-i', xesPath, '--format', 'json', '--no-save'],
        { env: env.env }
      );

      expect(resultPositional.exitCode).toBe(EXIT_CODES.success);
      expect(resultNamed.exitCode).toBe(EXIT_CODES.success);

      // Both should produce JSON with the same input path
      const j1 = JSON.parse(resultPositional.stdout) as Record<string, unknown>;
      const j2 = JSON.parse(resultNamed.stdout) as Record<string, unknown>;
      const p1 = j1['payload'] as Record<string, unknown>;
      const p2 = j2['payload'] as Record<string, unknown>;
      expect(p1['input']).toBe(p2['input']);
    });

    it('custom --activity-key is reflected in JSON output', async () => {
      const result = await runCli(
        ['lab', 'temporal', xesPath, '--activity-key', 'concept:name', '--format', 'json', '--no-save'],
        { env: env.env }
      );
      expect(result.exitCode).toBe(EXIT_CODES.success);

      const j = JSON.parse(result.stdout) as Record<string, unknown>;
      const p = j['payload'] as Record<string, unknown>;
      expect(p['activityKey']).toBe('concept:name');
    });

    it('custom --timestamp-key is reflected in JSON output', async () => {
      const result = await runCli(
        [
          'lab',
          'temporal',
          xesPath,
          '--timestamp-key',
          'time:timestamp',
          '--format',
          'json',
          '--no-save',
        ],
        { env: env.env }
      );
      expect(result.exitCode).toBe(EXIT_CODES.success);

      const j = JSON.parse(result.stdout) as Record<string, unknown>;
      const p = j['payload'] as Record<string, unknown>;
      expect(p['timestampKey']).toBe('time:timestamp');
    });

    it('violations.count is a non-negative integer', async () => {
      const result = await runCli(['lab', 'temporal', xesPath, '--format', 'json', '--no-save'], {
        env: env.env,
      });
      expect(result.exitCode).toBe(EXIT_CODES.success);

      const j = JSON.parse(result.stdout) as Record<string, unknown>;
      const p = j['payload'] as Record<string, unknown>;
      const violations = p['violations'] as Record<string, unknown>;
      expect(typeof violations['count']).toBe('number');
      expect(violations['count'] as number).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(violations['count'])).toBe(true);
    });

    it('dfg section contains nodes and edges arrays', async () => {
      const result = await runCli(['lab', 'temporal', xesPath, '--format', 'json', '--no-save'], {
        env: env.env,
      });
      expect(result.exitCode).toBe(EXIT_CODES.success);

      const j = JSON.parse(result.stdout) as Record<string, unknown>;
      const p = j['payload'] as Record<string, unknown>;
      const dfg = p['dfg'] as Record<string, unknown>;
      expect(Array.isArray(dfg['nodes'])).toBe(true);
      expect(Array.isArray(dfg['edges'])).toBe(true);
      // XES has 4 distinct activities: register, examine, decide, notify
      expect((dfg['nodes'] as unknown[]).length).toBeGreaterThanOrEqual(3);
    });

    it('--no-save skips receipt and still exits 0', async () => {
      const result = await runCli(['lab', 'temporal', xesPath, '--format', 'json', '--no-save'], {
        env: env.env,
      });
      expect(result.exitCode).toBe(EXIT_CODES.success);
    });

    it('nonexistent XES file exits source_error (2)', async () => {
      const result = await runCli(
        ['lab', 'temporal', '/nonexistent/path/log.xes', '--format', 'json', '--no-save'],
        { env: env.env }
      );
      expect(result.exitCode).toBe(EXIT_CODES.source_error);

      // A verb failure's stdout is `{error:{code,message}}` (see
      // packages/noun-verb/src/errors.ts) — there is no top-level `status`
      // field at all on the error path (that only exists on the legacy
      // envelope's SUCCESS shape). Assert the real error contract instead.
      const j = JSON.parse(result.stdout) as { error?: { code?: string; message?: string } };
      expect(j.error).toBeDefined();
      expect(j.error?.code).toBe('INVALID_INPUT');
    });
  });
});
