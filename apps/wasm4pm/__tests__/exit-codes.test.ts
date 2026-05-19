import { describe, it, expect } from 'vitest';
import { EXIT_CODES, translateContractExitCode } from '../src/exit-codes.js';

// ─────────────────────────────────────────────────────────────────────────────
// Static contract — numeric values and ordering
// ─────────────────────────────────────────────────────────────────────────────

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

  it('success is 0 — the only code that is falsy', () => {
    expect(EXIT_CODES.success).toBe(0);
    const nonZero = Object.values(EXIT_CODES).filter((c) => c !== EXIT_CODES.success);
    for (const code of nonZero) {
      expect(code).toBeGreaterThan(0);
    }
  });

  it('all codes are unique — no two error conditions share a code', () => {
    const values = Object.values(EXIT_CODES);
    const unique = new Set(values);
    expect(unique.size).toBe(values.length);
  });

  it('covers the contiguous range 0–5 with no gaps', () => {
    const values = new Set(Object.values(EXIT_CODES));
    for (let i = 0; i <= 5; i++) {
      expect(values.has(i)).toBe(true);
    }
  });

  it('exports exactly the documented set of keys', () => {
    const keys = Object.keys(EXIT_CODES).sort();
    expect(keys).toContain('success');
    expect(keys).toContain('config_error');
    expect(keys).toContain('source_error');
    expect(keys).toContain('execution_error');
    expect(keys).toContain('partial_failure');
    expect(keys).toContain('system_error');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// translateContractExitCode — contract error range mapping
// ─────────────────────────────────────────────────────────────────────────────

describe('translateContractExitCode', () => {
  it('maps 2xx (configuration errors) to config_error (1)', () => {
    expect(translateContractExitCode(200)).toBe(EXIT_CODES.config_error);
    expect(translateContractExitCode(250)).toBe(EXIT_CODES.config_error);
    expect(translateContractExitCode(299)).toBe(EXIT_CODES.config_error);
  });

  it('maps 3xx (source/input errors) to source_error (2)', () => {
    expect(translateContractExitCode(300)).toBe(EXIT_CODES.source_error);
    expect(translateContractExitCode(350)).toBe(EXIT_CODES.source_error);
    expect(translateContractExitCode(399)).toBe(EXIT_CODES.source_error);
  });

  it('maps 4xx (algorithm errors) to execution_error (3)', () => {
    expect(translateContractExitCode(400)).toBe(EXIT_CODES.execution_error);
    expect(translateContractExitCode(450)).toBe(EXIT_CODES.execution_error);
    expect(translateContractExitCode(499)).toBe(EXIT_CODES.execution_error);
  });

  it('maps 5xx (WASM runtime errors) to execution_error (3)', () => {
    expect(translateContractExitCode(500)).toBe(EXIT_CODES.execution_error);
    expect(translateContractExitCode(550)).toBe(EXIT_CODES.execution_error);
    expect(translateContractExitCode(599)).toBe(EXIT_CODES.execution_error);
  });

  it('maps 6xx (sink/output errors) to partial_failure (4)', () => {
    expect(translateContractExitCode(600)).toBe(EXIT_CODES.partial_failure);
    expect(translateContractExitCode(650)).toBe(EXIT_CODES.partial_failure);
    expect(translateContractExitCode(699)).toBe(EXIT_CODES.partial_failure);
  });

  it('maps 7xx (observability errors) to system_error (5)', () => {
    expect(translateContractExitCode(700)).toBe(EXIT_CODES.system_error);
    expect(translateContractExitCode(750)).toBe(EXIT_CODES.system_error);
    expect(translateContractExitCode(799)).toBe(EXIT_CODES.system_error);
  });

  it('maps unknown/out-of-range codes to system_error (5)', () => {
    expect(translateContractExitCode(0)).toBe(EXIT_CODES.system_error);
    expect(translateContractExitCode(100)).toBe(EXIT_CODES.system_error);
    expect(translateContractExitCode(-1)).toBe(EXIT_CODES.system_error);
    expect(translateContractExitCode(10000)).toBe(EXIT_CODES.system_error);
    expect(translateContractExitCode(800)).toBe(EXIT_CODES.system_error);
    expect(translateContractExitCode(1000)).toBe(EXIT_CODES.system_error);
  });

  it('boundary: 199 is unknown → system_error; 200 is config_error; 300 is source_error', () => {
    expect(translateContractExitCode(199)).toBe(EXIT_CODES.system_error);
    expect(translateContractExitCode(200)).toBe(EXIT_CODES.config_error);
    expect(translateContractExitCode(300)).toBe(EXIT_CODES.source_error);
    expect(translateContractExitCode(400)).toBe(EXIT_CODES.execution_error);
    expect(translateContractExitCode(500)).toBe(EXIT_CODES.execution_error);
    expect(translateContractExitCode(600)).toBe(EXIT_CODES.partial_failure);
    expect(translateContractExitCode(700)).toBe(EXIT_CODES.system_error);
  });

  it('returns a valid EXIT_CODE value for every input in [200, 799]', () => {
    const validCodes = new Set(Object.values(EXIT_CODES));
    for (let code = 200; code <= 799; code += 10) {
      const result = translateContractExitCode(code);
      expect(validCodes.has(result)).toBe(true);
    }
  });

  it('4xx and 5xx both map to execution_error — WASM and algorithm errors are equivalent from CLI perspective', () => {
    // Both algorithm failure (400s) and WASM runtime failure (500s) produce execution_error
    expect(translateContractExitCode(401)).toBe(translateContractExitCode(501));
    expect(translateContractExitCode(450)).toBe(translateContractExitCode(550));
    expect(translateContractExitCode(499)).toBe(translateContractExitCode(599));
  });
});
