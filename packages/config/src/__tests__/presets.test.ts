import { describe, it, expect } from 'vitest';
import { getPublicPresetConfig, describePublicPreset, suggestPreset } from '../validation/presets.js';
import { validate } from '../schema.js';

describe('getPublicPresetConfig', () => {
  it('fast preset uses dfg algorithm with fast execution profile', () => {
    const config = getPublicPresetConfig('fast');
    expect(config.algorithm.name).toBe('dfg');
    expect(config.execution.profile).toBe('fast');
  });

  it('quality preset uses ilp algorithm with quality execution profile', () => {
    const config = getPublicPresetConfig('quality');
    expect(config.algorithm.name).toBe('ilp');
    expect(config.execution.profile).toBe('quality');
  });

  it('all three presets produce schema-valid configs', () => {
    for (const preset of ['fast', 'balanced', 'quality'] as const) {
      expect(() => validate(getPublicPresetConfig(preset)), `${preset} preset failed schema validation`).not.toThrow();
    }
  });
});

describe('suggestPreset', () => {
  it('suggests fast when maxMemoryMb is below 1000', () => {
    expect(suggestPreset({ maxMemoryMb: 512 })).toBe('fast');
    expect(suggestPreset({ maxMemoryMb: 999 })).toBe('fast');
  });

  it('suggests quality when a quality-tier algorithm is required', () => {
    expect(suggestPreset({ requiredAlgorithms: ['genetic_algorithm'] })).toBe('quality');
    expect(suggestPreset({ requiredAlgorithms: ['ilp'] })).toBe('quality');
  });

  it('defaults to balanced with no constraints or no trigger conditions', () => {
    expect(suggestPreset({})).toBe('balanced');
    expect(suggestPreset({ maxMemoryMb: 2000, maxLatencyMs: 5000 })).toBe('balanced');
  });
});

describe('describePublicPreset', () => {
  it('returns non-empty description strings for all three presets', () => {
    for (const preset of ['fast', 'balanced', 'quality'] as const) {
      const desc = describePublicPreset(preset);
      expect(typeof desc).toBe('string');
      expect(desc.length).toBeGreaterThan(0);
    }
  });
});
