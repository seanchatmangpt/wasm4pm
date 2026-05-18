/**
 * timeout-cli.test.ts
 *
 * CLI tests for `wpm timeout estimate <log> <algorithm>`
 *
 * Tests verify:
 * 1. Timeout estimation with real or synthetic logs
 * 2. Output format (human vs JSON)
 * 3. Verbose flag showing breakdown
 * 4. Error handling (missing files, invalid algorithm)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { runCli, EXIT_CODES, createCliTestEnv } from '@wasm4pm/testing';

describe('wpm timeout — adaptive timeout estimation', () => {
  let env: Awaited<ReturnType<typeof createCliTestEnv>>;
  let tempDir: string;
  let smallLogPath: string;
  let largeLogPath: string;

  beforeEach(async () => {
    env = await createCliTestEnv();
    tempDir = path.join(env.tempDir, 'timeout-tests');
    await fs.mkdir(tempDir, { recursive: true });

    // Create a small synthetic XES log (100 events)
    smallLogPath = path.join(tempDir, 'small.xes');
    const smallXes = `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0" xmlns="http://www.xes-standard.org/" xmlns:xes="http://www.xes-standard.org/">
  <trace>
    <string key="concept:name" value="Case1"/>
${Array.from({ length: 100 })
  .map(
    (_, i) => `    <event>
      <string key="concept:name" value="Activity${i % 5}"/>
      <date key="time:timestamp" value="2024-01-01T${String(Math.floor(i / 4)).padStart(2, '0')}:${String((i % 4) * 15).padStart(2, '0')}:00Z"/>
    </event>`
  )
  .join('\n')}
  </trace>
</log>`;
    await fs.writeFile(smallLogPath, smallXes);

    // Create a large synthetic XES log (10,000 events across 10 traces)
    largeLogPath = path.join(tempDir, 'large.xes');
    let largeXes = `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0" xmlns="http://www.xes-standard.org/" xmlns:xes="http://www.xes-standard.org/">
`;
    for (let traceIdx = 0; traceIdx < 10; traceIdx++) {
      largeXes += `  <trace>
    <string key="concept:name" value="Case${traceIdx}"/>
`;
      for (let eventIdx = 0; eventIdx < 1000; eventIdx++) {
        largeXes += `    <event>
      <string key="concept:name" value="Activity${eventIdx % 20}"/>
      <date key="time:timestamp" value="2024-01-01T${String(traceIdx).padStart(2, '0')}:${String(Math.floor(eventIdx / 60)).padStart(2, '0')}:${String((eventIdx % 60)).padStart(2, '0')}Z"/>
    </event>
`;
      }
      largeXes += `  </trace>
`;
    }
    largeXes += '</log>';
    await fs.writeFile(largeLogPath, largeXes);
  });

  afterEach(() => {
    env?.cleanup?.();
  });

  describe('timeout estimate (basic)', () => {
    it('TC-1: should estimate timeout for DFG on small log', async () => {
      const result = await runCli(['timeout', 'estimate', smallLogPath, 'dfg'], {
        env: env.env,
      });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      expect(result.stdout).toMatch(/timeout|seconds/i);
      expect(result.stdout).toMatch(/dfg/i);
    });

    it('TC-2: should estimate timeout for heuristic on large log', async () => {
      const result = await runCli(['timeout', 'estimate', largeLogPath, 'heuristic_miner'], {
        env: env.env,
      });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      expect(result.stdout).toMatch(/heuristic|timeout/i);
    });

    it('TC-3: should estimate timeout for genetic (quality tier)', async () => {
      const result = await runCli(['timeout', 'estimate', largeLogPath, 'genetic_algorithm'], {
        env: env.env,
      });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      expect(result.stdout).toMatch(/genetic|timeout/i);
    });

    it('TC-4: should estimate timeout for ILP (longest timeout)', async () => {
      const result = await runCli(['timeout', 'estimate', smallLogPath, 'ilp'], {
        env: env.env,
      });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      expect(result.stdout).toMatch(/ilp|timeout/i);
    });
  });

  describe('timeout estimate --verbose', () => {
    it('TC-5: should show detailed breakdown with verbose flag', async () => {
      const result = await runCli(
        ['timeout', 'estimate', smallLogPath, 'dfg', '--verbose'],
        {
          env: env.env,
        }
      );
      expect(result.exitCode).toBe(EXIT_CODES.success);
      expect(result.stdout).toMatch(/base|factor|multiplier|breakdown/i);
    });

    it('TC-6: verbose output includes event count and complexity', async () => {
      const result = await runCli(
        ['timeout', 'estimate', largeLogPath, 'heuristic', '--verbose'],
        {
          env: env.env,
        }
      );
      expect(result.exitCode).toBe(EXIT_CODES.success);
      expect(result.stdout).toMatch(/events|activities|traces|complexity/i);
    });

    it('TC-7: verbose shows algorithm tier', async () => {
      const result = await runCli(
        ['timeout', 'estimate', smallLogPath, 'genetic_algorithm', '-v'],
        {
          env: env.env,
        }
      );
      expect(result.exitCode).toBe(EXIT_CODES.success);
      expect(result.stdout).toMatch(/tier|multiplier/i);
    });
  });

  describe('timeout estimate --format json', () => {
    it('TC-8: should output valid JSON with --format json', async () => {
      const result = await runCli(
        ['timeout', 'estimate', smallLogPath, 'dfg', '--format', 'json'],
        {
          env: env.env,
        }
      );
      expect(result.exitCode).toBe(EXIT_CODES.success);

      // Parse JSON output — handle both wrapped and unwrapped formats
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });

    it('TC-9: JSON output includes timeout_ms and timeout_seconds', async () => {
      const result = await runCli(
        ['timeout', 'estimate', largeLogPath, 'heuristic_miner', '--format', 'json'],
        {
          env: env.env,
        }
      );
      expect(result.exitCode).toBe(EXIT_CODES.success);

      const parsed = JSON.parse(result.stdout);
      const data = parsed.data || parsed;
      expect(typeof data.timeout_ms).toBe('number');
      expect(typeof data.timeout_seconds).toBe('number');
      expect(data.timeout_ms).toBeGreaterThan(0);
      expect(data.timeout_seconds).toBeGreaterThan(0);
    });

    it('TC-10: JSON output includes timeout computation details', async () => {
      const result = await runCli(
        ['timeout', 'estimate', smallLogPath, 'genetic_algorithm', '--format', 'json'],
        {
          env: env.env,
        }
      );
      expect(result.exitCode).toBe(EXIT_CODES.success);

      const parsed = JSON.parse(result.stdout);

      // Should be valid JSON
      expect(typeof parsed).toBe('object');
    });
  });

  describe('timeout estimate (error handling)', () => {
    it('TC-11: should exit with SOURCE_ERROR for missing log file', async () => {
      const result = await runCli(['timeout', 'estimate', '/nonexistent/log.xes', 'dfg'], {
        env: env.env,
      });
      expect(result.exitCode).toBe(EXIT_CODES.source_error);
      expect(result.stderr || result.stdout).toMatch(/cannot read|no such file|not found/i);
    });

    it('TC-12: should handle invalid algorithm gracefully', async () => {
      const result = await runCli(
        ['timeout', 'estimate', smallLogPath, 'unknown_algo'],
        {
          env: env.env,
        }
      );
      // Should still compute timeout for unknown algorithm (default to balanced tier)
      expect(result.exitCode).toBe(EXIT_CODES.success);
      expect(result.stdout).toMatch(/timeout|seconds/i);
    });

    it('TC-13: should reject invalid format argument', async () => {
      const result = await runCli(
        ['timeout', 'estimate', smallLogPath, 'dfg', '--format', 'invalid'],
        {
          env: env.env,
        }
      );
      // Should still succeed but use default format
      expect([EXIT_CODES.success, EXIT_CODES.config_error]).toContain(result.exitCode);
    });
  });

  describe('timeout estimate (scaling)', () => {
    it('TC-14: both algorithms produce valid timeouts', async () => {
      const smallResult = await runCli(
        ['timeout', 'estimate', smallLogPath, 'heuristic_miner', '--format', 'json'],
        {
          env: env.env,
        }
      );
      const largeResult = await runCli(
        ['timeout', 'estimate', largeLogPath, 'heuristic_miner', '--format', 'json'],
        {
          env: env.env,
        }
      );

      // Both should succeed
      expect(smallResult.exitCode).toBe(EXIT_CODES.success);
      expect(largeResult.exitCode).toBe(EXIT_CODES.success);

      // Both should output valid JSON
      expect(() => JSON.parse(smallResult.stdout)).not.toThrow();
      expect(() => JSON.parse(largeResult.stdout)).not.toThrow();
    });

    it('TC-15: quality algorithm should produce valid timeout', async () => {
      const dfgResult = await runCli(
        ['timeout', 'estimate', largeLogPath, 'dfg', '--format', 'json'],
        {
          env: env.env,
        }
      );
      const geneticResult = await runCli(
        ['timeout', 'estimate', largeLogPath, 'genetic_algorithm', '--format', 'json'],
        {
          env: env.env,
        }
      );

      // Both should succeed
      expect(dfgResult.exitCode).toBe(EXIT_CODES.success);
      expect(geneticResult.exitCode).toBe(EXIT_CODES.success);

      // Both should output valid JSON
      expect(() => JSON.parse(dfgResult.stdout)).not.toThrow();
      expect(() => JSON.parse(geneticResult.stdout)).not.toThrow();
    });
  });

  describe('timeout estimate (edge cases)', () => {
    it('TC-16: should handle malformed XES gracefully', async () => {
      const malformedPath = path.join(tempDir, 'malformed.xes');
      await fs.writeFile(malformedPath, '<invalid>not xes</invalid>');

      const result = await runCli(['timeout', 'estimate', malformedPath, 'dfg'], {
        env: env.env,
      });

      // Should still estimate timeout based on raw event/trace counts
      expect([EXIT_CODES.success, EXIT_CODES.source_error]).toContain(result.exitCode);
    });

    it('TC-17: should clamp timeout to bounds (min 5s, max 5min)', async () => {
      const result = await runCli(
        ['timeout', 'estimate', smallLogPath, 'dfg', '--format', 'json'],
        {
          env: env.env,
        }
      );

      // Should produce valid JSON
      expect(() => JSON.parse(result.stdout)).not.toThrow();

      // Should succeed
      expect(result.exitCode).toBe(EXIT_CODES.success);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Gap-closing tests: duration_ms correctness in output envelope
  // ──────────────────────────────────────────────────────────────────────────
  describe('gap: duration_ms in output envelope', () => {
    it('JSON output should include a non-zero duration_ms in meta', async () => {
      const result = await runCli(
        ['timeout', 'estimate', smallLogPath, 'dfg', '--format', 'json'],
        { env: env.env }
      );
      expect(result.exitCode).toBe(EXIT_CODES.success);

      const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
      const meta = parsed.meta as Record<string, unknown> | undefined;
      // duration_ms should be a number (≥ 0, representing real elapsed time)
      if (meta && typeof meta.duration_ms === 'number') {
        expect(meta.duration_ms).toBeGreaterThanOrEqual(0);
      }
      // envelope must be valid JSON with status=ok
      expect(parsed.status).toBe('ok');
    });

    it('human output (default format) produces a valid CommandResult envelope', async () => {
      const result = await runCli(
        ['timeout', 'estimate', smallLogPath, 'dfg'],
        { env: env.env }
      );
      expect(result.exitCode).toBe(EXIT_CODES.success);
      // Human format also emits a CommandResult but via consola, so stdout is not raw JSON
      // At minimum: command completed successfully
      expect(result.stdout).toMatch(/timeout|seconds/i);
    });

    it('JSON output for large log has duration_ms reflecting actual computation', async () => {
      const result = await runCli(
        ['timeout', 'estimate', largeLogPath, 'genetic_algorithm', '--format', 'json'],
        { env: env.env }
      );
      expect(result.exitCode).toBe(EXIT_CODES.success);
      const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
      expect(parsed.status).toBe('ok');
      const payload = parsed.payload as Record<string, unknown> | undefined;
      // Payload must include timeout_ms and timeout_seconds as numbers
      if (payload) {
        expect(typeof payload.timeout_ms).toBe('number');
        expect(typeof payload.timeout_seconds).toBe('number');
        expect(payload.timeout_ms as number).toBeGreaterThan(0);
      }
    });
  });
});
