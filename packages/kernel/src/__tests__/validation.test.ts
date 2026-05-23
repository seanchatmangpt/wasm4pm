import { describe, it, expect } from 'vitest';
import { validateKernelResult, ValidationError } from '../validation.js';
import type { KernelResult } from '../api.js';
import type { AlgorithmMetadata } from '../registry.js';

const dfgMeta: AlgorithmMetadata = {
  id: 'dfg',
  name: 'Directly-Follows Graph',
  description: 'Fast DFG discovery',
  outputType: 'dfg',
  complexity: 'O(n)',
  speedTier: 5,
  qualityTier: 30,
  parameters: [],
  supportedProfiles: ['fast', 'balanced', 'quality', 'stream'],
  deploymentProfiles: ['mobile', 'browser', 'edge', 'fog', 'iot'],
  estimatedDurationMs: 0.5,
  estimatedMemoryMB: 10,
  robustToNoise: true,
  scalesWell: true,
};

function makeResult(overrides: Partial<KernelResult> = {}): KernelResult {
  return {
    handle: 'dfg_handle_abc123',
    algorithm: 'dfg',
    outputType: 'dfg',
    durationMs: 12.5,
    execution_ms: 12.5,
    params: { activity_key: 'concept:name' },
    hash: 'abc123def456', // @lint-allow-fakery — test fixture, intentionally short
    toLLMContext: () => 'dfg:abc123',
    ...overrides,
  };
}

describe('validateKernelResult — valid results', () => {
  it('does not throw for a well-formed KernelResult', () => {
    expect(() => validateKernelResult(makeResult(), dfgMeta)).not.toThrow();
  });

  it('does not throw when duration is zero', () => {
    expect(() => validateKernelResult(makeResult({ durationMs: 0, execution_ms: 0 }), dfgMeta)).not.toThrow();
  });
});

describe('validateKernelResult — hard violations throw ValidationError', () => {
  it('throws when handle is empty string', () => {
    expect(() => validateKernelResult(makeResult({ handle: '' }), dfgMeta))
      .toThrow(ValidationError);
  });

  it('throws when outputType mismatches registry expectation', () => {
    const err = (() => {
      try {
        validateKernelResult(makeResult({ outputType: 'petrinet' }), dfgMeta);
      } catch (e) {
        return e;
      }
    })() as ValidationError;

    expect(err).toBeInstanceOf(ValidationError);
    expect(err.algorithmName).toBe('dfg');
    expect(err.violations.some((v) => v.rule === 'output-type-match')).toBe(true);
  });

  it('includes all violations in the thrown error', () => {
    const err = (() => {
      try {
        validateKernelResult(makeResult({ handle: '', outputType: 'petrinet' }), dfgMeta);
      } catch (e) {
        return e;
      }
    })() as ValidationError;

    expect(err.violations.length).toBeGreaterThanOrEqual(2);
    expect(err.violations.every((v) => v.rule && v.severity && v.message)).toBe(true);
  });
});

describe('ValidationError class contract', () => {
  it('has the correct name, algorithmName, and violations properties', () => {
    const violations = [{ rule: 'test', severity: 'error' as const, message: 'test error' }];
    const err = new ValidationError('msg', 'dfg', violations);

    expect(err.name).toBe('ValidationError');
    expect(err.algorithmName).toBe('dfg');
    expect(err.violations).toBe(violations);
  });
});
