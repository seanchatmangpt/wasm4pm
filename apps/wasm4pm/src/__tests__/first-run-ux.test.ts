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
    it('should detect first run when results directory does not exist', async () => {
      // Mock the current working directory to a temp location with no .wasm4pm
      const originalCwd = process.cwd();
      const tempDir = await fs.mkdtemp('/tmp/wpm-test-');

      try {
        process.chdir(tempDir);
        const result = await isFirstRun();
        expect(result).toBe(true);
      } finally {
        process.chdir(originalCwd);
        await fs.rm(tempDir, { recursive: true, force: true });
      }
    });

    it('should detect first run when results directory exists but has <2 files', async () => {
      const originalCwd = process.cwd();
      const tempDir = await fs.mkdtemp('/tmp/wpm-test-');
      const resultsDir = path.join(tempDir, '.wasm4pm/results');

      try {
        process.chdir(tempDir);
        await fs.mkdir(resultsDir, { recursive: true });
        await fs.writeFile(path.join(resultsDir, 'discover-dfg.json'), '{}');

        const result = await isFirstRun();
        expect(result).toBe(true);
      } finally {
        process.chdir(originalCwd);
        await fs.rm(tempDir, { recursive: true, force: true });
      }
    });

    it('should return false after 2+ results exist', async () => {
      const originalCwd = process.cwd();
      const tempDir = await fs.mkdtemp('/tmp/wpm-test-');
      const resultsDir = path.join(tempDir, '.wasm4pm/results');

      try {
        process.chdir(tempDir);
        await fs.mkdir(resultsDir, { recursive: true });
        await fs.writeFile(path.join(resultsDir, 'discover-dfg.json'), '{}');
        await fs.writeFile(path.join(resultsDir, 'discover-heuristic.json'), '{}');

        const result = await isFirstRun();
        expect(result).toBe(false);
      } finally {
        process.chdir(originalCwd);
        await fs.rm(tempDir, { recursive: true, force: true });
      }
    });

    it('should filter to only .json files with discover- prefix', async () => {
      const originalCwd = process.cwd();
      const tempDir = await fs.mkdtemp('/tmp/wpm-test-');
      const resultsDir = path.join(tempDir, '.wasm4pm/results');

      try {
        process.chdir(tempDir);
        await fs.mkdir(resultsDir, { recursive: true });
        await fs.writeFile(path.join(resultsDir, 'discover-dfg.json'), '{}');
        await fs.writeFile(path.join(resultsDir, 'other-file.json'), '{}');
        await fs.writeFile(path.join(resultsDir, 'discover-heuristic.txt'), '{}');

        const result = await isFirstRun();
        // Should only count discover-dfg.json (1 file), so still first run
        expect(result).toBe(true);
      } finally {
        process.chdir(originalCwd);
        await fs.rm(tempDir, { recursive: true, force: true });
      }
    });
  });

  describe('interpretFitness()', () => {
    it('should classify fitness >= 0.85 as High', () => {
      const result = interpretFitness(0.85);
      expect(result.level).toBe('High');
      expect(result.emoji).toBe('✓');
      expect(result.explanation).toContain('Most observed');
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

    it('should use relative path for saved result', () => {
      const hints = formatFirstRunHints(0.9, 'dfg', 'log.xes', '/usr/local/.wasm4pm/results/discover-dfg.json');
      const pathLine = hints.find((h) => h.includes('Result saved'));
      // Should use relative path, not absolute
      expect(pathLine).toBeDefined();
      expect(pathLine).not.toContain('/usr/local/');
    });

    it('should use basename for conformance command', () => {
      const hints = formatFirstRunHints(0.9, 'dfg', '/full/path/to/log.xes', null);
      const conformanceStep = hints.find((h) => h.includes('wpm conformance'));
      expect(conformanceStep).toContain('log.xes');
      expect(conformanceStep).not.toContain('/full/path');
    });
  });
});

describe('wpm run — first-run UX integration', () => {
  let env: Awaited<ReturnType<typeof createCliTestEnv>>;

  beforeEach(async () => {
    env = await createCliTestEnv();
  });

  afterEach(() => {
    env?.cleanup?.();
  });

  it('should show first-run hints on first discovery', async () => {
    // Skip if no test log available
    if (!env.testLog) {
      return;
    }

    // Clear results directory to simulate first run
    const resultsDir = path.join(env.cwd, '.wasm4pm/results');
    if ((await fs.stat(resultsDir).catch(() => null))?.isDirectory?.()) {
      await fs.rm(resultsDir, { recursive: true, force: true });
    }

    const result = await runCli(['run', env.testLog, '--algorithm', 'dfg'], { env: env.env });
    expect(result.exitCode).toBe(EXIT_CODES.success);
    // First-run UX shows "Process Model Discovered" and next steps
    expect(result.stdout).toMatch(/Process Model|Next Steps|Review model|Validate/i);
  });

  it('should include fitness interpretation in first-run hints', async () => {
    if (!env.testLog) {
      return;
    }

    // Clear results to ensure first run
    const resultsDir = path.join(env.cwd, '.wasm4pm/results');
    if ((await fs.stat(resultsDir).catch(() => null))?.isDirectory?.()) {
      await fs.rm(resultsDir, { recursive: true, force: true });
    }

    const result = await runCli(['run', env.testLog, '--algorithm', 'dfg', '--with-quality'], {
      env: env.env,
    });
    expect(result.exitCode).toBe(EXIT_CODES.success);
    // When fitness is shown, interpretation should follow
    if (result.stdout.includes('Fitness:')) {
      expect(result.stdout).toMatch(/High|Medium|Low|Critical/i);
    }
  });

  it('should not show first-run hints on subsequent runs', async () => {
    if (!env.testLog) {
      return;
    }

    // Create results directory with 2+ files to simulate non-first run
    const resultsDir = path.join(env.cwd, '.wasm4pm/results');
    await fs.mkdir(resultsDir, { recursive: true });
    await fs.writeFile(path.join(resultsDir, 'discover-dfg.json'), '{}');
    await fs.writeFile(path.join(resultsDir, 'discover-heuristic.json'), '{}');

    const result = await runCli(['run', env.testLog, '--algorithm', 'dfg'], { env: env.env });
    expect(result.exitCode).toBe(EXIT_CODES.success);
    // Should NOT show "Process Model Discovered" on subsequent runs
    expect(result.stdout).not.toMatch(/🎯.*Process Model Discovered/);
  });

  it('should hide first-run hints in JSON output format', async () => {
    if (!env.testLog) {
      return;
    }

    // Clear results to simulate first run
    const resultsDir = path.join(env.cwd, '.wasm4pm/results');
    if ((await fs.stat(resultsDir).catch(() => null))?.isDirectory?.()) {
      await fs.rm(resultsDir, { recursive: true, force: true });
    }

    const result = await runCli(['run', env.testLog, '--algorithm', 'dfg', '--format', 'json'], {
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

  it('should recommend wpm algorithms command in first-run hints', async () => {
    if (!env.testLog) {
      return;
    }

    // Clear results to simulate first run
    const resultsDir = path.join(env.cwd, '.wasm4pm/results');
    if ((await fs.stat(resultsDir).catch(() => null))?.isDirectory?.()) {
      await fs.rm(resultsDir, { recursive: true, force: true });
    }

    const result = await runCli(['run', env.testLog, '--algorithm', 'dfg'], { env: env.env });
    expect(result.exitCode).toBe(EXIT_CODES.success);
    expect(result.stdout).toMatch(/wpm algorithms/i);
  });
});
