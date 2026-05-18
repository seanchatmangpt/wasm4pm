/**
 * Result<T> type-guard exhaustive tests
 *
 * Oracle hierarchy:
 *   Group 1 — Rank 1 (mathematical): Mutual exclusion — exactly one guard is true per variant
 *   Group 2 — Rank 1 (mathematical): Exhaustiveness — edge values (falsy, empty) are handled correctly
 *   Group 3 — Rank 2 (domain contract): Type narrowing — guarded branches expose the right fields
 *   Group 4 — Rank 3 (metamorphic): Symmetry — isOk/isErr/isError compose correctly for any input
 */

import { describe, it, expect } from 'vitest';
import { ok, err, error, isOk, isErr, isError, type Result } from '../result.js';
import { createError } from '../errors.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const makeError = () => createError('CONFIG_INVALID', 'bad config');

// ---------------------------------------------------------------------------
// Group 1 — Rank 1: Mutual exclusion
// ---------------------------------------------------------------------------

describe('Group 1 — Rank 1: Mutual exclusion (each variant satisfies exactly one guard)', () => {
  it('ok(value): isOk===true, isErr===false, isError===false', () => {
    const r: Result<number> = ok(42);
    expect(isOk(r)).toBe(true);
    expect(isErr(r)).toBe(false);
    expect(isError(r)).toBe(false);
  });

  it('err(string): isOk===false, isErr===true, isError===false', () => {
    const r: Result<number> = err('something failed');
    expect(isOk(r)).toBe(false);
    expect(isErr(r)).toBe(true);
    expect(isError(r)).toBe(false);
  });

  it('error(ErrorInfo): isOk===false, isErr===false, isError===true', () => {
    const r: Result<number> = error(makeError());
    expect(isOk(r)).toBe(false);
    expect(isErr(r)).toBe(false);
    expect(isError(r)).toBe(true);
  });

  it('no result satisfies two guards simultaneously (ok)', () => {
    const r: Result<string> = ok('hello');
    const trueCount = [isOk(r), isErr(r), isError(r)].filter(Boolean).length;
    expect(trueCount).toBe(1);
  });

  it('no result satisfies two guards simultaneously (err)', () => {
    const r: Result<string> = err('fail');
    const trueCount = [isOk(r), isErr(r), isError(r)].filter(Boolean).length;
    expect(trueCount).toBe(1);
  });

  it('no result satisfies two guards simultaneously (error)', () => {
    const r: Result<string> = error(makeError());
    const trueCount = [isOk(r), isErr(r), isError(r)].filter(Boolean).length;
    expect(trueCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Group 2 — Rank 1: Exhaustiveness — falsy/edge values
// ---------------------------------------------------------------------------

describe('Group 2 — Rank 1: Exhaustiveness (falsy and edge values are not confused)', () => {
  it('ok(undefined) is still Ok — undefined is a valid success value', () => {
    const r: Result<undefined> = ok(undefined);
    expect(isOk(r)).toBe(true);
    expect(isErr(r)).toBe(false);
    expect(isError(r)).toBe(false);
  });

  it('ok(null) is still Ok — null is a valid success value', () => {
    const r: Result<null> = ok(null);
    expect(isOk(r)).toBe(true);
    expect(isErr(r)).toBe(false);
    expect(isError(r)).toBe(false);
  });

  it('ok(0) is still Ok — 0 is not a JavaScript falsy trap', () => {
    const r: Result<number> = ok(0);
    expect(isOk(r)).toBe(true);
    expect(isErr(r)).toBe(false);
    expect(isError(r)).toBe(false);
  });

  it('ok(false) is still Ok — false is a valid success value', () => {
    const r: Result<boolean> = ok(false);
    expect(isOk(r)).toBe(true);
    expect(isErr(r)).toBe(false);
    expect(isError(r)).toBe(false);
  });

  it("ok('') is still Ok — empty string is a valid success value", () => {
    const r: Result<string> = ok('');
    expect(isOk(r)).toBe(true);
    expect(isErr(r)).toBe(false);
    expect(isError(r)).toBe(false);
  });

  it("err('') is still Err — empty string is a valid (if unhelpful) error message", () => {
    const r: Result<number> = err('');
    expect(isOk(r)).toBe(false);
    expect(isErr(r)).toBe(true);
    expect(isError(r)).toBe(false);
  });

  it('every discriminant value maps to exactly one truthy guard', () => {
    const variants: Result<unknown>[] = [ok(1), err('msg'), error(makeError())];
    for (const r of variants) {
      const trueCount = [isOk(r), isErr(r), isError(r)].filter(Boolean).length;
      expect(trueCount, `variant type=${r.type}`).toBe(1);
    }
  });
});

// ---------------------------------------------------------------------------
// Group 3 — Rank 2: Type narrowing — correct fields accessible after guard
// ---------------------------------------------------------------------------

describe('Group 3 — Rank 2: Type narrowing (guarded branches expose the correct fields)', () => {
  it('after isOk() branch, result.value is accessible at runtime', () => {
    const r: Result<string> = ok('process-mining');
    if (isOk(r)) {
      expect(r.value).toBe('process-mining');
    } else {
      expect.fail('isOk should have been true');
    }
  });

  it('after isErr() branch, result.error is the string message', () => {
    const r: Result<number> = err('timeout after 30s');
    if (isErr(r)) {
      const msg: string = r.error; // TypeScript allows this without cast
      expect(msg).toBe('timeout after 30s');
      expect(typeof msg).toBe('string');
    } else {
      expect.fail('isErr should have been true');
    }
  });

  it('after isError() branch, result.error has .code and .message (ErrorInfo fields)', () => {
    const errInfo = createError('WASM_INIT_FAILED', 'WASM binary not found');
    const r: Result<void> = error(errInfo);
    if (isError(r)) {
      expect(typeof r.error.code).toBe('string');
      expect(typeof r.error.message).toBe('string');
      expect(r.error.code).toBe('WASM_INIT_FAILED');
      expect(r.error.message).toBe('WASM binary not found');
    } else {
      expect.fail('isError should have been true');
    }
  });

  it('after isError() branch, result.error has .exit_code (ErrorInfo.exit_code)', () => {
    const r: Result<void> = error(createError('ALGORITHM_FAILED', 'algo failed'));
    if (isError(r)) {
      expect(typeof r.error.exit_code).toBe('number');
      expect(r.error.exit_code).toBe(400);
    } else {
      expect.fail('isError should have been true');
    }
  });

  it('guarded ok branch does NOT expose .error property', () => {
    const r: Result<string> = ok('value');
    if (isOk(r)) {
      expect('error' in r).toBe(false);
    } else {
      expect.fail('isOk should have been true');
    }
  });
});

// ---------------------------------------------------------------------------
// Group 4 — Rank 3: Metamorphic symmetry
// ---------------------------------------------------------------------------

describe('Group 4 — Rank 3: Metamorphic symmetry (guards compose correctly)', () => {
  it('isOk(ok(x)) === true for any x (string)', () => {
    expect(isOk(ok('anything'))).toBe(true);
  });

  it('isOk(ok(x)) === true for any x (object)', () => {
    expect(isOk(ok({ nested: true }))).toBe(true);
  });

  it('isOk(err(msg)) === false for any msg', () => {
    expect(isOk(err('any error message'))).toBe(false);
    expect(isOk(err(''))).toBe(false);
  });

  it('isOk(error(info)) === false for any ErrorInfo', () => {
    expect(isOk(error(createError('CONFIG_INVALID', 'any')))).toBe(false);
    expect(isOk(error(createError('WASM_INIT_FAILED', 'any')))).toBe(false);
  });

  it('!isOk(r) && !isErr(r) === isError(r) for all three variants', () => {
    const variants: Result<unknown>[] = [ok(1), err('e'), error(makeError())];
    for (const r of variants) {
      expect(!isOk(r) && !isErr(r), `variant type=${r.type}`).toBe(isError(r));
    }
  });

  it('!isOk(r) && !isError(r) === isErr(r) for all three variants', () => {
    const variants: Result<unknown>[] = [ok(1), err('e'), error(makeError())];
    for (const r of variants) {
      expect(!isOk(r) && !isError(r), `variant type=${r.type}`).toBe(isErr(r));
    }
  });

  it('!isErr(r) && !isError(r) === isOk(r) for all three variants', () => {
    const variants: Result<unknown>[] = [ok(1), err('e'), error(makeError())];
    for (const r of variants) {
      expect(!isErr(r) && !isError(r), `variant type=${r.type}`).toBe(isOk(r));
    }
  });

  it('applying isOk twice to the same value yields the same result (idempotent)', () => {
    const r: Result<number> = ok(99);
    expect(isOk(r)).toBe(isOk(r));
  });

  it('applying isErr twice to the same value yields the same result (idempotent)', () => {
    const r: Result<number> = err('idempotent');
    expect(isErr(r)).toBe(isErr(r));
  });

  it('applying isError twice to the same value yields the same result (idempotent)', () => {
    const r: Result<number> = error(makeError());
    expect(isError(r)).toBe(isError(r));
  });
});
