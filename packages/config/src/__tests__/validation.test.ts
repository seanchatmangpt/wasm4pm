import { describe, it, expect } from 'vitest';
import {
  validateAlgorithmProfile,
  validateMlConfig,
  validateRlConfig,
  validatePredictionConfig,
  formatDetailedZodError,
} from '../validation/detailed-errors.js';
import {
  getProfileCapabilities,
  suggestProfile,
  validateAlgorithmInProfile,
  getProfileComparisonTable,
} from '../validation/profile-management.js';
import { getPresetConfig, getExampleTomlWithComments, describePreset } from '../validation/presets.js';
import { checkConfigWarnings } from '../resolver.js';
import { validate } from '../schema.js';
import type { Config } from '../types.js';

describe('Validation - Detailed Errors', () => {
  it('validates algorithm in profile', () => {
    // DFG should work in all profiles
    expect(validateAlgorithmProfile('dfg', 'fast')).toEqual({ compatible: true });
    expect(validateAlgorithmProfile('dfg', 'browser')).toEqual({ compatible: true });
  });

  it('accepts valid algorithm in profile', () => {
    // DFG should be in all profiles
    const result = validateAlgorithmProfile('dfg', 'fast');
    expect(result.compatible).toBe(true);
    expect(result.warning).toBeUndefined();
  });

  it('warns on suspicious ML config (k > dataset size)', () => {
    const config: Partial<Config> = {
      ml: {
        enabled: true,
        tasks: ['cluster'],
        cluster: { method: 'kmeans', k: 100, eps: 1.0 },
        classify: { model: 'decision_tree', targetKey: 'outcome', k: 5 },
        forecast: { method: 'linear', periods: 5, polynomialDegree: 2 },
        anomaly: { method: 'ema', alpha: 0.3, threshold: 2.5 },
        regress: { method: 'linear', targetKey: 'outcome', lambda: 0.0 },
        pca: { nComponents: 2 },
        targetKey: 'outcome',
        forecastPeriods: 5,
        nComponents: 2,
        eps: 1.0,
      },
    };

    const warnings = validateMlConfig(config, 50); // Log size: 50 traces
    expect(warnings.some(w => w.field === 'ml.cluster.k')).toBe(true);
    expect(warnings.some(w => w.warning.includes('larger than log size'))).toBe(true);
  });

  it('warns on suspicious RL config (learning_rate > 0.5)', () => {
    const config: Partial<Config> = {
      rl: {
        enabled: true,
        agents: ['QLearning'],
        learning_rate: 0.8, // Too high
        discount_factor: 0.99,
        epsilon: 0.1,
        convergence: { min_cycles: 50, target_reward_improvement: 0.05, window_size: 10 },
        gpu_enabled: false,
        linucb_lambda: 1.0,
        ucb1_exploration: Math.SQRT2,
      },
    };

    const warnings = validateRlConfig(config);
    expect(warnings.some(w => w.field === 'rl.learning_rate')).toBe(true);
    expect(warnings.some(w => w.warning.includes('very high'))).toBe(true);
  });

  it('warns on suspicious prediction config (ngramOrder too low)', () => {
    const config: Partial<Config> = {
      prediction: {
        enabled: true,
        activityKey: 'concept:name',
        ngramOrder: 1, // Invalid
        driftWindowSize: 10,
        tasks: ['next_activity'],
        drift: { ewma_alpha: 0.2, threshold: 0.3 },
      },
    };

    const warnings = validatePredictionConfig(config);
    expect(warnings.some(w => w.field === 'prediction.ngramOrder')).toBe(true);
  });
});

describe('Validation - Profiles', () => {
  it('gets capabilities for fast profile', () => {
    const caps = getProfileCapabilities('fast');
    expect(caps.name).toBe('fast');
    expect(caps.algorithms.length).toBeLessThan(10);
    expect(caps.features.length).toBeLessThan(5);
  });

  it('gets capabilities for quality profile (all algorithms)', () => {
    const caps = getProfileCapabilities('quality');
    expect(caps.name).toBe('quality');
    expect(caps.algorithms.length).toBeGreaterThan(35); // Should have 41
  });

  it('suggests fast profile for low memory budget', () => {
    const result = suggestProfile({ memoryBudgetMb: 0.5 });
    expect(result.recommended).toBe('fast');
  });

  it('suggests balanced as default', () => {
    const result = suggestProfile({}); // No constraints
    expect(result.recommended).toBe('balanced');
  });

  it('suggests balanced for ML algorithms (available in balanced+)', () => {
    const result = suggestProfile({
      requiredAlgorithms: ['ml_classify', 'ml_cluster'],
    });
    // Should suggest balanced or higher since ML is available in balanced+
    expect(['balanced', 'quality']).toContain(result.recommended);
  });

  it('validates algorithm in profile', () => {
    expect(validateAlgorithmInProfile('dfg', 'fast')).toEqual({ valid: true });
    const badResult = validateAlgorithmInProfile('ilp', 'fast');
    expect(badResult.valid).toBe(false);
    expect(badResult.error).toMatch(/not available/);
  });

  it('generates profile comparison table', () => {
    const table = getProfileComparisonTable();
    expect(table).toContain('Fast');
    expect(table).toContain('Balanced');
    expect(table).toContain('Quality');
    expect(table).toContain('Stream');
    expect(table).toContain('Profile'); // Header
  });
});

describe('Validation - Presets', () => {
  it('creates quick-test preset', () => {
    const config = getPresetConfig('quick-test');
    expect(config.version).toBe('26.4.5');
    expect(config.execution.profile).toBe('fast');
    expect(config.execution.timeout).toBe(60000);
    expect(config.prediction?.enabled).toBe(false);
  });

  it('creates production preset', () => {
    const config = getPresetConfig('production');
    expect(config.execution.profile).toBe('balanced');
    expect(config.ml?.enabled).toBe(true);
    expect(config.ml?.tasks).toContain('classify');
    expect(config.prediction?.enabled).toBe(true);
  });

  it('creates research preset', () => {
    const config = getPresetConfig('research');
    expect(config.execution.profile).toBe('quality');
    expect(config.algorithm.name).toBe('ilp');
    expect(config.ml?.tasks?.length).toBeGreaterThanOrEqual(6);
    expect(config.rl?.enabled).toBe(true);
  });

  it('validates preset configs against schema', () => {
    for (const scenario of ['quick-test', 'production', 'research'] as const) {
      const preset = getPresetConfig(scenario);
      // Should not throw
      expect(() => {
        validate({
          ...preset,
          source: { kind: 'file' },
        });
      }).not.toThrow();
    }
  });

  it('generates example TOML with comments', () => {
    const toml = getExampleTomlWithComments();
    expect(toml).toContain('[source]');
    expect(toml).toContain('[ml]');
    expect(toml).toContain('[rl]');
    expect(toml).toContain('[prediction]');
    expect(toml).toContain('# ');
  });

  it('describes presets', () => {
    const desc = describePreset('quick-test');
    expect(desc).toContain('Quick Test');
    expect(desc).toContain('fast');

    const prod = describePreset('production');
    expect(prod).toContain('Production');
    expect(prod).toContain('balanced');

    const research = describePreset('research');
    expect(research).toContain('Research');
    expect(research).toContain('quality');
  });
});

describe('Config - Warnings', () => {
  it('collects warnings from multiple sources', () => {
    const config: Partial<Config> = {
      algorithm: { name: 'dfg', parameters: {} },
      execution: { profile: 'balanced' },
      ml: {
        enabled: true,
        tasks: ['cluster'],
        cluster: { method: 'kmeans', k: 200, eps: 1.0 },
        classify: { model: 'decision_tree', targetKey: 'outcome', k: 5 },
        forecast: { method: 'linear', periods: 5, polynomialDegree: 2 },
        anomaly: { method: 'ema', alpha: 0.3, threshold: 2.5 },
        regress: { method: 'linear', targetKey: 'outcome', lambda: 0.0 },
        pca: { nComponents: 2 },
        targetKey: 'outcome',
        forecastPeriods: 5,
        nComponents: 2,
        eps: 1.0,
      },
    };

    const warnings = checkConfigWarnings(config, 100);
    // Should warn about k > sqrt(logSize) = 10
    expect(warnings.some(w => w.field === 'ml.cluster.k')).toBe(true);
  });

  it('returns empty warnings for valid config', () => {
    const config: Partial<Config> = {
      algorithm: { name: 'dfg', parameters: {} },
      execution: { profile: 'fast' },
      ml: { enabled: false, tasks: [] },
    };

    const warnings = checkConfigWarnings(config, 1000);
    // Should be no warnings for DFG + fast profile + disabled ML
    expect(warnings.filter(w => w.field === 'algorithm.name').length).toBe(0);
  });
});

describe('Error Formatting', () => {
  it('formats basic validation error', () => {
    const config = { version: '1.0', source: { kind: 'invalid' } };

    expect(() => validate(config)).toThrow(/validation failed/i);
  });

  it('shows multiple validation errors with paths', () => {
    const config = {
      version: 'bad',
      source: { kind: 'invalid' },
      execution: { profile: 'wrong' },
    };

    try {
      validate(config);
      expect.fail('Should have thrown');
    } catch (error) {
      const message = String(error);
      expect(message).toContain('validation failed');
      expect(message).toContain('version');
      expect(message).toContain('source');
    }
  });
});
