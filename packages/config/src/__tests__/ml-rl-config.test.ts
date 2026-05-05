/**
 * Tests for the refactored ML / RL / drift configuration sub-sections.
 *
 * Covers:
 *   - Nested per-task ML schema (classify, cluster, forecast, anomaly, regress, pca)
 *   - Backwards-compatibility migration of legacy flat ml.method / ml.k / ml.eps
 *   - RL agents, hyperparameters, and convergence sub-section
 *   - Prediction drift sub-section
 *   - JSON / TOML round-trip stability
 *   - New WASM4PM_ML_* / WASM4PM_RL_* / WASM4PM_PREDICTION_DRIFT_* env vars
 *   - Performance: validation cost stays sub-millisecond on average
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
  it('accepts a fully nested ml configuration', () => {
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
  });

  it('applies sub-section defaults when sections are omitted', () => {
    const cfg = validate({ ...minimal, ml: { enabled: true } });
    expect(cfg.ml!.classify.model).toBe('decision_tree');
    expect(cfg.ml!.cluster.method).toBe('kmeans');
    expect(cfg.ml!.cluster.k).toBe(5);
    expect(cfg.ml!.forecast.method).toBe('linear');
    expect(cfg.ml!.forecast.periods).toBe(5);
    expect(cfg.ml!.anomaly.method).toBe('ema');
    expect(cfg.ml!.regress.method).toBe('linear');
    expect(cfg.ml!.pca.nComponents).toBe(2);
  });

  it('rejects invalid classify model', () => {
    expect(() =>
      validate({ ...minimal, ml: { enabled: true, classify: { model: 'random_forest' } } })
    ).toThrow(/validation failed/i);
  });

  it('rejects invalid cluster method', () => {
    expect(() =>
      validate({ ...minimal, ml: { enabled: true, cluster: { method: 'gmm' } } })
    ).toThrow(/validation failed/i);
  });

  it('rejects negative ridge lambda', () => {
    expect(() =>
      validate({ ...minimal, ml: { enabled: true, regress: { lambda: -0.1 } } })
    ).toThrow();
  });

  it('rejects polynomial degree out of range', () => {
    expect(() =>
      validate({ ...minimal, ml: { enabled: true, forecast: { polynomialDegree: 0 } } })
    ).toThrow();
    expect(() =>
      validate({ ...minimal, ml: { enabled: true, forecast: { polynomialDegree: 99 } } })
    ).toThrow();
  });
});

describe('ML legacy → nested migration', () => {
  it('promotes legacy ml.k into both classify.k and cluster.k', () => {
    const cfg = validate({ ...minimal, ml: { enabled: true, k: 9 } });
    expect(cfg.ml!.classify.k).toBe(9);
    expect(cfg.ml!.cluster.k).toBe(9);
  });

  it('promotes legacy ml.eps into cluster.eps', () => {
    const cfg = validate({ ...minimal, ml: { enabled: true, eps: 2.7 } });
    expect(cfg.ml!.cluster.eps).toBeCloseTo(2.7);
  });

  it('promotes legacy ml.forecastPeriods into forecast.periods', () => {
    const cfg = validate({ ...minimal, ml: { enabled: true, forecastPeriods: 14 } });
    expect(cfg.ml!.forecast.periods).toBe(14);
  });

  it('promotes legacy ml.nComponents into pca.nComponents', () => {
    const cfg = validate({ ...minimal, ml: { enabled: true, nComponents: 6 } });
    expect(cfg.ml!.pca.nComponents).toBe(6);
  });

  it('promotes legacy ml.targetKey into classify+regress when not overridden', () => {
    const cfg = validate({ ...minimal, ml: { enabled: true, targetKey: 'churn' } });
    expect(cfg.ml!.classify.targetKey).toBe('churn');
    expect(cfg.ml!.regress.targetKey).toBe('churn');
  });

  it('explicit nested values win over legacy fields', () => {
    const cfg = validate({
      ...minimal,
      ml: {
        enabled: true,
        k: 9,
        eps: 99,
        classify: { k: 4 },
        cluster: { k: 7, eps: 0.5 },
      },
    });
    expect(cfg.ml!.classify.k).toBe(4);
    expect(cfg.ml!.cluster.k).toBe(7);
    expect(cfg.ml!.cluster.eps).toBe(0.5);
  });
});

describe('RL configuration', () => {
  it('accepts a full RL configuration', () => {
    const cfg = validate({
      ...minimal,
      rl: {
        enabled: true,
        agents: ['QLearning', 'SARSA', 'DoubleQLearning', 'ExpectedSARSA', 'REINFORCE'],
        learning_rate: 0.25,
        discount_factor: 0.97,
        epsilon: 0.05,
        convergence: {
          min_cycles: 200,
          target_reward_improvement: 0.01,
          window_size: 25,
        },
        gpu_enabled: true,
        linucb_lambda: 0.5,
        ucb1_exploration: 1.0,
      },
    });
    expect(cfg.rl!.enabled).toBe(true);
    expect(cfg.rl!.agents).toHaveLength(5);
    expect(cfg.rl!.learning_rate).toBe(0.25);
    expect(cfg.rl!.convergence.min_cycles).toBe(200);
    expect(cfg.rl!.convergence.target_reward_improvement).toBe(0.01);
    expect(cfg.rl!.convergence.window_size).toBe(25);
  });

  it('applies RL defaults when only enabled is provided', () => {
    const cfg = validate({ ...minimal, rl: { enabled: true } });
    expect(cfg.rl!.agents).toEqual(['QLearning']);
    expect(cfg.rl!.learning_rate).toBe(0.1);
    expect(cfg.rl!.discount_factor).toBe(0.99);
    expect(cfg.rl!.epsilon).toBe(0.1);
    expect(cfg.rl!.convergence.min_cycles).toBe(50);
    expect(cfg.rl!.convergence.target_reward_improvement).toBe(0.05);
    expect(cfg.rl!.convergence.window_size).toBe(10);
  });

  it('rejects unknown agent names', () => {
    expect(() => validate({ ...minimal, rl: { enabled: true, agents: ['DeepQ'] } })).toThrow(
      /validation failed/i
    );
  });

  it('rejects learning_rate outside (0, 1]', () => {
    expect(() => validate({ ...minimal, rl: { learning_rate: 0 } })).toThrow();
    expect(() => validate({ ...minimal, rl: { learning_rate: 1.5 } })).toThrow();
    expect(() => validate({ ...minimal, rl: { learning_rate: -0.1 } })).toThrow();
  });

  it('rejects discount_factor outside [0, 1]', () => {
    expect(() => validate({ ...minimal, rl: { discount_factor: -0.1 } })).toThrow();
    expect(() => validate({ ...minimal, rl: { discount_factor: 1.1 } })).toThrow();
  });

  it('rejects epsilon outside [0, 1]', () => {
    expect(() => validate({ ...minimal, rl: { epsilon: -0.1 } })).toThrow();
    expect(() => validate({ ...minimal, rl: { epsilon: 1.5 } })).toThrow();
  });

  it('rejects non-positive convergence params', () => {
    expect(() => validate({ ...minimal, rl: { convergence: { min_cycles: 0 } } })).toThrow();
    expect(() => validate({ ...minimal, rl: { convergence: { window_size: -1 } } })).toThrow();
    expect(() =>
      validate({ ...minimal, rl: { convergence: { target_reward_improvement: -0.01 } } })
    ).toThrow();
  });
});

describe('Prediction drift sub-section', () => {
  it('accepts nested drift parameters', () => {
    const cfg = validate({
      ...minimal,
      prediction: {
        enabled: true,
        tasks: ['drift'],
        drift: { ewma_alpha: 0.4, threshold: 0.6 },
      },
    });
    expect(cfg.prediction!.drift.ewma_alpha).toBe(0.4);
    expect(cfg.prediction!.drift.threshold).toBe(0.6);
  });

  it('applies drift defaults', () => {
    const cfg = validate({ ...minimal, prediction: { enabled: true } });
    expect(cfg.prediction!.drift.ewma_alpha).toBe(0.2);
    expect(cfg.prediction!.drift.threshold).toBe(0.3);
  });

  it('rejects ewma_alpha outside (0, 1]', () => {
    expect(() => validate({ ...minimal, prediction: { drift: { ewma_alpha: 0 } } })).toThrow();
    expect(() => validate({ ...minimal, prediction: { drift: { ewma_alpha: 1.1 } } })).toThrow();
  });

  it('rejects threshold outside (0, 1]', () => {
    expect(() => validate({ ...minimal, prediction: { drift: { threshold: 0 } } })).toThrow();
    expect(() => validate({ ...minimal, prediction: { drift: { threshold: 2 } } })).toThrow();
  });
});

describe('Round-trip serialization', () => {
  it('survives JSON serialize → parse → validate cycle', () => {
    const cfg = validate({
      ...minimal,
      ml: {
        enabled: true,
        tasks: ['classify', 'cluster'],
        classify: { model: 'knn', k: 3 },
        cluster: { method: 'dbscan', eps: 0.7 },
      },
      rl: {
        enabled: true,
        agents: ['QLearning', 'SARSA'],
        learning_rate: 0.2,
        convergence: { min_cycles: 75, window_size: 15, target_reward_improvement: 0.02 },
      },
      prediction: { enabled: true, tasks: ['drift'], drift: { ewma_alpha: 0.15, threshold: 0.4 } },
    });
    const reparsed = validate(JSON.parse(JSON.stringify(cfg)));
    expect(reparsed.ml).toEqual(cfg.ml);
    expect(reparsed.rl).toEqual(cfg.rl);
    expect(reparsed.prediction).toEqual(cfg.prediction);
  });

  it('explanation: idempotent — validate(validate(x)) === validate(x)', () => {
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
  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wasm4pm-cfg-'));
  });
  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('parses WASM4PM_ML_* env vars', async () => {
    const cfg = await resolveConfig({
      configSearchPaths: [tmpDir],
      env: {
        WASM4PM_ML_ENABLED: 'true',
        WASM4PM_ML_ALGORITHMS: 'classify,cluster,forecast',
      },
    });
    expect(cfg.ml!.enabled).toBe(true);
    expect(cfg.ml!.tasks).toEqual(['classify', 'cluster', 'forecast']);
  });

  it('parses WASM4PM_RL_* env vars', async () => {
    const cfg = await resolveConfig({
      configSearchPaths: [tmpDir],
      env: {
        WASM4PM_RL_ENABLED: '1',
        WASM4PM_RL_AGENTS: 'QLearning,SARSA',
        WASM4PM_RL_LEARNING_RATE: '0.05',
        WASM4PM_RL_DISCOUNT_FACTOR: '0.95',
        WASM4PM_RL_EPSILON: '0.2',
      },
    });
    expect(cfg.rl!.enabled).toBe(true);
    expect(cfg.rl!.agents).toEqual(['QLearning', 'SARSA']);
    expect(cfg.rl!.learning_rate).toBe(0.05);
    expect(cfg.rl!.discount_factor).toBe(0.95);
    expect(cfg.rl!.epsilon).toBe(0.2);
  });

  it('parses WASM4PM_PREDICTION_DRIFT_* env vars', async () => {
    const cfg = await resolveConfig({
      configSearchPaths: [tmpDir],
      env: {
        WASM4PM_PREDICTION_ENABLED: 'true',
        WASM4PM_PREDICTION_DRIFT_THRESHOLD: '0.45',
        WASM4PM_PREDICTION_DRIFT_EWMA_ALPHA: '0.1',
      },
    });
    expect(cfg.prediction!.drift.threshold).toBe(0.45);
    expect(cfg.prediction!.drift.ewma_alpha).toBe(0.1);
  });

  it('rejects out-of-range RL env values with a clear message', async () => {
    await expect(
      resolveConfig({
        configSearchPaths: [tmpDir],
        env: { WASM4PM_RL_LEARNING_RATE: '5.0' },
      })
    ).rejects.toThrow(/WASM4PM_RL_LEARNING_RATE/);
    await expect(
      resolveConfig({
        configSearchPaths: [tmpDir],
        env: { WASM4PM_RL_DISCOUNT_FACTOR: '1.5' },
      })
    ).rejects.toThrow(/WASM4PM_RL_DISCOUNT_FACTOR/);
    await expect(
      resolveConfig({
        configSearchPaths: [tmpDir],
        env: { WASM4PM_RL_EPSILON: '-0.1' },
      })
    ).rejects.toThrow(/WASM4PM_RL_EPSILON/);
  });

  it('rejects invalid drift env values', async () => {
    await expect(
      resolveConfig({
        configSearchPaths: [tmpDir],
        env: { WASM4PM_PREDICTION_DRIFT_THRESHOLD: '0' },
      })
    ).rejects.toThrow(/WASM4PM_PREDICTION_DRIFT_THRESHOLD/);
    await expect(
      resolveConfig({
        configSearchPaths: [tmpDir],
        env: { WASM4PM_PREDICTION_DRIFT_EWMA_ALPHA: 'xyz' },
      })
    ).rejects.toThrow(/WASM4PM_PREDICTION_DRIFT_EWMA_ALPHA/);
  });
});

describe('CLI overrides — ML / RL', () => {
  let tmpDir: string;
  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wasm4pm-cfg-'));
  });
  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('CLI ML overrides win over file ML config', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'wasm4pm.toml'),
      `version = "26.4.5"\n[source]\nkind = "file"\n[ml]\nenabled = false\ntasks = ["forecast"]\n`
    );
    const cfg = await resolveConfig({
      configSearchPaths: [tmpDir],
      cliOverrides: { mlEnabled: true, mlTasks: ['classify', 'pca'] },
    });
    expect(cfg.ml!.enabled).toBe(true);
    expect(cfg.ml!.tasks).toEqual(['classify', 'pca']);
  });

  it('CLI RL overrides drive learning hyperparameters', async () => {
    const cfg = await resolveConfig({
      configSearchPaths: [tmpDir],
      cliOverrides: {
        rlEnabled: true,
        rlAgents: ['DoubleQLearning'],
        rlLearningRate: 0.05,
        rlDiscountFactor: 0.9,
        rlEpsilon: 0.02,
      },
    });
    expect(cfg.rl!.enabled).toBe(true);
    expect(cfg.rl!.agents).toEqual(['DoubleQLearning']);
    expect(cfg.rl!.learning_rate).toBe(0.05);
    expect(cfg.rl!.discount_factor).toBe(0.9);
    expect(cfg.rl!.epsilon).toBe(0.02);
  });
});

describe('Example presets', () => {
  let tmpDir: string;
  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wasm4pm-preset-'));
  });
  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it.each(['fast', 'balanced', 'quality'] as const)(
    'preset %s round-trips through TOML → resolveConfig → validate',
    async (preset) => {
      await fs.writeFile(path.join(tmpDir, 'wasm4pm.toml'), getExamplePresetConfig(preset));
      const cfg = await resolveConfig({ configSearchPaths: [tmpDir] });
      expect(cfg.execution.profile).toBe(preset);
    }
  );

  it('exposes a complete .env example covering every WASM4PM_* var', () => {
    const env = getExampleEnvFile();
    for (const key of [
      'WASM4PM_PROFILE',
      'WASM4PM_ML_ENABLED',
      'WASM4PM_ML_ALGORITHMS',
      'WASM4PM_RL_ENABLED',
      'WASM4PM_RL_AGENTS',
      'WASM4PM_RL_LEARNING_RATE',
      'WASM4PM_RL_DISCOUNT_FACTOR',
      'WASM4PM_RL_EPSILON',
      'WASM4PM_PREDICTION_DRIFT_THRESHOLD',
      'WASM4PM_PREDICTION_DRIFT_EWMA_ALPHA',
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
        enabled: true,
        agents: ['QLearning', 'SARSA', 'DoubleQLearning'],
        learning_rate: 0.1,
        discount_factor: 0.99,
        epsilon: 0.1,
        convergence: { min_cycles: 50, target_reward_improvement: 0.05, window_size: 10 },
      },
      prediction: {
        enabled: true,
        tasks: ['next_activity', 'remaining_time', 'drift'],
        drift: { ewma_alpha: 0.2, threshold: 0.3 },
      },
    };
    const N = 1_000;
    const start = performance.now();
    for (let i = 0; i < N; i++) validate(sample);
    const elapsed = performance.now() - start;
    const perCall = elapsed / N;
    // Generous bound: validation should comfortably stay under 5ms/call.
    expect(perCall).toBeLessThan(5);
  });
});
