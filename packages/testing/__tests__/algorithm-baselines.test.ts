import { describe, it, expect } from 'vitest';
import {
  getBaselineFor,
  getBaselinesForAlgorithm,
  getAllAlgorithmsWithBaselines,
  validatePerformance,
  interpolateBaseline,
  formatValidationResult,
  exportBaselines,
  type AlgorithmBaseline,
  type PerformanceValidation,
} from '../src/algorithm-baselines.js';

describe('algorithm-baselines', () => {
  describe('getBaselineFor', () => {
    it('returns baseline for known algorithm and log size', () => {
      const baseline = getBaselineFor('dfg', 'small');
      expect(baseline).not.toBeNull();
      expect(baseline?.algorithm).toBe('dfg');
      expect(baseline?.logSize).toBe('small');
      expect(baseline?.eventCount).toBe(100);
      expect(baseline?.expectedFitness).toBe(0.85);
    });

    it('returns null for unknown algorithm', () => {
      const baseline = getBaselineFor('unknown_algo', 'small');
      expect(baseline).toBeNull();
    });

    it('returns null for unknown log size', () => {
      const baseline = getBaselineFor('dfg', 'unknown' as any);
      expect(baseline).toBeNull();
    });

    it('returns baselines for all three log sizes', () => {
      const small = getBaselineFor('dfg', 'small');
      const medium = getBaselineFor('dfg', 'medium');
      const large = getBaselineFor('dfg', 'large');

      expect(small).not.toBeNull();
      expect(medium).not.toBeNull();
      expect(large).not.toBeNull();

      // Fitness should generally decrease with larger logs (more complex)
      expect(small!.expectedFitness).toBeGreaterThanOrEqual(large!.expectedFitness);
    });
  });

  describe('getBaselinesForAlgorithm', () => {
    it('returns all baselines for an algorithm', () => {
      const baselines = getBaselinesForAlgorithm('dfg');
      expect(baselines.length).toBe(3); // small, medium, large
      expect(baselines.map((b) => b.logSize)).toEqual(['small', 'medium', 'large']);
    });

    it('returns empty array for unknown algorithm', () => {
      const baselines = getBaselinesForAlgorithm('unknown_algo');
      expect(baselines.length).toBe(0);
    });

    it('includes algorithms from different families', () => {
      const dfg = getBaselinesForAlgorithm('dfg');
      const mlCluster = getBaselinesForAlgorithm('ml_cluster');

      expect(dfg[0].family).toBe('discovery');
      expect(mlCluster[0].family).toBe('ml');
    });
  });

  describe('getAllAlgorithmsWithBaselines', () => {
    it('returns list of all algorithms with baselines', () => {
      const algorithms = getAllAlgorithmsWithBaselines();
      expect(algorithms.length).toBeGreaterThan(0);
      expect(algorithms).toContain('dfg');
      expect(algorithms).toContain('alpha_plus_plus');
      expect(algorithms).toContain('genetic_algorithm');
      expect(algorithms).toContain('ml_classify');
    });

    it('returns algorithms in sorted order', () => {
      const algorithms = getAllAlgorithmsWithBaselines();
      const sorted = [...algorithms].sort();
      expect(algorithms).toEqual(sorted);
    });
  });

  describe('validatePerformance', () => {
    it('passes when performance is within tolerance', () => {
      // baseline fitness: 0.85, runtime: 5ms
      // 0.84 is 1.2% below baseline, 5.1ms is 2% above baseline
      const validation = validatePerformance('dfg', 0.84, 5.1, 'small', 0.05);

      expect(validation.passed).toBe(true);
      expect(validation.warning).toBeUndefined();
      expect(validation.fitnessVariance).toBeLessThan(0.05);
      expect(validation.runtimeVariance).toBeLessThan(0.05);
    });

    it('fails when fitness degrades beyond tolerance', () => {
      // baseline is 0.85, deviation of 10%
      const validation = validatePerformance('dfg', 0.765, 5, 'small', 0.05);

      expect(validation.passed).toBe(false);
      expect(validation.warning).toBeDefined();
      expect(validation.warning).toContain('fitness degraded');
      expect(validation.fitnessVariance).toBeGreaterThan(0.05);
    });

    it('fails when runtime increases beyond tolerance', () => {
      // baseline is 5ms, +15%
      const validation = validatePerformance('dfg', 0.85, 5.8, 'small', 0.05);

      expect(validation.passed).toBe(false);
      expect(validation.warning).toBeDefined();
      expect(validation.warning).toContain('runtime variance');
    });

    it('returns null baseline for unknown algorithm', () => {
      const validation = validatePerformance('unknown_algo', 0.8, 10, 'small', 0.05);

      expect(validation.passed).toBe(false);
      expect(validation.warning).toContain("No baseline found");
      expect(validation.baselineFitness).toBe(0);
    });

    it('uses custom tolerance when provided', () => {
      // With 10% tolerance, should pass; with 5%, should fail
      const fitness = 0.805; // 5.4% below baseline 0.85

      const tolerant = validatePerformance('dfg', fitness, 5, 'small', 0.1);
      const strict = validatePerformance('dfg', fitness, 5, 'small', 0.05);

      expect(tolerant.passed).toBe(true);
      expect(strict.passed).toBe(false);
    });

    it('computes variance correctly', () => {
      const validation = validatePerformance('dfg', 0.8, 10, 'small', 1.0);

      // fitness variance: |0.8 - 0.85| / 0.85 = 0.05 / 0.85 ≈ 0.0588
      expect(validation.fitnessVariance).toBeCloseTo(0.0588, 3);

      // runtime variance: |10 - 5| / 5 = 5 / 5 = 1.0
      expect(validation.runtimeVariance).toBeCloseTo(1.0, 3);
    });
  });

  describe('interpolateBaseline', () => {
    it('interpolates between known log sizes', () => {
      const baseline = interpolateBaseline('dfg', 500); // between small (100) and medium (1000)

      expect(baseline).not.toBeNull();
      expect(baseline?.eventCount).toBe(500);
      // fitness should be between small (0.85) and medium (0.82)
      expect(baseline!.expectedFitness).toBeLessThan(0.85);
      expect(baseline!.expectedFitness).toBeGreaterThan(0.82);
    });

    it('extrapolates below smallest known size', () => {
      const baseline = interpolateBaseline('dfg', 50); // smaller than small (100)

      expect(baseline).not.toBeNull();
      expect(baseline?.eventCount).toBe(50);
      // should use small baseline as lower bound
      expect(baseline?.logSize).toBe('small');
    });

    it('extrapolates above largest known size', () => {
      const baseline = interpolateBaseline('dfg', 50000); // larger than large (10000)

      expect(baseline).not.toBeNull();
      expect(baseline?.eventCount).toBe(50000);
      expect(baseline?.logSize).toBe('large');
      // runtime should scale linearly: 100ms * (50000/10000) = 500ms
      expect(baseline?.expectedRuntimeMs).toBeCloseTo(500, 0);
    });

    it('returns null for unknown algorithm', () => {
      const baseline = interpolateBaseline('unknown_algo', 500);
      expect(baseline).toBeNull();
    });
  });

  describe('formatValidationResult', () => {
    it('formats passing result', () => {
      const validation = validatePerformance('dfg', 0.84, 5.1, 'small', 0.05);
      const formatted = formatValidationResult(validation);

      expect(formatted).toContain('✓');
      expect(formatted).toContain('within tolerance');
      expect(formatted).toContain('dfg');
    });

    it('formats failing result with details', () => {
      const validation = validatePerformance('dfg', 0.765, 15, 'small', 0.05);
      const formatted = formatValidationResult(validation);

      expect(formatted).toContain('✗');
      expect(formatted).toContain('DEGRADED');
      expect(formatted).toContain('Fitness');
      expect(formatted).toContain('Runtime');
      expect(formatted).toContain('variance');
    });

    it('includes warning when present', () => {
      const validation = validatePerformance('dfg', 0.765, 5, 'small', 0.05);
      const formatted = formatValidationResult(validation);

      expect(formatted).toContain('⚠️');
      expect(formatted).toContain('degraded');
    });
  });

  describe('exportBaselines', () => {
    it('exports all baselines', () => {
      const exported = exportBaselines();

      expect(exported.length).toBeGreaterThan(20); // We defined 30+ baselines
      expect(exported[0]).toHaveProperty('algorithm');
      expect(exported[0]).toHaveProperty('logSize');
      expect(exported[0]).toHaveProperty('expectedFitness');
    });

    it('does not modify original on export modification', () => {
      const exported1 = exportBaselines();
      const exported2 = exportBaselines();

      // Should be deep copies
      expect(exported1).not.toBe(exported2);
      expect(exported1).toEqual(exported2);
    });
  });

  describe('baseline data quality', () => {
    it('all baselines have valid fitness values', () => {
      const baselines = exportBaselines();

      baselines.forEach((baseline) => {
        expect(baseline.expectedFitness).toBeGreaterThanOrEqual(0);
        expect(baseline.expectedFitness).toBeLessThanOrEqual(1);
      });
    });

    it('all baselines have valid runtime values', () => {
      const baselines = exportBaselines();

      baselines.forEach((baseline) => {
        expect(baseline.expectedRuntimeMs).toBeGreaterThan(0);
        expect(baseline.expectedThroughputEventsPerSec).toBeGreaterThan(0);
      });
    });

    it('fitness generally degrades with larger logs', () => {
      const algorithms = ['dfg', 'alpha_plus_plus', 'heuristic_miner'];

      algorithms.forEach((algo) => {
        const small = getBaselineFor(algo, 'small');
        const large = getBaselineFor(algo, 'large');

        if (small && large) {
          // Larger logs are more complex, fitness should not improve
          expect(small.expectedFitness).toBeGreaterThanOrEqual(large.expectedFitness);
        }
      });
    });

    it('runtime increases with larger logs', () => {
      const algorithms = ['dfg', 'alpha_plus_plus', 'heuristic_miner'];

      algorithms.forEach((algo) => {
        const small = getBaselineFor(algo, 'small');
        const large = getBaselineFor(algo, 'large');

        if (small && large) {
          expect(large.expectedRuntimeMs).toBeGreaterThan(small.expectedRuntimeMs);
        }
      });
    });

    it('all baselines have consistent families', () => {
      const baselines = exportBaselines();
      const validFamilies = ['discovery', 'ml', 'conformance'];

      baselines.forEach((baseline) => {
        expect(validFamilies).toContain(baseline.family);
      });
    });
  });

  describe('integration: performance validation workflow', () => {
    it('complete workflow: lookup, validate, format', () => {
      // Step 1: Get baseline
      const baseline = getBaselineFor('dfg', 'medium');
      expect(baseline).not.toBeNull();

      // Step 2: Simulate actual results (with small degradation)
      const actualFitness = baseline!.expectedFitness * 0.98; // 2% degradation
      const actualRuntime = baseline!.expectedRuntimeMs * 1.03; // 3% slower

      // Step 3: Validate
      const validation = validatePerformance('dfg', actualFitness, actualRuntime, 'medium', 0.05);

      // Should pass because 2% and 3% are both < 5%
      expect(validation.passed).toBe(true);

      // Step 4: Format for display
      const formatted = formatValidationResult(validation);
      expect(formatted).toContain('✓');
    });

    it('detects regressions', () => {
      const baseline = getBaselineFor('genetic_algorithm', 'large');
      expect(baseline).not.toBeNull();

      // Simulate 15% fitness degradation
      const actualFitness = baseline!.expectedFitness * 0.85;
      const actualRuntime = baseline!.expectedRuntimeMs;

      const validation = validatePerformance(
        'genetic_algorithm',
        actualFitness,
        actualRuntime,
        'large',
        0.05
      );

      expect(validation.passed).toBe(false);
      expect(validation.warning).toContain('degraded');
    });
  });
});
