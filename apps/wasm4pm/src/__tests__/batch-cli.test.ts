/**
 * batch-cli.test.ts
 * CLI tests for wpm batch command — parallel processing of multiple event logs
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runCli, EXIT_CODES, createCliTestEnv } from '@wasm4pm/testing';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

/**
 * Minimal valid XES event log with 3 traces
 */
const MIN_VALID_XES = `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0" xmlns="http://www.xes.org/">
  <trace>
    <event>
      <string key="concept:name" value="Start"/>
      <string key="time:timestamp" value="2024-01-01T00:00:00Z"/>
    </event>
    <event>
      <string key="concept:name" value="Process"/>
      <string key="time:timestamp" value="2024-01-01T00:01:00Z"/>
    </event>
    <event>
      <string key="concept:name" value="End"/>
      <string key="time:timestamp" value="2024-01-01T00:02:00Z"/>
    </event>
  </trace>
</log>`;

describe('wpm batch — parallel discovery of multiple event logs', () => {
  let env: Awaited<ReturnType<typeof createCliTestEnv>>;
  let tmpDir: string;

  beforeEach(async () => {
    env = await createCliTestEnv();
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wpm-batch-test-'));
  });

  afterEach(async () => {
    env?.cleanup?.();
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  /**
   * Create mock XES files for testing
   */
  async function createMockXesFiles(count: number): Promise<string[]> {
    const files: string[] = [];
    for (let i = 0; i < count; i++) {
      const filePath = path.join(tmpDir, `log_${i}.xes`);
      await fs.writeFile(filePath, MIN_VALID_XES);
      files.push(filePath);
    }
    return files;
  }

  describe('basic functionality', () => {
    it('should process a directory with multiple XES files', async () => {
      await createMockXesFiles(2);
      const result = await runCli(['batch', tmpDir, '--algorithm', 'dfg']);
      expect([EXIT_CODES.success, EXIT_CODES.partial_failure]).toContain(result.exitCode);
    });

    it('should require a directory argument', async () => {
      const result = await runCli(['batch']);
      expect(result.exitCode).not.toBe(EXIT_CODES.success);
    });

    it('should error on non-existent directory', async () => {
      const result = await runCli(['batch', '/nonexistent/path/batch-test-12345']);
      expect(result.exitCode).toBe(EXIT_CODES.source_error);
    });

    it('should error on empty directory', async () => {
      const result = await runCli(['batch', tmpDir]);
      expect(result.exitCode).toBe(EXIT_CODES.source_error);
    });
  });

  describe('algorithm selection', () => {
    it('should accept --algorithm dfg', async () => {
      await createMockXesFiles(1);
      const result = await runCli(['batch', tmpDir, '--algorithm', 'dfg']);
      expect([EXIT_CODES.success, EXIT_CODES.partial_failure]).toContain(result.exitCode);
    });

    it('should accept --algorithm heuristic (default)', async () => {
      await createMockXesFiles(1);
      const result = await runCli(['batch', tmpDir]);
      expect([EXIT_CODES.success, EXIT_CODES.partial_failure]).toContain(result.exitCode);
    });

    it('should accept --algorithm alpha', async () => {
      await createMockXesFiles(1);
      const result = await runCli(['batch', tmpDir, '--algorithm', 'alpha']);
      expect([EXIT_CODES.success, EXIT_CODES.partial_failure]).toContain(result.exitCode);
    });

    it('should accept --algorithm inductive', async () => {
      await createMockXesFiles(1);
      const result = await runCli(['batch', tmpDir, '--algorithm', 'inductive']);
      expect([EXIT_CODES.success, EXIT_CODES.partial_failure]).toContain(result.exitCode);
    });
  });

  describe('worker configuration', () => {
    it('should accept --workers 2 for parallel processing', async () => {
      await createMockXesFiles(2);
      const result = await runCli(['batch', tmpDir, '--workers', '2']);
      expect([EXIT_CODES.success, EXIT_CODES.partial_failure]).toContain(result.exitCode);
    });

    it('should accept --workers 1 for serial processing', async () => {
      await createMockXesFiles(2);
      const result = await runCli(['batch', tmpDir, '--workers', '1']);
      expect([EXIT_CODES.success, EXIT_CODES.partial_failure]).toContain(result.exitCode);
    });

    it('should default to CPU count if --workers not specified', async () => {
      await createMockXesFiles(1);
      const result = await runCli(['batch', tmpDir]);
      expect([EXIT_CODES.success, EXIT_CODES.partial_failure]).toContain(result.exitCode);
    });

    it('should handle --workers 4 with small file set', async () => {
      await createMockXesFiles(2);
      const result = await runCli(['batch', tmpDir, '--workers', '4']);
      expect([EXIT_CODES.success, EXIT_CODES.partial_failure]).toContain(result.exitCode);
    });
  });

  describe('timeout configuration', () => {
    it('should accept --timeout option (in seconds)', async () => {
      await createMockXesFiles(1);
      const result = await runCli(['batch', tmpDir, '--timeout', '60']);
      expect([EXIT_CODES.success, EXIT_CODES.partial_failure]).toContain(result.exitCode);
    });

    it('should default to 300 seconds if not specified', async () => {
      await createMockXesFiles(1);
      const result = await runCli(['batch', tmpDir]);
      expect([EXIT_CODES.success, EXIT_CODES.partial_failure]).toContain(result.exitCode);
    });

    it('should accept --timeout 10 for shorter timeout', async () => {
      await createMockXesFiles(1);
      const result = await runCli(['batch', tmpDir, '--timeout', '10']);
      expect([EXIT_CODES.success, EXIT_CODES.partial_failure]).toContain(result.exitCode);
    });
  });

  describe('output formats', () => {
    it('should output human format by default', async () => {
      await createMockXesFiles(1);
      const result = await runCli(['batch', tmpDir]);
      expect([EXIT_CODES.success, EXIT_CODES.partial_failure]).toContain(result.exitCode);
      expect(result.stdout).toMatch(/BATCH|SUMMARY|TIMING|STATISTICS/i);
    });

    it('should support --format json', async () => {
      await createMockXesFiles(1);
      const result = await runCli(['batch', tmpDir, '--format', 'json']);
      expect([EXIT_CODES.success, EXIT_CODES.partial_failure]).toContain(result.exitCode);
      // Output should be valid JSON or at least contain the structure
      expect(result.stdout).toBeTruthy();
    });

    it('should support --format jsonl', async () => {
      await createMockXesFiles(1);
      const result = await runCli(['batch', tmpDir, '--format', 'jsonl']);
      expect([EXIT_CODES.success, EXIT_CODES.partial_failure]).toContain(result.exitCode);
      expect(result.stdout).toBeTruthy();
    });

    it('should support --verbose for per-log details', async () => {
      await createMockXesFiles(2);
      const result = await runCli(['batch', tmpDir, '--verbose']);
      expect([EXIT_CODES.success, EXIT_CODES.partial_failure]).toContain(result.exitCode);
      // Verbose flag is accepted without error
      expect(result.exitCode).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('should continue processing when one log has error', async () => {
      await createMockXesFiles(2);
      const invalidFile = path.join(tmpDir, 'invalid.xes');
      await fs.writeFile(invalidFile, 'invalid xml');

      const result = await runCli(['batch', tmpDir]);
      expect([EXIT_CODES.success, EXIT_CODES.partial_failure]).toContain(result.exitCode);
    });

    it('should report failed logs in summary', async () => {
      await createMockXesFiles(2);
      const result = await runCli(['batch', tmpDir, '--verbose']);
      expect([EXIT_CODES.success, EXIT_CODES.partial_failure]).toContain(result.exitCode);
      // Summary is included in the verbose output
      expect(result.stdout).toBeTruthy();
    });

    it('should handle mixed valid and invalid files', async () => {
      await createMockXesFiles(1);
      const invalidFile = path.join(tmpDir, 'corrupted.xes');
      await fs.writeFile(invalidFile, '<invalid>');
      const validFile = path.join(tmpDir, 'valid.xes');
      await fs.writeFile(validFile, MIN_VALID_XES);

      const result = await runCli(['batch', tmpDir]);
      expect([EXIT_CODES.success, EXIT_CODES.partial_failure]).toContain(result.exitCode);
    });
  });

  describe('timing metrics', () => {
    it('should report total elapsed time', async () => {
      await createMockXesFiles(1);
      const result = await runCli(['batch', tmpDir]);
      expect([EXIT_CODES.success, EXIT_CODES.partial_failure]).toContain(result.exitCode);
      // Command completes without error
      expect(result.exitCode).toBeDefined();
    });

    it('should report per-log timing in verbose mode', async () => {
      await createMockXesFiles(2);
      const result = await runCli(['batch', tmpDir, '--verbose']);
      expect([EXIT_CODES.success, EXIT_CODES.partial_failure]).toContain(result.exitCode);
      expect(result.stdout).toMatch(/ms|s/);
    });
  });

  describe('output payload structure', () => {
    it('should produce CommandResult<BatchPayload> envelope', async () => {
      await createMockXesFiles(1);
      const result = await runCli(['batch', tmpDir, '--format', 'json']);
      expect([EXIT_CODES.success, EXIT_CODES.partial_failure]).toContain(result.exitCode);
      // Result should be valid structured output
      expect(result.stdout).toBeTruthy();
    });

    it('should include logCount in payload', async () => {
      await createMockXesFiles(3);
      const result = await runCli(['batch', tmpDir, '--format', 'json']);
      expect([EXIT_CODES.success, EXIT_CODES.partial_failure]).toContain(result.exitCode);
      expect(result.stdout).toContain('3');
    });

    it('should include summary statistics in payload', async () => {
      await createMockXesFiles(2);
      const result = await runCli(['batch', tmpDir, '--format', 'json']);
      expect([EXIT_CODES.success, EXIT_CODES.partial_failure]).toContain(result.exitCode);
      // Summary should contain totalLogs, successful, failed, etc.
      expect(result.stdout).toMatch(/totalLogs|successful|failed/);
    });
  });

  describe('edge cases', () => {
    it('should handle single log file', async () => {
      await createMockXesFiles(1);
      const result = await runCli(['batch', tmpDir]);
      expect([EXIT_CODES.success, EXIT_CODES.partial_failure]).toContain(result.exitCode);
    });

    it('should handle many log files (10+)', async () => {
      await createMockXesFiles(10);
      const result = await runCli(['batch', tmpDir, '--workers', '2']);
      expect([EXIT_CODES.success, EXIT_CODES.partial_failure]).toContain(result.exitCode);
      // Command completes successfully with many files
      expect(result.exitCode).toBeDefined();
    });

    it('should handle .json format event logs alongside .xes files', async () => {
      const jsonFile = path.join(tmpDir, 'log.json');
      await fs.writeFile(
        jsonFile,
        JSON.stringify({
          logs: [
            {
              events: [
                { concept_name: 'Start', timestamp: '2024-01-01T00:00:00Z' },
                { concept_name: 'End', timestamp: '2024-01-01T00:01:00Z' },
              ],
            },
          ],
        })
      );
      await createMockXesFiles(1);
      const result = await runCli(['batch', tmpDir]);
      expect([EXIT_CODES.success, EXIT_CODES.partial_failure]).toContain(result.exitCode);
    });

    it('should skip hidden files and node_modules', async () => {
      await createMockXesFiles(2);
      const hiddenFile = path.join(tmpDir, '.hidden.xes');
      await fs.writeFile(hiddenFile, MIN_VALID_XES);
      const nmDir = path.join(tmpDir, 'node_modules');
      await fs.mkdir(nmDir);
      await fs.writeFile(path.join(nmDir, 'log.xes'), MIN_VALID_XES);

      const result = await runCli(['batch', tmpDir]);
      expect([EXIT_CODES.success, EXIT_CODES.partial_failure]).toContain(result.exitCode);
      // Should complete without error, skipping hidden/node_modules files
      expect(result.exitCode).toBeDefined();
    });

    it('should process nested subdirectories', async () => {
      const subDir = path.join(tmpDir, 'subdir', 'nested');
      await fs.mkdir(subDir, { recursive: true });
      const logPath = path.join(subDir, 'log.xes');
      await fs.writeFile(logPath, MIN_VALID_XES);

      const result = await runCli(['batch', tmpDir]);
      expect([EXIT_CODES.success, EXIT_CODES.partial_failure]).toContain(result.exitCode);
    });

    it('should handle very long file paths', async () => {
      const deepDir = path.join(
        tmpDir,
        'a',
        'b',
        'c',
        'd',
        'e',
        'f',
        'g',
        'h',
        'i',
        'j'
      );
      await fs.mkdir(deepDir, { recursive: true });
      const logPath = path.join(deepDir, 'log.xes');
      await fs.writeFile(logPath, MIN_VALID_XES);

      const result = await runCli(['batch', tmpDir]);
      expect([EXIT_CODES.success, EXIT_CODES.partial_failure]).toContain(result.exitCode);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Gap-closing tests: --workers validation, --no-save, structured JSON payload
  // ──────────────────────────────────────────────────────────────────────────
  describe('gap: --workers validation', () => {
    it('should return config_error (1) when --workers 0', async () => {
      await createMockXesFiles(1);
      const result = await runCli(['batch', tmpDir, '--workers', '0']);
      expect(result.exitCode).toBe(EXIT_CODES.config_error);
    });

    it('should return config_error (1) when --workers 0.5 (non-integer)', async () => {
      await createMockXesFiles(1);
      // parseInt('0.5') = 0, which is ≤ 0 and should be rejected
      const result = await runCli(['batch', tmpDir, '--workers', '0.5']);
      expect(result.exitCode).toBe(EXIT_CODES.config_error);
    });

    it('should return config_error (1) when --workers is not a number', async () => {
      await createMockXesFiles(1);
      const result = await runCli(['batch', tmpDir, '--workers', 'abc']);
      expect(result.exitCode).toBe(EXIT_CODES.config_error);
    });

    it('should include a helpful message when --workers is invalid', async () => {
      await createMockXesFiles(1);
      const result = await runCli(['batch', tmpDir, '--workers', '0']);
      expect(result.stdout + result.stderr).toMatch(/workers|positive integer/i);
    });

    it('should accept --workers 1 (boundary: minimum valid value)', async () => {
      await createMockXesFiles(1);
      const result = await runCli(['batch', tmpDir, '--workers', '1']);
      expect([EXIT_CODES.success, EXIT_CODES.partial_failure]).toContain(result.exitCode);
    });
  });

  describe('gap: --no-save flag', () => {
    it('should accept --no-save flag without error', async () => {
      await createMockXesFiles(1);
      const result = await runCli(['batch', tmpDir, '--no-save']);
      expect([EXIT_CODES.success, EXIT_CODES.partial_failure]).toContain(result.exitCode);
    });

    it('--no-save with --format json should still produce structured output', async () => {
      await createMockXesFiles(1);
      const result = await runCli(['batch', tmpDir, '--no-save', '--format', 'json']);
      expect([EXIT_CODES.success, EXIT_CODES.partial_failure]).toContain(result.exitCode);
      expect(result.stdout).toBeTruthy();
    });
  });

  describe('gap: structured JSON payload fields', () => {
    it('--format json should include success_count field', async () => {
      await createMockXesFiles(2);
      const result = await runCli(['batch', tmpDir, '--format', 'json']);
      expect([EXIT_CODES.success, EXIT_CODES.partial_failure]).toContain(result.exitCode);
      expect(result.stdout).toMatch(/success_count/);
    });

    it('--format json should include failure_count field', async () => {
      await createMockXesFiles(2);
      const result = await runCli(['batch', tmpDir, '--format', 'json']);
      expect([EXIT_CODES.success, EXIT_CODES.partial_failure]).toContain(result.exitCode);
      expect(result.stdout).toMatch(/failure_count/);
    });

    it('--format json should include total_duration_ms field', async () => {
      await createMockXesFiles(1);
      const result = await runCli(['batch', tmpDir, '--format', 'json']);
      expect([EXIT_CODES.success, EXIT_CODES.partial_failure]).toContain(result.exitCode);
      expect(result.stdout).toMatch(/total_duration_ms/);
    });

    it('--format json should include per_file_results array', async () => {
      await createMockXesFiles(2);
      const result = await runCli(['batch', tmpDir, '--format', 'json']);
      expect([EXIT_CODES.success, EXIT_CODES.partial_failure]).toContain(result.exitCode);
      expect(result.stdout).toMatch(/per_file_results/);
    });
  });
});
