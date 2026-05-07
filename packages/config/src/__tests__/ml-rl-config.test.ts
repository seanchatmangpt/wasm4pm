/**
 * Tests for the refactored ML / RL / drift configuration sub-sections.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { validate } from '../schema.js';
import { resolveConfig, getExamplePresetConfig, getExampleEnvFile } from '../resolver.js';

const minimal = {
  version: '26.4.5',
  source: { kind: 'file' as const },
};

describe('ML nested sub-sections', () => {
  it('accepts fully nested ML config, applies defaults, and rejects invalid values', () => {
    const cfg = validate({
      ...minimal,
      ml: {
        enabled: true,
        tasks: ['classify', 'cluster', 'forecast'],
        classify: { model: 'naive_bayes', targetKey: 'label', k: 3 },
        cluster: { method: 'dbscan', k: 8, eps: 2.0 },
        forecast: { method: 'polynomial', periods: 12, polynomialDegree: 4 },
        anomaly: { method: 'zscore', alpha: 0.5, threshold: 3.0 },
        regress: { method: 'ridge', targetKey: 'duration', lambda: 0.25 },
        pca: { nComponents: 5 },
      },
    });
    expect(cfg.ml!.classify.model).toBe('naive_bayes');
    expect(cfg.ml!.cluster.method).toBe('dbscan');
    expect(cfg.ml!.forecast.method).toBe('polynomial');
    expect(cfg.ml!.forecast.polynomialDegree).toBe(4);
    expect(cfg.ml!.anomaly.method).toBe('zscore');
    expect(cfg.ml!.regress.lambda).toBe(0.25);
    expect(cfg.ml!.pca.nComponents).toBe(5);

    const defaults = validate({ ...minimal, ml: { enabled: true } });
    expect(defaults.ml!.classify.model).toBe('decision_tree');
    expect(defaults.ml!.cluster.method).toBe('kmeans');
    expect(defaults.ml!.cluster.k).toBe(5);
    expect(defaults.ml!.forecast.method).toBe('linear');
    expect(defaults.ml!.forecast.periods).toBe(5);
    expect(defaults.ml!.anomaly.method).toBe('ema');
    expect(defaults.ml!.regress.method).toBe('linear');
    expect(defaults.ml!.pca.nComponents).toBe(2);

    expect(() =>
      validate({ ...minimal, ml: { enabled: true, classify: { model: 'random_forest' } } })
    ).toThrow(/validation failed/i);
    expect(() =>
      validate({ ...minimal, ml: { enabled: true, cluster: { method: 'gmm' } } })
    ).toThrow(/validation failed/i);
    expect(() =>
      validate({ ...minimal, ml: { enabled: true, regress: { lambda: -0.1 } } })
    ).toThrow();
    expect(() =>
      validate({ ...minimal, ml: { enabled: true, forecast: { polynomialDegree: 0 } } })
    ).toThrow();
    expect(() =>
      validate({ ...minimal, ml: { enabled: true, forecast: { polynomialDegree: 99 } } })
    ).toThrow();
  });
});

describe('ML legacy → nested migration', () => {
  it('promotes legacy flat fields into nested sub-sections with explicit values winning', () => {
    const k9 = validate({ ...minimal, ml: { enabled: true, k: 9 } });
    expect(k9.ml!.classify.k).toBe(9);
    expect(k9.ml!.cluster.k).toBe(9);

    const eps = validate({ ...minimal, ml: { enabled: true, eps: 2.7 } });
    expect(eps.ml!.cluster.eps).toBeCloseTo(2.7);

    const periods = validate({ ...minimal, ml: { enabled: true, forecastPeriods: 14 } });
    expect(periods.ml!.forecast.periods).toBe(14);

    const nComp = validate({ ...minimal, ml: { enabled: true, nComponents: 6 } });
    expect(nComp.ml!.pca.nComponents).toBe(6);

    const targetKey = validate({ ...minimal, ml: { enabled: true, targetKey: 'churn' } });
    expect(targetKey.ml!.classify.targetKey).toBe('churn');
    expect(targetKey.ml!.regress.targetKey).toBe('churn');

    const override = validate({
      ...minimal,
      ml: { enabled: true, k: 9, eps: 99, classify: { k: 4 }, cluster: { k: 7, eps: 0.5 } },
    });
    expect(override.ml!.classify.k).toBe(4);
    expect(override.ml!.cluster.k).toBe(7);
    expect(override.ml!.cluster.eps).toBe(0.5);
  });
});

describe('RL configuration', () => {
  it('accepts full RL configuration, applies defaults, and rejects invalid values', () => {
    const full = validate({
      ...minimal,
      rl: {
        enabled: true,
        agents: ['QLearning', 'SARSA', 'DoubleQLearning', 'ExpectedSARSA', 'REINFORCE'],
        learning_rate: 0.25,
        discount_factor: 0.97,
        epsilon: 0.05,
        convergence: { min_cycles: 200, target_reward_improvement: 0.01, window_size: 25 },
        gpu_enabled: true,
        linucb_lambda: 0.5,
        ucb1_exploration: 1.0,
      },
    });
    expect(full.rl!.enabled).toBe(true);
    expect(full.rl!.agents).toHaveLength(5);
    expect(full.rl!.learning_rate).toBe(0.25);
    expect(full.rl!.convergence.min_cycles).toBe(200);
    expect(full.rl!.convergence.target_reward_improvement).toBe(0.01);
    expect(full.rl!.convergence.window_size).toBe(25);

    const defaults = validate({ ...minimal, rl: { enabled: true } });
    expect(defaults.rl!.agents).toEqual(['QLearning']);
    expect(defaults.rl!.learning_rate).toBe(0.1);
    expect(defaults.rl!.discount_factor).toBe(0.99);
    expect(defaults.rl!.epsilon).toBe(0.1);
    expect(defaults.rl!.convergence.min_cycles).toBe(50);
    expect(defaults.rl!.convergence.target_reward_improvement).toBe(0.05);
    expect(defaults.rl!.convergence.window_size).toBe(10);

    expect(() => validate({ ...minimal, rl: { enabled: true, agents: ['DeepQ'] } })).toThrow(/validation failed/i);
    expect(() => validate({ ...minimal, rl: { learning_rate: 0 } })).toThrow();
    expect(() => validate({ ...minimal, rl: { learning_rate: 1.5 } })).toThrow();
    expect(() => validate({ ...minimal, rl: { learning_rate: -0.1 } })).toThrow();
    expect(() => validate({ ...minimal, rl: { discount_factor: -0.1 } })).toThrow();
    expect(() => validate({ ...minimal, rl: { discount_factor: 1.1 } })).toThrow();
    expect(() => validate({ ...minimal, rl: { epsilon: -0.1 } })).toThrow();
    expect(() => validate({ ...minimal, rl: { epsilon: 1.5 } })).toThrow();
    expect(() => validate({ ...minimal, rl: { convergence: { min_cycles: 0 } } })).toThrow();
    expect(() => validate({ ...minimal, rl: { convergence: { window_size: -1 } } })).toThrow();
    expect(() => validate({ ...minimal, rl: { convergence: { target_reward_improvement: -0.01 } } })).toThrow();
  });
});

describe('Prediction drift sub-section', () => {
  it('accepts nested drift parameters, applies defaults, and rejects out-of-range values', () => {
    const cfg = validate({
      ...minimal,
      prediction: { enabled: true, tasks: ['drift'], drift: { ewma_alpha: 0.4, threshold: 0.6 } },
    });
    expect(cfg.prediction!.drift.ewma_alpha).toBe(0.4);
    expect(cfg.prediction!.drift.threshold).toBe(0.6);

    const defaults = validate({ ...minimal, prediction: { enabled: true } });
    expect(defaults.prediction!.drift.ewma_alpha).toBe(0.2);
    expect(defaults.prediction!.drift.threshold).toBe(0.3);

    expect(() => validate({ ...minimal, prediction: { drift: { ewma_alpha: 0 } } })).toThrow();
    expect(() => validate({ ...minimal, prediction: { drift: { ewma_alpha: 1.1 } } })).toThrow();
    expect(() => validate({ ...minimal, prediction: { drift: { threshold: 0 } } })).toThrow();
    expect(() => validate({ ...minimal, prediction: { drift: { threshold: 2 } } })).toThrow();
  });
});

describe('Round-trip serialization', () => {
  it('survives JSON serialize → parse → validate cycle and is idempotent', () => {
    const cfg = validate({
      ...minimal,
      ml: {
        enabled: true, tasks: ['classify', 'cluster'],
        classify: { model: 'knn', k: 3 }, cluster: { method: 'dbscan', eps: 0.7 },
      },
      rl: {
        enabled: true, agents: ['QLearning', 'SARSA'], learning_rate: 0.2,
        convergence: { min_cycles: 75, window_size: 15, target_reward_improvement: 0.02 },
      },
      prediction: { enabled: true, tasks: ['drift'], drift: { ewma_alpha: 0.15, threshold: 0.4 } },
    });
    const reparsed = validate(JSON.parse(JSON.stringify(cfg)));
    expect(reparsed.ml).toEqual(cfg.ml);
    expect(reparsed.rl).toEqual(cfg.rl);
    expect(reparsed.prediction).toEqual(cfg.prediction);

    const a = validate({ ...minimal, ml: { enabled: true, k: 7 } });
    const b = validate(JSON.parse(JSON.stringify(a)));
    expect(b.ml!.classify.k).toBe(7);
    expect(b.ml!.cluster.k).toBe(7);
  });
});

describe('Error message quality', () => {
  it('reports field path in [bracket] notation with issue count', () => {
    let msg = '';
    try {
      validate({
        ...minimal,
        rl: { learning_rate: 5, convergence: { min_cycles: -1 } },
        ml: { enabled: true, classify: { model: 'svm' } },
      });
    } catch (e) {
      msg = (e as Error).message;
    }
    expect(msg).toMatch(/Configuration validation failed/);
    expect(msg).toMatch(/\(\d+ issues?\)/);
    expect(msg).toMatch(/\[rl\.learning_rate\]/);
    expect(msg).toMatch(/\[rl\.convergence\.min_cycles\]/);
    expect(msg).toMatch(/\[ml\.classify\.model\]/);
  });
});

describe('Environment variables — ML / RL / drift', () => {
  let tmpDir: string;
  beforeEach(async () => { tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wasm4pm-cfg-')); });
  afterEach(async () => { await fs.rm(tmpDir, { recursive: true, force: true }); });

  it('parses WASM4PM_ML_*, WASM4PM_RL_*, and WASM4PM_PREDICTION_DRIFT_* env vars and rejects out-of-range values', async () => {
    const cfgMl = await resolveConfig({
      configSearchPaths: [tmpDir],
      env: { WASM4PM_ML_ENABLED: 'true', WASM4PM_ML_ALGORITHMS: 'classify,cluster,forecast' },
    });
    expect(cfgMl.ml!.enabled).toBe(true);
    expect(cfgMl.ml!.tasks).toEqual(['classify', 'cluster', 'forecast']);

    const cfgRl = await resolveConfig({
      configSearchPaths: [tmpDir],
      env: {
        WASM4PM_RL_ENABLED: '1', WASM4PM_RL_AGENTS: 'QLearning,SARSA',
        WASM4PM_RL_LEARNING_RATE: '0.05', WASM4PM_RL_DISCOUNT_FACTOR: '0.95', WASM4PM_RL_EPSILON: '0.2',
      },
    });
    expect(cfgRl.rl!.enabled).toBe(true);
    expect(cfgRl.rl!.agents).toEqual(['QLearning', 'SARSA']);
    expect(cfgRl.rl!.learning_rate).toBe(0.05);
    expect(cfgRl.rl!.discount_factor).toBe(0.95);
    expect(cfgRl.rl!.epsilon).toBe(0.2);

    const cfgDrift = await resolveConfig({
      configSearchPaths: [tmpDir],
      env: {
        WASM4PM_PREDICTION_ENABLED: 'true',
        WASM4PM_PREDICTION_DRIFT_THRESHOLD: '0.45',
        WASM4PM_PREDICTION_DRIFT_EWMA_ALPHA: '0.1',
      },
    });
    expect(cfgDrift.prediction!.drift.threshold).toBe(0.45);
    expect(cfgDrift.prediction!.drift.ewma_alpha).toBe(0.1);

    await expect(resolveConfig({ configSearchPaths: [tmpDir], env: { WASM4PM_RL_LEARNING_RATE: '5.0' } }))
      .rejects.toThrow(/WASM4PM_RL_LEARNING_RATE/);
    await expect(resolveConfig({ configSearchPaths: [tmpDir], env: { WASM4PM_RL_DISCOUNT_FACTOR: '1.5' } }))
      .rejects.toThrow(/WASM4PM_RL_DISCOUNT_FACTOR/);
    await expect(resolveConfig({ configSearchPaths: [tmpDir], env: { WASM4PM_RL_EPSILON: '-0.1' } }))
      .rejects.toThrow(/WASM4PM_RL_EPSILON/);
    await expect(resolveConfig({ configSearchPaths: [tmpDir], env: { WASM4PM_PREDICTION_DRIFT_THRESHOLD: '0' } }))
      .rejects.toThrow(/WASM4PM_PREDICTION_DRIFT_THRESHOLD/);
    await expect(resolveConfig({ configSearchPaths: [tmpDir], env: { WASM4PM_PREDICTION_DRIFT_EWMA_ALPHA: 'xyz' } }))
      .rejects.toThrow(/WASM4PM_PREDICTION_DRIFT_EWMA_ALPHA/);
  });
});

describe('CLI overrides and example presets', () => {
  let tmpDir: string;
  beforeEach(async () => { tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wasm4pm-cfg-')); });
  afterEach(async () => { await fs.rm(tmpDir, { recursive: true, force: true }); });

  it('CLI ML and RL overrides win over file config, presets round-trip, and example env file covers all vars', async () => {
    await fs.writeFile(path.join(tmpDir, 'wasm4pm.toml'),
      `version = "26.4.5"\n[source]\nkind = "file"\n[ml]\nenabled = false\ntasks = ["forecast"]\n`);
    const cfgMl = await resolveConfig({
      configSearchPaths: [tmpDir],
      cliOverrides: { mlEnabled: true, mlTasks: ['classify', 'pca'] },
    });
    expect(cfgMl.ml!.enabled).toBe(true);
    expect(cfgMl.ml!.tasks).toEqual(['classify', 'pca']);

    const cfgRl = await resolveConfig({
      configSearchPaths: [tmpDir],
      cliOverrides: { rlEnabled: true, rlAgents: ['DoubleQLearning'], rlLearningRate: 0.05, rlDiscountFactor: 0.9, rlEpsilon: 0.02 },
    });
    expect(cfgRl.rl!.enabled).toBe(true);
    expect(cfgRl.rl!.agents).toEqual(['DoubleQLearning']);
    expect(cfgRl.rl!.learning_rate).toBe(0.05);
    expect(cfgRl.rl!.discount_factor).toBe(0.9);
    expect(cfgRl.rl!.epsilon).toBe(0.02);

    for (const preset of ['fast', 'balanced', 'quality'] as const) {
      await fs.writeFile(path.join(tmpDir, 'wasm4pm.toml'), getExamplePresetConfig(preset));
      const cfg = await resolveConfig({ configSearchPaths: [tmpDir] });
      expect(cfg.execution.profile).toBe(preset);
    }

    const env = getExampleEnvFile();
    for (const key of [
      'WASM4PM_PROFILE', 'WASM4PM_ML_ENABLED', 'WASM4PM_ML_ALGORITHMS',
      'WASM4PM_RL_ENABLED', 'WASM4PM_RL_AGENTS', 'WASM4PM_RL_LEARNING_RATE',
      'WASM4PM_RL_DISCOUNT_FACTOR', 'WASM4PM_RL_EPSILON',
      'WASM4PM_PREDICTION_DRIFT_THRESHOLD', 'WASM4PM_PREDICTION_DRIFT_EWMA_ALPHA',
    ]) {
      expect(env).toContain(key);
    }
  });
});

describe('Performance', () => {
  it('validates a full ML+RL+prediction config in under 5ms on average (1k iterations)', () => {
    const sample = {
      ...minimal,
      ml: {
        enabled: true,
        tasks: ['classify', 'cluster', 'forecast', 'anomaly', 'regress', 'pca'],
        classify: { model: 'knn', k: 7 },
        cluster: { method: 'kmeans', k: 4 },
        forecast: { method: 'polynomial', periods: 8, polynomialDegree: 3 },
        anomaly: { method: 'ema', alpha: 0.2, threshold: 2.0 },
        regress: { method: 'ridge', lambda: 0.1 },
        pca: { nComponents: 3 },
      },
      rl: {
        enabled: true, agents: ['QLearning', 'SARSA', 'DoubleQLearning'],
        learning_rate: 0.1, discount_factor: 0.99, epsilon: 0.1,
        convergence: { min_cycles: 50, target_reward_improvement: 0.05, window_size: 10 },
      },
      prediction: {
        enabled: true, tasks: ['next_activity', 'remaining_time', 'drift'],
        drift: { ewma_alpha: 0.2, threshold: 0.3 },
      },
    };
    const N = 1_000;
    const start = performance.now();
    for (let i = 0; i < N; i++) validate(sample);
    const elapsed = performance.now() - start;
    expect(elapsed / N).toBeLessThan(5);
  });
});
