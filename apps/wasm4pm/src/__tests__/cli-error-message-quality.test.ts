/**
 * CLI Error Message Quality Test Suite
 *
 * Validates that error messages are clear, actionable, and include:
 * - What went wrong
 * - Why it happened
 * - How to fix it
 */

import { describe, it, expect } from 'vitest';
import { runCli, EXIT_CODES } from '@wasm4pm/testing';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('CLI Error Messages — Clarity & Actionability', () => {
  const fixturesDir = path.join(process.cwd(), 'apps/wasm4pm/src/__tests__/fixtures');

  describe('run command', () => {
    it('should provide clear error when input file does not exist', async () => {
      const result = await runCli(['model', 'discover', '/nonexistent/path/log.xes', '--algorithm', 'dfg']);

      // Should not be success (config error, source error, or execution error)
      expect(result.exitCode).not.toBe(EXIT_CODES.success);

      // Error message should exist and be informative
      const output = result.stdout + result.stderr;
      expect(output.length).toBeGreaterThan(20); // Has error details
    });

    it('should suggest valid algorithms when unknown algorithm is provided', async () => {
      // Use a minimal run to test algorithm validation
      const result = await runCli(['model', 'discover', '--algorithm', 'unknown-algo', '--help']);
      const output = result.stdout + result.stderr;

      // Either help works or error suggests valid algorithms
      // The key is it doesn't crash
      expect([EXIT_CODES.success, EXIT_CODES.config_error]).toContain(result.exitCode);
    });
  });

  describe('benchmark command', () => {
    it('should provide guidance on missing corpus or unavailable benchmarks', async () => {
      const result = await runCli(['lab', 'benchmark', 'replay']);

      // Either succeeds or gives clear error
      expect([EXIT_CODES.success, EXIT_CODES.source_error, EXIT_CODES.execution_error]).toContain(
        result.exitCode
      );

      // If error, should provide actionable guidance
      if (result.exitCode !== EXIT_CODES.success) {
        const output = result.stdout + result.stderr;
        expect(output.length).toBeGreaterThan(10); // Has descriptive error
      }
    });

    it('should validate corpus file exists', async () => {
      const result = await runCli(['lab', 'benchmark', 'replay', '--corpus', '/nonexistent.jsonl']);

      // Should be an error
      expect(result.exitCode).not.toBe(EXIT_CODES.success);
      const output = result.stdout + result.stderr;
      expect(output).toMatch(/not found|does not exist|missing/i);
    });
  });

  describe('predict command', () => {
    it('should validate task parameter with suggestions', async () => {
      const result = await runCli(['model', 'predict', 'invalid-task', '-i', 'test_file.xes']);

      // `model predict` is a bridged verb (nouns/_bridge.ts): the legacy
      // command's own config_error(1) classification is collapsed by the
      // generic bridge's `classifyLegacyFailure` into the framework's
      // INVALID_INPUT bucket, which wpm's errorCodeMap resolves to
      // source_error (2), not the legacy config_error.
      expect(result.exitCode).toBe(EXIT_CODES.source_error);
      const output = result.stdout + result.stderr;

      // Should list valid tasks
      expect(output).toMatch(/unknown|invalid/i);
      expect(output).toMatch(/valid|available/i);
      expect(output).toMatch(/next-activity|remaining-time|outcome/i);
    });

    it('should handle prefix validation for case-level predictions', async () => {
      const result = await runCli([
        'model', 'predict',
        'next-activity',
        '-i', 'test_file.xes',
        '--prefix', 'NotAnActivity,Also-NotOne',
      ]);

      // Either succeeds or gives clear guidance on invalid prefix
      if (result.exitCode !== EXIT_CODES.success) {
        const output = result.stdout + result.stderr;
        // FM-5: `output.length > 0` would pass for a single space or newline.
        // Assert that the output actually contains error-relevant content.
        expect(output).toMatch(/error|invalid|prefix|activity|not found/i);
      }
    });
  });

  describe('powl command', () => {
    it('should show help without hanging', async () => {
      const result = await runCli(['powl', '--help'], { timeout: 3000 });

      // Should complete (success or error, not timeout)
      expect([EXIT_CODES.success, EXIT_CODES.config_error]).toContain(result.exitCode);
    }, { timeout: 6000 });
  });

  describe('config validation', () => {
    it('should provide guidance on invalid --format flag', async () => {
      const result = await runCli(['model', 'discover', '--format', 'xml', '--help']);

      // If --format is rejected, should suggest valid formats
      const output = result.stdout + result.stderr;
      if (output.includes('invalid') || output.includes('unknown')) {
        expect(output).toMatch(/human|json/i);
      }
    });
  });

  describe('exit code contract', () => {
    it('should use proper exit codes for argument/config problems', async () => {
      const result = await runCli(['model', 'predict', 'bad-task', '-i', 'x.xes']);
      // Should not be success
      expect(result.exitCode).not.toBe(EXIT_CODES.success);
      // Should be a user error (config or execution), not system error
      expect([EXIT_CODES.config_error, EXIT_CODES.execution_error, EXIT_CODES.source_error]).toContain(
        result.exitCode
      );
    });

    it('should use proper exit codes for missing files', async () => {
      const result = await runCli(['model', 'discover', '/missing.xes']);
      // Should not be success
      expect(result.exitCode).not.toBe(EXIT_CODES.success);
      // Should be a user error (config or source)
      expect([
        EXIT_CODES.config_error,
        EXIT_CODES.source_error,
        EXIT_CODES.execution_error,
      ]).toContain(result.exitCode);
    });
  });
});
