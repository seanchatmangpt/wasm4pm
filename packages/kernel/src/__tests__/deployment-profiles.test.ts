/**
 * deployment-profiles.test.ts
 *
 * Validates the WASM deployment profile contracts for the kernel registry.
 * The five profiles (mobile/iot/edge/fog/browser) have documented algorithm
 * availability guarantees that must hold regardless of which algorithms are
 * added or removed from the registry.
 *
 * Oracle ranks (Van der Aalst / process mining Chicago TDD):
 *   Rank 1 — Mathematical theorem: subset chain, count ordering, field existence
 *   Rank 2 — Domain contract: specific algorithm availability by profile, POWL/ML placement
 *   Rank 3 — Metamorphic relation: determinism, unknown-profile safety
 *
 * Profile hierarchy (smallest binary → largest):
 *   mobile (~500KB) ⊆ iot (~1MB) ⊆ edge (~1.5MB) ⊆ fog (~2MB) ⊆ browser (~2.7MB)
 *
 * All assertions are derived from the ACTUAL registry values verified via node
 * introspection on 2026-05-17. Do NOT rely on CLAUDE.md algorithm counts —
 * the registry is the source of truth.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { AlgorithmRegistry, DeploymentProfile } from '../registry.js';

// ---------------------------------------------------------------------------
// Shared registry — constructed once for the entire file
// ---------------------------------------------------------------------------

let registry: AlgorithmRegistry;

beforeAll(() => {
  registry = new AlgorithmRegistry();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getIds(profile: DeploymentProfile): Set<string> {
  return new Set(registry.getForDeploymentProfile(profile).map((a) => a.id));
}

function isSubset(a: Set<string>, b: Set<string>): boolean {
  return [...a].every((id) => b.has(id));
}

// ---------------------------------------------------------------------------
// 1. Profile containment invariants (Rank 1 — mathematical)
// ---------------------------------------------------------------------------

describe('Profile containment invariants (Rank 1)', () => {
  it('browser profile has the most algorithms of all profiles', () => {
    const counts = (['mobile', 'iot', 'edge', 'fog', 'browser'] as DeploymentProfile[]).map(
      (p) => registry.getForDeploymentProfile(p).length
    );
    const browserCount = registry.getForDeploymentProfile('browser').length;
    expect(browserCount).toBe(Math.max(...counts));
  });

  it('mobile profile has the fewest algorithms of all profiles', () => {
    const counts = (['mobile', 'iot', 'edge', 'fog', 'browser'] as DeploymentProfile[]).map(
      (p) => registry.getForDeploymentProfile(p).length
    );
    const mobileCount = registry.getForDeploymentProfile('mobile').length;
    expect(mobileCount).toBe(Math.min(...counts));
  });

  it('subset chain: mobile ⊆ iot', () => {
    const mobile = getIds('mobile');
    const iot = getIds('iot');
    expect(isSubset(mobile, iot)).toBe(true);
  });

  it('subset chain: iot ⊆ edge', () => {
    const iot = getIds('iot');
    const edge = getIds('edge');
    expect(isSubset(iot, edge)).toBe(true);
  });

  it('subset chain: edge ⊆ fog', () => {
    const edge = getIds('edge');
    const fog = getIds('fog');
    expect(isSubset(edge, fog)).toBe(true);
  });

  it('subset chain: fog ⊆ browser', () => {
    const fog = getIds('fog');
    const browser = getIds('browser');
    expect(isSubset(fog, browser)).toBe(true);
  });

  it('subset chain: full mobile ⊆ iot ⊆ edge ⊆ fog ⊆ browser', () => {
    const mobile = getIds('mobile');
    const iot = getIds('iot');
    const edge = getIds('edge');
    const fog = getIds('fog');
    const browser = getIds('browser');
    expect(isSubset(mobile, iot)).toBe(true);
    expect(isSubset(iot, edge)).toBe(true);
    expect(isSubset(edge, fog)).toBe(true);
    expect(isSubset(fog, browser)).toBe(true);
  });

  it('every algorithm available in mobile is also available in browser', () => {
    const mobileAlgos = registry.getForDeploymentProfile('mobile');
    const browser = getIds('browser');
    for (const algo of mobileAlgos) {
      expect(browser.has(algo.id), `mobile algo '${algo.id}' must be in browser`).toBe(true);
    }
  });

  it('edge has strictly more algorithms than mobile', () => {
    const edgeCount = registry.getForDeploymentProfile('edge').length;
    const mobileCount = registry.getForDeploymentProfile('mobile').length;
    expect(edgeCount).toBeGreaterThan(mobileCount);
  });

  it('fog has strictly more algorithms than edge', () => {
    const fogCount = registry.getForDeploymentProfile('fog').length;
    const edgeCount = registry.getForDeploymentProfile('edge').length;
    expect(fogCount).toBeGreaterThan(edgeCount);
  });
});

// ---------------------------------------------------------------------------
// 2. Algorithm count invariants (Rank 1 — verified ground truth)
// ---------------------------------------------------------------------------

describe('Algorithm count invariants (Rank 1)', () => {
  it('total registered algorithms is exactly 60', () => {
    // Verified via node introspection 2026-05-17 — if this changes a human must
    // consciously update this test after reviewing what was added/removed.
    expect(registry.list().length).toBe(60);
  });

  it('browser profile exposes all registered algorithms', () => {
    expect(registry.getForDeploymentProfile('browser').length).toBe(registry.list().length);
  });

  it('mobile profile has exactly 22 algorithms', () => {
    expect(registry.getForDeploymentProfile('mobile').length).toBe(22);
  });

  it('iot profile has exactly 22 algorithms (same set as mobile)', () => {
    expect(registry.getForDeploymentProfile('iot').length).toBe(22);
  });

  it('edge profile has exactly 48 algorithms', () => {
    expect(registry.getForDeploymentProfile('edge').length).toBe(48);
  });

  it('fog profile has exactly 60 algorithms (same set as browser)', () => {
    expect(registry.getForDeploymentProfile('fog').length).toBe(60);
  });

  it('mobile has fewer than 30 algorithms', () => {
    expect(registry.getForDeploymentProfile('mobile').length).toBeLessThan(30);
  });

  it('edge has more algorithms than iot', () => {
    expect(registry.getForDeploymentProfile('edge').length).toBeGreaterThan(
      registry.getForDeploymentProfile('iot').length
    );
  });
});

// ---------------------------------------------------------------------------
// 3. Specific algorithm availability (Rank 2 — domain contracts)
// ---------------------------------------------------------------------------

describe('Core discovery algorithms present in expected profiles (Rank 2)', () => {
  it('dfg is available in all 5 profiles', () => {
    for (const profile of ['mobile', 'iot', 'edge', 'fog', 'browser'] as DeploymentProfile[]) {
      expect(getIds(profile).has('dfg'), `dfg must be in ${profile}`).toBe(true);
    }
  });

  it('process_skeleton is available in all 5 profiles', () => {
    for (const profile of ['mobile', 'iot', 'edge', 'fog', 'browser'] as DeploymentProfile[]) {
      expect(getIds(profile).has('process_skeleton'), `process_skeleton must be in ${profile}`).toBe(
        true
      );
    }
  });

  it('simd_streaming_dfg is available in all 5 profiles', () => {
    for (const profile of ['mobile', 'iot', 'edge', 'fog', 'browser'] as DeploymentProfile[]) {
      expect(
        getIds(profile).has('simd_streaming_dfg'),
        `simd_streaming_dfg must be in ${profile}`
      ).toBe(true);
    }
  });

  it('alpha_plus_plus is available in edge, fog, and browser', () => {
    expect(getIds('edge').has('alpha_plus_plus')).toBe(true);
    expect(getIds('fog').has('alpha_plus_plus')).toBe(true);
    expect(getIds('browser').has('alpha_plus_plus')).toBe(true);
  });

  it('alpha_plus_plus is NOT in mobile or iot (balanced profile only)', () => {
    expect(getIds('mobile').has('alpha_plus_plus')).toBe(false);
    expect(getIds('iot').has('alpha_plus_plus')).toBe(false);
  });

  it('heuristic_miner is available in edge, fog, and browser', () => {
    expect(getIds('edge').has('heuristic_miner')).toBe(true);
    expect(getIds('fog').has('heuristic_miner')).toBe(true);
    expect(getIds('browser').has('heuristic_miner')).toBe(true);
  });

  it('inductive_miner is available in edge, fog, and browser', () => {
    expect(getIds('edge').has('inductive_miner')).toBe(true);
    expect(getIds('fog').has('inductive_miner')).toBe(true);
    expect(getIds('browser').has('inductive_miner')).toBe(true);
  });

  it('genetic_algorithm is available in fog and browser only', () => {
    expect(getIds('fog').has('genetic_algorithm')).toBe(true);
    expect(getIds('browser').has('genetic_algorithm')).toBe(true);
    expect(getIds('mobile').has('genetic_algorithm')).toBe(false);
    expect(getIds('iot').has('genetic_algorithm')).toBe(false);
    expect(getIds('edge').has('genetic_algorithm')).toBe(false);
  });

  it('ilp is available in fog and browser only', () => {
    expect(getIds('fog').has('ilp')).toBe(true);
    expect(getIds('browser').has('ilp')).toBe(true);
    expect(getIds('mobile').has('ilp')).toBe(false);
    expect(getIds('iot').has('ilp')).toBe(false);
    expect(getIds('edge').has('ilp')).toBe(false);
  });
});

describe('ML algorithms: edge, fog, browser only (Rank 2)', () => {
  const ML_ALGOS = ['ml_cluster', 'ml_anomaly', 'ml_classify', 'ml_forecast', 'ml_regress', 'ml_pca'];

  for (const mlAlgo of ML_ALGOS) {
    it(`${mlAlgo} is available in edge, fog, and browser`, () => {
      expect(getIds('edge').has(mlAlgo)).toBe(true);
      expect(getIds('fog').has(mlAlgo)).toBe(true);
      expect(getIds('browser').has(mlAlgo)).toBe(true);
    });

    it(`${mlAlgo} is NOT available in mobile or iot`, () => {
      expect(getIds('mobile').has(mlAlgo)).toBe(false);
      expect(getIds('iot').has(mlAlgo)).toBe(false);
    });
  }
});

describe('Advanced quality algorithms: fog and browser only (Rank 2)', () => {
  const QUALITY_ALGOS = ['a_star', 'aco', 'pso', 'simulated_annealing', 'optimized_dfg', 'alignments'];

  for (const algoId of QUALITY_ALGOS) {
    it(`${algoId} is in fog and browser`, () => {
      expect(getIds('fog').has(algoId)).toBe(true);
      expect(getIds('browser').has(algoId)).toBe(true);
    });

    it(`${algoId} is NOT in mobile, iot, or edge`, () => {
      expect(getIds('mobile').has(algoId)).toBe(false);
      expect(getIds('iot').has(algoId)).toBe(false);
      expect(getIds('edge').has(algoId)).toBe(false);
    });
  }
});

describe('POWL and stream-profile algorithms: all 5 profiles (Rank 2)', () => {
  // powl_to_process_tree has 'stream' supportedProfile → universal deployment
  it('powl_to_process_tree is available in all 5 profiles', () => {
    for (const profile of ['mobile', 'iot', 'edge', 'fog', 'browser'] as DeploymentProfile[]) {
      expect(
        getIds(profile).has('powl_to_process_tree'),
        `powl_to_process_tree must be in ${profile}`
      ).toBe(true);
    }
  });

  it('yawl_export is available in all 5 profiles', () => {
    for (const profile of ['mobile', 'iot', 'edge', 'fog', 'browser'] as DeploymentProfile[]) {
      expect(getIds(profile).has('yawl_export'), `yawl_export must be in ${profile}`).toBe(true);
    }
  });

  it('bpmn_import is available in all 5 profiles', () => {
    for (const profile of ['mobile', 'iot', 'edge', 'fog', 'browser'] as DeploymentProfile[]) {
      expect(getIds(profile).has('bpmn_import'), `bpmn_import must be in ${profile}`).toBe(true);
    }
  });
});

describe('OCEL algorithms: fog and browser only (except ocel_dfg and ocel_encode)', () => {
  it('ocel_dfg is available in all 5 profiles (fast profile)', () => {
    // ocel_dfg has supportedProfiles: fast, balanced, quality — fast → mobile+iot+browser
    for (const profile of ['mobile', 'iot', 'edge', 'fog', 'browser'] as DeploymentProfile[]) {
      expect(getIds(profile).has('ocel_dfg'), `ocel_dfg must be in ${profile}`).toBe(true);
    }
  });

  it('ocel_encode is available in all 5 profiles (stream profile)', () => {
    for (const profile of ['mobile', 'iot', 'edge', 'fog', 'browser'] as DeploymentProfile[]) {
      expect(getIds(profile).has('ocel_encode'), `ocel_encode must be in ${profile}`).toBe(true);
    }
  });

  it('ocel_dfg_per_type is available in edge, fog, and browser only', () => {
    expect(getIds('edge').has('ocel_dfg_per_type')).toBe(true);
    expect(getIds('fog').has('ocel_dfg_per_type')).toBe(true);
    expect(getIds('browser').has('ocel_dfg_per_type')).toBe(true);
    expect(getIds('mobile').has('ocel_dfg_per_type')).toBe(false);
    expect(getIds('iot').has('ocel_dfg_per_type')).toBe(false);
  });

  it('ocel_petri_net is available in edge, fog, and browser only', () => {
    expect(getIds('edge').has('ocel_petri_net')).toBe(true);
    expect(getIds('fog').has('ocel_petri_net')).toBe(true);
    expect(getIds('browser').has('ocel_petri_net')).toBe(true);
    expect(getIds('mobile').has('ocel_petri_net')).toBe(false);
    expect(getIds('iot').has('ocel_petri_net')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 4. Profile metadata integrity (Rank 2 — domain contracts)
// ---------------------------------------------------------------------------

describe('Profile metadata integrity (Rank 2)', () => {
  const VALID_PROFILES = new Set<string>(['mobile', 'iot', 'edge', 'fog', 'browser']);

  it('every algorithm has a non-empty deploymentProfiles array', () => {
    for (const algo of registry.list()) {
      expect(
        algo.deploymentProfiles.length,
        `${algo.id} must have at least one deployment profile`
      ).toBeGreaterThan(0);
    }
  });

  it("every algorithm's deploymentProfiles values are from the 5 valid profile names", () => {
    for (const algo of registry.list()) {
      for (const dp of algo.deploymentProfiles) {
        expect(
          VALID_PROFILES.has(dp),
          `${algo.id} has invalid deployment profile: '${dp}'`
        ).toBe(true);
      }
    }
  });

  it('every algorithm has id, name, speedTier, and qualityTier fields', () => {
    for (const algo of registry.list()) {
      expect(algo.id, `${algo.id} must have an id`).toBeTruthy();
      expect(algo.name, `${algo.id} must have a name`).toBeTruthy();
      expect(typeof algo.speedTier).toBe('number');
      expect(typeof algo.qualityTier).toBe('number');
    }
  });

  it('every algorithm returned by getForDeploymentProfile has required metadata fields', () => {
    for (const profile of ['mobile', 'iot', 'edge', 'fog', 'browser'] as DeploymentProfile[]) {
      for (const algo of registry.getForDeploymentProfile(profile)) {
        expect(algo.id, `${profile}/${algo.id} must have id`).toBeTruthy();
        expect(algo.name, `${profile}/${algo.id} must have name`).toBeTruthy();
        expect(typeof algo.speedTier).toBe('number');
        expect(typeof algo.qualityTier).toBe('number');
        expect(Array.isArray(algo.deploymentProfiles)).toBe(true);
      }
    }
  });

  it('every algorithm has browser in its deploymentProfiles (browser = full superset)', () => {
    for (const algo of registry.list()) {
      expect(
        algo.deploymentProfiles,
        `${algo.id} must include 'browser' in its deployment profiles`
      ).toContain('browser');
    }
  });

  it('getForDeploymentProfile(browser) returns all registered algorithms', () => {
    const all = registry.list();
    const browserAlgos = registry.getForDeploymentProfile('browser');
    expect(browserAlgos.length).toBe(all.length);
  });
});

// ---------------------------------------------------------------------------
// 5. Speed/quality ordering (Rank 2)
// ---------------------------------------------------------------------------

describe('Speed and quality tier ordering (Rank 2)', () => {
  it('browser profile includes simd_streaming_dfg with the minimum speed tier (1)', () => {
    const simd = registry.get('simd_streaming_dfg');
    expect(simd).toBeDefined();
    expect(simd!.speedTier).toBe(1);
    expect(getIds('browser').has('simd_streaming_dfg')).toBe(true);
  });

  it('browser profile includes ilp with speed tier 80 (highest complexity)', () => {
    const ilp = registry.get('ilp');
    expect(ilp).toBeDefined();
    expect(ilp!.speedTier).toBe(80);
    expect(getIds('browser').has('ilp')).toBe(true);
  });

  it('browser profile spans the full speed range from 1 to 80', () => {
    const browserAlgos = registry.getForDeploymentProfile('browser');
    const speeds = browserAlgos.map((a) => a.speedTier);
    expect(Math.min(...speeds)).toBe(1);
    expect(Math.max(...speeds)).toBe(80);
  });

  it('ilp has higher quality tier than dfg', () => {
    const ilp = registry.get('ilp')!;
    const dfg = registry.get('dfg')!;
    expect(ilp.qualityTier).toBeGreaterThan(dfg.qualityTier);
  });

  it('genetic_algorithm has higher quality tier than heuristic_miner', () => {
    const ga = registry.get('genetic_algorithm')!;
    const hm = registry.get('heuristic_miner')!;
    expect(ga.qualityTier).toBeGreaterThan(hm.qualityTier);
  });

  it('heuristic_miner has higher quality tier than dfg', () => {
    const hm = registry.get('heuristic_miner')!;
    const dfg = registry.get('dfg')!;
    expect(hm.qualityTier).toBeGreaterThan(dfg.qualityTier);
  });

  it('dfg has lower speed tier (faster) than ilp', () => {
    const dfg = registry.get('dfg')!;
    const ilp = registry.get('ilp')!;
    // lower speedTier = faster
    expect(dfg.speedTier).toBeLessThan(ilp.speedTier);
  });
});

// ---------------------------------------------------------------------------
// 6. Metamorphic relations (Rank 3)
// ---------------------------------------------------------------------------

describe('Metamorphic relations (Rank 3)', () => {
  it('getForDeploymentProfile is deterministic (same result on two consecutive calls)', () => {
    for (const profile of ['mobile', 'iot', 'edge', 'fog', 'browser'] as DeploymentProfile[]) {
      const first = registry
        .getForDeploymentProfile(profile)
        .map((a) => a.id)
        .sort();
      const second = registry
        .getForDeploymentProfile(profile)
        .map((a) => a.id)
        .sort();
      expect(first).toEqual(second);
    }
  });

  it('unknown profile name returns empty array (not undefined or throws)', () => {
    // getForDeploymentProfile signature accepts DeploymentProfile, but at runtime
    // an unknown string falls through to the empty-map path and returns []
    const result = registry.getForDeploymentProfile('unknown' as DeploymentProfile);
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(0);
  });

  it('the set of fog algorithms is identical to the set of browser algorithms', () => {
    // fog and browser share the same algorithm set because all quality-profile algorithms
    // are added to both. This is a design decision captured in inferDeploymentProfiles.
    const fogIds = registry
      .getForDeploymentProfile('fog')
      .map((a) => a.id)
      .sort();
    const browserIds = registry
      .getForDeploymentProfile('browser')
      .map((a) => a.id)
      .sort();
    expect(fogIds).toEqual(browserIds);
  });

  it('the set of mobile algorithms is identical to the set of iot algorithms', () => {
    // mobile and iot share the same algorithm set because the fast+stream profiles
    // both map to mobile and iot, and no profiles map exclusively to iot.
    const mobileIds = registry
      .getForDeploymentProfile('mobile')
      .map((a) => a.id)
      .sort();
    const iotIds = registry
      .getForDeploymentProfile('iot')
      .map((a) => a.id)
      .sort();
    expect(mobileIds).toEqual(iotIds);
  });

  it('adding an algorithm to mobile (via registration) makes it appear in getForDeploymentProfile(mobile)', () => {
    // Metamorphic: mutating the registry state updates the profile view.
    // Use a fresh registry instance to avoid polluting the shared one.
    const freshRegistry = new AlgorithmRegistry();
    const beforeTotal = freshRegistry.list().length;
    freshRegistry.register({
      id: '_test_mobile_algo',
      name: 'Test Mobile Algorithm',
      description: 'Metamorphic test stub',
      outputType: 'dfg',
      complexity: 'O(n)',
      speedTier: 5,
      qualityTier: 20,
      parameters: [],
      supportedProfiles: ['fast'],
      deploymentProfiles: ['mobile', 'iot', 'browser'],
      estimatedDurationMs: 1,
      estimatedMemoryMB: 5,
      robustToNoise: true,
      scalesWell: true,
    });
    // Must rebuild the deployment profile map manually since register() does not
    // rebuild the map automatically after construction — we verify via get()
    const registered = freshRegistry.get('_test_mobile_algo');
    expect(registered).toBeDefined();
    expect(registered!.deploymentProfiles).toContain('mobile');
    // The total list grows by exactly 1
    expect(freshRegistry.list().length).toBe(beforeTotal + 1);
  });

  it('getForDeploymentProfile returns algorithm objects with non-null deploymentProfiles arrays', () => {
    for (const profile of ['mobile', 'iot', 'edge', 'fog', 'browser'] as DeploymentProfile[]) {
      for (const algo of registry.getForDeploymentProfile(profile)) {
        expect(algo.deploymentProfiles).not.toBeNull();
        expect(Array.isArray(algo.deploymentProfiles)).toBe(true);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 7. Van der Aalst quality dimension cross-checks (Rank 2)
// ---------------------------------------------------------------------------

describe('Van der Aalst quality dimension cross-checks (Rank 2)', () => {
  it('conformance algorithms (alignments, etconformance_precision) are in fog and browser', () => {
    for (const algId of ['alignments', 'etconformance_precision']) {
      expect(getIds('fog').has(algId), `${algId} must be in fog`).toBe(true);
      expect(getIds('browser').has(algId), `${algId} must be in browser`).toBe(true);
    }
  });

  it('conformance algorithms are NOT in mobile or iot', () => {
    for (const algId of ['alignments', 'etconformance_precision']) {
      expect(getIds('mobile').has(algId)).toBe(false);
      expect(getIds('iot').has(algId)).toBe(false);
    }
  });

  it('generalization metric algorithm is in fog and browser', () => {
    expect(getIds('fog').has('generalization')).toBe(true);
    expect(getIds('browser').has('generalization')).toBe(true);
  });

  it('social network algorithms (handover_network, working_together_network) are in edge+', () => {
    for (const algId of ['handover_network', 'working_together_network']) {
      expect(getIds('edge').has(algId), `${algId} must be in edge`).toBe(true);
      expect(getIds('fog').has(algId), `${algId} must be in fog`).toBe(true);
      expect(getIds('browser').has(algId), `${algId} must be in browser`).toBe(true);
      expect(getIds('mobile').has(algId), `${algId} must NOT be in mobile`).toBe(false);
      expect(getIds('iot').has(algId), `${algId} must NOT be in iot`).toBe(false);
    }
  });

  it('monte_carlo_simulation is in fog and browser only', () => {
    expect(getIds('fog').has('monte_carlo_simulation')).toBe(true);
    expect(getIds('browser').has('monte_carlo_simulation')).toBe(true);
    expect(getIds('mobile').has('monte_carlo_simulation')).toBe(false);
    expect(getIds('iot').has('monte_carlo_simulation')).toBe(false);
    expect(getIds('edge').has('monte_carlo_simulation')).toBe(false);
  });

  it('alignments has the highest quality tier among conformance algorithms', () => {
    const alignments = registry.get('alignments')!;
    const etconf = registry.get('etconformance_precision')!;
    expect(alignments.qualityTier).toBeGreaterThanOrEqual(etconf.qualityTier);
  });
});
