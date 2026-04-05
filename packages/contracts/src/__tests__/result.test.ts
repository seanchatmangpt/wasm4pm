/**
 * Result Type Tests
 * Tests for discriminated union error handling with ErrorDetails support
 */

import { describe, it, expect } from 'vitest';
import {
  ok,
  err,
  error,
  isOk,
  isErr,
  isError,
  isStringError,
  getExitCode,
  unwrap,
  unwrapOr,
  type Result,
  type ErrorInfo,
} from '../result.js';
import { createError, type ErrorInfo as ErrorDetails } from '../errors.js';

describe('Result Type - Discriminated Union', () => {
  describe('ok() and err() constructors', () => {
    it('creates successful result', () => {
      const result = ok(42);
      expect(result.type).toBe('ok');
      expect(result.value).toBe(42);
    });

    it('creates string error result', () => {
      const result = err('Something went wrong');
      expect(result.type).toBe('err');
      expect(result.error).toBe('Something went wrong');
    });

    it('works with generic types', () => {
      const okString: Result<string> = ok('hello');
      const okNumber: Result<number> = ok(123);
      const okObject: Result<{ id: number }> = ok({ id: 1 });

      expect(okString.type).toBe('ok');
      expect(okNumber.type).toBe('ok');
      expect(okObject.type).toBe('ok');
    });
  });

  describe('error() constructor for ErrorInfo', () => {
    it('creates structured error result', () => {
      const errorInfo = createError('CONFIG_MISSING', 'Config file not found');
      const result = error(errorInfo);

      expect(result.type).toBe('error');
      expect(result.error.code).toBe('CONFIG_MISSING');
      expect(result.error.exit_code).toBeGreaterThanOrEqual(200);
    });

    it('preserves error context', () => {
      const errorInfo = createError(
        'SOURCE_NOT_FOUND',
        'File missing',
        { path: '/data/log.xes' }
      );
      const result = error(errorInfo);

      expect(result.error.context?.path).toBe('/data/log.xes');
    });

    it('preserves remediation', () => {
      const errorInfo = createError('ALGORITHM_FAILED', 'Computation failed');
      const result = error(errorInfo);

      expect(result.error.remediation).toBeTruthy();
    });
  });

  describe('type guards', () => {
    describe('isOk()', () => {
      it('returns true for ok results', () => {
        const result = ok('value');
        expect(isOk(result)).toBe(true);
      });

      it('returns false for err results', () => {
        const result = err('error');
        expect(isOk(result)).toBe(false);
      });

      it('returns false for error results', () => {
        const errorInfo = createError('CONFIG_INVALID', 'test');
        const result = error(errorInfo);
        expect(isOk(result)).toBe(false);
      });

      it('narrows type correctly', () => {
        const result: Result<string> = ok('hello');

        if (isOk(result)) {
          const value: string = result.value;
          expect(value).toBe('hello');
        } else {
          expect.fail('Should be ok');
        }
      });
    });

    describe('isErr()', () => {
      it('returns true for string error results', () => {
        const result = err('error message');
        expect(isStringError(result)).toBe(true);
      });

      it('returns false for ok results', () => {
        const result = ok(123);
        expect(isStringError(result)).toBe(false);
      });

      it('returns false for ErrorResult', () => {
        const errorInfo = createError('WASM_INIT_FAILED', 'test');
        const result = error(errorInfo);
        expect(isStringError(result)).toBe(false);
      });
    });

    describe('isError()', () => {
      it('returns true for structured error results', () => {
        const errorInfo = createError('SOURCE_INVALID', 'test');
        const result = error(errorInfo);
        expect(isError(result)).toBe(true);
      });

      it('returns false for ok results', () => {
        const result = ok('value');
        expect(isError(result)).toBe(false);
      });

      it('returns false for string errors', () => {
        const result = err('error');
        expect(isError(result)).toBe(false);
      });

      it('narrows to ErrorResult type', () => {
        const result: Result<string> = error(
          createError('SINK_FAILED', 'test')
        );

        if (isError(result)) {
          const errorInfo: ErrorDetails = result.error;
          expect(errorInfo.exit_code).toBeGreaterThanOrEqual(600);
        }
      });
    });
  });

  describe('getExitCode()', () => {
    it('returns exit code for structured errors', () => {
      const errorInfo = createError('CONFIG_INVALID', 'test');
      const result = error(errorInfo);

      const code = getExitCode(result);
      expect(code).toBe(200);
    });

    it('returns undefined for ok results', () => {
      const result = ok('value');
      const code = getExitCode(result);
      expect(code).toBeUndefined();
    });

    it('returns undefined for string errors', () => {
      const result = err('error');
      const code = getExitCode(result);
      expect(code).toBeUndefined();
    });

    it('returns correct exit code for each error type', () => {
      const testCases: Array<[any, number]> = [
        [createError('CONFIG_MISSING', 'test'), 201],
        [createError('SOURCE_NOT_FOUND', 'test'), 300],
        [createError('ALGORITHM_FAILED', 'test'), 400],
        [createError('WASM_INIT_FAILED', 'test'), 500],
        [createError('SINK_FAILED', 'test'), 600],
        [createError('OTEL_FAILED', 'test'), 700],
      ];

      for (const [errorInfo, expectedCode] of testCases) {
        const result = error(errorInfo);
        expect(getExitCode(result)).toBe(expectedCode);
      }
    });
  });

  describe('unwrap()', () => {
    it('extracts value from ok results', () => {
      const result = ok('hello world');
      expect(unwrap(result)).toBe('hello world');
    });

    it('throws for string errors', () => {
      const result = err('Something failed');
      expect(() => unwrap(result)).toThrow('Unwrap failed');
    });

    it('throws for structured errors', () => {
      const errorInfo = createError('CONFIG_MISSING', 'Config not found');
      const result = error(errorInfo);
      expect(() => unwrap(result)).toThrow();
    });

    it('preserves value type', () => {
      const obj = { id: 123, name: 'test' };
      const result = ok(obj);
      const unwrapped = unwrap(result);

      expect(unwrapped.id).toBe(123);
      expect(unwrapped.name).toBe('test');
    });
  });

  describe('unwrapOr()', () => {
    it('extracts value from ok results', () => {
      const result = ok(42);
      expect(unwrapOr(result, 0)).toBe(42);
    });

    it('returns default for string errors', () => {
      const result = err('Failed');
      expect(unwrapOr(result, 99)).toBe(99);
    });

    it('returns default for structured errors', () => {
      const errorInfo = createError('SOURCE_NOT_FOUND', 'test');
      const result = error(errorInfo);
      expect(unwrapOr(result, 0)).toBe(0);
    });

    it('does not use default when ok', () => {
      const result = ok('value');
      const defaultVal = 'default';
      expect(unwrapOr(result, defaultVal)).toBe('value');
    });
  });

  describe('pattern matching', () => {
    it('handles all three result variants', () => {
      const results: Result<number>[] = [
        ok(42),
        err('failed'),
        error(createError('CONFIG_INVALID', 'test')),
      ];

      const values: (number | string)[] = [];

      for (const result of results) {
        if (result.type === 'ok') {
          values.push(result.value);
        } else if (result.type === 'err') {
          values.push('error');
        } else if (result.type === 'error') {
          values.push(`error:${result.error.code}`);
        }
      }

      expect(values).toContainEqual(42);
      expect(values).toContainEqual('error');
      expect(values).toContainEqual('error:CONFIG_INVALID');
    });

    it('uses type guards for exhaustive checking', () => {
      const result: Result<string> = ok('test');

      if (isOk(result)) {
        expect(result.value).toBe('test');
      } else if (isStringError(result)) {
        expect.fail('Should not reach here');
      } else if (isError(result)) {
        expect.fail('Should not reach here');
      }
    });
  });

  describe('mixed error types', () => {
    it('can work with both string and structured errors', () => {
      const results: Result<string>[] = [
        ok('success'),
        err('simple error'),
        error(createError('WASM_MEMORY_EXCEEDED', 'Out of memory')),
      ];

      const successCount = results.filter((r) => isOk(r)).length;
      const stringErrorCount = results.filter((r) => isStringError(r)).length;
      const structuredErrorCount = results.filter((r) => isError(r)).length;

      expect(successCount).toBe(1);
      expect(stringErrorCount).toBe(1);
      expect(structuredErrorCount).toBe(1);
    });

    it('can extract exit codes only from structured errors', () => {
      const results: Result<string>[] = [
        ok('value'),
        err('error'),
        error(createError('SINK_FAILED', 'test')),
      ];

      const exitCodes = results
        .map((r) => getExitCode(r))
        .filter((code): code is number => code !== undefined);

      expect(exitCodes).toHaveLength(1);
      expect(exitCodes[0]).toBeGreaterThanOrEqual(600);
    });
  });

  describe('interoperability', () => {
    it('structured errors contain full ErrorDetails', () => {
      const errorInfo = createError(
        'ALGORITHM_NOT_FOUND',
        'Algorithm xyz not available',
        { algorithm: 'xyz', available: ['dfg', 'alpha'] }
      );
      const result = error(errorInfo);

      if (isError(result)) {
        expect(result.error.code).toBe('ALGORITHM_NOT_FOUND');
        expect(result.error.message).toContain('xyz');
        expect(result.error.remediation).toBeTruthy();
        expect(result.error.recoverable).toBe(false);
        expect(result.error.context?.algorithm).toBe('xyz');
      } else {
        expect.fail('Should be error result');
      }
    });

    it('supports legacy string errors alongside structured errors', () => {
      const legacyError: Result<string> = err('Old error format');
      const structuredError: Result<string> = error(
        createError('CONFIG_INVALID', 'New error format')
      );

      expect(isStringError(legacyError)).toBe(true);
      expect(isError(structuredError)).toBe(true);
    });
  });
});
