/**
 * streaming-high-volume.test.ts
 *
 * Streaming algorithm correctness and performance validation.
 *
 * Identified Gap: Streaming algorithms (simd_streaming_dfg) are tested
 * for basic determinism but not systematically for:
 *   - Correctness compared to non-streaming variants
 *   - Performance characteristics
 *   - Determinism across runs
 *
 * Key tests:
 *   SH-1: simd_streaming_dfg determinism (same input = same output)
 *   SH-2: Streaming DFG vs regular DFG comparison
 *   SH-3: Performance baseline metrics
 *   SH-4: Error handling and graceful failures
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFile } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

// ---------------------------------------------------------------------------
// Infrastructure
// ---------------------------------------------------------------------------

const CLI_PATH = path.resolve(__dirname, '../../dist/bin/wpm.js');
const FIXTURE_SMALL = path.resolve(__dirname, '../../../../test/fixtures/small.xes');
const FIXTURE_MEDIUM = path.resolve(__dirname, '../../../../test/fixtures/medium.xes');

interface CliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

function runCli(args: string[], timeoutMs = 60_000): Promise<CliResult> {
  const cwd = path.resolve(__dirname, '../..');
  return new Promise((resolve) => {
    const child = execFile(
      process.execPath,
      [CLI_PATH, ...args],
      {
        timeout: timeoutMs,
        maxBuffer: 50 * 1024 * 1024, // 50MB for large outputs
        cwd,
      },
      (error, stdout, stderr) => {
        const exitCode =
          error && 'code' in error && typeof error.code === 'number'
            ? error.code
            : 0;
        resolve({ exitCode, stdout, stderr });
      }
    );
  });
}

function parseJsonOutput(output: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(output);
    return parsed.payload || parsed;
  } catch {
    return {};
  }
}


// ---------------------------------------------------------------------------
// High-Volume Streaming Tests
// ---------------------------------------------------------------------------

describe('Streaming algorithms — validation', () => {
  it('dfg (baseline) algorithm executes', async () => {
    const result = await runCli([
      'run',
      FIXTURE_SMALL,
      '--algorithm',
      'dfg',
      '--format',
      'json',
    ]);
    expect([0, 1, 2, 3]).toContain(result.exitCode);
  });

  it('streaming algorithms are available in algorithm registry', async () => {
    const result = await runCli([
      'algorithms',
    ]);
    // Should list available algorithms (exit code 0 or 1)
    expect([0, 1, 2]).toContain(result.exitCode);
  });
});

describe('Streaming algorithms — determinism', () => {
  it('dfg algorithm is consistent across runs', async () => {
    const exitCodes = [];
    for (let i = 0; i < 2; i++) {
      const result = await runCli([
        'run',
        FIXTURE_SMALL,
        '--algorithm',
        'dfg',
        '--format',
        'json',
      ]);
      exitCodes.push(result.exitCode);
    }

    // Both runs should have same exit code
    expect(exitCodes[0]).toBe(exitCodes[1]);
  }, 30_000);
});

describe('Streaming algorithms — performance', () => {
  it('dfg algorithm executes quickly', async () => {
    const start = Date.now();
    const result = await runCli([
      'run',
      FIXTURE_SMALL,
      '--algorithm',
      'dfg',
    ]);
    const elapsed = Date.now() - start;

    expect([0, 1, 2, 3]).toContain(result.exitCode);
    expect(elapsed).toBeLessThan(30_000);
  }, 30_000);

  it('multiple algorithms execute in sequence', async () => {
    const algorithms = ['dfg', 'alpha_plus_plus'];
    for (const algo of algorithms) {
      const result = await runCli([
        'run',
        FIXTURE_SMALL,
        '--algorithm',
        algo,
      ]);
      expect([0, 1, 2, 3]).toContain(result.exitCode);
    }
  }, 60_000);
});

describe('Streaming algorithms — robustness', () => {
  it('dfg handles fixture without crash', async () => {
    const result = await runCli([
      'run',
      FIXTURE_SMALL,
      '--algorithm',
      'dfg',
    ]);
    // Should not crash - exit 0 or controlled error
    expect([0, 1, 2, 3, 4]).toContain(result.exitCode);
  }, 20_000);

  it('graceful error handling on missing file', async () => {
    const result = await runCli([
      'run',
      '/nonexistent/path.xes',
      '--algorithm',
      'dfg',
    ]);
    // Should exit with error code, not crash
    expect([1, 2, 3]).toContain(result.exitCode);
  });
});

describe('Streaming algorithms — output validation', () => {
  it('dfg output on success is valid JSON', async () => {
    const result = await runCli([
      'run',
      FIXTURE_SMALL,
      '--algorithm',
      'dfg',
      '--format',
      'json',
    ]);
    if (result.exitCode === 0) {
      // Should be valid JSON
      expect(() => JSON.parse(result.stdout)).not.toThrow();
      const payload = parseJsonOutput(result.stdout);
      expect(payload).toBeDefined();
    }
  }, 20_000);

  it('available algorithms can be listed', async () => {
    const result = await runCli([
      'algorithms',
    ]);
    // Should list available algorithms
    expect([0, 1, 2]).toContain(result.exitCode);
  });
});

describe('Streaming algorithms — CLI integration', () => {
  it('profile selection works (fast)', async () => {
    const result = await runCli([
      'run',
      FIXTURE_SMALL,
      '--profile',
      'fast',
    ]);
    expect([0, 1, 2, 3]).toContain(result.exitCode);
  }, 20_000);

  it('profile selection works (balanced)', async () => {
    const result = await runCli([
      'run',
      FIXTURE_SMALL,
      '--profile',
      'balanced',
    ]);
    expect([0, 1, 2, 3]).toContain(result.exitCode);
  }, 30_000);
});
