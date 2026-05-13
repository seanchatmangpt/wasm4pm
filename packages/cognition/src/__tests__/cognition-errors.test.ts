/**
 * cognition-errors.test.ts — 6 tests for CognitionError
 *
 * Oracle rank: Rank 2 (Domain contract — structured error fields, serialization).
 *
 * Tests import CognitionError directly. No WASM, no I/O.
 */

import { describe, it, expect } from 'vitest';
import { CognitionError } from '../errors.js';
import type { CognitionErrorCode } from '../errors.js';

describe('CognitionError', () => {
  it('name is "CognitionError" (not "Error")', () => {
    const err = new CognitionError('msg', 'BREED_FAILED');
    expect(err.name).toBe('CognitionError');
  });

  it('code field matches the constructor argument', () => {
    const codes: CognitionErrorCode[] = [
      'WASM_INIT_FAILED',
      'INPUT_SERIALIZE_FAILED',
      'OUTPUT_PARSE_FAILED',
      'BREED_FAILED',
      'VERIFY_FAILED',
      'REPLAY_NOT_FOUND',
      'SYSTEM_BUILD_FAILED',
      'SYSTEM_VERIFY_FAILED',
    ];
    for (const code of codes) {
      const err = new CognitionError('msg', code);
      expect(err.code).toBe(code);
    }
  });

  it('is instanceof Error (prototype chain preserved)', () => {
    const err = new CognitionError('oops', 'BREED_FAILED');
    expect(err instanceof Error).toBe(true);
    expect(err instanceof CognitionError).toBe(true);
  });

  it('cause is accessible when provided', () => {
    const cause = new Error('root cause');
    const err = new CognitionError('wrapper', 'WASM_INIT_FAILED', { cause });
    expect(err.cause).toBe(cause);
  });

  it('toJSON() returns name, code, message, details (no cause leakage)', () => {
    const err = new CognitionError('bad input', 'INPUT_SERIALIZE_FAILED', {
      details: { field: 'intent' },
    });
    const json = err.toJSON();
    expect(json['name']).toBe('CognitionError');
    expect(json['code']).toBe('INPUT_SERIALIZE_FAILED');
    expect(json['message']).toBe('bad input');
    expect((json['details'] as Record<string, string>)['field']).toBe('intent');
    expect('cause' in json).toBe(false);
  });

  it('message is accessible as Error.message', () => {
    const err = new CognitionError('specific failure', 'VERIFY_FAILED');
    expect(err.message).toBe('specific failure');
  });
});
