import { describe, it, expect } from 'vitest';
import { EXIT_CODES } from '../src/exit-codes.js';

describe('Exit codes', () => {
  it('should define success code as 0', () => {
    expect(EXIT_CODES.success).toBe(0);
  });

  it('should define config_error as 1', () => {
    expect(EXIT_CODES.config_error).toBe(1);
  });

  it('should define source_error as 2', () => {
    expect(EXIT_CODES.source_error).toBe(2);
  });

  it('should define execution_error as 3', () => {
    expect(EXIT_CODES.execution_error).toBe(3);
  });

  it('should define partial_failure as 4', () => {
    expect(EXIT_CODES.partial_failure).toBe(4);
  });

  it('should define system_error as 5', () => {
    expect(EXIT_CODES.system_error).toBe(5);
  });

  it('should have increasing exit codes from config to system error', () => {
    expect(EXIT_CODES.config_error < EXIT_CODES.source_error).toBe(true);
    expect(EXIT_CODES.source_error < EXIT_CODES.execution_error).toBe(true);
    expect(EXIT_CODES.execution_error < EXIT_CODES.partial_failure).toBe(true);
    expect(EXIT_CODES.partial_failure < EXIT_CODES.system_error).toBe(true);
  });

  it('should match standard Unix exit code conventions', () => {
    // Standard: 0 = success, 1-5 = error categories
    const codes = Object.values(EXIT_CODES);
    codes.forEach((code) => {
      expect(code).toBeGreaterThanOrEqual(0);
      expect(code).toBeLessThanOrEqual(5);
    });
  });
});
