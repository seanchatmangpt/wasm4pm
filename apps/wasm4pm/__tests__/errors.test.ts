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
  it('is an instance of Error', () => {
    const err = new Wasm4pmError('test', EXIT_CODES.config_error);
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(Wasm4pmError);
  });

  it('stores message and exit code', () => {
    const err = new Wasm4pmError('something went wrong', EXIT_CODES.execution_error);
    expect(err.message).toBe('something went wrong');
    expect(err.exitCode).toBe(EXIT_CODES.execution_error);
  });

  it('has name set to "Wasm4pmError"', () => {
    const err = new Wasm4pmError('test', EXIT_CODES.success);
    expect(err.name).toBe('Wasm4pmError');
  });
});

describe('ConfigError', () => {
  it('is an instance of Wasm4pmError and Error', () => {
    const err = new ConfigError('bad config');
    expect(err).toBeInstanceOf(Wasm4pmError);
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ConfigError);
  });

  it('has exit code 1 (config_error)', () => {
    const err = new ConfigError('missing file');
    expect(err.exitCode).toBe(EXIT_CODES.config_error);
  });

  it('has name set to "ConfigError"', () => {
    const err = new ConfigError('test');
    expect(err.name).toBe('ConfigError');
  });

  it('preserves message', () => {
    const err = new ConfigError('wasm4pm.toml not found');
    expect(err.message).toBe('wasm4pm.toml not found');
  });
});

describe('SourceError', () => {
  it('is an instance of Wasm4pmError', () => {
    const err = new SourceError('bad file');
    expect(err).toBeInstanceOf(Wasm4pmError);
  });

  it('has exit code 2 (source_error)', () => {
    const err = new SourceError('file not found');
    expect(err.exitCode).toBe(EXIT_CODES.source_error);
  });

  it('has name set to "SourceError"', () => {
    const err = new SourceError('test');
    expect(err.name).toBe('SourceError');
  });
});

describe('ExecutionError', () => {
  it('is an instance of Wasm4pmError', () => {
    const err = new ExecutionError('algorithm failed');
    expect(err).toBeInstanceOf(Wasm4pmError);
  });

  it('has exit code 3 (execution_error)', () => {
    const err = new ExecutionError('timeout');
    expect(err.exitCode).toBe(EXIT_CODES.execution_error);
  });

  it('has name set to "ExecutionError"', () => {
    const err = new ExecutionError('test');
    expect(err.name).toBe('ExecutionError');
  });
});

describe('PartialFailureError', () => {
  it('is an instance of Wasm4pmError', () => {
    const err = new PartialFailureError('partial', ['a'], ['b']);
    expect(err).toBeInstanceOf(Wasm4pmError);
  });

  it('has exit code 4 (partial_failure)', () => {
    const err = new PartialFailureError('partial', ['a'], ['b']);
    expect(err.exitCode).toBe(EXIT_CODES.partial_failure);
  });

  it('stores succeeded and failed arrays', () => {
    const err = new PartialFailureError('some failed', ['algo1', 'algo2'], ['algo3']);
    expect(err.succeeded).toEqual(['algo1', 'algo2']);
    expect(err.failed).toEqual(['algo3']);
  });

  it('has name set to "PartialFailureError"', () => {
    const err = new PartialFailureError('test', [], []);
    expect(err.name).toBe('PartialFailureError');
  });

  it('handles empty succeeded/failed arrays', () => {
    const err = new PartialFailureError('no operations', [], []);
    expect(err.succeeded).toEqual([]);
    expect(err.failed).toEqual([]);
  });
});

describe('SystemError', () => {
  it('is an instance of Wasm4pmError', () => {
    const err = new SystemError('disk full');
    expect(err).toBeInstanceOf(Wasm4pmError);
  });

  it('has exit code 5 (system_error)', () => {
    const err = new SystemError('permission denied');
    expect(err.exitCode).toBe(EXIT_CODES.system_error);
  });

  it('has name set to "SystemError"', () => {
    const err = new SystemError('test');
    expect(err.name).toBe('SystemError');
  });
});

describe('handleError', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('exits with config_error exit code for ConfigError', () => {
    handleError(new ConfigError('bad config'));
    expect(exitSpy).toHaveBeenCalledWith(EXIT_CODES.config_error);
  });

  it('exits with source_error exit code for SourceError', () => {
    handleError(new SourceError('file missing'));
    expect(exitSpy).toHaveBeenCalledWith(EXIT_CODES.source_error);
  });

  it('exits with execution_error exit code for ExecutionError', () => {
    handleError(new ExecutionError('timeout'));
    expect(exitSpy).toHaveBeenCalledWith(EXIT_CODES.execution_error);
  });

  it('exits with partial_failure exit code for PartialFailureError', () => {
    handleError(new PartialFailureError('partial', ['a'], ['b']));
    expect(exitSpy).toHaveBeenCalledWith(EXIT_CODES.partial_failure);
  });

  it('exits with system_error exit code for SystemError', () => {
    handleError(new SystemError('disk full'));
    expect(exitSpy).toHaveBeenCalledWith(EXIT_CODES.system_error);
  });

  it('exits with system_error exit code for unknown Error', () => {
    handleError(new Error('generic error'));
    expect(exitSpy).toHaveBeenCalledWith(EXIT_CODES.system_error);
  });

  it('exits with system_error exit code for non-Error thrown value', () => {
    handleError('string error');
    expect(exitSpy).toHaveBeenCalledWith(EXIT_CODES.system_error);
  });

  it('logs error name and message for Wasm4pmError', () => {
    const consoleSpy = vi.spyOn(console, 'error');
    handleError(new ConfigError('bad config'));
    expect(consoleSpy).toHaveBeenCalledWith('[ConfigError] bad config');
  });

  it('logs as SystemError for unknown errors', () => {
    const consoleSpy = vi.spyOn(console, 'error');
    handleError(new Error('generic'));
    expect(consoleSpy).toHaveBeenCalledWith('[SystemError] generic');
  });
});
