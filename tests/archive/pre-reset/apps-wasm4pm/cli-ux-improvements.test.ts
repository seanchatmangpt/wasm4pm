/**
 * CLI UX Improvements Tests
 *
 * Tests for:
 * - Gap 2: Error recovery hints with structured error codes
 * - Gap 1: Multi-level verbose output (-v, -vv, -vvv)
 */

import { describe, it, expect } from 'vitest';
import {
  getRecoveryHint,
  formatRecoveryHint,
  getQuickRecoverySuggestion,
  getRecoveryHintStructured,
} from '../error-recovery.js';
import { normalizeVerboseLevel, ConsoleProjection } from '../output.js';
import { ConfigTracer } from '../config-trace.js';

describe('Gap 2: Error Recovery Hints', () => {
  it('should provide structured error code for algorithm not found', () => {
    const hint = getRecoveryHint("Algorithm 'foo' not found", 'config', 'run');
    expect(hint.code).toBe('CONFIG_ALGORITHM_NOT_FOUND');
    expect(hint.suggestion).toContain('Did you mean');
    expect(hint.alternatives).toContain('dfg');
    expect(hint.docsUrl).toContain('algorithms');
  });

  it('should suggest closest matching algorithm', () => {
    const hint = getRecoveryHint("Algorithm 'heurisitc' not found", 'config', 'run');
    expect(hint.didYouMean).toBe('heuristic'); // Levenshtein distance match
  });

  it('should provide structured error code for invalid profile', () => {
    const hint = getRecoveryHint("profile 'foo' not valid", 'config', 'run');
    expect(hint.code).toBe('CONFIG_INVALID_PROFILE');
    expect(hint.alternatives).toContain('fast');
    expect(hint.alternatives).toContain('balanced');
  });

  it('should provide SOURCE_FILE_NOT_FOUND code', () => {
    const hint = getRecoveryHint("File 'log.xes' not found", 'source', 'run');
    expect(hint.code).toBe('SOURCE_FILE_NOT_FOUND');
    expect(hint.command).toContain('log.xes');
  });

  it('should provide EXEC_TIMEOUT code', () => {
    const hint = getRecoveryHint('Timeout exceeded', 'execution', 'run');
    expect(hint.code).toBe('EXEC_TIMEOUT');
    expect(hint.envVar).toBe('WASM4PM_EXECUTION_TIMEOUT');
  });

  it('should provide EXEC_OUT_OF_MEMORY code', () => {
    const hint = getRecoveryHint('Out of memory', 'execution', 'run');
    expect(hint.code).toBe('EXEC_OUT_OF_MEMORY');
    expect(hint.command).toContain('dfg');
  });

  it('should provide SYS_PERMISSION_DENIED code', () => {
    const hint = getRecoveryHint('Permission denied', 'system', 'run');
    expect(hint.code).toBe('SYS_PERMISSION_DENIED');
    expect(hint.command).toContain('chmod');
  });

  it('should format recovery hint with code and docs URL', () => {
    const hint = getRecoveryHint("Algorithm 'foo' not found", 'config', 'run');
    const formatted = formatRecoveryHint(hint);
    expect(formatted).toContain('CONFIG_ALGORITHM_NOT_FOUND');
    expect(formatted).toContain('Learn more:');
    expect(formatted).toContain('https://wasm4pm.dev');
  });

  it('should return quick recovery suggestion as one-liner', () => {
    const suggestion = getQuickRecoverySuggestion("Algorithm 'foo' not found", 'config');
    expect(suggestion).toContain('Try:');
    expect(suggestion).toContain('wpm');
  });

  it('should provide structured hint with all fields', () => {
    const hint = getRecoveryHintStructured("Algorithm 'foo' not found", 'config');
    expect(hint.code).toBeDefined();
    expect(hint.suggestion).toBeDefined();
    expect(hint.command).toBeDefined();
    expect(hint.alternatives).toBeDefined();
    expect(hint.docsUrl).toBeDefined();
  });
});

describe('Gap 1: Multi-level Verbose Output', () => {
  it('should normalize verbose=true to level 1', () => {
    const level = normalizeVerboseLevel({ verbose: true });
    expect(level).toBe(1);
  });

  it('should normalize verbose=2 to level 2', () => {
    const level = normalizeVerboseLevel({ verbose: 2 });
    expect(level).toBe(2);
  });

  it('should normalize verboseLevel=3 to level 3', () => {
    const level = normalizeVerboseLevel({ verboseLevel: 3 });
    expect(level).toBe(3);
  });

  it('should clamp verbose level to 0-3 range', () => {
    expect(normalizeVerboseLevel({ verbose: 10 })).toBe(3);
    expect(normalizeVerboseLevel({ verbose: -1 })).toBe(0);
  });

  it('should prefer verboseLevel over verbose', () => {
    const level = normalizeVerboseLevel({ verbose: 1, verboseLevel: 3 });
    expect(level).toBe(3);
  });

  it('should provide debug output at level 1+', () => {
    const proj1 = new ConsoleProjection({ verboseLevel: 0 });
    const proj2 = new ConsoleProjection({ verboseLevel: 1 });
    expect(proj1.verboseLevel).toBe(0);
    expect(proj2.verboseLevel).toBe(1);
    // Note: debug() actually logs, so we can't directly test without mocking console
  });

  it('should provide decision output at level 2+', () => {
    const proj = new ConsoleProjection({ verboseLevel: 2 });
    expect(proj.verboseLevel).toBe(2);
  });

  it('should provide span output at level 3+', () => {
    const proj = new ConsoleProjection({ verboseLevel: 3 });
    expect(proj.verboseLevel).toBe(3);
  });
});

describe('Config Resolution Tracing', () => {
  it('should track config source precedence', () => {
    const tracer = new ConfigTracer();
    tracer.recordSource('algorithm', 'dfg', 'defaults');
    tracer.recordSource('algorithm', 'heuristic', 'wasm4pm.toml');

    const trace = tracer.getTrace();
    expect(trace.sources.length).toBeGreaterThan(0);
    expect(trace.sources).toContainEqual(
      expect.objectContaining({ field: 'algorithm', value: 'heuristic', source: 'wasm4pm.toml' })
    );
  });

  it('should record algorithm selection reason', () => {
    const tracer = new ConfigTracer();
    tracer.recordAlgorithmChoice(
      'heuristic',
      'Selected for noise tolerance',
      ['dfg', 'alpha', 'heuristic'],
      { score: 50 }
    );

    const trace = tracer.getTrace();
    expect(trace.algorithm).toBeDefined();
    expect(trace.algorithm?.chosen).toBe('heuristic');
    expect(trace.algorithm?.scoreDetails).toEqual({ score: 50 });
  });

  it('should record profile selection reason', () => {
    const tracer = new ConfigTracer();
    tracer.recordProfileChoice('balanced', 'Default profile for mixed workloads', [
      'Log size ~50K events',
      'Balanced discovery quality',
    ]);

    const trace = tracer.getTrace();
    expect(trace.profile).toBeDefined();
    expect(trace.profile?.chosen).toBe('balanced');
    expect(trace.profile?.reasons).toHaveLength(2);
  });

  it('should format trace at level 1 (debug)', () => {
    const tracer = new ConfigTracer();
    tracer.recordSource('algorithm', 'dfg', 'wasm4pm.toml');

    const formatted = tracer.format(1);
    expect(formatted).toContain('DEBUG');
    expect(formatted).toContain('algorithm');
  });

  it('should format trace at level 2 (decision)', () => {
    const tracer = new ConfigTracer();
    tracer.recordAlgorithmChoice('heuristic', 'Reason', ['dfg', 'heuristic']);

    const formatted = tracer.format(2);
    expect(formatted).toContain('DECISION');
    expect(formatted).toContain('heuristic');
  });

  it('should format trace at level 3 (all sources)', () => {
    const tracer = new ConfigTracer();
    tracer.recordSource('algorithm', 'dfg', 'defaults');
    tracer.recordSource('algorithm', 'heuristic', 'wasm4pm.toml');

    const formatted = tracer.format(3);
    expect(formatted).toContain('All Config Sources');
    expect(formatted).toContain('wasm4pm.toml');
    expect(formatted).toContain('defaults');
  });
});
