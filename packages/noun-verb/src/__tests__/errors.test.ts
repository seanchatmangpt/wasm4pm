import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ERROR_EXIT_CODES,
  ERROR_CODES,
  NounVerbError,
  resolveExitCode,
} from '../errors.js';

describe('NounVerbError', () => {
  it('serializes to the { error: { code, message } } envelope', () => {
    const err = NounVerbError.invalidInput('bad input');
    expect(err.toEnvelope()).toEqual({
      error: { code: 'INVALID_INPUT', message: 'bad input' },
    });
  });

  it('includes action_template in the envelope when present', () => {
    const err = new NounVerbError('DEADLINE_EXCEEDED', 'took too long', {
      actionTemplate: { kind: 'timeout_adjustment', suggested_timeout_ms: 5000 },
    });
    expect(err.toEnvelope()).toEqual({
      error: {
        code: 'DEADLINE_EXCEEDED',
        message: 'took too long',
        action_template: { kind: 'timeout_adjustment', suggested_timeout_ms: 5000 },
      },
    });
  });

  it('is idempotent under .from()', () => {
    const err = NounVerbError.executionError('boom');
    expect(NounVerbError.from(err)).toBe(err);
  });

  it('coerces a plain Error into an EXECUTION_ERROR', () => {
    const coerced = NounVerbError.from(new Error('native failure'));
    expect(coerced.code).toBe('EXECUTION_ERROR');
    expect(coerced.message).toBe('native failure');
  });

  it('coerces a non-Error throw into an EXECUTION_ERROR', () => {
    const coerced = NounVerbError.from('raw string throw');
    expect(coerced.code).toBe('EXECUTION_ERROR');
    expect(coerced.message).toBe('raw string throw');
  });

  it('commandNotFound proposes a did-you-mean action_template', () => {
    const err = NounVerbError.commandNotFound('mdel', ['model', 'log', 'evidence']);
    expect(err.code).toBe('COMMAND_NOT_FOUND');
    expect(err.actionTemplate).toEqual({
      kind: 'command_fix',
      suggested_command: 'model',
      reason: "Suggested correction for 'mdel'",
    });
  });

  it('commandNotFound omits action_template when nothing is close enough', () => {
    const err = NounVerbError.commandNotFound('zzz', ['model', 'log']);
    expect(err.actionTemplate).toBeUndefined();
    expect(err.toEnvelope().error.action_template).toBeUndefined();
  });

  it('verbNotFound proposes a full "noun verb" correction', () => {
    const err = NounVerbError.verbNotFound('model', 'dicover', ['discover', 'check']);
    expect(err.actionTemplate).toEqual({
      kind: 'command_fix',
      suggested_command: 'model discover',
      reason: "Suggested correction for 'dicover'",
    });
  });
});

describe('exit code mapping', () => {
  it('has a default mapping for every ErrorCode within 0-5', () => {
    for (const code of ERROR_CODES) {
      const exitCode = DEFAULT_ERROR_EXIT_CODES[code];
      expect(exitCode).toBeGreaterThanOrEqual(1);
      expect(exitCode).toBeLessThanOrEqual(5);
    }
  });

  it('resolveExitCode falls back to the default map when no override is given', () => {
    expect(resolveExitCode('EXECUTION_ERROR')).toBe(DEFAULT_ERROR_EXIT_CODES.EXECUTION_ERROR);
  });

  it('resolveExitCode honors a host-supplied partial override', () => {
    expect(resolveExitCode('EXECUTION_ERROR', { EXECUTION_ERROR: 4 })).toBe(4);
    // Unrelated codes stay on the default.
    expect(resolveExitCode('INTERNAL_ERROR', { EXECUTION_ERROR: 4 })).toBe(
      DEFAULT_ERROR_EXIT_CODES.INTERNAL_ERROR
    );
  });
});
