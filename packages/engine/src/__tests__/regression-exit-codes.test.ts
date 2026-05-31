/**
 * Regression test: EXIT_CODES lowercase keys must be defined and have correct values.
 *
 * Bug: Playground scenarios and older CLI tests imported EXIT_CODES and used
 * UPPERCASE keys (EXIT_CODES.SUCCESS, EXIT_CODES.CONFIG_ERROR, etc.) which were
 * undefined, producing `undefined` comparisons that silently passed.  The fix
 * canonicalized the export to lowercase keys matching the JSON contract names
 * (success, config_error, source_error, …) and removed the UPPERCASE aliases.
 *
 * This test FAILS on the old (uppercase-only) export and PASSES on the fixed
 * (lowercase) export.
 */

import { describe, it, expect } from 'vitest';
import { EXIT_CODES } from '@wasm4pm/testing';

describe('regression: EXIT_CODES lowercase keys are defined with correct numeric values', () => {
  it('EXIT_CODES.success === 0', () => {
    expect(EXIT_CODES.success).toBeDefined();
    expect(EXIT_CODES.success).toBe(0);
  });

  it('EXIT_CODES.config_error === 1', () => {
    expect(EXIT_CODES.config_error).toBeDefined();
    expect(EXIT_CODES.config_error).toBe(1);
  });

  it('EXIT_CODES.source_error === 2', () => {
    expect(EXIT_CODES.source_error).toBeDefined();
    expect(EXIT_CODES.source_error).toBe(2);
  });

  it('EXIT_CODES.execution_error === 3', () => {
    expect(EXIT_CODES.execution_error).toBeDefined();
    expect(EXIT_CODES.execution_error).toBe(3);
  });

  it('EXIT_CODES.partial_failure === 4', () => {
    expect(EXIT_CODES.partial_failure).toBeDefined();
    expect(EXIT_CODES.partial_failure).toBe(4);
  });

  it('EXIT_CODES.system_error === 5', () => {
    expect(EXIT_CODES.system_error).toBeDefined();
    expect(EXIT_CODES.system_error).toBe(5);
  });

  it('all EXIT_CODES values are non-negative integers', () => {
    for (const [key, value] of Object.entries(EXIT_CODES)) {
      expect(typeof value, `EXIT_CODES.${key} must be a number`).toBe('number');
      expect(Number.isInteger(value), `EXIT_CODES.${key} must be an integer`).toBe(true);
      expect(value, `EXIT_CODES.${key} must be >= 0`).toBeGreaterThanOrEqual(0);
    }
  });

  it('EXIT_CODES values are all distinct (no two codes are equal)', () => {
    const values = Object.values(EXIT_CODES);
    const unique = new Set(values);
    expect(unique.size).toBe(values.length);
  });
});
