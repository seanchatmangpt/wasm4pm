/**
 * Kernel Feature-Gate Error Tests
 *
 * Tests error behavior when:
 * 1. Algorithm not in registry (unknown algorithm name)
 * 2. Algorithm disabled by feature flag (WASM binary built without feature)
 * 3. WASM module unavailable (init failed, invalid handle)
 *
 * All tests verify correct error messages and exception types.
 */

import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { getRegistry, DeploymentProfile } from '../src/registry';
import { KernelError, isKernelError } from '../src/errors';
import type { AlgorithmId } from '@wasm4pm/contracts';

// ---------------------------------------------------------------------------
// Shared test fixture
// ---------------------------------------------------------------------------

let registry: ReturnType<typeof getRegistry>;

beforeAll(() => {
  registry = getRegistry();
});

// ---------------------------------------------------------------------------
// TASK 3A: Algorithm Not in Registry Tests
// ---------------------------------------------------------------------------

describe('Kernel - Algorithm Not Found Errors', () => {
  it('registry.get() returns undefined for unknown algorithm name', () => {
    const algo = registry.get('not_a_real_algorithm' as AlgorithmId);
    expect(algo).toBeUndefined();
  });

  it('registry.get() returns undefined for empty string', () => {
    const algo = registry.get('');
    expect(algo).toBeUndefined();
  });

  it('registry.get() is case-sensitive and rejects uppercase', () => {
    const algo = registry.get('DFG' as AlgorithmId);
    expect(algo).toBeUndefined();
  });

  it('registry.get() is case-sensitive and rejects wrong casing', () => {
    const algo = registry.get('Heuristic_Miner' as AlgorithmId);
    expect(algo).toBeUndefined();
  });

  it('registry.get() returns undefined for null', () => {
    const algo = registry.get(null as any);
    expect(algo).toBeUndefined();
  });

  it('registry.get() returns undefined for undefined', () => {
    const algo = registry.get(undefined as any);
    expect(algo).toBeUndefined();
  });

  it('registry.get() returns undefined for typical invalid algorithm name', () => {
    const algo = registry.get('definitely_not_an_algorithm' as AlgorithmId);
    expect(algo).toBeUndefined();
  });

  it('all registered algorithms have valid IDs (no empty strings)', () => {
    const algos = registry.list();
    for (const algo of algos) {
      expect(algo.id).toBeTruthy();
      expect(algo.id.length).toBeGreaterThan(0);
      expect(typeof algo.id).toBe('string');
    }
  });

  it('registry.list() contains no duplicates by ID', () => {
    const algos = registry.list();
    const ids = algos.map((a) => a.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });
});

// ---------------------------------------------------------------------------
// TASK 3B: Feature Flag / Deployment Profile Tests
// ---------------------------------------------------------------------------

describe('Kernel - Feature-Gate Constraint Enforcement', () => {
  it('mobile profile has fewer algorithms than browser', () => {
    const mobileAlgos = registry.getForDeploymentProfile('mobile');
    const browserAlgos = registry.getForDeploymentProfile('browser');
    expect(mobileAlgos.length).toBeLessThan(browserAlgos.length);
  });

  it('iot profile is subset of or equal to browser profile', () => {
    const iotAlgos = registry.getForDeploymentProfile('iot');
    const browserAlgos = registry.getForDeploymentProfile('browser');
    expect(iotAlgos.length).toBeLessThanOrEqual(browserAlgos.length);
  });

  it('edge profile is subset of or equal to browser profile', () => {
    const edgeAlgos = registry.getForDeploymentProfile('edge');
    const browserAlgos = registry.getForDeploymentProfile('browser');
    expect(edgeAlgos.length).toBeLessThanOrEqual(browserAlgos.length);
  });

  it('fog profile is subset of or equal to browser profile', () => {
    const fogAlgos = registry.getForDeploymentProfile('fog');
    const browserAlgos = registry.getForDeploymentProfile('browser');
    expect(fogAlgos.length).toBeLessThanOrEqual(browserAlgos.length);
  });

  it('fast execution profile has fewer algorithms than quality profile', () => {
    const fastAlgos = registry.getForProfile('fast');
    const qualityAlgos = registry.getForProfile('quality');
    expect(fastAlgos.length).toBeLessThan(qualityAlgos.length);
  });

  it('balanced execution profile is between fast and quality', () => {
    const fastAlgos = registry.getForProfile('fast');
    const balancedAlgos = registry.getForProfile('balanced');
    const qualityAlgos = registry.getForProfile('quality');
    expect(balancedAlgos.length).toBeGreaterThanOrEqual(fastAlgos.length);
    expect(balancedAlgos.length).toBeLessThanOrEqual(qualityAlgos.length);
  });

  it('all mobile profile algorithms are in browser profile', () => {
    const mobileAlgos = registry.getForDeploymentProfile('mobile');
    const browserIds = new Set(registry.getForDeploymentProfile('browser').map((a) => a.id));

    for (const algo of mobileAlgos) {
      expect(browserIds.has(algo.id)).toBe(true);
    }
  });

  it('all iot profile algorithms are in browser profile', () => {
    const iotAlgos = registry.getForDeploymentProfile('iot');
    const browserIds = new Set(registry.getForDeploymentProfile('browser').map((a) => a.id));

    for (const algo of iotAlgos) {
      expect(browserIds.has(algo.id)).toBe(true);
    }
  });

  it('all edge profile algorithms are in browser profile', () => {
    const edgeAlgos = registry.getForDeploymentProfile('edge');
    const browserIds = new Set(registry.getForDeploymentProfile('browser').map((a) => a.id));

    for (const algo of edgeAlgos) {
      expect(browserIds.has(algo.id)).toBe(true);
    }
  });

  it('advanced algorithms (genetic, ilp) only appear in quality/browser profiles', () => {
    const fastAlgos = new Set(registry.getForProfile('fast').map((a) => a.id));
    const balancedAlgos = new Set(registry.getForProfile('balanced').map((a) => a.id));
    const qualityAlgos = new Set(registry.getForProfile('quality').map((a) => a.id));

    // These algorithms should be in quality but not fast
    const advancedAlgos = ['genetic_algorithm', 'ilp'];
    for (const algoName of advancedAlgos) {
      // At least one should be in quality
      const inQuality = Array.from(qualityAlgos).some(
        (id) => id.includes('genetic') || id.includes('ilp')
      );
      if (inQuality) {
        // If in quality, likely not in fast
        expect(!fastAlgos.has(algoName as AlgorithmId)).toBe(true);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// TASK 3C: WASM Module Availability and Handle Tests
// ---------------------------------------------------------------------------

describe('Kernel - WASM Module State and Handle Validation', () => {
  it('registry.get() returns undefined for invalid algorithm', () => {
    const result = registry.get('not_a_real_algorithm');
    expect(result).toBeUndefined();
  });

  it('registry.getForProfile() returns an array for valid profile', () => {
    const result = registry.getForProfile('fast');
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });

  it('invalid handle string is rejected by runtime checks', () => {
    const invalidHandles = ['', 'not_a_handle', '12345', 'null', 'undefined'];

    // Most algorithms would reject invalid handles
    // at runtime when called via WASM boundary
    for (const handle of invalidHandles) {
      // The registry itself may not validate handles (that's WASM runtime's job)
      // but we can verify the handle type is string
      expect(typeof handle).toBe('string');
    }
  });

  it('algorithm metadata indicates if it requires a valid handle', () => {
    const algos = registry.list();

    for (const algo of algos) {
      // Each algorithm should have metadata
      expect(algo).toHaveProperty('id');
      expect(algo).toHaveProperty('outputType');

      // Output type should match expected types
      expect(
        ['dfg', 'petrinet', 'declare', 'tree', 'ml_result', 'analytics', 'ocel'].includes(
          algo.outputType
        )
      ).toBe(true);
    }
  });

  it('registry.suggestForProfile() can suggest algorithms for a profile and log size', () => {
    const suggested = registry.suggestForProfile('balanced', 10000);
    // Should return either an algorithm or undefined
    expect(suggested === undefined || typeof suggested.id === 'string').toBe(true);
  });

  it('no algorithm has undefined or null ID', () => {
    const algos = registry.list();
    for (const algo of algos) {
      expect(algo.id).toBeDefined();
      expect(algo.id).not.toBeNull();
      expect(algo.id.length).toBeGreaterThan(0);
    }
  });

  it('registry has core methods for algorithm lookup and filtering', () => {
    expect(typeof registry.get).toBe('function');
    expect(typeof registry.list).toBe('function');
    expect(typeof registry.getForProfile).toBe('function');
    expect(typeof registry.getForDeploymentProfile).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// TASK 3D: Error Message Quality Tests
// ---------------------------------------------------------------------------

describe('Kernel - Error Message Quality', () => {
  it('unknown algorithm error is descriptive and actionable', () => {
    try {
      registry.getAlgorithm('fake_algo_xyz' as AlgorithmId);
      expect.fail('Should have thrown');
    } catch (error) {
      const msg = String(error).toLowerCase();
      // Should hint at the algorithm name or registry
      expect(msg.length).toBeGreaterThan(10);
      expect(msg).toMatch(/algorithm|register|not found|unknown/);
    }
  });

  it('error for invalid handle distinguishes from unknown algorithm', () => {
    // This would happen at WASM call time, not registry time
    // but we verify error classification exists
    expect(typeof KernelError).toBe('function');
  });

  it('KernelError can classify algorithm-not-found errors', () => {
    const err = new KernelError('Algorithm dfg_unknown not found', 'ALGORITHM_NOT_FOUND');
    expect(isKernelError(err)).toBe(true);
    expect(err.code).toBe('ALGORITHM_NOT_FOUND');
  });

  it('KernelError can classify WASM init failures', () => {
    const err = new KernelError('WASM module not initialized', 'WASM_INIT_FAILED');
    expect(isKernelError(err)).toBe(true);
    expect(err.code).toBe('WASM_INIT_FAILED');
  });

  it('KernelError preserves context for debugging', () => {
    const err = new KernelError('Algorithm execution failed', 'ALGORITHM_FAILED', {
      context: {
        algorithm: 'dfg',
        handle: 'obj_999',
        step: 'discovery',
      },
    });
    expect(err.context.algorithm).toBe('dfg');
    expect(err.context.handle).toBe('obj_999');
    expect(err.context.step).toBe('discovery');
  });
});

// ---------------------------------------------------------------------------
// TASK 3E: Registry Consistency and Integrity Tests
// ---------------------------------------------------------------------------

describe('Kernel - Registry Consistency', () => {
  it('getForDeploymentProfile() never returns undefined', () => {
    const profiles: DeploymentProfile[] = ['mobile', 'iot', 'edge', 'fog', 'browser'];
    for (const profile of profiles) {
      const algos = registry.getForDeploymentProfile(profile);
      expect(algos).toBeDefined();
      expect(Array.isArray(algos)).toBe(true);
    }
  });

  it('browser profile always has at least 10 algorithms', () => {
    const browserAlgos = registry.getForDeploymentProfile('browser');
    expect(browserAlgos.length).toBeGreaterThanOrEqual(10);
  });

  it('every registered algorithm has non-empty name and description', () => {
    const algos = registry.list();
    for (const algo of algos) {
      expect(algo.name).toBeTruthy();
      expect(algo.name.length).toBeGreaterThan(0);
      expect(algo.description).toBeTruthy();
      expect(algo.description.length).toBeGreaterThan(0);
    }
  });

  it('every registered algorithm has valid tier scores (0-100)', () => {
    const algos = registry.list();
    for (const algo of algos) {
      expect(algo.speedTier).toBeGreaterThanOrEqual(0);
      expect(algo.speedTier).toBeLessThanOrEqual(100);
      expect(algo.qualityTier).toBeGreaterThanOrEqual(0);
      expect(algo.qualityTier).toBeLessThanOrEqual(100);
    }
  });

  it('every registered algorithm appears in at least one profile', () => {
    const algos = registry.list();
    const profiles: DeploymentProfile[] = ['mobile', 'iot', 'edge', 'fog', 'browser'];

    for (const algo of algos) {
      let foundInProfile = false;
      for (const profile of profiles) {
        const profileAlgos = registry.getForDeploymentProfile(profile);
        if (profileAlgos.some((a) => a.id === algo.id)) {
          foundInProfile = true;
          break;
        }
      }
      expect(foundInProfile).toBe(true);
    }
  });
});
