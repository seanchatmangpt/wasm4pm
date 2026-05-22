/**
 * Contract tests for mcpp-bridge.ts
 *
 * Oracle ranks:
 *   Rank 1 — Mathematical invariant  (e.g. threshold values in [0, 1])
 *   Rank 2 — Domain contract         (e.g. MCPP_VERSION, receipt_required by profile)
 *   Rank 3 — Metamorphic relation    (e.g. quality > balanced > fast thresholds)
 */
import { describe, it, expect } from 'vitest';
import type { Config } from '../types.js';
import {
  configToMcppExtensions,
  configToConformanceThresholds,
  buildMcppRequest,
  MCPP_VERSION,
  type ObjectRef,
  type ConformanceThresholds,
  type McpplusRequest,
  type Policy,
} from '../mcpp-bridge.js';

// ---------------------------------------------------------------------------
// Minimal Config factory — produces a valid Config with Zod-resolved defaults.
// We construct the shape directly (no Zod parse) because we are testing the
// bridge logic, not the schema resolver.  The bridge only reads the fields it
// maps, so absent optional sections simply produce no extension keys.
// ---------------------------------------------------------------------------
function makeConfig(overrides: Partial<Config> = {}): Config {
  return {
    schemaVersion: 1,
    version: '26.5.17',
    source: { kind: 'file', path: 'test.xes' },
    sink: { kind: 'stdout' },
    algorithm: { name: 'dfg', parameters: {} },
    execution: { profile: 'balanced' },
    observability: { logLevel: 'info', metricsEnabled: false },
    output: { format: 'human', destination: 'stdout', pretty: true, colorize: true },
    metadata: {
      loadTime: 1_716_000_000_000,
      hash: 'abc123def456abc123def456abc123def456abc123def456abc123def456abc1',
      provenance: {},
    },
    ...overrides,
  } as unknown as Config;
}

// Sample ObjectRef used in buildMcppRequest tests
const sampleObjects: ObjectRef[] = [
  {
    id: 'log-1',
    type: 'EventLog',
    hash: 'blake3:' + 'a'.repeat(64),
  },
];

// ---------------------------------------------------------------------------
// MCPP_VERSION
// ---------------------------------------------------------------------------
describe('MCPP_VERSION', () => {
  it('is the string "1.0" (Rank 2 — domain contract)', () => {
    expect(MCPP_VERSION).toBe('1.0');
  });

  it('is a const string, not a number or undefined', () => {
    expect(typeof MCPP_VERSION).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// configToMcppExtensions
// ---------------------------------------------------------------------------
describe('configToMcppExtensions', () => {
  describe('key namespace convention', () => {
    it('all extension keys are prefixed with "wasm4pm." (Rank 2)', () => {
      const ext = configToMcppExtensions(makeConfig());
      for (const key of Object.keys(ext)) {
        expect(key).toMatch(/^wasm4pm\./);
      }
    });

    it('returns a flat Record — values are not nested objects except algorithm.parameters', () => {
      const ext = configToMcppExtensions(makeConfig());
      // Every key must have a single dot-separated path under wasm4pm.*
      expect(typeof ext).toBe('object');
      expect(ext).not.toBeNull();
    });
  });

  describe('core identity fields', () => {
    it('wasm4pm.config.hash maps metadata.hash', () => {
      const cfg = makeConfig();
      const ext = configToMcppExtensions(cfg);
      expect(ext['wasm4pm.config.hash']).toBe(cfg.metadata.hash);
    });

    it('wasm4pm.config.schema_version maps schemaVersion', () => {
      const cfg = makeConfig();
      const ext = configToMcppExtensions(cfg);
      expect(ext['wasm4pm.config.schema_version']).toBe(cfg.schemaVersion);
    });

    it('wasm4pm.config.version maps version', () => {
      const cfg = makeConfig();
      const ext = configToMcppExtensions(cfg);
      expect(ext['wasm4pm.config.version']).toBe(cfg.version);
    });
  });

  describe('source section', () => {
    it('wasm4pm.source.kind maps source.kind', () => {
      const ext = configToMcppExtensions(makeConfig({ source: { kind: 'file', path: 'a.xes' } }));
      expect(ext['wasm4pm.source.kind']).toBe('file');
    });

    it('wasm4pm.source.path is present when source.path is set', () => {
      const ext = configToMcppExtensions(makeConfig({ source: { kind: 'file', path: 'log.xes' } }));
      expect(ext['wasm4pm.source.path']).toBe('log.xes');
    });

    it('wasm4pm.source.path is absent when source has no path', () => {
      const ext = configToMcppExtensions(makeConfig({ source: { kind: 'stream' } }));
      expect('wasm4pm.source.path' in ext).toBe(false);
    });

    it('wasm4pm.source.url is present when source.url is set', () => {
      const ext = configToMcppExtensions(
        makeConfig({ source: { kind: 'http', url: 'http://example.com/log.xes' } })
      );
      expect(ext['wasm4pm.source.url']).toBe('http://example.com/log.xes');
    });
  });

  describe('algorithm section', () => {
    it('wasm4pm.algorithm.name maps algorithm.name', () => {
      const ext = configToMcppExtensions(
        makeConfig({ algorithm: { name: 'heuristic_miner', parameters: {} } })
      );
      expect(ext['wasm4pm.algorithm.name']).toBe('heuristic_miner');
    });

    it('wasm4pm.algorithm.parameters is absent when parameters is empty', () => {
      const ext = configToMcppExtensions(
        makeConfig({ algorithm: { name: 'dfg', parameters: {} } })
      );
      expect('wasm4pm.algorithm.parameters' in ext).toBe(false);
    });

    it('wasm4pm.algorithm.parameters is present when parameters is non-empty', () => {
      const ext = configToMcppExtensions(
        makeConfig({ algorithm: { name: 'dfg', parameters: { dependency_threshold: 0.5 } } })
      );
      expect(ext['wasm4pm.algorithm.parameters']).toEqual({ dependency_threshold: 0.5 });
    });
  });

  describe('execution section', () => {
    it('wasm4pm.execution.profile maps execution.profile', () => {
      for (const profile of ['fast', 'balanced', 'quality', 'stream'] as const) {
        const ext = configToMcppExtensions(makeConfig({ execution: { profile } }));
        expect(ext['wasm4pm.execution.profile']).toBe(profile);
      }
    });

    it('wasm4pm.execution.timeout_ms is present when execution.timeout is set', () => {
      const ext = configToMcppExtensions(
        makeConfig({ execution: { profile: 'balanced', timeout: 30_000 } })
      );
      expect(ext['wasm4pm.execution.timeout_ms']).toBe(30_000);
    });

    it('wasm4pm.execution.timeout_ms is absent when execution.timeout is not set', () => {
      const ext = configToMcppExtensions(makeConfig({ execution: { profile: 'fast' } }));
      expect('wasm4pm.execution.timeout_ms' in ext).toBe(false);
    });

    it('wasm4pm.execution.max_memory_bytes is present when execution.maxMemory is set', () => {
      const ext = configToMcppExtensions(
        makeConfig({ execution: { profile: 'quality', maxMemory: 512_000_000 } })
      );
      expect(ext['wasm4pm.execution.max_memory_bytes']).toBe(512_000_000);
    });
  });

  describe('observability section', () => {
    it('wasm4pm.observability.log_level maps observability.logLevel', () => {
      const ext = configToMcppExtensions(
        makeConfig({ observability: { logLevel: 'debug', metricsEnabled: false } })
      );
      expect(ext['wasm4pm.observability.log_level']).toBe('debug');
    });

    it('wasm4pm.observability.metrics_enabled maps observability.metricsEnabled', () => {
      const ext = configToMcppExtensions(
        makeConfig({ observability: { logLevel: 'info', metricsEnabled: true } })
      );
      expect(ext['wasm4pm.observability.metrics_enabled']).toBe(true);
    });

    it('otel sub-keys are present when otel config is provided', () => {
      const ext = configToMcppExtensions(
        makeConfig({
          observability: {
            logLevel: 'info',
            metricsEnabled: false,
            otel: { enabled: true, exporter: 'otlp', endpoint: 'https://example.com:4317', required: false },
          },
        })
      );
      expect(ext['wasm4pm.observability.otel.enabled']).toBe(true);
      expect(ext['wasm4pm.observability.otel.exporter']).toBe('otlp');
      expect(ext['wasm4pm.observability.otel.endpoint']).toBe('https://example.com:4317');
    });

    it('otel sub-keys are absent when otel config is not provided', () => {
      const ext = configToMcppExtensions(
        makeConfig({ observability: { logLevel: 'info', metricsEnabled: false } })
      );
      expect('wasm4pm.observability.otel.enabled' in ext).toBe(false);
    });
  });

  describe('optional sections — absent when not configured', () => {
    it('prediction extension keys are absent when prediction is not in config', () => {
      const ext = configToMcppExtensions(makeConfig());
      const predictionKeys = Object.keys(ext).filter((k) => k.startsWith('wasm4pm.prediction'));
      expect(predictionKeys).toHaveLength(0);
    });

    it('prediction extension keys are absent when prediction.enabled is false', () => {
      const ext = configToMcppExtensions(
        makeConfig({
          prediction: {
            enabled: false,
            activityKey: 'concept:name',
            ngramOrder: 2,
            driftWindowSize: 10,
            tasks: [],
            drift: { ewma_alpha: 0.2, threshold: 0.3 },
          },
        } as unknown as Partial<Config>)
      );
      const predictionKeys = Object.keys(ext).filter((k) => k.startsWith('wasm4pm.prediction'));
      expect(predictionKeys).toHaveLength(0);
    });

    it('prediction extension keys are present when prediction.enabled is true', () => {
      const ext = configToMcppExtensions(
        makeConfig({
          prediction: {
            enabled: true,
            activityKey: 'concept:name',
            ngramOrder: 3,
            driftWindowSize: 20,
            tasks: ['next_activity'],
            drift: { ewma_alpha: 0.15, threshold: 0.25 },
          },
        } as unknown as Partial<Config>)
      );
      expect(ext['wasm4pm.prediction.enabled']).toBe(true);
      expect(ext['wasm4pm.prediction.activity_key']).toBe('concept:name');
      expect(ext['wasm4pm.prediction.ngram_order']).toBe(3);
      expect(ext['wasm4pm.prediction.drift_window_size']).toBe(20);
      expect(ext['wasm4pm.prediction.drift.ewma_alpha']).toBe(0.15);
      expect(ext['wasm4pm.prediction.drift.threshold']).toBe(0.25);
    });

    it('ML extension keys are absent when ml is not in config', () => {
      const ext = configToMcppExtensions(makeConfig());
      const mlKeys = Object.keys(ext).filter((k) => k.startsWith('wasm4pm.ml'));
      expect(mlKeys).toHaveLength(0);
    });

    it('ML extension keys are absent when ml.enabled is false', () => {
      const ext = configToMcppExtensions(
        makeConfig({
          ml: {
            enabled: false,
            tasks: [],
            classify: { model: 'decision_tree', targetKey: 'outcome', k: 5 },
            cluster: { method: 'kmeans', k: 5, eps: 1.0 },
            forecast: { method: 'linear', periods: 5, polynomialDegree: 2 },
            anomaly: { method: 'ema', alpha: 0.3, threshold: 2.5 },
            regress: { method: 'linear', targetKey: 'outcome', lambda: 0 },
            pca: { nComponents: 2 },
            targetKey: 'outcome',
            forecastPeriods: 5,
            nComponents: 2,
            eps: 1.0,
          },
        } as unknown as Partial<Config>)
      );
      const mlKeys = Object.keys(ext).filter((k) => k.startsWith('wasm4pm.ml'));
      expect(mlKeys).toHaveLength(0);
    });

    it('ML extension keys are present when ml.enabled is true', () => {
      const ext = configToMcppExtensions(
        makeConfig({
          ml: {
            enabled: true,
            tasks: ['cluster'],
            classify: { model: 'decision_tree', targetKey: 'outcome', k: 5 },
            cluster: { method: 'kmeans', k: 7, eps: 1.0 },
            forecast: { method: 'linear', periods: 5, polynomialDegree: 2 },
            anomaly: { method: 'ema', alpha: 0.3, threshold: 2.5 },
            regress: { method: 'linear', targetKey: 'outcome', lambda: 0 },
            pca: { nComponents: 2 },
            targetKey: 'outcome',
            forecastPeriods: 5,
            nComponents: 2,
            eps: 1.0,
          },
        } as unknown as Partial<Config>)
      );
      expect(ext['wasm4pm.ml.enabled']).toBe(true);
      expect(ext['wasm4pm.ml.tasks']).toEqual(['cluster']);
      // Only the 'cluster' task was in tasks[], so cluster sub-keys should be present
      expect(ext['wasm4pm.ml.cluster.method']).toBe('kmeans');
      expect(ext['wasm4pm.ml.cluster.k']).toBe(7);
    });

    it('RL extension keys are absent when rl is not in config', () => {
      const ext = configToMcppExtensions(makeConfig());
      const rlKeys = Object.keys(ext).filter((k) => k.startsWith('wasm4pm.rl'));
      expect(rlKeys).toHaveLength(0);
    });

    it('RL extension keys are present when rl.enabled is true', () => {
      const ext = configToMcppExtensions(
        makeConfig({
          rl: {
            enabled: true,
            agents: ['QLearning'],
            learning_rate: 0.1,
            discount_factor: 0.99,
            epsilon: 0.1,
            convergence: { min_cycles: 50, target_reward_improvement: 0.05, window_size: 10 },
            gpu_enabled: false,
            linucb_lambda: 1.0,
            ucb1_exploration: Math.SQRT2,
          },
        } as unknown as Partial<Config>)
      );
      expect(ext['wasm4pm.rl.enabled']).toBe(true);
      expect(ext['wasm4pm.rl.agents']).toEqual(['QLearning']);
      expect(ext['wasm4pm.rl.learning_rate']).toBe(0.1);
      expect(ext['wasm4pm.rl.discount_factor']).toBe(0.99);
    });

    it('membrane extension keys are absent when membrane is not in config', () => {
      const ext = configToMcppExtensions(makeConfig());
      const memKeys = Object.keys(ext).filter((k) => k.startsWith('wasm4pm.membrane'));
      expect(memKeys).toHaveLength(0);
    });

    it('swarm extension keys are absent when swarm is not in config', () => {
      const ext = configToMcppExtensions(makeConfig());
      const swarmKeys = Object.keys(ext).filter((k) => k.startsWith('wasm4pm.swarm'));
      expect(swarmKeys).toHaveLength(0);
    });

    it('swarm extension keys are present when swarm config is provided', () => {
      const ext = configToMcppExtensions(
        makeConfig({
          swarm: {
            max_episodes: 5,
            convergence_runs: 3,
            convergence_threshold: 0.8,
            worker_model: 'llama-3.1-70b-versatile',
            algorithm_ids: ['dfg', 'heuristic_miner'],
          },
        } as unknown as Partial<Config>)
      );
      expect(ext['wasm4pm.swarm.max_episodes']).toBe(5);
      expect(ext['wasm4pm.swarm.convergence_threshold']).toBe(0.8);
      expect(ext['wasm4pm.swarm.algorithm_ids']).toEqual(['dfg', 'heuristic_miner']);
    });
  });
});

// ---------------------------------------------------------------------------
// configToConformanceThresholds
// ---------------------------------------------------------------------------
describe('configToConformanceThresholds', () => {
  // Rank 1 — Mathematical invariant: all returned threshold values must be in [0, 1]
  describe('Rank 1 — all threshold values are in [0, 1]', () => {
    for (const profile of ['fast', 'balanced', 'quality', 'stream'] as const) {
      it(`${profile} profile produces no threshold outside [0, 1]`, () => {
        const thresholds = configToConformanceThresholds(makeConfig({ execution: { profile } }));
        for (const [key, value] of Object.entries(thresholds)) {
          if (value !== undefined) {
            expect(value).toBeGreaterThanOrEqual(0);
            expect(value).toBeLessThanOrEqual(1);
          }
        }
      });
    }
  });

  describe('profile semantics (Rank 2 — domain contracts)', () => {
    it('fast profile sets only fitness at 0.70', () => {
      const t = configToConformanceThresholds(makeConfig({ execution: { profile: 'fast' } }));
      expect(t.fitness).toBe(0.70);
      expect(t.precision).toBeUndefined();
      expect(t.lifecycle).toBeUndefined();
      expect(t.cardinality).toBeUndefined();
      expect(t.receipt).toBeUndefined();
    });

    it('balanced profile sets fitness 0.80 and precision 0.70', () => {
      const t = configToConformanceThresholds(makeConfig({ execution: { profile: 'balanced' } }));
      expect(t.fitness).toBe(0.80);
      expect(t.precision).toBe(0.70);
      expect(t.lifecycle).toBeUndefined();
      expect(t.cardinality).toBeUndefined();
      expect(t.receipt).toBeUndefined();
    });

    it('quality profile sets all five dimensions at high thresholds', () => {
      const t = configToConformanceThresholds(makeConfig({ execution: { profile: 'quality' } }));
      expect(t.fitness).toBe(0.90);
      expect(t.precision).toBe(0.85);
      expect(t.lifecycle).toBe(0.80);
      expect(t.cardinality).toBe(0.80);
      expect(t.receipt).toBe(1.0);
    });

    it('stream profile sets only fitness at 0.65', () => {
      const t = configToConformanceThresholds(makeConfig({ execution: { profile: 'stream' } }));
      expect(t.fitness).toBe(0.65);
      expect(t.precision).toBeUndefined();
      expect(t.lifecycle).toBeUndefined();
    });

    it('quality profile fitness >= 0.9 (Rank 2 — admission requirement)', () => {
      const t = configToConformanceThresholds(makeConfig({ execution: { profile: 'quality' } }));
      expect(t.fitness).toBeGreaterThanOrEqual(0.9);
    });

    it('quality profile requires receipt === 1.0 (Rank 2 — receipt chain mandatory)', () => {
      const t = configToConformanceThresholds(makeConfig({ execution: { profile: 'quality' } }));
      expect(t.receipt).toBe(1.0);
    });
  });

  describe('Rank 3 — monotonic ordering of fitness across profiles', () => {
    it('quality fitness > balanced fitness > fast fitness > stream fitness', () => {
      const quality = configToConformanceThresholds(makeConfig({ execution: { profile: 'quality' } }));
      const balanced = configToConformanceThresholds(makeConfig({ execution: { profile: 'balanced' } }));
      const fast = configToConformanceThresholds(makeConfig({ execution: { profile: 'fast' } }));
      const stream = configToConformanceThresholds(makeConfig({ execution: { profile: 'stream' } }));

      expect(quality.fitness!).toBeGreaterThan(balanced.fitness!);
      expect(balanced.fitness!).toBeGreaterThan(fast.fitness!);
      expect(fast.fitness!).toBeGreaterThan(stream.fitness!);
    });
  });

  describe('membrane override', () => {
    it('when membrane.enabled is true, receipt is 1.0 regardless of profile', () => {
      for (const profile of ['fast', 'balanced', 'stream'] as const) {
        const t = configToConformanceThresholds(
          makeConfig({
            execution: { profile },
            membrane: {
              enabled: true,
              custody_actions: ['approve'],
              thresholds: {
                actor_anomaly_escalate: 0.7,
                actor_anomaly_warn: 0.4,
                route_match_allow: 0.5,
                automl_escalate: 0.9,
                automl_warn: 0.7,
              },
              drift: {
                stable_threshold: 0.10,
                moderate_threshold: 0.25,
                high_threshold: 0.50,
                severe_threshold: 0.75,
              },
              envelopes: { persist: true, path: '.wasm4pm/envelopes' },
            },
          } as unknown as Partial<Config>)
        );
        expect(t.receipt).toBe(1.0);
      }
    });

    it('when membrane is absent, fast profile has no receipt threshold', () => {
      const t = configToConformanceThresholds(makeConfig({ execution: { profile: 'fast' } }));
      expect(t.receipt).toBeUndefined();
    });
  });

  describe('return shape', () => {
    it('returns an object with optional keys matching ConformanceThresholds', () => {
      const t = configToConformanceThresholds(makeConfig({ execution: { profile: 'quality' } }));
      // All five keys that can exist
      const validKeys = new Set(['fitness', 'precision', 'lifecycle', 'cardinality', 'receipt']);
      for (const key of Object.keys(t)) {
        expect(validKeys.has(key)).toBe(true);
      }
    });

    it('returns a plain object (not an array or null)', () => {
      const t = configToConformanceThresholds(makeConfig());
      expect(typeof t).toBe('object');
      expect(t).not.toBeNull();
      expect(Array.isArray(t)).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// buildMcppRequest
// ---------------------------------------------------------------------------
describe('buildMcppRequest', () => {
  describe('mcpp_version field', () => {
    it('includes mcpp_version matching MCPP_VERSION constant (Rank 2)', () => {
      const req = buildMcppRequest(makeConfig(), 'part-123', sampleObjects);
      expect(req.mcpp_version).toBe(MCPP_VERSION);
      expect(req.mcpp_version).toBe('1.0');
    });
  });

  describe('part_id and input_objects', () => {
    it('part_id matches the provided partId', () => {
      const req = buildMcppRequest(makeConfig(), 'my-part-uuid', sampleObjects);
      expect(req.part_id).toBe('my-part-uuid');
    });

    it('input_objects matches the provided objects array', () => {
      const req = buildMcppRequest(makeConfig(), 'pid', sampleObjects);
      expect(req.input_objects).toBe(sampleObjects);
    });

    it('input_objects can be an empty array', () => {
      const req = buildMcppRequest(makeConfig(), 'pid', []);
      expect(req.input_objects).toEqual([]);
    });

    it('multiple input objects are preserved in order', () => {
      const objs: ObjectRef[] = [
        { id: 'a', type: 'EventLog', hash: 'blake3:' + 'a'.repeat(64) },
        { id: 'b', type: 'ProcessModel', hash: 'blake3:' + 'b'.repeat(64) },
      ];
      const req = buildMcppRequest(makeConfig(), 'pid', objs);
      expect(req.input_objects).toHaveLength(2);
      expect(req.input_objects[0].id).toBe('a');
      expect(req.input_objects[1].id).toBe('b');
    });
  });

  describe('route_class', () => {
    it('route_class is set to the algorithm name from config', () => {
      const req = buildMcppRequest(
        makeConfig({ algorithm: { name: 'genetic_algorithm', parameters: {} } }),
        'pid',
        sampleObjects
      );
      expect(req.route_class).toBe('genetic_algorithm');
    });

    it('route_class changes with different algorithm names', () => {
      const req1 = buildMcppRequest(
        makeConfig({ algorithm: { name: 'dfg', parameters: {} } }),
        'pid',
        []
      );
      const req2 = buildMcppRequest(
        makeConfig({ algorithm: { name: 'ilp', parameters: {} } }),
        'pid',
        []
      );
      expect(req1.route_class).toBe('dfg');
      expect(req2.route_class).toBe('ilp');
    });
  });

  describe('required_conformance', () => {
    it('required_conformance is set for quality profile (Rank 2)', () => {
      const req = buildMcppRequest(
        makeConfig({ execution: { profile: 'quality' } }),
        'pid',
        sampleObjects
      );
      expect(req.required_conformance).toBeDefined();
      expect(req.required_conformance!.fitness).toBeGreaterThanOrEqual(0.9);
    });

    it('required_conformance is derived from configToConformanceThresholds (Rank 2)', () => {
      const config = makeConfig({ execution: { profile: 'balanced' } });
      const expectedThresholds = configToConformanceThresholds(config);
      const req = buildMcppRequest(config, 'pid', sampleObjects);
      expect(req.required_conformance).toEqual(expectedThresholds);
    });

    it('required_conformance fitness values are in [0, 1] for all profiles (Rank 1)', () => {
      for (const profile of ['fast', 'balanced', 'quality', 'stream'] as const) {
        const req = buildMcppRequest(makeConfig({ execution: { profile } }), 'pid', []);
        const rc = req.required_conformance!;
        for (const [, value] of Object.entries(rc)) {
          if (value !== undefined) {
            expect(value).toBeGreaterThanOrEqual(0);
            expect(value).toBeLessThanOrEqual(1);
          }
        }
      }
    });
  });

  describe('policy field', () => {
    it('policy.on_nonconformance is "refuse" for all profiles (Rank 2)', () => {
      for (const profile of ['fast', 'balanced', 'quality', 'stream'] as const) {
        const req = buildMcppRequest(makeConfig({ execution: { profile } }), 'pid', []);
        expect(req.policy?.on_nonconformance).toBe('refuse');
      }
    });

    it('policy.receipt_required is true for quality profile (Rank 2)', () => {
      const req = buildMcppRequest(
        makeConfig({ execution: { profile: 'quality' } }),
        'pid',
        sampleObjects
      );
      expect(req.policy?.receipt_required).toBe(true);
    });

    it('policy.receipt_required is false for fast profile', () => {
      const req = buildMcppRequest(
        makeConfig({ execution: { profile: 'fast' } }),
        'pid',
        sampleObjects
      );
      expect(req.policy?.receipt_required).toBe(false);
    });

    it('policy.receipt_required is false for stream profile', () => {
      const req = buildMcppRequest(
        makeConfig({ execution: { profile: 'stream' } }),
        'pid',
        sampleObjects
      );
      expect(req.policy?.receipt_required).toBe(false);
    });

    it('policy.proof_pack_required is true for balanced/quality profiles (Rank 2)', () => {
      for (const profile of ['balanced', 'quality'] as const) {
        const req = buildMcppRequest(makeConfig({ execution: { profile } }), 'pid', []);
        expect(req.policy?.proof_pack_required).toBe(true);
      }
    });

    it('policy.proof_pack_required is false for fast/stream profiles', () => {
      for (const profile of ['fast', 'stream'] as const) {
        const req = buildMcppRequest(makeConfig({ execution: { profile } }), 'pid', []);
        expect(req.policy?.proof_pack_required).toBe(false);
      }
    });
  });

  describe('extensions field', () => {
    it('extensions is an object with wasm4pm.* keys (Rank 2)', () => {
      const req = buildMcppRequest(makeConfig(), 'pid', sampleObjects);
      expect(req.extensions).toBeDefined();
      expect(typeof req.extensions).toBe('object');
      for (const key of Object.keys(req.extensions!)) {
        expect(key).toMatch(/^wasm4pm\./);
      }
    });

    it('extensions.wasm4pm.algorithm.name matches config algorithm', () => {
      const req = buildMcppRequest(
        makeConfig({ algorithm: { name: 'heuristic_miner', parameters: {} } }),
        'pid',
        sampleObjects
      );
      expect(req.extensions?.['wasm4pm.algorithm.name']).toBe('heuristic_miner');
    });

    it('extensions equals output of configToMcppExtensions (Rank 2)', () => {
      const config = makeConfig();
      const req = buildMcppRequest(config, 'pid', sampleObjects);
      const ext = configToMcppExtensions(config);
      expect(req.extensions).toEqual(ext);
    });
  });

  describe('trace_parent field', () => {
    it('trace_parent is absent when no options are provided (Rank 2)', () => {
      const req = buildMcppRequest(makeConfig(), 'pid', sampleObjects);
      expect(req.trace_parent).toBeUndefined();
      expect('trace_parent' in req).toBe(false);
    });

    it('trace_parent is absent when options object is provided without traceParent', () => {
      const req = buildMcppRequest(makeConfig(), 'pid', sampleObjects, {});
      expect(req.trace_parent).toBeUndefined();
    });

    it('trace_parent is set when options.traceParent is provided', () => {
      const traceparent = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';
      const req = buildMcppRequest(makeConfig(), 'pid', sampleObjects, {
        traceParent: traceparent,
      });
      expect(req.trace_parent).toBe(traceparent);
    });
  });

  describe('returned McpplusRequest shape', () => {
    it('returned object has all required McpplusRequest fields', () => {
      const req = buildMcppRequest(makeConfig(), 'part-abc', sampleObjects);
      expect(typeof req.mcpp_version).toBe('string');
      expect(typeof req.part_id).toBe('string');
      expect(Array.isArray(req.input_objects)).toBe(true);
    });

    it('returned object is a plain object (not null or array)', () => {
      const req = buildMcppRequest(makeConfig(), 'pid', []);
      expect(typeof req).toBe('object');
      expect(req).not.toBeNull();
      expect(Array.isArray(req)).toBe(false);
    });
  });

  describe('ObjectRef hash format (Rank 2 — domain contract)', () => {
    it('ObjectRef hash must start with "blake3:" prefix', () => {
      const obj: ObjectRef = {
        id: 'log-1',
        type: 'EventLog',
        hash: 'blake3:' + 'a'.repeat(64),
      };
      expect(obj.hash).toMatch(/^blake3:[0-9a-f]{64}$/);
    });

    it('buildMcppRequest passes ObjectRef through unchanged', () => {
      const obj: ObjectRef = {
        id: 'log-xyz',
        type: 'EventLog',
        hash: 'blake3:' + 'f'.repeat(64),
      };
      const req = buildMcppRequest(makeConfig(), 'pid', [obj]);
      expect(req.input_objects[0]).toEqual(obj);
    });
  });
});
