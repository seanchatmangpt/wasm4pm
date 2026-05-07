/**
 * CLI Integration Tests.
 *
 * Tests the CLI contract layer: exit code translation, error hierarchy
 * propagation, and argument validation behavior. Chicago TDD — tests
 * observable behavior (what exit codes and errors are produced), not
 * internal implementation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  Wasm4pmError,
  ConfigError,
  SourceError,
  ExecutionError,
  PartialFailureError,
  SystemError,
  handleError,
} from '../src/errors.js';
import { EXIT_CODES, translateContractExitCode } from '../src/exit-codes.js';

// ---------------------------------------------------------------------------
// Exit Code Contract
// ---------------------------------------------------------------------------

describe('EXIT_CODES contract', () => {
  it('covers the full range 0-5, all codes are unique, and success is the only non-error code', () => {
    const codes = Object.values(EXIT_CODES);
    const codeSet = new Set(codes);
    for (let i = 0; i <= 5; i++) {
      expect(codeSet.has(i)).toBe(true);
    }
    expect(codeSet.size).toBe(codes.length);
    const nonZero = codes.filter((c) => c !== 0);
    expect(nonZero.length).toBeGreaterThanOrEqual(5);
    for (const code of nonZero) {
      expect(code).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Contract Exit Code Translation
// ---------------------------------------------------------------------------

describe('translateContractExitCode', () => {
  it('translates each error range and unknown codes to correct exit codes', () => {
    // 2xx → config_error (1)
    expect(translateContractExitCode(200)).toBe(EXIT_CODES.config_error);
    expect(translateContractExitCode(250)).toBe(EXIT_CODES.config_error);
    expect(translateContractExitCode(299)).toBe(EXIT_CODES.config_error);
    // 3xx → source_error (2)
    expect(translateContractExitCode(300)).toBe(EXIT_CODES.source_error);
    expect(translateContractExitCode(350)).toBe(EXIT_CODES.source_error);
    expect(translateContractExitCode(399)).toBe(EXIT_CODES.source_error);
    // 4xx → execution_error (3)
    expect(translateContractExitCode(400)).toBe(EXIT_CODES.execution_error);
    expect(translateContractExitCode(450)).toBe(EXIT_CODES.execution_error);
    expect(translateContractExitCode(499)).toBe(EXIT_CODES.execution_error);
    // 5xx → execution_error (3)
    expect(translateContractExitCode(500)).toBe(EXIT_CODES.execution_error);
    expect(translateContractExitCode(550)).toBe(EXIT_CODES.execution_error);
    expect(translateContractExitCode(599)).toBe(EXIT_CODES.execution_error);
    // 6xx → partial_failure (4)
    expect(translateContractExitCode(600)).toBe(EXIT_CODES.partial_failure);
    expect(translateContractExitCode(650)).toBe(EXIT_CODES.partial_failure);
    expect(translateContractExitCode(699)).toBe(EXIT_CODES.partial_failure);
    // 7xx → system_error (5)
    expect(translateContractExitCode(700)).toBe(EXIT_CODES.system_error);
    expect(translateContractExitCode(799)).toBe(EXIT_CODES.system_error);
    // unknown/out-of-range → system_error (5)
    expect(translateContractExitCode(0)).toBe(EXIT_CODES.system_error);
    expect(translateContractExitCode(100)).toBe(EXIT_CODES.system_error);
    expect(translateContractExitCode(-1)).toBe(EXIT_CODES.system_error);
    expect(translateContractExitCode(10000)).toBe(EXIT_CODES.system_error);
    // boundary: 199 is unknown, 200 is config_error, 300 is source_error
    expect(translateContractExitCode(199)).toBe(EXIT_CODES.system_error);
    expect(translateContractExitCode(300)).toBe(EXIT_CODES.source_error);
  });
});

// ---------------------------------------------------------------------------
// Error Hierarchy — Exit Code + Inheritance
// ---------------------------------------------------------------------------

describe('Error classes', () => {
  const errorClasses = [
    { cls: ConfigError, code: EXIT_CODES.config_error, name: 'ConfigError' },
    { cls: SourceError, code: EXIT_CODES.source_error, name: 'SourceError' },
    { cls: ExecutionError, code: EXIT_CODES.execution_error, name: 'ExecutionError' },
    { cls: PartialFailureError, code: EXIT_CODES.partial_failure, name: 'PartialFailureError' },
    { cls: SystemError, code: EXIT_CODES.system_error, name: 'SystemError' },
  ];

  it('each class produces correct exit code and is instanceof Wasm4pmError and Error', () => {
    for (const { cls, code } of errorClasses) {
      const err = new cls('test message');
      expect(err.exitCode).toBe(code);
      expect(err).toBeInstanceOf(Wasm4pmError);
      expect(err).toBeInstanceOf(Error);
    }
  });

  it('PartialFailureError stores succeeded and failed lists (including empty)', () => {
    const err = new PartialFailureError('some algorithms failed', ['dfg', 'heuristic_miner'], ['ilp']);
    expect(err.succeeded).toEqual(['dfg', 'heuristic_miner']);
    expect(err.failed).toEqual(['ilp']);
    const empty = new PartialFailureError('no operations', [], []);
    expect(empty.succeeded).toEqual([]);
    expect(empty.failed).toEqual([]);
  });

  it('Wasm4pmError accepts all valid exit codes', () => {
    for (const code of Object.values(EXIT_CODES)) {
      const err = new Wasm4pmError('test', code);
      expect(err.exitCode).toBe(code);
    }
  });
});

// ---------------------------------------------------------------------------
// handleError — Exit Code Mapping + Logging
// ---------------------------------------------------------------------------

describe('handleError exit code mapping', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);
    consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    exitSpy.mockRestore();
    consoleSpy.mockRestore();
  });

  it('maps each Wasm4pmError subclass to the correct exit code', () => {
    handleError(new ConfigError('bad config'));
    expect(exitSpy).toHaveBeenCalledWith(EXIT_CODES.config_error);
    exitSpy.mockClear();

    handleError(new SourceError('file missing'));
    expect(exitSpy).toHaveBeenCalledWith(EXIT_CODES.source_error);
    exitSpy.mockClear();

    handleError(new ExecutionError('algorithm timeout'));
    expect(exitSpy).toHaveBeenCalledWith(EXIT_CODES.execution_error);
    exitSpy.mockClear();

    handleError(new PartialFailureError('partial', ['a'], ['b']));
    expect(exitSpy).toHaveBeenCalledWith(EXIT_CODES.partial_failure);
    exitSpy.mockClear();

    handleError(new SystemError('disk full'));
    expect(exitSpy).toHaveBeenCalledWith(EXIT_CODES.system_error);
    exitSpy.mockClear();

    handleError(new Error('generic error'));
    expect(exitSpy).toHaveBeenCalledWith(EXIT_CODES.system_error);
  });

  it('logs error name and message correctly for Wasm4pmError and unknown errors', () => {
    handleError(new ConfigError('bad config'));
    expect(consoleSpy).toHaveBeenCalledWith('[ConfigError] bad config');
    consoleSpy.mockClear();

    handleError(new Error('generic'));
    expect(consoleSpy).toHaveBeenCalledWith('[SystemError] generic');
  });
});
