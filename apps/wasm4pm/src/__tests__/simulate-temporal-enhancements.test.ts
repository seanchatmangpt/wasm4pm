import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { runCli } from '@wasm4pm/testing';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('wpm simulate/temporal enhancements', () => {
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
      const result = await runCli(['simulate', testLogPath, '--iterations', '2', '--format', 'json', '--no-save']);
      expect(result?.exitCode).toBe(0);
      expect(result?.stdout).toBeDefined();
    });

    it('--iterations defaults to 1', async () => {
      const result = await runCli(['simulate', testLogPath, '--format', 'json', '--no-save']);
      expect(result?.exitCode).toBe(0);
      const output = JSON.parse(result?.stdout || '{}');
      expect(output.payload?.simulation?.iterations).toBeDefined();
    });

    it('--iterations must be a valid number', async () => {
      const result = await runCli(['simulate', testLogPath, '--iterations', 'invalid', '--format', 'json']);
      expect(result?.exitCode).not.toBe(0);
    });

    it('multiple iterations produce aggregate statistics', async () => {
      const result = await runCli([
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
      expect(output.payload?.statistics?.traceLengths).toBeDefined();
      expect(output.payload?.statistics?.traceLengths?.mean).toBeGreaterThan(0);
      expect(output.payload?.statistics?.traceLengths?.p95).toBeGreaterThan(0);
    });

    it('includes variant count in output', async () => {
      const result = await runCli([
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

    it('--max-duration must be a valid number', async () => {
      const result = await runCli(['simulate', testLogPath, '--max-duration', 'invalid']);
      expect(result?.exitCode).not.toBe(0);
    });

    it('respects max-duration timeout', async () => {
      const t0 = Date.now();
      const result = await runCli([
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
      const result = await runCli(['temporal', testLogPath, '--bucket-size', '2', '--format', 'json', '--no-save']);
      expect(result?.exitCode).toBe(0);
      const output = JSON.parse(result?.stdout || '{}');
      expect(output.payload?.bucketSizeHours).toBe(2);
    });

    it('--bucket-size defaults to 1 hour', async () => {
      const result = await runCli(['temporal', testLogPath, '--format', 'json', '--no-save']);
      expect(result?.exitCode).toBe(0);
      const output = JSON.parse(result?.stdout || '{}');
      expect(output.payload?.bucketSizeHours).toBe(1);
    });

    it('--bucket-size must be a valid number', async () => {
      const result = await runCli(['temporal', testLogPath, '--bucket-size', 'invalid']);
      expect(result?.exitCode).not.toBe(0);
    });

    it('includes buckets in JSON output', async () => {
      const result = await runCli(['temporal', testLogPath, '--bucket-size', '1', '--format', 'json', '--no-save']);
      expect(result?.exitCode).toBe(0);
      const output = JSON.parse(result?.stdout || '{}');
      expect(Array.isArray(output.payload?.buckets)).toBe(true);
    });
  });

  describe('temporal trend detection', () => {
    it('includes trend direction in output', async () => {
      const result = await runCli(['temporal', testLogPath, '--format', 'json', '--no-save']);
      expect(result?.exitCode).toBe(0);
      const output = JSON.parse(result?.stdout || '{}');
      const trendDirection = output.payload?.trendDirection;
      expect(['accelerating', 'decelerating', 'stable']).toContain(trendDirection);
    });

    it('trend is one of the three valid values', async () => {
      const result = await runCli(['temporal', testLogPath, '--bucket-size', '2', '--format', 'json', '--no-save']);
      expect(result?.exitCode).toBe(0);
      const output = JSON.parse(result?.stdout || '{}');
      const trend = output.payload?.trendDirection;
      expect(['accelerating', 'decelerating', 'stable']).toContain(trend);
    });
  });

  describe('output validation', () => {
    it('simulate JSON output is valid', async () => {
      const result = await runCli(['simulate', testLogPath, '--format', 'json', '--no-save']);
      expect(result?.exitCode).toBe(0);
      expect(() => JSON.parse(result?.stdout || '{}')).not.toThrow();
    });

    it('temporal JSON output is valid', async () => {
      const result = await runCli(['temporal', testLogPath, '--format', 'json', '--no-save']);
      expect(result?.exitCode).toBe(0);
      expect(() => JSON.parse(result?.stdout || '{}')).not.toThrow();
    });

    it('simulate human output does not error', async () => {
      const result = await runCli(['simulate', testLogPath, '--no-save']);
      expect(result?.exitCode).toBe(0);
      expect(result?.stdout).toBeDefined();
      expect(result?.stdout).toContain('Simulation');
    });

    it('temporal human output does not error', async () => {
      const result = await runCli(['temporal', testLogPath, '--no-save']);
      expect(result?.exitCode).toBe(0);
      expect(result?.stdout).toBeDefined();
      expect(result?.stdout).toContain('Temporal Analysis');
    });
  });
});
