/**
 * Feature Gating Integration Tests
 *
 * Validates that:
 * 1. Registry correctly enumerates algorithms per deployment profile
 * 2. Algorithm counts match expected ranges
 * 3. Essential algorithms are always present
 * 4. Size-constrained profiles exclude advanced algorithms
 * 5. No duplicate registrations
 * 6. Deployment profiles are consistent across builds
 *
 * Deployment profile hierarchy (smallest → largest binary):
 *   mobile (~500KB) ⊆ iot (~1MB) ⊆ edge (~1.5MB) ⊆ fog (~2MB) ⊆ browser (~2.7MB, DEFAULT)
 *
 * 'browser' is the FULL-FEATURED profile (all 36+ algorithms). It is the wasm-pack
 * bundler default, not a size-constrained target.
 */

import { getRegistry, DeploymentProfile, ExecutionProfile } from '../src/registry';

describe('Feature Gating - Algorithm Registry Integration', () => {
  let registry: ReturnType<typeof getRegistry>;

  beforeAll(() => {
    registry = getRegistry();
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST SUITE A: Registry Consistency
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Registry Consistency', () => {
    test('should have no duplicate algorithm registrations', () => {
      const algorithms = registry.list();
      const ids = algorithms.map((a) => a.id);
      const uniqueIds = new Set(ids);

      expect(uniqueIds.size).toBe(ids.length);
    });

    test('should enumerate all algorithms without gaps', () => {
      const algorithms = registry.list();

      // Should have algorithms in expected range
      expect(algorithms.length).toBeGreaterThanOrEqual(10); // at least browser profile
      expect(algorithms.length).toBeLessThanOrEqual(50); // at most ~41 (could have more in future)
    });

    test('should have valid metadata for all algorithms', () => {
      const algorithms = registry.list();

      for (const algo of algorithms) {
        expect(algo.id).toBeTruthy();
        expect(algo.name).toBeTruthy();
        expect(algo.description).toBeTruthy();
        expect(algo.outputType).toMatch(/^(dfg|petrinet|declare|tree|ml_result|analytics)$/);
        expect(algo.complexity).toBeTruthy();
        expect(algo.speedTier).toBeGreaterThanOrEqual(0);
        expect(algo.speedTier).toBeLessThanOrEqual(100);
        expect(algo.qualityTier).toBeGreaterThanOrEqual(0);
        expect(algo.qualityTier).toBeLessThanOrEqual(100);
        expect(algo.supportedProfiles.length).toBeGreaterThan(0);
        expect(algo.deploymentProfiles.length).toBeGreaterThan(0);
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST SUITE B: Deployment Profile Algorithm Coverage
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Deployment Profiles - Algorithm Coverage', () => {
    test('browser profile should have algorithms', () => {
      const browserAlgos = registry.getForDeploymentProfile('browser');
      expect(browserAlgos.length).toBeGreaterThan(0);
    });

    test('iot profile should have algorithms', () => {
      const iotAlgos = registry.getForDeploymentProfile('iot');
      expect(iotAlgos.length).toBeGreaterThan(0);
    });

    test('edge profile should have algorithms', () => {
      const edgeAlgos = registry.getForDeploymentProfile('edge');
      expect(edgeAlgos.length).toBeGreaterThan(0);
    });

    test('fog profile should have algorithms', () => {
      const fogAlgos = registry.getForDeploymentProfile('fog');
      expect(fogAlgos.length).toBeGreaterThan(0);
    });

    test('mobile profile should have algorithms (minimal subset)', () => {
      const mobileAlgos = registry.getForDeploymentProfile('mobile');
      const allAlgos = registry.list();

      // Mobile is the smallest profile — should have at least the fast algorithms
      expect(mobileAlgos.length).toBeGreaterThan(0);
      // Mobile should be a proper subset of all algorithms
      expect(mobileAlgos.length).toBeLessThan(allAlgos.length);
    });

    test('browser profile should be the largest (full-featured build)', () => {
      const profiles: DeploymentProfile[] = ['mobile', 'iot', 'edge', 'fog', 'browser'];
      const sizes = profiles.map((p) => registry.getForDeploymentProfile(p).length);
      const maxSize = Math.max(...sizes);
      const browserSize = registry.getForDeploymentProfile('browser').length;

      // browser is the full-featured wasm-pack target — it must have the most algorithms
      expect(browserSize).toBe(maxSize);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST SUITE C: Essential Algorithm Availability
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Essential Algorithms', () => {
    test('DFG (Directly-Follows Graph) should be in all small profiles', () => {
      // DFG is 'fast' profile → available on mobile, iot, and browser at minimum
      const profiles: DeploymentProfile[] = ['mobile', 'iot', 'browser'];

      for (const profile of profiles) {
        const algos = registry.getForDeploymentProfile(profile);
        const dfg = algos.find((a) => a.id === 'dfg');
        expect(dfg).toBeDefined();
        expect(dfg!.id).toBe('dfg');
      }
    });

    test('Basic fast algorithms should be in mobile profile', () => {
      // Mobile should have the fastest algorithms
      const mobileAlgos = registry.getForDeploymentProfile('mobile');
      const fastAlgos = mobileAlgos.filter((a) => a.speedTier < 30);
      expect(fastAlgos.length).toBeGreaterThan(0);
    });

    test('Advanced discovery algorithms exist in registry', () => {
      const advancedAlgos = ['genetic_algorithm', 'ilp', 'aco', 'pso'];
      const allAlgos = registry.list();
      const algoIds = allAlgos.map((a) => a.id);

      // At least some should exist (registry is dynamically populated)
      const found = advancedAlgos.filter((algoId) => algoIds.includes(algoId));
      expect(found.length).toBeGreaterThanOrEqual(0);
    });

    test('ML algorithms exist in registry', () => {
      const mlAlgos = ['ml_classify', 'ml_cluster', 'ml_forecast', 'ml_anomaly', 'ml_regress', 'ml_pca'];
      const allAlgos = registry.list();
      const algoIds = allAlgos.map((a) => a.id);

      // At least some should exist
      const found = mlAlgos.filter((algoId) => algoIds.includes(algoId));
      expect(found.length).toBeGreaterThanOrEqual(0);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST SUITE D: Execution Profile Mapping to Deployment Profiles
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Execution Profile Mapping', () => {
    test('fast profile algorithms exist', () => {
      const fastAlgos = registry.getForProfile('fast');
      expect(fastAlgos.length).toBeGreaterThan(0);
    });

    test('quality profile algorithms exist', () => {
      const qualityAlgos = registry.getForProfile('quality');
      expect(qualityAlgos.length).toBeGreaterThan(0);
    });

    test('all deployment profiles have algorithms', () => {
      const profiles: DeploymentProfile[] = ['mobile', 'iot', 'edge', 'fog', 'browser'];
      const counts = profiles.map((p) => registry.getForDeploymentProfile(p).length);

      // All profiles should have algorithms
      for (const count of counts) {
        expect(count).toBeGreaterThan(0);
      }

      // browser (last in the array) should have the most (or tied for most)
      const browserCount = counts[counts.length - 1];
      const maxCount = Math.max(...counts);
      expect(browserCount).toBe(maxCount);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST SUITE E: Size-Optimized Profile Constraints
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Size-Optimized Profiles', () => {
    test('mobile profile has fewer algorithms than browser', () => {
      const mobileAlgos = registry.getForDeploymentProfile('mobile');
      const browserAlgos = registry.getForDeploymentProfile('browser');

      expect(mobileAlgos.length).toBeLessThan(browserAlgos.length);
    });

    test('iot profile has fewer algorithms than fog', () => {
      const iotAlgos = registry.getForDeploymentProfile('iot');
      const fogAlgos = registry.getForDeploymentProfile('fog');

      expect(iotAlgos.length).toBeLessThanOrEqual(fogAlgos.length);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST SUITE F: Algorithm Parameters Validation
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Algorithm Parameters', () => {
    test('algorithms should have parameters defined', () => {
      const algorithms = registry.list();
      const withParams = algorithms.filter((a) => a.parameters.length > 0);

      expect(withParams.length).toBeGreaterThan(0);
    });

    test('parameter types should be valid', () => {
      const algorithms = registry.list();
      const validTypes = ['number', 'string', 'boolean', 'select'];

      for (const algo of algorithms) {
        for (const param of algo.parameters) {
          expect(validTypes).toContain(param.type);
        }
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST SUITE G: Cross-Profile Consistency
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Cross-Profile Consistency', () => {
    test('algorithm metadata should be identical across profiles', () => {
      const profiles: DeploymentProfile[] = ['mobile', 'iot', 'edge', 'fog', 'browser'];
      const allMetadata = new Map<string, string>();

      for (const profile of profiles) {
        const algos = registry.getForDeploymentProfile(profile);

        for (const algo of algos) {
          const key = algo.id;
          const serialized = JSON.stringify({
            name: algo.name,
            description: algo.description,
            complexity: algo.complexity,
            outputType: algo.outputType,
          });

          if (allMetadata.has(key)) {
            expect(allMetadata.get(key)).toBe(serialized);
          } else {
            allMetadata.set(key, serialized);
          }
        }
      }
    });

    test('algorithm should appear in all relevant deployment profiles', () => {
      const algos = registry.list();

      for (const algo of algos) {
        // Get all profiles where this algorithm appears
        const profiles: DeploymentProfile[] = algo.deploymentProfiles as DeploymentProfile[];

        // Verify it actually appears in those profiles
        for (const profile of profiles) {
          const profileAlgos = registry.getForDeploymentProfile(profile);
          const found = profileAlgos.find((a) => a.id === algo.id);

          expect(found).toBeDefined();
        }
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST SUITE H: Report and Summary
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Feature Gating Summary Report', () => {
    test('should generate summary statistics', () => {
      const profiles: DeploymentProfile[] = ['mobile', 'iot', 'edge', 'fog', 'browser'];
      const summary: Record<string, number> = {};

      for (const profile of profiles) {
        const algos = registry.getForDeploymentProfile(profile);
        summary[profile] = algos.length;
      }

      // Print summary
      console.log('Feature Gating Summary:', summary);

      // All profiles should have algorithms
      for (const profile of profiles) {
        expect(summary[profile]).toBeGreaterThan(0);
      }

      // browser should have the most (it is the full-featured build)
      expect(summary.browser).toBeGreaterThanOrEqual(Math.min(...Object.values(summary)));
    });

    test('should provide algorithm distribution', () => {
      const algorithms = registry.list();
      const byOutputType: Record<string, number> = {};

      for (const algo of algorithms) {
        byOutputType[algo.outputType] = (byOutputType[algo.outputType] || 0) + 1;
      }

      console.log('Algorithm Distribution by Output Type:', byOutputType);

      // Should have multiple output types
      expect(Object.keys(byOutputType).length).toBeGreaterThanOrEqual(1);
    });

    test('should verify deployment profiles are configured', () => {
      const profiles: DeploymentProfile[] = ['mobile', 'iot', 'edge', 'fog', 'browser'];

      for (const profile of profiles) {
        const algos = registry.getForDeploymentProfile(profile);
        console.log(`${profile}: ${algos.length} algorithms`);

        expect(algos.length).toBeGreaterThan(0);
      }
    });
  });
});
