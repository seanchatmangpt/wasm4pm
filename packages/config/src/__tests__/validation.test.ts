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

// ---------------------------------------------------------------------------
// Shared minimal base for constructing invalid configs
// ---------------------------------------------------------------------------
const MINIMAL = { version: '26.4.5', source: { kind: 'file' as const } };

// ---------------------------------------------------------------------------
// Validation - Detailed Errors
// ---------------------------------------------------------------------------
describe('Validation - Detailed Errors', () => {
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

// ---------------------------------------------------------------------------
// Validation - Profiles
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Validation - Presets
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Config - Warnings
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Error Formatting
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Domain-contract: invalid algorithm name → validation error
// ---------------------------------------------------------------------------
describe('Domain contract — invalid algorithm name', () => {
  it('rejects an unknown algorithm name', () => {
    expect(() =>
      validate({ ...MINIMAL, algorithm: { name: 'not_a_real_algo' } })
    ).toThrow(/validation failed/i);
  });

  it('rejects an empty algorithm name string', () => {
    expect(() =>
      validate({ ...MINIMAL, algorithm: { name: '' } })
    ).toThrow();
  });

  it('rejects algorithm name with wrong casing', () => {
    expect(() =>
      validate({ ...MINIMAL, algorithm: { name: 'DFG' } })
    ).toThrow();
  });

  it('accepts every valid algorithm id without throwing', () => {
    // Spot-check a representative set from each tier
    for (const name of ['dfg', 'heuristic_miner', 'ilp', 'genetic_algorithm', 'inductive_miner'] as const) {
      expect(() => validate({ ...MINIMAL, algorithm: { name } })).not.toThrow();
    }
  });
});

// ---------------------------------------------------------------------------
// Domain-contract: negative / zero timeout → validation error
// ---------------------------------------------------------------------------
describe('Domain contract — execution constraints', () => {
  it('rejects negative timeout', () => {
    expect(() => validate({ ...MINIMAL, execution: { profile: 'fast', timeout: -1 } })).toThrow();
  });

  it('rejects zero timeout', () => {
    expect(() => validate({ ...MINIMAL, execution: { profile: 'fast', timeout: 0 } })).toThrow();
  });

  it('rejects zero maxMemory', () => {
    expect(() => validate({ ...MINIMAL, execution: { profile: 'fast', maxMemory: 0 } })).toThrow();
  });

  it('rejects negative maxMemory', () => {
    expect(() => validate({ ...MINIMAL, execution: { profile: 'fast', maxMemory: -1024 } })).toThrow();
  });

  it('accepts positive timeout and maxMemory', () => {
    expect(() => validate({ ...MINIMAL, execution: { profile: 'fast', timeout: 1, maxMemory: 1 } })).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Domain-contract: invalid profile name → validation error
// ---------------------------------------------------------------------------
describe('Domain contract — invalid profile name', () => {
  it('rejects an unknown profile name', () => {
    expect(() =>
      validate({ ...MINIMAL, execution: { profile: 'turbo' } })
    ).toThrow();
  });

  it('rejects profile name with wrong casing', () => {
    expect(() =>
      validate({ ...MINIMAL, execution: { profile: 'FAST' } })
    ).toThrow();
  });

  it('accepts all four valid profile names', () => {
    for (const profile of ['fast', 'balanced', 'quality', 'stream'] as const) {
      expect(() => validate({ ...MINIMAL, execution: { profile } })).not.toThrow();
    }
  });
});

// ---------------------------------------------------------------------------
// Domain-contract: missing required source fields
// ---------------------------------------------------------------------------
describe('Domain contract — missing required source fields', () => {
  it('rejects http source without url', () => {
    expect(() =>
      validate({ ...MINIMAL, source: { kind: 'http' } })
    ).toThrow(/url/i);
  });

  it('rejects source with invalid kind', () => {
    expect(() =>
      validate({ ...MINIMAL, source: { kind: 'ftp' } })
    ).toThrow();
  });

  it('rejects sink kind=http without url', () => {
    expect(() =>
      validate({ ...MINIMAL, sink: { kind: 'http' } })
    ).toThrow(/url/i);
  });

  it('rejects sink kind=file without path', () => {
    expect(() =>
      validate({ ...MINIMAL, sink: { kind: 'file' } })
    ).toThrow(/path/i);
  });

  it('rejects source=file with url field set (url is not applicable for file sources)', () => {
    expect(() =>
      validate({ ...MINIMAL, source: { kind: 'file', url: 'https://example.com/events' } })
    ).toThrow(/url/i);
  });

  it('rejects sink=stdout with path field set', () => {
    expect(() =>
      validate({ ...MINIMAL, sink: { kind: 'stdout', path: './out.pnml' } })
    ).toThrow(/path/i);
  });
});

// ---------------------------------------------------------------------------
// Domain-contract: valid edge cases
// ---------------------------------------------------------------------------
describe('Domain contract — valid edge cases', () => {
  it('accepts stream source without path or url', () => {
    expect(() => validate({ ...MINIMAL, source: { kind: 'stream' } })).not.toThrow();
  });

  it('accepts watch with poll_interval = 1 (minimum positive integer)', () => {
    expect(() =>
      validate({ ...MINIMAL, watch: { enabled: true, poll_interval: 1 } })
    ).not.toThrow();
  });

  it('rejects watch with poll_interval = 0', () => {
    expect(() =>
      validate({ ...MINIMAL, watch: { enabled: true, poll_interval: 0 } })
    ).toThrow();
  });

  it('accepts prediction with enabled=false and empty tasks array', () => {
    expect(() =>
      validate({ ...MINIMAL, prediction: { enabled: false, tasks: [] } })
    ).not.toThrow();
  });

  it('rejects prediction enabled=true with empty tasks array', () => {
    expect(() =>
      validate({ ...MINIMAL, prediction: { enabled: true, tasks: [] } })
    ).toThrow(/tasks/i);
  });

  it('accepts prediction enabled=true with at least one task', () => {
    expect(() =>
      validate({ ...MINIMAL, prediction: { enabled: true, tasks: ['drift'] } })
    ).not.toThrow();
  });

  it('rejects version without minor component (e.g. "1.0")', () => {
    expect(() => validate({ ...MINIMAL, version: '1.0' })).toThrow();
  });

  it('rejects version with leading v prefix', () => {
    expect(() => validate({ ...MINIMAL, version: 'v26.4.5' })).toThrow();
  });

  it('accepts version with large numbers (day = 31)', () => {
    expect(() => validate({ ...MINIMAL, version: '26.4.31' })).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// TASK 1: Config Validation Error Tests (Quick-Win Coverage)
// ---------------------------------------------------------------------------
describe('Config Validation - Type Validation Failures', () => {
  it('rejects type mismatch: number field receives string', () => {
    const badConfig = {
      ...MINIMAL,
      execution: { profile: 'fast', timeout: 'not_a_number' as any },
    };
    expect(() => validate(badConfig)).toThrow(/validation failed/i);
  });

  it('rejects type mismatch: boolean field receives string', () => {
    const badConfig = {
      ...MINIMAL,
      watch: { enabled: 'true' as any, poll_interval: 60 },
    };
    expect(() => validate(badConfig)).toThrow(/validation failed/i);
  });

  it('rejects type mismatch: object field receives string', () => {
    const badConfig = {
      ...MINIMAL,
      algorithm: { name: 'dfg', parameters: 'not_an_object' as any },
    };
    expect(() => validate(badConfig)).toThrow(/validation failed/i);
  });

  it('rejects type mismatch: array field receives scalar', () => {
    const badConfig = {
      ...MINIMAL,
      prediction: { enabled: true, tasks: 'drift' as any },
    };
    expect(() => validate(badConfig)).toThrow(/validation failed/i);
  });
});

describe('Config Validation - Missing Required Fields', () => {
  it('rejects config with algorithm.name as empty string', () => {
    const badConfig = {
      ...MINIMAL,
      algorithm: { name: '' as any, parameters: {} },
    };
    expect(() => validate(badConfig)).toThrow(/validation failed|algorithm/i);
  });

  it('rejects config missing source.kind field', () => {
    const badConfig = {
      ...MINIMAL,
      source: { path: '/some/path' },
    };
    expect(() => validate(badConfig)).toThrow(/validation failed|kind/i);
  });

  it('rejects config missing version field', () => {
    const badConfig = {
      source: { kind: 'file' as const },
    };
    expect(() => validate(badConfig as any)).toThrow(/validation failed|version/i);
  });

  it('rejects config with null algorithm.name', () => {
    const badConfig = {
      ...MINIMAL,
      algorithm: { name: null as any },
    };
    expect(() => validate(badConfig)).toThrow(/validation failed|algorithm/i);
  });
});

describe('Config Validation - Invalid Enum Values', () => {
  it('rejects invalid execution profile: "turbo"', () => {
    const badConfig = {
      ...MINIMAL,
      execution: { profile: 'turbo' as any },
    };
    expect(() => validate(badConfig)).toThrow(/validation failed|profile/i);
  });

  it('rejects invalid source kind: "ftp"', () => {
    const badConfig = {
      ...MINIMAL,
      source: { kind: 'ftp' as any },
    };
    expect(() => validate(badConfig)).toThrow(/validation failed|kind/i);
  });

  it('rejects invalid sink kind: "memory"', () => {
    const badConfig = {
      ...MINIMAL,
      sink: { kind: 'memory' as any },
    };
    expect(() => validate(badConfig)).toThrow(/validation failed|kind/i);
  });

  it('rejects invalid output format: "xml"', () => {
    const badConfig = {
      ...MINIMAL,
      output: { format: 'xml' as any },
    };
    expect(() => validate(badConfig)).toThrow(/validation failed|format/i);
  });

  it('rejects invalid algorithm name: "unknown_algo"', () => {
    const badConfig = {
      ...MINIMAL,
      algorithm: { name: 'unknown_algo' as any },
    };
    expect(() => validate(badConfig)).toThrow(/validation failed|algorithm/i);
  });
});
