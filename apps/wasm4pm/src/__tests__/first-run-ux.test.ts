/**
 * first-run-ux.test.ts
 * Tests for first-run user experience detection and hints
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { isFirstRun, interpretFitness, formatFirstRunHints } from '../first-run-ux.js';
import { runCli, EXIT_CODES, createCliTestEnv } from '@wasm4pm/testing';

describe('first-run-ux', () => {
  describe('isFirstRun()', () => {
    // isFirstRun() accepts an optional cwdOverride parameter so tests can pass
    // a temp directory directly without process.chdir() (unsupported in vitest
    // worker threads) or any mocking (forbidden by the Gemba test-purity hook).

    it('should detect first run when results directory does not exist', async () => {
      const tempDir = await fs.mkdtemp('/tmp/wpm-test-');
      try {
        const result = await isFirstRun(tempDir);
        expect(result).toBe(true);
      } finally {
        await fs.rm(tempDir, { recursive: true, force: true });
      }
    });

    it('should detect first run when results directory exists but has <2 files', async () => {
      const tempDir = await fs.mkdtemp('/tmp/wpm-test-');
      const resultsDir = path.join(tempDir, '.wasm4pm/results');
      try {
        await fs.mkdir(resultsDir, { recursive: true });
        // Actual filename format: <timestamp>-discover-<algo>.json
        await fs.writeFile(path.join(resultsDir, '20260518T090000-discover-dfg.json'), '{}');

        const result = await isFirstRun(tempDir);
        expect(result).toBe(true);
      } finally {
        await fs.rm(tempDir, { recursive: true, force: true });
      }
    });

    it('should return false after 2+ results exist', async () => {
      const tempDir = await fs.mkdtemp('/tmp/wpm-test-');
      const resultsDir = path.join(tempDir, '.wasm4pm/results');
      try {
        await fs.mkdir(resultsDir, { recursive: true });
        // Actual filename format: <timestamp>-discover-<algo>.json
        await fs.writeFile(path.join(resultsDir, '20260518T090000-discover-dfg.json'), '{}');
        await fs.writeFile(path.join(resultsDir, '20260518T090100-discover-heuristic.json'), '{}');

        const result = await isFirstRun(tempDir);
        expect(result).toBe(false);
      } finally {
        await fs.rm(tempDir, { recursive: true, force: true });
      }
    });

    it('should filter to only .json files with -discover- infix (timestamp-based filenames)', async () => {
      const tempDir = await fs.mkdtemp('/tmp/wpm-test-');
      const resultsDir = path.join(tempDir, '.wasm4pm/results');
      try {
        await fs.mkdir(resultsDir, { recursive: true });
        // One matching discovery result (timestamp-discover-algo format)
        await fs.writeFile(path.join(resultsDir, '20260518T090000-discover-dfg.json'), '{}');
        // Non-matching: no -discover- infix
        await fs.writeFile(path.join(resultsDir, 'other-file.json'), '{}');
        // Non-matching: wrong extension
        await fs.writeFile(path.join(resultsDir, '20260518T090100-discover-heuristic.txt'), '{}');

        const result = await isFirstRun(tempDir);
        // Should only count the one matching file (1 < 2), so still first run
        expect(result).toBe(true);
      } finally {
        await fs.rm(tempDir, { recursive: true, force: true });
      }
    });
  });

  describe('interpretFitness()', () => {
    it('should classify fitness >= 0.85 as High', () => {
      const result = interpretFitness(0.85);
      expect(result.level).toBe('High');
      expect(result.emoji).toBe('✓');
      expect(result.explanation).toContain('most observed behavior');
    });

    it('should classify fitness 0.60-0.85 as Medium', () => {
      const result = interpretFitness(0.70);
      expect(result.level).toBe('Medium');
      expect(result.emoji).toBe('◐');
      expect(result.explanation).toContain('genetic_algorithm');
    });

    it('should classify fitness 0.40-0.60 as Low', () => {
      const result = interpretFitness(0.50);
      expect(result.level).toBe('Low');
      expect(result.emoji).toBe('◕');
      expect(result.explanation).toContain('heuristic_miner');
    });

    it('should classify fitness < 0.40 as Critical', () => {
      const result = interpretFitness(0.30);
      expect(result.level).toBe('Critical');
      expect(result.emoji).toBe('✗');
      expect(result.explanation).toContain('doctor');
    });

    it('should handle boundary values', () => {
      expect(interpretFitness(0.85).level).toBe('High');
      expect(interpretFitness(0.84).level).toBe('Medium');
      expect(interpretFitness(0.60).level).toBe('Medium');
      expect(interpretFitness(0.59).level).toBe('Low');
      expect(interpretFitness(0.40).level).toBe('Low');
      expect(interpretFitness(0.39).level).toBe('Critical');
    });
  });

  describe('formatFirstRunHints()', () => {
    it('should include process model discovered header', () => {
      const hints = formatFirstRunHints(0.9, 'dfg', 'log.xes', null);
      expect(hints.some((h) => h.includes('Process Model Discovered'))).toBe(true);
    });

    it('should include fitness interpretation when provided', () => {
      const hints = formatFirstRunHints(0.85, 'dfg', 'log.xes', null);
      const fitnessLine = hints.find((h) => h.includes('Fitness:'));
      expect(fitnessLine).toBeDefined();
      expect(fitnessLine).toContain('85.0%');
      expect(fitnessLine).toContain('High');
    });

    it('should include actionable next steps', () => {
      const hints = formatFirstRunHints(0.9, 'dfg', 'log.xes', null);
      expect(hints.some((h) => h.includes('Review model'))).toBe(true);
      expect(hints.some((h) => h.includes('Validate'))).toBe(true);
      expect(hints.some((h) => h.includes('Compare algorithms'))).toBe(true);
      expect(hints.some((h) => h.includes('Learn more'))).toBe(true);
    });

    it('should include result save path when provided', () => {
      const hints = formatFirstRunHints(0.9, 'dfg', 'log.xes', '/path/to/result.json');
      expect(hints.some((h) => h.includes('Result saved'))).toBe(true);
    });

    it('should omit result path message when savedPath is null', () => {
      const hints = formatFirstRunHints(0.9, 'dfg', 'log.xes', null);
      expect(hints.some((h) => h.includes('Result saved'))).toBe(false);
    });

    it('should handle undefined fitness gracefully', () => {
      const hints = formatFirstRunHints(undefined, 'dfg', 'log.xes', null);
      expect(hints).toContain('');
      expect(hints.some((h) => h.includes('Next Steps'))).toBe(true);
    });

    it('should include Result saved line when savedPath is provided', () => {
      // Use a path that is relative to the test cwd so path.relative() produces a short path
      const savedPath = path.join(process.cwd(), '.wasm4pm', 'results', '20260518T090000-discover-dfg.json');
      const hints = formatFirstRunHints(0.9, 'dfg', 'log.xes', savedPath);
      const pathLine = hints.find((h) => h.includes('Result saved'));
      expect(pathLine).toBeDefined();
      // The line must not show the full absolute path — path.relative() must be applied
      expect(pathLine).not.toMatch(/^.*Result saved to: \//); // must not start with absolute path
    });

    it('should use basename for conformance command', () => {
      const hints = formatFirstRunHints(0.9, 'dfg', '/full/path/to/log.xes', null);
      const conformanceStep = hints.find((h) => h.includes('wpm conformance'));
      expect(conformanceStep).toContain('log.xes');
      expect(conformanceStep).not.toContain('/full/path');
    });
  });
});

// `wpm run` was hard-retired (apps/wasm4pm/src/nouns/_removed.ts): it now exits 1
// with "error: 'wpm run' was removed — use 'wpm model discover'" for every
// invocation, and its replacement, `model discover`, does not wire in
// first-run-ux hints at all (see first-run-ux.ts usage — only commands/run.ts
// calls formatFirstRunHints/isFirstRun). These tests previously appeared green
// only because they guarded on `env.testLog`, a field that never existed on
// `CliTestEnv` (a real bug, not a feature flag) so the guard was always truthy
// and every body returned before any assertion ran. Skipped below rather than
// asserting against dead functionality or reinstating a silent no-op guard;
// re-enable once first-run hints are reimplemented against `model discover`.
describe('wpm run — first-run UX integration', () => {
  let env: Awaited<ReturnType<typeof createCliTestEnv>>;
  // `CliTestEnv` (packages/testing/src/harness/cli.ts) does not carry a test-log
  // fixture or a `cwd` field — it exposes `tempDir`. Build a real XES fixture in
  // `tempDir` per-test (mirrors run-cli.test.ts) so these integration tests are
  // ready to exercise the CLI again once un-skipped.
  let testLog: string;

  beforeEach(async () => {
    env = await createCliTestEnv();
    const fixtureSource = path.resolve(process.cwd(), 'test/fixtures/small.xes');
    testLog = path.join(env.tempDir, 'test.xes');
    try {
      await fs.copyFile(fixtureSource, testLog);
    } catch {
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
      await fs.writeFile(testLog, minimalXes, 'utf-8');
    }
  });

  afterEach(() => {
    env?.cleanup?.();
  });

  it.skip('should show first-run hints on first discovery', async () => {
    // Clear results directory to simulate first run
    const resultsDir = path.join(env.tempDir, '.wasm4pm/results');
    if ((await fs.stat(resultsDir).catch(() => null))?.isDirectory?.()) {
      await fs.rm(resultsDir, { recursive: true, force: true });
    }

    const result = await runCli(['run', testLog, '--algorithm', 'dfg'], {
      cwd: env.tempDir,
      env: env.env,
    });
    expect(result.exitCode).toBe(EXIT_CODES.success);
    // First-run UX shows "Process Model Discovered" and next steps
    expect(result.stdout).toMatch(/Process Model|Next Steps|Review model|Validate/i);
  });

  it.skip('should include fitness interpretation in first-run hints', async () => {
    // Clear results to ensure first run
    const resultsDir = path.join(env.tempDir, '.wasm4pm/results');
    if ((await fs.stat(resultsDir).catch(() => null))?.isDirectory?.()) {
      await fs.rm(resultsDir, { recursive: true, force: true });
    }

    const result = await runCli(['run', testLog, '--algorithm', 'dfg', '--with-quality'], {
      cwd: env.tempDir,
      env: env.env,
    });
    expect(result.exitCode).toBe(EXIT_CODES.success);
    // When fitness is shown, interpretation should follow
    if (result.stdout.includes('Fitness:')) {
      expect(result.stdout).toMatch(/High|Medium|Low|Critical/i);
    }
  });

  it.skip('should not show first-run hints on subsequent runs', async () => {
    // Create results directory with 2+ files to simulate non-first run.
    // Use the actual filename format: <timestamp>-discover-<algo>.json
    const resultsDir = path.join(env.tempDir, '.wasm4pm/results');
    await fs.mkdir(resultsDir, { recursive: true });
    await fs.writeFile(path.join(resultsDir, '20260518T090000-discover-dfg.json'), '{}');
    await fs.writeFile(path.join(resultsDir, '20260518T090100-discover-heuristic.json'), '{}');

    const result = await runCli(['run', testLog, '--algorithm', 'dfg'], {
      cwd: env.tempDir,
      env: env.env,
    });
    expect(result.exitCode).toBe(EXIT_CODES.success);
    // Should NOT show "Process Model Discovered" on subsequent runs
    expect(result.stdout).not.toMatch(/🎯.*Process Model Discovered/);
  });

  it.skip('should hide first-run hints in JSON output format', async () => {
    // Clear results to simulate first run
    const resultsDir = path.join(env.tempDir, '.wasm4pm/results');
    if ((await fs.stat(resultsDir).catch(() => null))?.isDirectory?.()) {
      await fs.rm(resultsDir, { recursive: true, force: true });
    }

    const result = await runCli(['run', testLog, '--algorithm', 'dfg', '--format', 'json'], {
      cwd: env.tempDir,
      env: env.env,
    });
    expect(result.exitCode).toBe(EXIT_CODES.success);
    // JSON output should be pure JSON, no human-readable hints
    try {
      const json = JSON.parse(result.stdout);
      expect(json).toBeDefined();
    } catch {
      // If it's not valid JSON, the first-run hints were incorrectly included
      expect.fail('JSON format was not pure JSON');
    }
  });

  it.skip('should recommend wpm algorithms command in first-run hints', async () => {
    // Clear results to simulate first run
    const resultsDir = path.join(env.tempDir, '.wasm4pm/results');
    if ((await fs.stat(resultsDir).catch(() => null))?.isDirectory?.()) {
      await fs.rm(resultsDir, { recursive: true, force: true });
    }

    const result = await runCli(['run', testLog, '--algorithm', 'dfg'], {
      cwd: env.tempDir,
      env: env.env,
    });
    expect(result.exitCode).toBe(EXIT_CODES.success);
    expect(result.stdout).toMatch(/wpm algorithms/i);
  });
});
