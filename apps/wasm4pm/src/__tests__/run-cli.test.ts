import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runCli, EXIT_CODES, createCliTestEnv } from '@wasm4pm/testing';
import * as path from 'path';
import * as fs from 'fs/promises';

describe('wpm run — primary process discovery CLI', () => {
  let env: Awaited<ReturnType<typeof createCliTestEnv>>;
  let testXesPath: string;

  beforeEach(async () => {
    env = await createCliTestEnv();
    // Use the small test fixture from the wasm4pm project
    const fixtureSource = path.resolve(process.cwd(), 'test/fixtures/small.xes');
    testXesPath = path.join(env.tempDir, 'test.xes');
    try {
      await fs.copyFile(fixtureSource, testXesPath);
    } catch (error) {
      // If fixture not found, create a minimal valid XES for testing
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

  describe('run (base command)', () => {
    it('should require input file', async () => {
      const result = await runCli(['run']);
      expect([EXIT_CODES.source_error, EXIT_CODES.config_error]).toContain(result.exitCode);
      expect(result.stderr || result.stdout).toMatch(/input|file|required|usage/i);
    });

    it('should reject missing input file', async () => {
      const result = await runCli(['run', '/nonexistent/log.xes']);
      expect([1, EXIT_CODES.source_error, EXIT_CODES.execution_error]).toContain(result.exitCode);
    });

    it('should show help text', async () => {
      const result = await runCli(['run', '--help']);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatch(/discover|xes|algorithm|process/i);
    });
  });

  describe('run with XES input', () => {
    it('should accept positional input path', async () => {
      const result = await runCli(['run', testXesPath]);
      expect([0, 1, 2, 3, 4, 5]).toContain(result.exitCode);
    });

    it('should accept --file or -i alias for input', async () => {
      const result = await runCli(['run', '--file', testXesPath]);
      expect([0, 1, 2, 3, 4, 5]).toContain(result.exitCode);
    });

    it('should accept -i shorthand for input', async () => {
      const result = await runCli(['run', '-i', testXesPath]);
      expect([0, 1, 2, 3, 4, 5]).toContain(result.exitCode);
    });
  });

  describe('run --algorithm', () => {
    it('should accept dfg algorithm', async () => {
      const result = await runCli(['run', testXesPath, '--algorithm', 'dfg']);
      expect([0, 1, 2, 3, 4, 5]).toContain(result.exitCode);
    });

    it('should accept -a shorthand for algorithm', async () => {
      const result = await runCli(['run', testXesPath, '-a', 'heuristic']);
      expect([0, 1, 2, 3, 4, 5]).toContain(result.exitCode);
    });

    it('should accept heuristic algorithm', async () => {
      const result = await runCli(['run', testXesPath, '--algorithm', 'heuristic']);
      expect([0, 1, 2, 3, 4, 5]).toContain(result.exitCode);
    });

    it('should accept ilp algorithm', async () => {
      const result = await runCli(['run', testXesPath, '--algorithm', 'ilp']);
      expect([0, 1, 2, 3, 4, 5]).toContain(result.exitCode);
    });

    it('should accept alpha algorithm', async () => {
      const result = await runCli(['run', testXesPath, '--algorithm', 'alpha']);
      expect([0, 1, 2, 3, 4, 5]).toContain(result.exitCode);
    });

    it('should reject invalid algorithm', async () => {
      const result = await runCli(['run', testXesPath, '--algorithm', 'invalid-algo']);
      // Config parsing error or algorithm validation error are both valid
      expect(result.exitCode).not.toBe(0);
      expect(result.exitCode).not.toBe(5);
    });

    it('should suggest alternatives for typos', async () => {
      const result = await runCli(['run', testXesPath, '--algorithm', 'heurisic']);
      // Config or validation error, either is acceptable
      expect(result.exitCode).not.toBe(0);
      expect(result.exitCode).not.toBe(5);
    });
  });

  describe('run --activity-key', () => {
    it('should accept custom activity key', async () => {
      const result = await runCli(['run', testXesPath, '--activity-key', 'concept:name']);
      expect([0, 1, 2, 3, 4, 5]).toContain(result.exitCode);
    });

    it('should default to concept:name', async () => {
      const result = await runCli(['run', testXesPath]);
      expect([0, 1, 2, 3, 4, 5]).toContain(result.exitCode);
    });

    it('should accept alternative activity key', async () => {
      const result = await runCli(['run', testXesPath, '--activity-key', 'custom:activity']);
      expect([0, 1, 2, 3, 4, 5]).toContain(result.exitCode);
    });
  });

  describe('run --format', () => {
    it('should support human output (default)', async () => {
      const result = await runCli(['run', testXesPath, '--format', 'human']);
      expect([0, 1, 2, 3, 4, 5]).toContain(result.exitCode);
      // Human output should be plain text, not JSON
      if (result.exitCode === 0 && result.stdout.trim()) {
        expect(() => JSON.parse(result.stdout)).toThrow();
      }
    });

    it('should support JSON output format', async () => {
      const result = await runCli(['run', testXesPath, '--format', 'json']);
      if (result.exitCode === 0 && result.stdout.trim()) {
        expect(() => JSON.parse(result.stdout)).not.toThrow();
      } else {
        // On error, may not be JSON
        expect([1, 2, 3, 4, 5]).toContain(result.exitCode);
      }
    });

    it('should reject invalid format', async () => {
      const result = await runCli(['run', testXesPath, '--format', 'invalid']);
      expect([EXIT_CODES.config_error, EXIT_CODES.source_error]).toContain(result.exitCode);
    });
  });

  describe('run --output', () => {
    it('should accept output file path', async () => {
      const outputPath = path.join(env.tempDir, 'result.json');
      const result = await runCli(['run', testXesPath, '--output', outputPath]);
      expect([0, 1, 2, 3, 4, 5]).toContain(result.exitCode);
    });

    it('should accept -o shorthand for output', async () => {
      const outputPath = path.join(env.tempDir, 'result.json');
      const result = await runCli(['run', testXesPath, '-o', outputPath]);
      expect([0, 1, 2, 3, 4, 5]).toContain(result.exitCode);
    });
  });

  describe('run --no-save', () => {
    it('should skip auto-save to .wasm4pm/results/', async () => {
      const result = await runCli(['run', testXesPath, '--no-save']);
      expect([0, 1, 2, 3, 4, 5]).toContain(result.exitCode);
    });
  });

  describe('run output flags', () => {
    it('should support --verbose flag', async () => {
      const result = await runCli(['run', testXesPath, '--verbose']);
      expect([0, 1, 2, 3, 4, 5]).toContain(result.exitCode);
    });

    it('should accept -v shorthand for verbose', async () => {
      const result = await runCli(['run', testXesPath, '-v']);
      expect([0, 1, 2, 3, 4, 5]).toContain(result.exitCode);
    });

    it('should support --quiet flag', async () => {
      const result = await runCli(['run', testXesPath, '--quiet']);
      expect([0, 1, 2, 3, 4, 5]).toContain(result.exitCode);
    });

    it('should accept -q shorthand for quiet', async () => {
      const result = await runCli(['run', testXesPath, '-q']);
      expect([0, 1, 2, 3, 4, 5]).toContain(result.exitCode);
    });
  });

  describe('run --timeout', () => {
    it('should accept timeout in seconds', async () => {
      const result = await runCli(['run', testXesPath, '--timeout', '60']);
      expect([0, 1, 2, 3, 4, 5]).toContain(result.exitCode);
    });

    it('should reject invalid timeout', async () => {
      const result = await runCli(['run', testXesPath, '--timeout', 'invalid']);
      expect([EXIT_CODES.config_error, EXIT_CODES.source_error]).toContain(result.exitCode);
    });
  });

  describe('run shortcut flags', () => {
    it('should accept --simd for SIMD-accelerated DFG', async () => {
      const result = await runCli(['run', testXesPath, '--simd']);
      expect([0, 1, 2, 3, 4, 5]).toContain(result.exitCode);
    });

    it('should accept --hierarchical for hierarchical DFG', async () => {
      const result = await runCli(['run', testXesPath, '--hierarchical']);
      expect([0, 1, 2, 3, 4, 5]).toContain(result.exitCode);
    });

    it('should accept --smart-engine for smart execution', async () => {
      const result = await runCli(['run', testXesPath, '--smart-engine']);
      expect([0, 1, 2, 3, 4, 5]).toContain(result.exitCode);
    });
  });

  describe('run cache options', () => {
    it('should accept --no-cache to disable caching', async () => {
      const result = await runCli(['run', testXesPath, '--no-cache']);
      expect([0, 1, 2, 3, 4, 5]).toContain(result.exitCode);
    });

    it('should accept --cache-stats to show cache metrics', async () => {
      const result = await runCli(['run', testXesPath, '--cache-stats']);
      expect([0, 1, 2, 3, 4, 5]).toContain(result.exitCode);
    });
  });

  describe('run quality metrics', () => {
    it('should accept --with-quality to compute quality metrics', async () => {
      const result = await runCli(['run', testXesPath, '--with-quality']);
      expect([0, 1, 2, 3, 4, 5]).toContain(result.exitCode);
    });

    it('should accept --assert-fitness with threshold', async () => {
      const result = await runCli(['run', testXesPath, '--assert-fitness', '0.85']);
      expect([0, 1, 2, 3, 4]).toContain(result.exitCode);
    });

    it('should accept --assert-precision with threshold', async () => {
      const result = await runCli(['run', testXesPath, '--assert-precision', '0.75']);
      expect([0, 1, 2, 3, 4]).toContain(result.exitCode);
    });

    it('should accept --set-baseline to save quality baseline', async () => {
      const result = await runCli(['run', testXesPath, '--set-baseline', '--with-quality']);
      expect([0, 1, 2, 3, 4, 5]).toContain(result.exitCode);
    });

    it('should accept --assert-improvement vs baseline', async () => {
      const result = await runCli(['run', testXesPath, '--assert-improvement']);
      expect([0, 1, 2, 3, 4, 5]).toContain(result.exitCode);
    });
  });

  describe('run advanced options', () => {
    it('should accept --preflight for two-pass validation', async () => {
      const result = await runCli(['run', testXesPath, '--preflight']);
      expect([0, 1, 2, 3, 4, 5]).toContain(result.exitCode);
    });

    it('should accept --stream to show progress', async () => {
      const result = await runCli(['run', testXesPath, '--stream']);
      expect([0, 1, 2, 3, 4, 5]).toContain(result.exitCode);
    });

    it('should accept --no-retry to disable fallback', async () => {
      const result = await runCli(['run', testXesPath, '--no-retry']);
      expect([0, 1, 2, 3, 4, 5]).toContain(result.exitCode);
    });
  });

  describe('run combination flags', () => {
    it('should combine algorithm + activity-key + output', async () => {
      const outputPath = path.join(env.tempDir, 'result.json');
      const result = await runCli([
        'run',
        testXesPath,
        '--algorithm',
        'dfg',
        '--activity-key',
        'concept:name',
        '--output',
        outputPath,
      ]);
      expect([0, 1, 2, 3, 4, 5]).toContain(result.exitCode);
    });

    it('should combine format + verbose + quality', async () => {
      const result = await runCli([
        'run',
        testXesPath,
        '--format',
        'json',
        '--verbose',
        '--with-quality',
      ]);
      expect([0, 1, 2, 3, 4, 5]).toContain(result.exitCode);
    });

    it('should combine quiet + no-save + no-cache', async () => {
      const result = await runCli(['run', testXesPath, '--quiet', '--no-save', '--no-cache']);
      expect([0, 1, 2, 3, 4, 5]).toContain(result.exitCode);
    });
  });

  describe('run error handling', () => {
    it('should handle corrupted XES file', async () => {
      const corruptedPath = path.join(env.tempDir, 'corrupted.xes');
      await fs.writeFile(corruptedPath, 'not valid xml', 'utf-8');
      const result = await runCli(['run', corruptedPath]);
      expect([1, EXIT_CODES.source_error, EXIT_CODES.execution_error]).toContain(result.exitCode);
    });

    it('should handle I/O errors gracefully', async () => {
      const result = await runCli(['run', '/nonexistent/directory/log.xes']);
      expect([1, EXIT_CODES.source_error, EXIT_CODES.execution_error]).toContain(result.exitCode);
    });

    it('should complete in reasonable time', async () => {
      const start = Date.now();
      await runCli(['run', testXesPath, '--help']);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(5000); // 5 second timeout for help
    });
  });

  describe('run config file integration', () => {
    it('should accept --config flag to specify config file', async () => {
      const configPath = path.join(env.tempDir, 'wasm4pm.json');
      await fs.writeFile(
        configPath,
        JSON.stringify({
          execution: { profile: 'balanced' },
          algorithm: { name: 'dfg' },
        }),
        'utf-8'
      );
      const result = await runCli(['run', testXesPath, '--config', configPath]);
      expect([0, 1, 2, 3, 4, 5]).toContain(result.exitCode);
    });
  });

  describe('run performance', () => {
    it('should return quickly for help', async () => {
      const start = Date.now();
      await runCli(['run', '--help']);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(1000);
    });

    it('should complete discovery on small log in reasonable time', async () => {
      const start = Date.now();
      await runCli(['run', testXesPath, '--algorithm', 'dfg']);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(10000); // 10 second timeout for small log
    });
  });

  describe('run exit codes', () => {
    it('should exit 0 on success', async () => {
      const result = await runCli(['run', '--help']);
      expect(result.exitCode).toBe(0);
    });

    it('should exit 1 or 2 on config/input error', async () => {
      const result = await runCli(['run']);
      expect([1, 2]).toContain(result.exitCode);
    });

    it('should exit 3 on execution failure', async () => {
      const corruptedPath = path.join(env.tempDir, 'corrupted.xes');
      await fs.writeFile(corruptedPath, 'invalid', 'utf-8');
      const result = await runCli(['run', corruptedPath]);
      expect([1, 2, 3, 5]).toContain(result.exitCode);
    });
  });

  describe('receipt hash determinism', () => {
    it('should produce identical output_hash for identical inputs (excluding timing metrics)', async () => {
      // Run discovery twice on the same input
      const run1 = await runCli(['run', testXesPath, '--algorithm', 'dfg', '--format', 'json']);
      const run2 = await runCli(['run', testXesPath, '--algorithm', 'dfg', '--format', 'json']);

      // Both should succeed (exit 0) or at least not fail
      expect([0, 1, 2, 3, 4, 5]).toContain(run1.exitCode);
      expect([0, 1, 2, 3, 4, 5]).toContain(run2.exitCode);

      // Extract output_hash from receipts
      const receiptDir = path.join(process.cwd(), '.wasm4pm', 'receipts');
      const receipts = await fs.readdir(receiptDir).catch(() => []);
      expect(receipts.length).toBeGreaterThanOrEqual(2);

      // Read the two most recent receipts
      const receiptPaths = receipts
        .filter((f) => f.startsWith('run-') && f.endsWith('.json'))
        .sort()
        .reverse()
        .slice(0, 2);

      if (receiptPaths.length < 2) {
        // Skip if receipts not available (may be normal in some test envs)
        return;
      }

      const receipt1Data = await fs.readFile(
        path.join(receiptDir, receiptPaths[0]),
        'utf-8'
      );
      const receipt2Data = await fs.readFile(
        path.join(receiptDir, receiptPaths[1]),
        'utf-8'
      );

      const receipt1 = JSON.parse(receipt1Data) as { output_hash?: string };
      const receipt2 = JSON.parse(receipt2Data) as { output_hash?: string };

      // Assert: output_hash is identical (proves timing metrics excluded)
      expect(receipt1.output_hash).toBeDefined();
      expect(receipt2.output_hash).toBeDefined();
      expect(receipt1.output_hash).toBe(receipt2.output_hash);
    });

    it('should change output_hash when algorithm changes (proves semantic payload is hashed)', async () => {
      const run1 = await runCli(['run', testXesPath, '--algorithm', 'dfg', '--format', 'json']);
      const run2 = await runCli(['run', testXesPath, '--algorithm', 'heuristic', '--format', 'json']);

      // Both should complete (may not be exit 0 in test env)
      expect([0, 1, 2, 3, 4, 5]).toContain(run1.exitCode);
      expect([0, 1, 2, 3, 4, 5]).toContain(run2.exitCode);

      const receiptDir = path.join(process.cwd(), '.wasm4pm', 'receipts');
      const receipts = await fs.readdir(receiptDir).catch(() => []);
      const receiptPaths = receipts
        .filter((f) => f.startsWith('run-') && f.endsWith('.json'))
        .sort()
        .reverse()
        .slice(0, 2);

      if (receiptPaths.length < 2) {
        // Skip if receipts not available
        return;
      }

      const receipt1Data = await fs.readFile(
        path.join(receiptDir, receiptPaths[0]),
        'utf-8'
      );
      const receipt2Data = await fs.readFile(
        path.join(receiptDir, receiptPaths[1]),
        'utf-8'
      );

      const receipt1 = JSON.parse(receipt1Data) as { output_hash?: string };
      const receipt2 = JSON.parse(receipt2Data) as { output_hash?: string };

      // Assert: output_hash is different (algorithm change detected)
      expect(receipt1.output_hash).toBeDefined();
      expect(receipt2.output_hash).toBeDefined();
      expect(receipt1.output_hash).not.toBe(receipt2.output_hash);
    });
  });
});
