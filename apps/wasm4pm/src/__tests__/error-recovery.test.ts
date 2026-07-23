/**
 * CLI Error Recovery — Actionable Messages
 *
 * Tests that verify:
 * 1. Error messages include recovery hints
 * 2. Recovery hints are context-specific
 * 3. Hints include relevant commands and environment variables
 * 4. All error types are covered (config, source, execution, system)
 */

import { describe, it, expect } from 'vitest';
import {
  getRecoveryHint,
  formatRecoveryHint,
  getQuickRecoverySuggestion,
} from '../error-recovery.js';
import { ConfigError, SourceError, ExecutionError, SystemError } from '../errors.js';

describe('Error Recovery Hints', () => {
  describe('Config Error Scenarios', () => {
    it('should suggest algorithm alternatives when algorithm is not found', () => {
      const hint = getRecoveryHint(
        "Algorithm 'foo' not found in registry",
        'config',
        'run'
      );

      expect(hint.suggestion).toContain('Algorithm');
      expect(hint.suggestion).toContain('not recognized');
      expect(hint.alternatives).toBeDefined();
      // 'dfg' is guaranteed present (top-8 slice of the deduped alias/id set);
      // 'genetic' is not part of that slice — assert against the real set
      // rather than an arbitrary member that may not be in the first 8.
      expect(hint.alternatives).toContain('dfg');
      expect(hint.alternatives!.length).toBeGreaterThan(0);
      expect(hint.alternatives!.length).toBeLessThanOrEqual(8);
    });

    it('should suggest valid profiles for invalid execution profile', () => {
      // NOTE: the branch match is `includes('profile') && includes('not')` —
      // the message must contain literal "not" (not just imply invalidity)
      // to hit the profile-specific hint rather than falling through to the
      // generic CONFIG_INVALID default.
      const hint = getRecoveryHint(
        "Invalid profile 'hyperfast': not a recognized profile",
        'config',
        'run'
      );

      expect(hint.suggestion).toContain('Invalid execution profile');
      expect(hint.alternatives).toEqual(expect.arrayContaining(['fast', 'balanced', 'quality', 'stream']));
      expect(hint.command).toBe('wpm init --preset balanced');
    });

    it('should advise TOML syntax check for malformed TOML config', () => {
      const hint = getRecoveryHint(
        'Failed to parse TOML config at wasm4pm.toml: Unexpected token',
        'config',
        'run'
      );

      expect(hint.suggestion).toContain('TOML');
      expect(hint.command).toBe('wpm init --force');
      expect(hint.alternatives).toContain('cat wasm4pm.toml');
    });

    it('should advise JSON validator for malformed JSON config', () => {
      const hint = getRecoveryHint(
        'Failed to parse JSON config at wasm4pm.json: Unexpected end of JSON',
        'config',
        'run'
      );

      expect(hint.suggestion).toContain('JSON');
      expect(hint.command).toBe('wpm init --force');
    });

    it('should suggest regenerating config for missing required field', () => {
      const hint = getRecoveryHint(
        'Field algorithm.name is required but missing',
        'config',
        'run'
      );

      expect(hint.suggestion).toContain('missing required field');
      expect(hint.command).toBe('wpm init --force');
    });

    it('should advise on type mismatch in config', () => {
      const hint = getRecoveryHint(
        'execution.timeout must be a number, got string',
        'config',
        'run'
      );

      expect(hint.suggestion).toContain('wrong type');
    });
  });

  describe('Source Error Scenarios', () => {
    it('should suggest file path verification for missing input file', () => {
      const hint = getRecoveryHint(
        'File not found: "process.xes"',
        'source',
        'run'
      );

      expect(hint.suggestion).toContain('not found');
      expect(hint.suggestion).toContain('process.xes');
      expect(hint.command).toContain('--input');
    });

    it('should suggest validation for unparseable event logs', () => {
      const hint = getRecoveryHint(
        'Cannot parse XES log: invalid XML at line 42',
        'source',
        'run'
      );

      expect(hint.suggestion).toContain('format is invalid');
      expect(hint.command).toContain('wpm validate');
      expect(hint.alternatives).toContain('wpm run --input log.xes --preflight');
    });

    it('should suggest algorithm fallback for logs that are too large', () => {
      const hint = getRecoveryHint(
        'Event log exceeds maximum size (50000 events)',
        'source',
        'run'
      );

      expect(hint.suggestion).toContain('too large');
      expect(hint.command).toContain('dfg');
    });

    it('should suggest attribute key specification when attributes are missing', () => {
      // The 'source' branch checks 'not found'/'No such file' BEFORE the
      // attribute branch — a message containing "not found" hits the
      // file-not-found hint instead. Use wording that names the missing
      // attribute without tripping the earlier, more specific branch.
      const hint = getRecoveryHint(
        'Log has missing required attribute: concept:name absent from events',
        'source',
        'run'
      );

      expect(hint.suggestion).toContain('required attributes');
      expect(hint.command).toContain('--activity-key');
      expect(hint.command).toContain('--input log.xes');
    });
  });

  describe('Execution Error Scenarios', () => {
    it('should diagnose WASM load failures', () => {
      const hint = getRecoveryHint(
        'WASM module not loaded: fetch failed',
        'execution',
        'run'
      );

      expect(hint.suggestion).toContain('WASM module failed');
      expect(hint.command).toBe('wpm doctor');
      expect(hint.alternatives).toContain('pnpm install');
    });

    it('should suggest algorithm availability check', () => {
      const hint = getRecoveryHint(
        'Algorithm genetic is not available in this WASM build (feature-discovery-advanced not enabled)',
        'execution',
        'run'
      );

      expect(hint.suggestion).toContain('not compiled');
      expect(hint.command).toContain('wpm algorithms');
      expect(hint.alternatives).toContain('wpm run --algorithm dfg --input log.xes');
    });

    it('should suggest timeout increase for execution timeouts', () => {
      const hint = getRecoveryHint(
        'Execution timeout exceeded (300000ms)',
        'execution',
        'run'
      );

      expect(hint.suggestion).toContain('timeout');
      expect(hint.command).toContain('--timeout 600');
      expect(hint.envVar).toBe('WASM4PM_EXECUTION_TIMEOUT');
    });

    it('should suggest memory-saving options for OOM', () => {
      const hint = getRecoveryHint(
        'Out of memory: failed to allocate 4GB',
        'execution',
        'run'
      );

      expect(hint.suggestion).toContain('memory');
      expect(hint.command).toContain('dfg');
      expect(hint.alternatives).toContain('wpm doctor');
    });

    it('should provide debugging steps for crashes', () => {
      const hint = getRecoveryHint(
        'Algorithm crashed: panicked at "index out of bounds"',
        'execution',
        'run'
      );

      expect(hint.suggestion).toContain('crashed');
      expect(hint.command).toContain('RUST_LOG=debug');
      expect(hint.alternatives).toContain('wpm doctor');
    });
  });

  describe('System Error Scenarios', () => {
    it('should suggest permission fixes for access denied', () => {
      const hint = getRecoveryHint(
        'Permission denied: cannot write to .wasm4pm/results/',
        'system',
        'run'
      );

      expect(hint.suggestion).toContain('Permission denied');
      expect(hint.command).toContain('chmod');
    });

    it('should suggest disk cleanup for out-of-space errors', () => {
      const hint = getRecoveryHint(
        'No space left on device',
        'system',
        'run'
      );

      expect(hint.suggestion).toContain('Disk is full');
      // The destructive `rm -rf .wasm4pm/results/*` now lives in `command`
      // (a single explicit recovery step), not `alternatives` (which offers
      // non-destructive diagnostics instead: `du -sh .`, `wpm doctor`).
      expect(hint.command).toContain('df -h');
      expect(hint.command).toContain('rm -rf .wasm4pm/results/*');
      expect(hint.alternatives).toContain('du -sh .');
      expect(hint.alternatives).toContain('wpm doctor');
    });

    it('should suggest network diagnostics for connectivity issues', () => {
      const hint = getRecoveryHint(
        'ECONNREFUSED: Cannot connect to OTEL endpoint',
        'system',
        'run'
      );

      expect(hint.suggestion).toContain('Network error');
      expect(hint.command).toContain('WASM4PM_OTEL_ENABLED=false');
      expect(hint.alternatives).toContain('ping 8.8.8.8');
    });

    it('should suggest env var verification for environment issues', () => {
      // The branch check is a case-sensitive `includes('env')` — a message
      // starting with capital "Environment" doesn't contain lowercase "env"
      // as a substring by itself elsewhere, so it must use lowercase to hit
      // the SYS_ENV_ERROR branch instead of falling through to the generic
      // SYS_ERROR default.
      const hint = getRecoveryHint(
        'environment variable WASM4PM_OTEL_ENDPOINT is invalid',
        'system',
        'run'
      );

      expect(hint.suggestion).toContain('Environment variable');
      expect(hint.command).toContain('env | grep WASM4PM');
    });
  });

  describe('Error Classes with Recovery Hints', () => {
    it('should attach recovery hint to ConfigError', () => {
      const err = new ConfigError('Algorithm not found');

      expect(err.recovery).toBeDefined();
      expect(err.recovery?.suggestion).toBeDefined();
      expect(err.recovery?.alternatives).toBeDefined();
    });

    it('should attach recovery hint to SourceError', () => {
      const err = new SourceError('File not found: log.xes');

      expect(err.recovery).toBeDefined();
      expect(err.recovery?.suggestion).toContain('not found');
    });

    it('should attach recovery hint to ExecutionError', () => {
      const err = new ExecutionError('Execution timeout exceeded');

      expect(err.recovery).toBeDefined();
      expect(err.recovery?.suggestion).toContain('timeout');
    });

    it('should attach recovery hint to SystemError', () => {
      const err = new SystemError('Permission denied');

      expect(err.recovery).toBeDefined();
      expect(err.recovery?.suggestion).toContain('Permission');
    });
  });

  describe('Recovery Hint Formatting', () => {
    it('should format recovery hint as readable text', () => {
      const hint = getRecoveryHint(
        'Algorithm not found',
        'config',
        'run'
      );

      const formatted = formatRecoveryHint(hint);

      expect(formatted).toContain('Suggestion:');
      expect(formatted).toContain('To recover');
      // The algorithm-not-found hint's `command` is 'wpm algorithms' (list
      // valid algorithms), not 'wpm run --help'.
      expect(formatted).toContain('wpm algorithms');
      expect(formatted).toContain('Alternatives:');
      expect(formatted).toContain('dfg');
    });

    it('should omit optional sections if not present', () => {
      const hint: ReturnType<typeof getRecoveryHint> = {
        suggestion: 'Try this suggestion',
        // No command, envVar, or alternatives
      };

      const formatted = formatRecoveryHint(hint);

      expect(formatted).toContain('Suggestion: Try this suggestion');
      expect(formatted).not.toContain('To recover');
      expect(formatted).not.toContain('Alternatives:');
    });
  });

  describe('Quick Recovery Suggestion (JSON remediation)', () => {
    it('should provide one-liner for JSON error format', () => {
      const suggestion = getQuickRecoverySuggestion(
        'Algorithm not found',
        'config'
      );

      expect(suggestion).toContain('not recognized');
      // Quick suggestion appends the hint's own `command` ('wpm algorithms'),
      // not a fixed 'wpm run --help'.
      expect(suggestion).toContain('Try: wpm algorithms');
    });

    it('should handle config errors', () => {
      const suggestion = getQuickRecoverySuggestion(
        'Failed to parse TOML config',
        'config'
      );

      expect(suggestion).toContain('wpm init --force');
    });

    it('should handle source errors', () => {
      const suggestion = getQuickRecoverySuggestion(
        'File not found: process.xes',
        'source'
      );

      // SOURCE_FILE_NOT_FOUND's suggestion text is "Input file not found:
      // <file>. Verify..." — it doesn't echo the literal phrase "File not
      // found" (capitalized differently), so match the actual wording.
      expect(suggestion).toContain('Input file not found');
      expect(suggestion).toContain('wpm run');
    });
  });

  describe('Output Integration', () => {
    it('should include remediation in JSON output', () => {
      // This is tested via integration tests in dx-error-messages.test.ts
      // Just verify that makeErrorResult accepts remediation
      const err = new ConfigError('Invalid profile');
      expect(err.recovery?.suggestion).toBeDefined();
    });
  });
});
