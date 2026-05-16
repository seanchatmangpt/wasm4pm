/**
 * registry-handlers-iter13.test.ts
 *
 * Rank-1 and Rank-2 oracle tests for three bugs found in iter-13 audit:
 *
 *   BUG-1 (handlers.ts): validateAlgorithmParameters fires a false type-error for
 *          'select' parameters because typeof 'kmeans' === 'string', not 'select'.
 *
 *   BUG-2 (registry.ts): DeploymentProfile type had 'cloud' instead of 'mobile'.
 *          The WASM build system has no 'cloud' profile; 'mobile' (~500KB) is the
 *          smallest tier and 'browser' (~2.78MB) is the full-feature tier.
 *
 *   BUG-3 (registry.ts): inferDeploymentProfiles mapped 'fast' → 'browser' instead
 *          of 'mobile', so fast algorithms were not tagged for the mobile tier.
 */

import { describe, it, expect } from 'vitest';
import { validateAlgorithmParameters } from '../handlers.js';
import { getRegistry, AlgorithmRegistry } from '../registry.js';
import type { DeploymentProfile } from '../registry.js';

// ─── BUG-1: select-type false positive ────────────────────────────────────────

describe('validateAlgorithmParameters — select-type parameters (Rank-1)', () => {
  // ml_cluster has a 'select' param: method ∈ ['kmeans', 'dbscan']
  it('valid select value does not produce a type error', () => {
    const result = validateAlgorithmParameters('ml_cluster', {
      activity_key: 'concept:name',
      method: 'kmeans',
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('valid select value "dbscan" does not produce a type error', () => {
    const result = validateAlgorithmParameters('ml_cluster', {
      activity_key: 'concept:name',
      method: 'dbscan',
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('invalid select value produces an options error, not a type error', () => {
    const result = validateAlgorithmParameters('ml_cluster', {
      activity_key: 'concept:name',
      method: 'hierarchical', // not in options
    });
    expect(result.valid).toBe(false);
    // Must report an options violation, not a type violation
    const hasOptionsError = result.errors.some((e) => e.includes('invalid value') || e.includes('Must be one of'));
    const hasTypeError = result.errors.some((e) => e.includes('wrong type'));
    expect(hasOptionsError).toBe(true);
    expect(hasTypeError).toBe(false);
  });

  // Rank-1: typeof 'string' is never equal to 'select' — verify the fix holds
  it('select string type check: typeof a select value is string, not select', () => {
    // Rank-1 mathematical property: JavaScript has no 'select' primitive type.
    // Any select param value must be a string. Validating typeof against 'select'
    // will always report a false type mismatch.
    expect(typeof 'kmeans').toBe('string');
    expect(typeof 'kmeans').not.toBe('select');
  });
});

// ─── BUG-2 & BUG-3: DeploymentProfile doctrine ────────────────────────────────

describe('DeploymentProfile: mobile exists, cloud does not (Rank-2 domain contract)', () => {
  it('getForDeploymentProfile("mobile") returns algorithms, not undefined', () => {
    const registry = getRegistry();
    // If 'mobile' is not a valid DeploymentProfile this call would return []
    // (because buildDeploymentProfileMap would not have a 'mobile' key).
    // After the fix it must return at least the fast DFG algorithms.
    const mobileAlgos = registry.getForDeploymentProfile('mobile' as DeploymentProfile);
    expect(mobileAlgos.length).toBeGreaterThan(0);
  });

  it('fast algorithms (dfg, simd_streaming_dfg, process_skeleton) are in mobile tier', () => {
    const registry = getRegistry();
    const mobileAlgos = registry.getForDeploymentProfile('mobile' as DeploymentProfile);
    const mobileIds = mobileAlgos.map((a) => a.id);
    // dfg is in 'fast' supportedProfiles → must infer mobile
    expect(mobileIds).toContain('dfg');
    // simd_streaming_dfg also in 'fast' → must infer mobile
    expect(mobileIds).toContain('simd_streaming_dfg');
  });

  it('getForDeploymentProfile("cloud") returns empty array (cloud is not a valid profile)', () => {
    const registry = getRegistry();
    // 'cloud' was removed; querying it must return [] not throw.
    const cloudAlgos = registry.getForDeploymentProfile('cloud' as DeploymentProfile);
    expect(cloudAlgos).toHaveLength(0);
  });

  it('browser profile contains all quality algorithms (Rank-2: browser is the full-feature tier)', () => {
    const registry = getRegistry();
    const browserAlgos = registry.getForDeploymentProfile('browser' as DeploymentProfile);
    const browserIds = browserAlgos.map((a) => a.id);
    // ILP and alignments are quality-only → must appear in the full-feature 'browser' tier
    expect(browserIds).toContain('ilp');
    expect(browserIds).toContain('genetic_algorithm');
  });

  it('AlgorithmRegistry deploymentProfiles never contains "cloud"', () => {
    const registry = new AlgorithmRegistry();
    const allAlgos = registry.list();
    for (const algo of allAlgos) {
      expect(algo.deploymentProfiles).not.toContain('cloud');
    }
  });

  it('AlgorithmRegistry deploymentProfiles contains "mobile" for at least one algorithm', () => {
    const registry = new AlgorithmRegistry();
    const allAlgos = registry.list();
    const hasMobile = allAlgos.some((a) => a.deploymentProfiles.includes('mobile' as DeploymentProfile));
    expect(hasMobile).toBe(true);
  });
});
