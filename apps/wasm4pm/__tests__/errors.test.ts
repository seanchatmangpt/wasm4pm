/**
 * Unit tests for apps/wasm4pm/src/errors.ts
 *
 * Tests error class hierarchy, exit code mapping, message formatting,
 * and the handleError() function.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  Wasm4pmError,
  ConfigError,
  SourceError,
  ExecutionError,
  PartialFailureError,
  SystemError,
  handleError,
} from '../src/errors.js';
import { EXIT_CODES } from '../src/exit-codes.js';

describe('Wasm4pmError (base class)', () => {
  it('is an instance of Error with correct message, exit code, and name', () => {
    const err = new Wasm4pmError('something went wrong', EXIT_CODES.execution_error);
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(Wasm4pmError);
    expect(err.message).toBe('something went wrong');
    expect(err.exitCode).toBe(EXIT_CODES.execution_error);
    expect(err.name).toBe('Wasm4pmError');
  });
});

describe('ConfigError', () => {
  it('has correct inheritance, exit code 1, name, and message', () => {
    const err = new ConfigError('wasm4pm.toml not found');
    expect(err).toBeInstanceOf(Wasm4pmError);
    expect(err).toBeInstanceOf(Error);
    expect(err.exitCode).toBe(EXIT_CODES.config_error);
    expect(err.name).toBe('ConfigError');
    expect(err.message).toBe('wasm4pm.toml not found');
  });
});

describe('SourceError', () => {
  it('has correct inheritance, exit code 2, and name', () => {
    const err = new SourceError('file not found');
    expect(err).toBeInstanceOf(Wasm4pmError);
    expect(err.exitCode).toBe(EXIT_CODES.source_error);
    expect(err.name).toBe('SourceError');
  });
});

describe('ExecutionError', () => {
  it('has correct inheritance, exit code 3, and name', () => {
    const err = new ExecutionError('timeout');
    expect(err).toBeInstanceOf(Wasm4pmError);
    expect(err.exitCode).toBe(EXIT_CODES.execution_error);
    expect(err.name).toBe('ExecutionError');
  });
});

describe('PartialFailureError', () => {
  it('has correct inheritance, exit code 4, name, and stores succeeded/failed arrays', () => {
    const err = new PartialFailureError('some failed', ['algo1', 'algo2'], ['algo3']);
    expect(err).toBeInstanceOf(Wasm4pmError);
    expect(err.exitCode).toBe(EXIT_CODES.partial_failure);
    expect(err.name).toBe('PartialFailureError');
    expect(err.succeeded).toEqual(['algo1', 'algo2']);
    expect(err.failed).toEqual(['algo3']);
  });

  it('handles empty succeeded/failed arrays', () => {
    const err = new PartialFailureError('no operations', [], []);
    expect(err.succeeded).toEqual([]);
    expect(err.failed).toEqual([]);
  });
});

describe('SystemError', () => {
  it('has correct inheritance, exit code 5, and name', () => {
    const err = new SystemError('permission denied');
    expect(err).toBeInstanceOf(Wasm4pmError);
    expect(err.exitCode).toBe(EXIT_CODES.system_error);
    expect(err.name).toBe('SystemError');
  });
});

describe('handleError', () => {
  let exitSpy: ReturnType<typeof vi.spyOn> & any;

  beforeEach(() => {
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('exits with correct code for each Wasm4pmError subclass and unknown errors', () => {
    handleError(new ConfigError('bad config'));
    expect(exitSpy).toHaveBeenCalledWith(EXIT_CODES.config_error);
    exitSpy.mockClear();

    handleError(new SourceError('file missing'));
    expect(exitSpy).toHaveBeenCalledWith(EXIT_CODES.source_error);
    exitSpy.mockClear();

    handleError(new ExecutionError('timeout'));
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
    exitSpy.mockClear();

    handleError('string error');
    expect(exitSpy).toHaveBeenCalledWith(EXIT_CODES.system_error);
  });

  it('logs correct format for Wasm4pmError and unknown errors', () => {
    const consoleSpy = vi.spyOn(console, 'error');
    handleError(new ConfigError('bad config'));
    expect(consoleSpy).toHaveBeenCalledWith('[ConfigError] bad config');
    consoleSpy.mockClear();

    handleError(new Error('generic'));
    expect(consoleSpy).toHaveBeenCalledWith('[SystemError] generic');
  });
});
