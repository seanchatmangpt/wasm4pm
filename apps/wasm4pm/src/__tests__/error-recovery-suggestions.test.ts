import { describe, it, expect } from 'vitest';
import { suggestRecovery, formatRecoverySuggestion } from '../error/recovery-suggestions.js';

describe('Gap-10: Error Recovery Suggestions', () => {
  it('should suggest recovery for CONFIG_ERROR', () => {
    const suggestion = suggestRecovery('CONFIG_ERROR');
    expect(suggestion.errorCode).toBe('CONFIG_ERROR');
    expect(suggestion.primarySuggestion).toContain('wpm init');
    expect(suggestion.secondarySuggestions.length).toBeGreaterThan(0);
  });

  it('should suggest recovery for SOURCE_ERROR with file path context', () => {
    const suggestion = suggestRecovery('SOURCE_ERROR', { errorCode: 'SOURCE_ERROR', filePath: 'missing.xes' });
    expect(suggestion.errorCode).toBe('SOURCE_ERROR');
    expect(suggestion.primarySuggestion).toContain('input event log');
    expect(suggestion.relatedCommands.some((cmd) => cmd.includes('validate'))).toBe(true);
  });

  it('should suggest recovery for EXECUTION_ERROR', () => {
    const suggestion = suggestRecovery('EXECUTION_ERROR');
    expect(suggestion.errorCode).toBe('EXECUTION_ERROR');
    expect(suggestion.primarySuggestion).toContain('simpler algorithm');
    expect(suggestion.secondarySuggestions.some((s) => s.includes('dfg'))).toBe(true);
  });

  it('should suggest recovery for PARTIAL_FAILURE', () => {
    const suggestion = suggestRecovery('PARTIAL_FAILURE');
    expect(suggestion.errorCode).toBe('PARTIAL_FAILURE');
    expect(suggestion.primarySuggestion).toContain('succeeded but others failed');
  });

  it('should suggest recovery for SYSTEM_ERROR', () => {
    const suggestion = suggestRecovery('SYSTEM_ERROR');
    expect(suggestion.errorCode).toBe('SYSTEM_ERROR');
    expect(suggestion.primarySuggestion).toContain('wpm doctor');
    expect(suggestion.relatedCommands.some((cmd) => cmd.includes('doctor'))).toBe(true);
  });

  it('should suggest recovery for CONFORMANCE_FAIL', () => {
    const suggestion = suggestRecovery('CONFORMANCE_FAIL');
    expect(suggestion.errorCode).toBe('CONFORMANCE_FAIL');
    expect(suggestion.primarySuggestion).toContain('fitness');
    expect(suggestion.secondarySuggestions.some((s) => s.includes('genetic_algorithm'))).toBe(true);
  });

  it('should suggest recovery for WASM_NOT_FOUND', () => {
    const suggestion = suggestRecovery('WASM_NOT_FOUND');
    expect(suggestion.errorCode).toBe('WASM_NOT_FOUND');
    expect(suggestion.primarySuggestion).toContain('WASM binary');
    expect(suggestion.secondarySuggestions.some((s) => s.includes('wasm_bg.wasm') || s.includes('pkg'))).toBe(true);
  });

  it('should suggest recovery for INVALID_ALGORITHM', () => {
    const suggestion = suggestRecovery('INVALID_ALGORITHM', { errorCode: 'INVALID_ALGORITHM', algorithm: 'GA' });
    expect(suggestion.errorCode).toBe('INVALID_ALGORITHM');
    expect(suggestion.primarySuggestion).toContain('wpm algorithms');
  });

  it('should suggest recovery for FILE_NOT_FOUND', () => {
    const suggestion = suggestRecovery('FILE_NOT_FOUND', { errorCode: 'FILE_NOT_FOUND', filePath: 'log.xes' });
    expect(suggestion.errorCode).toBe('FILE_NOT_FOUND');
    expect(suggestion.primarySuggestion).toContain('file not found');
    expect(suggestion.secondarySuggestions.some((s) => s.includes('Relative paths'))).toBe(true);
  });

  it('should suggest recovery for PARSE_ERROR', () => {
    const suggestion = suggestRecovery('PARSE_ERROR');
    expect(suggestion.errorCode).toBe('PARSE_ERROR');
    expect(suggestion.primarySuggestion).toContain('parse input file');
    expect(suggestion.secondarySuggestions.some((s) => s.includes('XML'))).toBe(true);
  });

  it('should suggest recovery for TIMEOUT', () => {
    const suggestion = suggestRecovery('TIMEOUT');
    expect(suggestion.errorCode).toBe('TIMEOUT');
    expect(suggestion.primarySuggestion).toContain('timed out');
    expect(suggestion.secondarySuggestions.some((s) => s.includes('dfg'))).toBe(true);
  });

  it('should suggest recovery for PERMISSION_DENIED', () => {
    const suggestion = suggestRecovery('PERMISSION_DENIED');
    expect(suggestion.errorCode).toBe('PERMISSION_DENIED');
    expect(suggestion.primarySuggestion).toContain('Permission denied');
    expect(suggestion.secondarySuggestions.some((s) => s.includes('read') || s.includes('write') || s.includes('access'))).toBe(true);
  });

  it('should format recovery suggestion for CLI output', () => {
    const suggestion = suggestRecovery('CONFIG_ERROR');
    const formatted = formatRecoverySuggestion(suggestion);
    expect(formatted).toContain('Recovery Suggestion');
    expect(formatted).toContain('CONFIG_ERROR');
    expect(formatted).toContain('wpm init');
  });

  it('should handle unknown error codes gracefully', () => {
    const suggestion = suggestRecovery('UNKNOWN_ERROR_CODE_123');
    expect(suggestion.errorCode).toBe('UNKNOWN_ERROR_CODE_123');
    expect(suggestion.primarySuggestion).toContain('Unknown error code');
    expect(suggestion.relatedCommands.some((cmd) => cmd.includes('doctor'))).toBe(true);
  });

  it('should normalize error code format (kebab-case to UPPER_SNAKE_CASE)', () => {
    const suggestion1 = suggestRecovery('config-error');
    const suggestion2 = suggestRecovery('CONFIG_ERROR');
    expect(suggestion1.errorCode).toBe(suggestion2.errorCode);
    expect(suggestion1.primarySuggestion).toBe(suggestion2.primarySuggestion);
  });
});
