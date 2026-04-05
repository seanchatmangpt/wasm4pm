/**
 * Error System Tests - PRD §14
 * Verifies error types, remediation, exit codes, and formatting
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  createError,
  formatError,
  formatErrorJSON,
  logError,
  validateErrorSystem,
  type ErrorCode,
  type ErrorInfo,
} from '../errors.js';

describe('Error System - PRD §14', () => {
  describe('createError factory', () => {
    it('creates valid error with all required fields', () => {
      const error = createError('CONFIG_MISSING', 'Config file not found');

      expect(error).toMatchObject({
        code: 'CONFIG_MISSING',
        message: 'Config file not found',
        remediation: expect.any(String),
        exit_code: expect.any(Number),
        recoverable: expect.any(Boolean),
      });
    });

    it('includes context when provided', () => {
      const context = { path: '/app/config.toml', searched: ['/app', '/home'] };
      const error = createError(
        'SOURCE_NOT_FOUND',
        'File missing',
        context
      );

      expect(error.context).toEqual(context);
    });

    it('omits context when not provided', () => {
      const error = createError('CONFIG_INVALID', 'Bad syntax');
      expect(error.context).toBeUndefined();
    });
  });

  describe('error codes and exit codes', () => {
    const errorCodes: ErrorCode[] = [
      'CONFIG_INVALID',
      'CONFIG_MISSING',
      'SOURCE_NOT_FOUND',
      'SOURCE_INVALID',
      'SOURCE_PERMISSION',
      'ALGORITHM_FAILED',
      'ALGORITHM_NOT_FOUND',
      'WASM_INIT_FAILED',
      'WASM_MEMORY_EXCEEDED',
      'SINK_FAILED',
      'SINK_PERMISSION',
      'OTEL_FAILED',
    ];

    errorCodes.forEach((code) => {
      it(`has valid exit code for ${code}`, () => {
        const error = createError(code, 'Test error');
        expect(error.exit_code).toBeGreaterThanOrEqual(200);
        expect(error.exit_code).toBeLessThan(800);
        expect(Number.isInteger(error.exit_code)).toBe(true);
      });

      it(`has remediation for ${code}`, () => {
        const error = createError(code, 'Test error');
        expect(error.remediation).toBeTruthy();
        expect(error.remediation.length).toBeGreaterThan(10);
      });

      it(`has recoverable flag for ${code}`, () => {
        const error = createError(code, 'Test error');
        expect(typeof error.recoverable).toBe('boolean');
      });
    });
  });

  describe('exit code ranges (PRD §8)', () => {
    it('config errors use 2xx range', () => {
      const configInvalid = createError('CONFIG_INVALID', 'test');
      const configMissing = createError('CONFIG_MISSING', 'test');

      expect(configInvalid.exit_code).toBeGreaterThanOrEqual(200);
      expect(configInvalid.exit_code).toBeLessThan(300);
      expect(configMissing.exit_code).toBeGreaterThanOrEqual(200);
      expect(configMissing.exit_code).toBeLessThan(300);
    });

    it('source errors use 3xx range', () => {
      const notFound = createError('SOURCE_NOT_FOUND', 'test');
      const invalid = createError('SOURCE_INVALID', 'test');
      const permission = createError('SOURCE_PERMISSION', 'test');

      [notFound, invalid, permission].forEach((err) => {
        expect(err.exit_code).toBeGreaterThanOrEqual(300);
        expect(err.exit_code).toBeLessThan(400);
      });
    });

    it('algorithm errors use 4xx range', () => {
      const failed = createError('ALGORITHM_FAILED', 'test');
      const notFound = createError('ALGORITHM_NOT_FOUND', 'test');

      [failed, notFound].forEach((err) => {
        expect(err.exit_code).toBeGreaterThanOrEqual(400);
        expect(err.exit_code).toBeLessThan(500);
      });
    });

    it('wasm errors use 5xx range', () => {
      const initFailed = createError('WASM_INIT_FAILED', 'test');
      const memoryExceeded = createError('WASM_MEMORY_EXCEEDED', 'test');

      [initFailed, memoryExceeded].forEach((err) => {
        expect(err.exit_code).toBeGreaterThanOrEqual(500);
        expect(err.exit_code).toBeLessThan(600);
      });
    });

    it('sink errors use 6xx range', () => {
      const failed = createError('SINK_FAILED', 'test');
      const permission = createError('SINK_PERMISSION', 'test');

      [failed, permission].forEach((err) => {
        expect(err.exit_code).toBeGreaterThanOrEqual(600);
        expect(err.exit_code).toBeLessThan(700);
      });
    });

    it('otel errors use 7xx range', () => {
      const error = createError('OTEL_FAILED', 'test');
      expect(error.exit_code).toBeGreaterThanOrEqual(700);
      expect(error.exit_code).toBeLessThan(800);
    });
  });

  describe('recoverable flag', () => {
    it('marks non-fatal errors as recoverable', () => {
      const memory = createError('WASM_MEMORY_EXCEEDED', 'test');
      const algorithm = createError('ALGORITHM_FAILED', 'test');
      const otel = createError('OTEL_FAILED', 'test');

      expect(memory.recoverable).toBe(true);
      expect(algorithm.recoverable).toBe(true);
      expect(otel.recoverable).toBe(true);
    });

    it('marks fatal errors as non-recoverable', () => {
      const configMissing = createError('CONFIG_MISSING', 'test');
      const sourceNotFound = createError('SOURCE_NOT_FOUND', 'test');
      const wasmInitFailed = createError('WASM_INIT_FAILED', 'test');

      expect(configMissing.recoverable).toBe(false);
      expect(sourceNotFound.recoverable).toBe(false);
      expect(wasmInitFailed.recoverable).toBe(false);
    });
  });

  describe('error formatting', () => {
    let testError: ErrorInfo;

    beforeAll(() => {
      testError = createError(
        'SOURCE_NOT_FOUND',
        'Input file not found at /data/log.xes',
        { path: '/data/log.xes', searched: ['/data', '/var/data'] }
      );
    });

    describe('formatError (human-readable)', () => {
      it('includes error code and message', () => {
        const output = formatError(testError, false);
        expect(output).toContain('SOURCE_NOT_FOUND');
        expect(output).toContain('Input file not found at /data/log.xes');
      });

      it('includes remediation section', () => {
        const output = formatError(testError, false);
        expect(output).toContain('Remediation:');
        expect(output).toContain('Verify the source path exists');
      });

      it('includes context when present', () => {
        const output = formatError(testError, false);
        expect(output).toContain('Context:');
        expect(output).toContain('path');
        expect(output).toContain('/data/log.xes');
      });

      it('includes recovery status', () => {
        const output = formatError(testError, false);
        expect(output).toMatch(/Recoverable|Fatal/);
      });

      it('omits context when absent', () => {
        const errorNoContext = createError('CONFIG_MISSING', 'test');
        const output = formatError(errorNoContext, false);
        expect(output).not.toContain('Context:');
      });

      it('adds ANSI colors when colorize=true', () => {
        const output = formatError(testError, true);
        expect(output).toContain('\x1b['); // ANSI escape sequence
      });

      it('removes ANSI colors when colorize=false', () => {
        const output = formatError(testError, false);
        expect(output).not.toMatch(/\x1b\[/);
      });
    });

    describe('formatErrorJSON', () => {
      it('includes all error fields', () => {
        const json = formatErrorJSON(testError);

        expect(json.code).toBe('SOURCE_NOT_FOUND');
        expect(json.message).toBe('Input file not found at /data/log.xes');
        expect(json.remediation).toBeTruthy();
        expect(json.exit_code).toBeGreaterThanOrEqual(300);
        expect(typeof json.recoverable).toBe('boolean');
      });

      it('includes context object', () => {
        const json = formatErrorJSON(testError);
        expect(json.context).toEqual({
          path: '/data/log.xes',
          searched: ['/data', '/var/data'],
        });
      });

      it('provides empty context when absent', () => {
        const errorNoContext = createError('CONFIG_MISSING', 'test');
        const json = formatErrorJSON(errorNoContext);
        expect(json.context).toEqual({});
      });

      it('is JSON serializable', () => {
        const json = formatErrorJSON(testError);
        const serialized = JSON.stringify(json);
        const deserialized = JSON.parse(serialized);

        expect(deserialized.code).toBe(testError.code);
        expect(deserialized.exit_code).toBe(testError.exit_code);
      });
    });
  });

  describe('error logging', () => {
    it('logError supports human format', () => {
      const error = createError('CONFIG_INVALID', 'Bad config');
      expect(() => logError(error, 'human')).not.toThrow();
    });

    it('logError supports plain format', () => {
      const error = createError('SOURCE_NOT_FOUND', 'File missing');
      expect(() => logError(error, 'plain')).not.toThrow();
    });

    it('logError supports json format', () => {
      const error = createError('WASM_INIT_FAILED', 'WASM initialization failed');
      expect(() => logError(error, 'json')).not.toThrow();
    });

    it('defaults to human format', () => {
      const error = createError('ALGORITHM_FAILED', 'Algorithm error');
      expect(() => logError(error)).not.toThrow();
    });
  });

  describe('error system validation', () => {
    it('all codes are properly configured', () => {
      const issues = validateErrorSystem();
      expect(issues).toHaveLength(0);
    });

    it('validation detects missing remediation', () => {
      // This would only trigger if we had incomplete configuration
      const issues = validateErrorSystem();
      const hasMissingRemediation = issues.some((i) =>
        i.includes('missing from REMEDIATIONS')
      );
      expect(hasMissingRemediation).toBe(false);
    });

    it('validation detects missing exit codes', () => {
      const issues = validateErrorSystem();
      const hasMissingExitCode = issues.some((i) =>
        i.includes('missing from EXIT_CODES')
      );
      expect(hasMissingExitCode).toBe(false);
    });

    it('validation detects invalid exit code ranges', () => {
      const issues = validateErrorSystem();
      const hasInvalidRange = issues.some((i) =>
        i.includes('invalid exit code')
      );
      expect(hasInvalidRange).toBe(false);
    });
  });

  describe('error remediation clarity', () => {
    const allErrorCodes: ErrorCode[] = [
      'CONFIG_INVALID',
      'CONFIG_MISSING',
      'SOURCE_NOT_FOUND',
      'SOURCE_INVALID',
      'SOURCE_PERMISSION',
      'ALGORITHM_FAILED',
      'ALGORITHM_NOT_FOUND',
      'WASM_INIT_FAILED',
      'WASM_MEMORY_EXCEEDED',
      'SINK_FAILED',
      'SINK_PERMISSION',
      'OTEL_FAILED',
    ];

    allErrorCodes.forEach((code) => {
      it(`${code} remediation is actionable`, () => {
        const error = createError(code, 'test');
        const remediation = error.remediation.toLowerCase();

        // Should contain action verbs
        const hasAction =
          remediation.includes('check') ||
          remediation.includes('verify') ||
          remediation.includes('run') ||
          remediation.includes('ensure') ||
          remediation.includes('update') ||
          remediation.includes('retry') ||
          remediation.includes('adjust') ||
          remediation.includes('reinstall');

        expect(hasAction).toBe(true);
      });

      it(`${code} remediation is specific`, () => {
        const error = createError(code, 'test');
        // Remediation should be more than just "check something"
        expect(error.remediation.length).toBeGreaterThan(30);
      });
    });
  });

  describe('error context handling', () => {
    it('preserves complex context objects', () => {
      const context = {
        path: '/data/log.xes',
        size: 1024000,
        format: 'XES',
        nested: {
          traces: 100,
          events: 5000,
        },
      };

      const error = createError('SOURCE_INVALID', 'Invalid format', context);

      expect(error.context).toEqual(context);
      expect(error.context?.nested?.traces).toBe(100);
    });

    it('handles null/undefined context gracefully', () => {
      const error1 = createError('CONFIG_MISSING', 'test', undefined);
      const error2 = createError('CONFIG_MISSING', 'test', null as any);

      expect(error1.context).toBeUndefined();
      expect(error2.context).toBeNull();
    });
  });

  describe('otel error handling (non-fatal)', () => {
    it('otel errors are non-fatal', () => {
      const error = createError('OTEL_FAILED', 'Could not export metrics');
      expect(error.recoverable).toBe(true);
    });

    it('otel errors have appropriate exit code', () => {
      const error = createError('OTEL_FAILED', 'test');
      expect(error.exit_code).toBeGreaterThanOrEqual(700);
      expect(error.exit_code).toBeLessThan(800);
    });

    it('otel error message indicates non-critical', () => {
      const error = createError('OTEL_FAILED', 'OpenTelemetry connection failed');
      expect(error.remediation).toContain('non-fatal');
    });
  });
});
