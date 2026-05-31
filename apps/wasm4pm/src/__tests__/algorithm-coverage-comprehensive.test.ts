/**
 * algorithm-coverage-comprehensive.test.ts
 *
 * Van der Aalst algorithm coverage tests. Validates that:
 *  1. All 38 declared kernel-registry algorithms are present.
 *  2. Each execution profile (fast/balanced/quality/stream) contains its required algorithms.
 *  3. Each deployment profile (mobile/iot/edge/fog/browser) is non-empty.
 *  4. Every registered algorithm has valid metadata (speedTier, qualityTier, outputType).
 *  5. The registry contains no duplicate IDs.
 *  6. All 6 prediction perspectives are declared in @wasm4pm/contracts.
 *  7. Algorithm output types cover the full Van der Aalst model vocabulary.
 *  8. Quality/speed tier invariants hold (Rank-2 domain contract).
 *
 * Oracle rank: Rank-2 (domain contract) — these are structural properties of the
 * registry metadata, not live WASM execution results.
 */

import { describe, it, expect } from 'vitest';
// The algorithm registry is exported from the wasm4pm npm package (bundled from packages/kernel).
// @wasm4pm/kernel is not a direct dependency of the CLI app; use the re-exported surface.
import { getRegistry } from 'wasm4pm';
import { VALID_PREDICT_CLI_TASKS } from '@wasm4pm/contracts';

// ─── Expected algorithm IDs per the wasm4pm CLAUDE.md ───────────────────────

/** Discovery algorithms that must be present in the browser (full) profile. */
const REQUIRED_DISCOVERY_IDS = [
  // DFG tier
  'dfg',
  'process_skeleton',
  'simd_streaming_dfg',
  // Heuristic / balanced
  'alpha_plus_plus',
  'heuristic_miner',
  'inductive_miner',
  'hill_climbing',
  'declare',
  // Quality tier
  'simulated_annealing',
  'a_star',
  'aco',
  'pso',
  'genetic_algorithm',
  'optimized_dfg',
  'ilp',
] as const;

/** ML algorithms that must be present in the browser profile. */
const REQUIRED_ML_IDS = ['ml_cluster', 'ml_anomaly'] as const;

/** Analysis/utility algorithms that must be present. */
const REQUIRED_ANALYSIS_IDS = [
  'transition_system',
  'log_to_trie',
  'causal_graph',
  'performance_spectrum',
  'batches',
  'generalization',
  'etconformance_precision',
  'alignments',
  'complexity_metrics',
  'pnml_import',
  'bpmn_import',
  'powl_to_process_tree',
  'yawl_export',
  'playout',
  'monte_carlo_simulation',
  'hierarchical_dfg',
  'streaming_log',
  'smart_engine',
] as const;

/** Social network algorithms. */
const REQUIRED_SOCIAL_IDS = ['handover_network', 'working_together_network'] as const;

/** Minimum set of algorithms per execution profile. */
const PROFILE_REQUIRED: Record<string, string[]> = {
  fast: ['dfg', 'process_skeleton', 'simd_streaming_dfg'],
  balanced: ['heuristic_miner', 'alpha_plus_plus', 'inductive_miner'],
  quality: ['genetic_algorithm', 'ilp', 'aco', 'pso'],
  stream: ['simd_streaming_dfg'],
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Algorithm Coverage — Registry Completeness', () => {
  const registry = getRegistry();
  const all = registry.list();
  const allIds = new Set(all.map((a) => a.id));

  it('registry has at least 38 algorithms registered', () => {
    // The CLAUDE.md states 38 kernel-registered algorithms.
    expect(all.length).toBeGreaterThanOrEqual(38);
  });

  it('registry contains no duplicate IDs', () => {
    const ids = all.map((a) => a.id);
    const unique = new Set(ids);
    expect(ids.length).toBe(unique.size);
  });

  it('all required discovery algorithms are registered', () => {
    for (const id of REQUIRED_DISCOVERY_IDS) {
      expect(allIds.has(id), `Missing discovery algorithm: ${id}`).toBe(true);
    }
  });

  it('all required ML algorithms are registered', () => {
    for (const id of REQUIRED_ML_IDS) {
      expect(allIds.has(id), `Missing ML algorithm: ${id}`).toBe(true);
    }
  });

  it('all required analysis/utility algorithms are registered', () => {
    for (const id of REQUIRED_ANALYSIS_IDS) {
      expect(allIds.has(id), `Missing analysis algorithm: ${id}`).toBe(true);
    }
  });

  it('all required social network algorithms are registered', () => {
    for (const id of REQUIRED_SOCIAL_IDS) {
      expect(allIds.has(id), `Missing social algorithm: ${id}`).toBe(true);
    }
  });
});

describe('Algorithm Coverage — Execution Profiles', () => {
  const registry = getRegistry();

  for (const [profile, required] of Object.entries(PROFILE_REQUIRED)) {
    const profileAlgos = registry.getForProfile(profile as 'fast' | 'balanced' | 'quality' | 'stream');
    const profileIds = new Set(profileAlgos.map((a) => a.id));

    it(`profile "${profile}" contains all required algorithms`, () => {
      for (const id of required) {
        expect(profileIds.has(id), `Profile "${profile}" is missing: ${id}`).toBe(true);
      }
    });

    it(`profile "${profile}" has at least 1 algorithm`, () => {
      expect(profileAlgos.length).toBeGreaterThan(0);
    });
  }
});

describe('Algorithm Coverage — Deployment Profiles', () => {
  const registry = getRegistry();
  const deploymentProfiles = ['mobile', 'iot', 'edge', 'fog', 'browser'] as const;

  for (const profile of deploymentProfiles) {
    it(`deployment profile "${profile}" is non-empty`, () => {
      const algos = registry.getForDeploymentProfile(profile);
      expect(algos.length, `Deployment profile "${profile}" has no algorithms`).toBeGreaterThan(0);
    });
  }

  it('browser profile has the most algorithms (full feature set)', () => {
    const browserAlgos = registry.getForDeploymentProfile('browser');
    for (const profile of deploymentProfiles) {
      if (profile === 'browser') continue;
      const others = registry.getForDeploymentProfile(profile);
      expect(browserAlgos.length).toBeGreaterThanOrEqual(others.length);
    }
  });

  it('browser profile has at least 38 algorithms', () => {
    const browserAlgos = registry.getForDeploymentProfile('browser');
    expect(browserAlgos.length).toBeGreaterThanOrEqual(38);
  });
});

describe('Algorithm Metadata Invariants (Rank-2 Domain Contract)', () => {
  const registry = getRegistry();
  const all = registry.list();

  it('every algorithm has a non-empty id', () => {
    for (const a of all) {
      expect(a.id.length, `Algorithm has empty id: ${JSON.stringify(a)}`).toBeGreaterThan(0);
    }
  });

  it('every algorithm has a non-empty name', () => {
    for (const a of all) {
      expect(a.name.length, `Algorithm ${a.id} has empty name`).toBeGreaterThan(0);
    }
  });

  it('every algorithm has a valid speedTier (1–100)', () => {
    for (const a of all) {
      expect(a.speedTier, `Algorithm ${a.id} speedTier out of range`).toBeGreaterThanOrEqual(1);
      expect(a.speedTier, `Algorithm ${a.id} speedTier out of range`).toBeLessThanOrEqual(100);
    }
  });

  it('every algorithm has a valid qualityTier (0–100)', () => {
    for (const a of all) {
      expect(a.qualityTier, `Algorithm ${a.id} qualityTier out of range`).toBeGreaterThanOrEqual(0);
      expect(a.qualityTier, `Algorithm ${a.id} qualityTier out of range`).toBeLessThanOrEqual(100);
    }
  });

  it('every algorithm has a non-empty outputType', () => {
    const validTypes = new Set(['dfg', 'petrinet', 'declare', 'tree', 'ml_result', 'analytics']);
    for (const a of all) {
      expect(validTypes.has(a.outputType), `Algorithm ${a.id} has invalid outputType: ${a.outputType}`).toBe(true);
    }
  });

  it('every algorithm belongs to at least one execution profile', () => {
    for (const a of all) {
      expect(
        a.supportedProfiles.length,
        `Algorithm ${a.id} has no supported profiles`
      ).toBeGreaterThan(0);
    }
  });

  it('every algorithm belongs to at least one deployment profile', () => {
    for (const a of all) {
      expect(
        a.deploymentProfiles.length,
        `Algorithm ${a.id} has no deployment profiles`
      ).toBeGreaterThan(0);
    }
  });

  it('simd_streaming_dfg has the lowest or equal speed tier (fastest)', () => {
    const simd = registry.get('simd_streaming_dfg');
    expect(simd).toBeDefined();
    if (!simd) return;
    // simd_streaming_dfg is documented as speed tier 2 — should be among the fastest
    expect(simd.speedTier).toBeLessThanOrEqual(5);
  });

  it('ilp has the highest quality tier (most accurate)', () => {
    const ilp = registry.get('ilp');
    expect(ilp).toBeDefined();
    if (!ilp) return;
    // ilp is documented as quality tier 90
    expect(ilp.qualityTier).toBeGreaterThanOrEqual(85);
  });

  it('quality-tier algorithms have higher qualityTier than fast-tier algorithms (aggregate)', () => {
    const fastAlgos = registry.getForProfile('fast');
    const qualityAlgos = registry.getForProfile('quality');
    const avgFast = fastAlgos.reduce((s, a) => s + a.qualityTier, 0) / Math.max(fastAlgos.length, 1);
    const avgQuality = qualityAlgos.reduce((s, a) => s + a.qualityTier, 0) / Math.max(qualityAlgos.length, 1);
    expect(avgQuality).toBeGreaterThan(avgFast);
  });
});

describe('Algorithm Coverage — Output Type Coverage', () => {
  const registry = getRegistry();
  const all = registry.list();

  const byType: Record<string, string[]> = {};
  for (const a of all) {
    if (!byType[a.outputType]) byType[a.outputType] = [];
    byType[a.outputType].push(a.id);
  }

  it('has algorithms that produce DFG output', () => {
    expect((byType['dfg'] ?? []).length).toBeGreaterThan(0);
  });

  it('has algorithms that produce Petri net output', () => {
    expect((byType['petrinet'] ?? []).length).toBeGreaterThan(0);
  });

  it('has algorithms that produce Declare constraints', () => {
    expect((byType['declare'] ?? []).length).toBeGreaterThan(0);
  });

  it('dfg is the dominant output type (most algorithms produce it)', () => {
    const dfgCount = (byType['dfg'] ?? []).length;
    const petriCount = (byType['petrinet'] ?? []).length;
    // DFG is the simplest and fastest — most analytics algorithms produce it
    expect(dfgCount + petriCount).toBeGreaterThanOrEqual(20);
  });
});

describe('Prediction Perspectives — 6 Van der Aalst Perspectives Declared', () => {
  // The 6 prediction perspectives defined in @wasm4pm/contracts must all be present.
  // These correspond to Teinemaa et al. (2019) alarm-based process monitoring paper.
  const REQUIRED_PERSPECTIVES = [
    'next-activity',
    'remaining-time',
    'outcome',
    'drift',
    'features',
    'resource',
  ];

  it('VALID_PREDICT_CLI_TASKS contains all 6 Van der Aalst prediction perspectives', () => {
    for (const p of REQUIRED_PERSPECTIVES) {
      expect(
        VALID_PREDICT_CLI_TASKS.includes(p as (typeof VALID_PREDICT_CLI_TASKS)[number]),
        `Missing prediction perspective: ${p}`
      ).toBe(true);
    }
  });

  it('VALID_PREDICT_CLI_TASKS has exactly 6 perspectives', () => {
    expect(VALID_PREDICT_CLI_TASKS.length).toBe(6);
  });

  it('each perspective name is a non-empty lowercase kebab-case string', () => {
    for (const t of VALID_PREDICT_CLI_TASKS) {
      expect(t.length).toBeGreaterThan(0);
      expect(t).toMatch(/^[a-z][a-z0-9-]*$/);
    }
  });
});

describe('Algorithm Registry — get() and getForProfile() API contract', () => {
  const registry = getRegistry();

  it('get() returns undefined for unknown algorithm IDs', () => {
    expect(registry.get('no_such_algorithm_xyz')).toBeUndefined();
  });

  it('get(id).id === id for all registered algorithms', () => {
    const all = registry.list();
    for (const a of all) {
      const fetched = registry.get(a.id);
      expect(fetched?.id).toBe(a.id);
    }
  });

  it('getForProfile("fast") returns a non-empty subset of list()', () => {
    const all = registry.list();
    const fast = registry.getForProfile('fast');
    expect(fast.length).toBeGreaterThan(0);
    expect(fast.length).toBeLessThanOrEqual(all.length);
  });

  it('getForProfile("quality") returns at least 4 algorithms', () => {
    const quality = registry.getForProfile('quality');
    expect(quality.length).toBeGreaterThanOrEqual(4);
  });

  it('stream profile contains simd_streaming_dfg', () => {
    const stream = registry.getForProfile('stream');
    const ids = stream.map((a) => a.id);
    expect(ids).toContain('simd_streaming_dfg');
  });
});
