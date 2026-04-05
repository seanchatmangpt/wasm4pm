import { describe, it, expect } from 'vitest';
import {
  ok,
  err,
  isOk,
  isErr,
  unwrap,
  unwrapOr,
  type Result,
} from '../src/index.js';

describe('Result Type', () => {
  describe('ok', () => {
    it('should create success result', () => {
      const result = ok(42);

      expect(result.type).toBe('ok');
      expect(result.value).toBe(42);
    });

    it('should work with any type', () => {
      const resultNumber = ok(123);
      const resultString = ok('test');
      const resultObject = ok({ data: 'value' });
      const resultArray = ok([1, 2, 3]);

      expect(resultNumber.value).toBe(123);
      expect(resultString.value).toBe('test');
      expect(resultObject.value).toEqual({ data: 'value' });
      expect(resultArray.value).toEqual([1, 2, 3]);
    });

    it('should work with undefined', () => {
      const result = ok(undefined);

      expect(result.type).toBe('ok');
      expect(result.value).toBeUndefined();
    });
  });

  describe('err', () => {
    it('should create error result', () => {
      const result = err('Something went wrong');

      expect(result.type).toBe('err');
      expect(result.error).toBe('Something went wrong');
    });

    it('should store error message', () => {
      const message = 'Failed to validate adapter';
      const result = err(message);

      expect(result.error).toBe(message);
    });
  });

  describe('isOk', () => {
    it('should return true for ok results', () => {
      const result = ok(42);

      expect(isOk(result)).toBe(true);
    });

    it('should return false for err results', () => {
      const result = err('error');

      expect(isOk(result)).toBe(false);
    });

    it('should narrow type in conditional', () => {
      const result: Result<number> = ok(42);

      if (isOk(result)) {
        expect(result.value).toBe(42);
      }
    });
  });

  describe('isErr', () => {
    it('should return true for err results', () => {
      const result = err('error');

      expect(isErr(result)).toBe(true);
    });

    it('should return false for ok results', () => {
      const result = ok(42);

      expect(isErr(result)).toBe(false);
    });

    it('should narrow type in conditional', () => {
      const result: Result<number> = err('something failed');

      if (isErr(result)) {
        expect(result.error).toBe('something failed');
      }
    });
  });

  describe('unwrap', () => {
    it('should extract value from ok result', () => {
      const result = ok(42);
      const value = unwrap(result);

      expect(value).toBe(42);
    });

    it('should throw error for err result', () => {
      const result = err('error occurred');

      expect(() => unwrap(result)).toThrow('Unwrap failed: error occurred');
    });

    it('should work with different types', () => {
      const resultString = unwrap(ok('hello'));
      const resultObject = unwrap(ok({ name: 'test' }));

      expect(resultString).toBe('hello');
      expect(resultObject).toEqual({ name: 'test' });
    });

    it('should throw error with original message', () => {
      const errorMsg = 'Failed to open adapter';
      const result = err(errorMsg);

      expect(() => unwrap(result)).toThrow(errorMsg);
    });
  });

  describe('unwrapOr', () => {
    it('should extract value from ok result', () => {
      const result = ok(42);
      const value = unwrapOr(result, 0);

      expect(value).toBe(42);
    });

    it('should return default for err result', () => {
      const result = err('error');
      const value = unwrapOr(result, 99);

      expect(value).toBe(99);
    });

    it('should work with different types', () => {
      const resultOk = unwrapOr(ok('hello'), 'default');
      const resultErr = unwrapOr(err('failed'), 'default');

      expect(resultOk).toBe('hello');
      expect(resultErr).toBe('default');
    });

    it('should handle complex default values', () => {
      const defaultObj = { status: 'unknown' };
      const result = err('failure');

      const value = unwrapOr(result, defaultObj);

      expect(value).toEqual(defaultObj);
    });
  });

  describe('Result Type Usage Patterns', () => {
    it('should use in async contexts', async () => {
      async function validate(): Promise<Result<boolean>> {
        return ok(true);
      }

      const result = await validate();

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toBe(true);
      }
    });

    it('should chain results with isOk checks', () => {
      const result1 = ok(42);
      const result2 = isOk(result1) ? ok(result1.value * 2) : err('failed');

      expect(isOk(result2)).toBe(true);
      if (isOk(result2)) {
        expect(result2.value).toBe(84);
      }
    });

    it('should map over results', () => {
      const result: Result<number> = ok(10);

      const mapped: Result<number> = isOk(result)
        ? ok(result.value * 2)
        : result;

      expect(unwrap(mapped)).toBe(20);
    });

    it('should handle error propagation', () => {
      const result1: Result<number> = err('connection failed');
      const result2: Result<number> = isOk(result1)
        ? ok(result1.value + 10)
        : result1;

      expect(isErr(result2)).toBe(true);
      if (isErr(result2)) {
        expect(result2.error).toBe('connection failed');
      }
    });
  });

  describe('Result Type in Adapter Contracts', () => {
    it('should match SourceAdapter.validate() return type', () => {
      const validateResult: Result<void> = ok(undefined);

      expect(isOk(validateResult)).toBe(true);
    });

    it('should match SourceAdapter.fingerprint() result wrapping', () => {
      // Fingerprint returns promise<string>, not Promise<Result<string>>
      const fingerprint = 'a'.repeat(64);

      expect(fingerprint).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should match EventStream.next() return type', () => {
      interface NextResult {
        events: unknown[];
        hasMore: boolean;
      }

      const result: Result<NextResult> = ok({
        events: [],
        hasMore: false,
      });

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.events).toEqual([]);
        expect(result.value.hasMore).toBe(false);
      }
    });

    it('should match SinkAdapter.write() return type', () => {
      const writeResult: Result<string> = ok('artifact-id-123');

      expect(isOk(writeResult)).toBe(true);
      if (isOk(writeResult)) {
        expect(typeof writeResult.value).toBe('string');
      }
    });
  });

  describe('Result Type Error Handling', () => {
    it('should preserve error context through chain', () => {
      const initialError = 'Failed to open connection';
      const result: Result<unknown> = err(initialError);

      if (isErr(result)) {
        expect(result.error).toBe(initialError);
      }
    });

    it('should support error recovery with defaults', () => {
      const failedResult: Result<number> = err('calculation failed');
      const recovered = unwrapOr(failedResult, 0);

      expect(recovered).toBe(0);
    });

    it('should enable conditional error logging', () => {
      const result: Result<string> = err('validation failed');

      if (isErr(result)) {
        // This would be logged in real code
        expect(result.error).toContain('validation');
      }
    });
  });

  describe('Result Type Composition', () => {
    it('should combine multiple results', () => {
      const r1 = ok(1);
      const r2 = ok(2);
      const r3 = ok(3);

      const combined = isOk(r1) && isOk(r2) && isOk(r3);

      expect(combined).toBe(true);
    });

    it('should handle mixed ok and err', () => {
      const r1 = ok(1);
      const r2 = err('failed');
      const r3 = ok(3);

      const combined = isOk(r1) && isErr(r2) && isOk(r3);

      expect(combined).toBe(true);
    });

    it('should short-circuit on first error', () => {
      const results: Result<number>[] = [ok(1), err('error'), ok(3)];

      let firstError: string | null = null;
      for (const result of results) {
        if (isErr(result)) {
          firstError = result.error;
          break;
        }
      }

      expect(firstError).toBe('error');
    });
  });
});
