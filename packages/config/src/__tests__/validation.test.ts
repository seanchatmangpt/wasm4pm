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
import {
  getPresetConfig,
  getExampleTomlWithComments,
  describePreset,
} from '../validation/presets.js';
import { checkConfigWarnings } from '../resolver.js';
import { validate } from '../schema.js';
import type { Config } from '../types.js';

describe('Validation - Detailed Errors', () => {
  // --- CRITICAL FIX #1: Algorithm-Profile Mismatch Tests ---
  describe('Algorithm-Profile Compatibility (CRITICAL FIX #1)', () => {
    it('allows algorithms available in the profile', () => {
      expect(validateAlgorithmProfile('dfg', 'fast')).toEqual({ compatible: true });
      expect(validateAlgorithmProfile('dfg', 'balanced')).toEqual({ compatible: true });
      expect(validateAlgorithmProfile('dfg', 'quality')).toEqual({ compatible: true });
      expect(validateAlgorithmProfile('heuristic_miner', 'balanced')).toEqual({
        compatible: true,
      });
      expect(validateAlgorithmProfile('ilp', 'quality')).toEqual({ compatible: true });
    });

    it('rejects algorithms NOT available in the profile', () => {
      const result1 = validateAlgorithmProfile('genetic_algorithm', 'fast');
      expect(result1.compatible).toBe(false);
      expect(result1.warning).toMatch(/not available in profile "fast"/);
      expect(result1.warning).toMatch(/Upgrade to "quality" profile/);

      const result2 = validateAlgorithmProfile('ilp', 'fast');
      expect(result2.compatible).toBe(false);
      expect(result2.warning).toMatch(/not available in profile "fast"/);
    });

    it('rejects non-existent algorithms', () => {
      const result = validateAlgorithmProfile('non_existent_algo', 'balanced');
      expect(result.compatible).toBe(false);
      expect(result.warning).toMatch(/not registered/);
    });

    it('suggests quality profile when algorithm only available there', () => {
      const result = validateAlgorithmProfile('powl_to_process_tree', 'balanced');
      expect(result.compatible).toBe(false);
      expect(result.warning).toMatch(/Upgrade to "quality" profile/);
    });
  });

  it('validates algorithm in profile, warns on suspicious ML/RL/prediction config', () => {
    expect(validateAlgorithmProfile('dfg', 'fast')).toEqual({ compatible: true });
    expect(validateAlgorithmProfile('dfg', 'browser')).toEqual({ compatible: true });
    const result = validateAlgorithmProfile('dfg', 'fast');
    expect(result.compatible).toBe(true);
    expect(result.warning).toBeUndefined();

    const mlConfig: Partial<Config> = {
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
    const mlWarnings = validateMlConfig(mlConfig, 50);
    expect(mlWarnings.some((w) => w.field === 'ml.cluster.k')).toBe(true);
    expect(mlWarnings.some((w) => w.warning.includes('larger than log size'))).toBe(true);

    const rlConfig: Partial<Config> = {
      rl: {
        enabled: true,
        agents: ['QLearning'],
        learning_rate: 0.8,
        discount_factor: 0.99,
        epsilon: 0.1,
        convergence: { min_cycles: 50, target_reward_improvement: 0.05, window_size: 10 },
        gpu_enabled: false,
        linucb_lambda: 1.0,
        ucb1_exploration: Math.SQRT2,
      },
    };
    const rlWarnings = validateRlConfig(rlConfig);
    expect(rlWarnings.some((w) => w.field === 'rl.learning_rate')).toBe(true);
    expect(rlWarnings.some((w) => w.warning.includes('very high'))).toBe(true);

    const predConfig: Partial<Config> = {
      prediction: {
        enabled: true,
        activityKey: 'concept:name',
        ngramOrder: 1,
        driftWindowSize: 10,
        tasks: ['next_activity'],
        drift: { ewma_alpha: 0.2, threshold: 0.3 },
      },
    };
    const predWarnings = validatePredictionConfig(predConfig);
    expect(predWarnings.some((w) => w.field === 'prediction.ngramOrder')).toBe(true);
  });
});

describe('Validation - Profiles', () => {
  it('gets capabilities, makes suggestions, validates algorithms, and generates comparison table', () => {
    const fastCaps = getProfileCapabilities('fast');
    expect(fastCaps.name).toBe('fast');
    expect(fastCaps.algorithms.length).toBeLessThan(10);
    expect(fastCaps.features.length).toBeLessThan(5);

    const qualityCaps = getProfileCapabilities('quality');
    expect(qualityCaps.name).toBe('quality');
    expect(qualityCaps.algorithms.length).toBeGreaterThan(35);

    expect(suggestProfile({ memoryBudgetMb: 0.5 }).recommended).toBe('fast');
    expect(suggestProfile({}).recommended).toBe('balanced');
    expect(['balanced', 'quality']).toContain(suggestProfile({ requiredAlgorithms: ['ml_classify', 'ml_cluster'] }).recommended);

    expect(validateAlgorithmInProfile('dfg', 'fast')).toEqual({ valid: true });
    const badResult = validateAlgorithmInProfile('ilp', 'fast');
    expect(badResult.valid).toBe(false);
    expect(badResult.error).toMatch(/not available/);

    const table = getProfileComparisonTable();
    expect(table).toContain('Fast');
    expect(table).toContain('Balanced');
    expect(table).toContain('Quality');
    expect(table).toContain('Stream');
    expect(table).toContain('Profile');
  });
});

describe('Validation - Presets', () => {
  it('creates presets, validates against schema, generates TOML, and describes presets', () => {
    const quickTest = getPresetConfig('quick-test');
    expect(quickTest.version).toBe('26.4.5');
    expect(quickTest.execution.profile).toBe('fast');
    expect(quickTest.execution.timeout).toBe(60000);
    expect(quickTest.prediction?.enabled).toBe(false);

    const production = getPresetConfig('production');
    expect(production.execution.profile).toBe('balanced');
    expect(production.ml?.enabled).toBe(true);
    expect(production.ml?.tasks).toContain('classify');
    expect(production.prediction?.enabled).toBe(true);

    const research = getPresetConfig('research');
    expect(research.execution.profile).toBe('quality');
    expect(research.algorithm.name).toBe('ilp');
    expect(research.ml?.tasks?.length).toBeGreaterThanOrEqual(6);
    expect(research.rl?.enabled).toBe(true);

    for (const scenario of ['quick-test', 'production', 'research'] as const) {
      const preset = getPresetConfig(scenario);
      expect(() => validate({ ...preset, source: { kind: 'file' } })).not.toThrow();
    }

    const toml = getExampleTomlWithComments();
    expect(toml).toContain('[source]');
    expect(toml).toContain('[ml]');
    expect(toml).toContain('[rl]');
    expect(toml).toContain('[prediction]');
    expect(toml).toContain('# ');

    expect(describePreset('quick-test')).toContain('Quick Test');
    expect(describePreset('quick-test')).toContain('fast');
    expect(describePreset('production')).toContain('Production');
    expect(describePreset('production')).toContain('balanced');
    expect(describePreset('research')).toContain('Research');
    expect(describePreset('research')).toContain('quality');
  });
});

describe('Config - Warnings', () => {
  it('collects warnings from multiple sources and returns empty warnings for valid config', () => {
    const configWithIssues: Partial<Config> = {
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
    const warnings = checkConfigWarnings(configWithIssues, 100);
    expect(warnings.some((w) => w.field === 'ml.cluster.k')).toBe(true);

    const validConfig: Partial<Config> = {
      algorithm: { name: 'dfg', parameters: {} },
      execution: { profile: 'fast' },
      ml: { enabled: false, tasks: [] },
    };
    const emptyWarnings = checkConfigWarnings(validConfig, 1000);
    expect(emptyWarnings.filter((w) => w.field === 'algorithm.name').length).toBe(0);
  });
});

describe('Error Formatting', () => {
  it('formats validation errors with paths for single and multiple issues', () => {
    const config = { version: '1.0', source: { kind: 'invalid' } };
    expect(() => validate(config)).toThrow(/validation failed/i);

    const multiConfig = {
      version: 'bad',
      source: { kind: 'invalid' },
      execution: { profile: 'wrong' },
    };
    try {
      validate(multiConfig);
      expect.fail('Should have thrown');
    } catch (error) {
      const message = String(error);
      expect(message).toContain('validation failed');
      expect(message).toContain('version');
      expect(message).toContain('source');
    }
  });
});
