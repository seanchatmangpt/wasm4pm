import { describe, it, expect } from 'vitest';
import { EXIT_CODES } from '../src/exit-codes.js';

describe('Exit codes', () => {
  it('defines the correct numeric values for all 6 codes', () => {
    expect(EXIT_CODES.success).toBe(0);
    expect(EXIT_CODES.config_error).toBe(1);
    expect(EXIT_CODES.source_error).toBe(2);
    expect(EXIT_CODES.execution_error).toBe(3);
    expect(EXIT_CODES.partial_failure).toBe(4);
    expect(EXIT_CODES.system_error).toBe(5);
  });

  it('codes are strictly increasing from config to system error and all non-negative', () => {
    expect(EXIT_CODES.config_error < EXIT_CODES.source_error).toBe(true);
    expect(EXIT_CODES.source_error < EXIT_CODES.execution_error).toBe(true);
    expect(EXIT_CODES.execution_error < EXIT_CODES.partial_failure).toBe(true);
    expect(EXIT_CODES.partial_failure < EXIT_CODES.system_error).toBe(true);
    for (const code of Object.values(EXIT_CODES)) {
      expect(code).toBeGreaterThanOrEqual(0);
    }
  });
});
