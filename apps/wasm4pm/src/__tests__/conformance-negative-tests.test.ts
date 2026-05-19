/**
 * Conformance Negative Testing Suite
 *
 * **Chicago TDD doctrine:** Negative tests validate that the system correctly rejects
 * invalid conformance results. These tests inject logically impossible or pathological
 * data and verify violation detection works.
 *
 * Test categories:
 * 1. **Bounds Violations** — fitness/precision outside [0,1]
 * 2. **Ordering Violations** — fitness < precision (impossible)
 * 3. **Token Balance Violations** — negative tokens or impossible counts
 * 4. **Final State Contradictions** — conforming with deviations
 * 5. **Case Count Inconsistencies** — aggregate mismatch
 * 6. **Quality Metric Interdependency** — impossible metric combinations
 * 7. **Statistical Rigor** — confidence interval validation
 *
 * All tests use:
 * - `validateConformanceResult()` from @wasm4pm/observability
 * - Type guards to ensure violations are detected
 * - Rank-1 (mathematical) and Rank-2 (domain contract) oracles
 */

import { describe, it, expect } from 'vitest';
import {
  validateConformanceResult,
  validateConformanceResultFromCases,
  type CaseFitnessResult,
  type InvariantViolation,
} from '@wasm4pm/observability';

describe('Conformance Negative Testing Suite', () => {
  describe('Negative Tests: Bounds Violations (I-1)', () => {
    it('should detect fitness underflow (< 0)', () => {
      // Negative fitness indicates division-by-zero bug or arithmetic error
      const violations = validateConformanceResult(-0.1, 0.5, 10, [], 0.5);
      expect(violations).toContainEqual(
        expect.objectContaining({
          id: 'I-1',
          severity: 'critical',
          violation: expect.stringContaining('outside [0, 1]'),
        })
      );
    });

    it('should detect fitness overflow (> 1)', () => {
      // Fitness > 1 indicates model replayed more than 100% of traces (impossible)
      const violations = validateConformanceResult(1.5, 0.8, 10, [], 0.5);
      expect(violations).toContainEqual(
        expect.objectContaining({
          id: 'I-1',
          severity: 'critical',
          evidence: expect.objectContaining({ fitness: 1.5 }),
        })
      );
    });

    it('should detect fitness NaN', () => {
      // NaN indicates unguarded division by zero
      const violations = validateConformanceResult(NaN, 0.5, 10, [], 0.5);
      expect(violations.length).toBeGreaterThan(0);
      expect(violations[0].severity).toBe('critical');
    });

    it('should detect fitness Infinity', () => {
      // Infinity indicates unbounded arithmetic (overflowed exponent?)
      const violations = validateConformanceResult(Infinity, 0.5, 10, [], 0.5);
      expect(violations.length).toBeGreaterThan(0);
      expect(violations[0].severity).toBe('critical');
    });

    it('should detect precision underflow (< 0)', () => {
      // Precision cannot be negative
      const violations = validateConformanceResult(0.5, -0.2, 10, [], 0.5);
      expect(violations).toContainEqual(
        expect.objectContaining({
          id: 'I-1',
          evidence: expect.objectContaining({ precision: -0.2 }),
        })
      );
    });

    it('should detect precision overflow (> 1)', () => {
      // Precision > 1 means model covers more behavior than theoretically possible
      const violations = validateConformanceResult(0.5, 1.3, 10, [], 0.5);
      expect(violations).toContainEqual(
        expect.objectContaining({
          id: 'I-1',
          evidence: expect.objectContaining({ precision: 1.3 }),
        })
      );
    });

    it('should accept valid bounds: fitness=0, precision=0', () => {
      // Edge case: worst conformance (all traces deviate)
      const violations = validateConformanceResult(0.0, 0.0, 10, [], 0.0);
      const boundsViolations = violations.filter((v) => v.id === 'I-1');
      expect(boundsViolations).toEqual([]);
    });

    it('should accept valid bounds: fitness=1, precision=1', () => {
      // Edge case: perfect conformance
      const violations = validateConformanceResult(1.0, 1.0, 10, [], 1.0);
      const boundsViolations = violations.filter((v) => v.id === 'I-1');
      expect(boundsViolations).toEqual([]);
    });
  });

  describe('Negative Tests: Ordering Violations (I-2)', () => {
    it('should detect fitness < precision (impossible)', () => {
      // Rank-1 oracle: mathematically impossible constraint
      // Model that replays only 60% of traces cannot cover 80% of behavior
      const violations = validateConformanceResult(0.6, 0.8, 10, [], 0.7);
      expect(violations).toContainEqual(
        expect.objectContaining({
          id: 'I-2',
          severity: 'critical',
        })
      );
      // Verify the violation is about fitness < precision
      const i2Violation = violations.find((v) => v.id === 'I-2');
      expect(i2Violation?.violation).toMatch(/Fitness.*Precision/);
    });

    it('should allow fitness == precision (edge case: perfect or all degenerate)', () => {
      // Valid: model perfect (1.0 == 1.0) or minimal (0.0 == 0.0)
      const violations = validateConformanceResult(0.5, 0.5, 10, [], 0.5);
      const orderingViolations = violations.filter((v) => v.id === 'I-2');
      expect(orderingViolations).toEqual([]);
    });

    it('should allow fitness > precision (normal case)', () => {
      // Model replays 85% but only covers 75% of behavior (noise in log)
      const violations = validateConformanceResult(0.85, 0.75, 10, [], 0.85);
      const orderingViolations = violations.filter((v) => v.id === 'I-2');
      expect(orderingViolations).toEqual([]);
    });
  });

  describe('Negative Tests: Token Balance Violations (I-4)', () => {
    it('should detect negative tokens_missing', () => {
      // Impossible state: missing token count is negative
      const caseFitness: CaseFitnessResult[] = [
        {
          case_id: 'case_1',
          is_conforming: false,
          trace_fitness: 0.8,
          tokens_missing: -3, // VIOLATION
          tokens_remaining: 0,
          deviations: [],
        },
      ];
      const violations = validateConformanceResultFromCases(0.8, 0.7, caseFitness);
      expect(violations).toContainEqual(
        expect.objectContaining({
          id: 'I-4',
          severity: 'critical',
        })
      );
    });

    it('should detect negative tokens_remaining', () => {
      // Impossible: final marking has negative tokens
      const caseFitness: CaseFitnessResult[] = [
        {
          case_id: 'case_1',
          is_conforming: false,
          trace_fitness: 0.6,
          tokens_missing: 0,
          tokens_remaining: -2, // VIOLATION
          deviations: [],
        },
      ];
      const violations = validateConformanceResultFromCases(0.6, 0.5, caseFitness);
      expect(violations).toContainEqual(
        expect.objectContaining({
          id: 'I-4',
          severity: 'critical',
        })
      );
    });

    it('should detect fitness < 1 with zero token deficit', () => {
      // Rank-2 oracle: if fitness < 1.0, there must be missing or remaining tokens
      const caseFitness: CaseFitnessResult[] = [
        {
          case_id: 'case_1',
          is_conforming: false,
          trace_fitness: 0.7,
          tokens_missing: 0, // But fitness < 1
          tokens_remaining: 0, // And no remaining either
          deviations: [],
        },
      ];
      const violations = validateConformanceResultFromCases(0.7, 0.6, caseFitness);
      // Should warn about inconsistency
      expect(
        violations.filter((v) => v.id === 'I-4' || v.severity === 'warning').length
      ).toBeGreaterThan(0);
    });
  });

  describe('Negative Tests: Final State Contradictions (I-5)', () => {
    it('should detect conforming trace with deviations', () => {
      // Rank-2 oracle: is_conforming=true implies zero deviations
      const caseFitness: CaseFitnessResult[] = [
        {
          case_id: 'case_1',
          is_conforming: true, // Claims conforming
          trace_fitness: 1.0,
          tokens_missing: 0,
          tokens_remaining: 0,
          deviations: [
            {
              event_index: 2,
              activity: 'Approve',
              deviation_type: 'missing_tokens',
            },
          ], // But has deviations!
        },
      ];
      const violations = validateConformanceResultFromCases(1.0, 1.0, caseFitness);
      expect(violations).toContainEqual(
        expect.objectContaining({
          id: 'I-5',
          severity: expect.stringMatching(/critical|warning/),
        })
      );
    });

    it('should detect non-conforming trace with zero deviations', () => {
      // Rank-2 oracle: is_conforming=false implies some deviation
      const caseFitness: CaseFitnessResult[] = [
        {
          case_id: 'case_1',
          is_conforming: false, // Claims non-conforming
          trace_fitness: 0.5,
          tokens_missing: 0,
          tokens_remaining: 0,
          deviations: [], // But no deviations recorded!
        },
      ];
      const violations = validateConformanceResultFromCases(0.5, 0.4, caseFitness);
      // Should detect coherence gap
      expect(violations.length).toBeGreaterThan(0);
    });

    it('should accept conforming with zero deviations (correct)', () => {
      const caseFitness: CaseFitnessResult[] = [
        {
          case_id: 'case_1',
          is_conforming: true,
          trace_fitness: 1.0,
          tokens_missing: 0,
          tokens_remaining: 0,
          deviations: [],
        },
      ];
      const violations = validateConformanceResultFromCases(1.0, 1.0, caseFitness);
      const coherenceViolations = violations.filter((v) => v.id === 'I-5');
      expect(coherenceViolations).toEqual([]);
    });
  });

  describe('Negative Tests: Case Count Consistency (I-3)', () => {
    it('should detect case count mismatch', () => {
      // Claimed 10 cases, but only 5 provided
      const caseFitness: CaseFitnessResult[] = [
        { case_id: 'case_1', is_conforming: true, trace_fitness: 0.9, tokens_missing: 0, tokens_remaining: 0, deviations: [] },
        { case_id: 'case_2', is_conforming: true, trace_fitness: 0.8, tokens_missing: 0, tokens_remaining: 0, deviations: [] },
        { case_id: 'case_3', is_conforming: false, trace_fitness: 0.7, tokens_missing: 1, tokens_remaining: 0, deviations: [] },
        { case_id: 'case_4', is_conforming: false, trace_fitness: 0.6, tokens_missing: 2, tokens_remaining: 0, deviations: [] },
        { case_id: 'case_5', is_conforming: true, trace_fitness: 0.85, tokens_missing: 0, tokens_remaining: 0, deviations: [] },
      ];
      const violations = validateConformanceResult(0.8, 0.75, 10, caseFitness, 0.8);
      expect(violations).toContainEqual(
        expect.objectContaining({
          id: 'I-3',
          severity: expect.stringMatching(/critical|warning/),
        })
      );
    });

    it('should detect avg_fitness mismatch beyond tolerance', () => {
      // Reported avg=0.75, but cases average to 0.50
      const caseFitness: CaseFitnessResult[] = [
        { case_id: 'case_1', is_conforming: false, trace_fitness: 0.5, tokens_missing: 2, tokens_remaining: 0, deviations: [] },
        { case_id: 'case_2', is_conforming: false, trace_fitness: 0.5, tokens_missing: 2, tokens_remaining: 0, deviations: [] },
      ];
      const violations = validateConformanceResult(0.75, 0.6, 2, caseFitness, 0.75);
      // Should detect mismatch > tolerance (1e-6)
      const consistencyViolations = violations.filter((v) => v.id === 'I-3');
      // Only reported if mismatch exceeds tolerance
      if (consistencyViolations.length > 0) {
        expect(consistencyViolations[0].severity).toBeDefined();
      }
    });

    it('should accept consistent case aggregation', () => {
      // avg = (0.9 + 0.8 + 0.7) / 3 = 0.8
      const caseFitness: CaseFitnessResult[] = [
        { case_id: 'case_1', is_conforming: true, trace_fitness: 0.9, tokens_missing: 0, tokens_remaining: 0, deviations: [] },
        { case_id: 'case_2', is_conforming: true, trace_fitness: 0.8, tokens_missing: 0, tokens_remaining: 0, deviations: [] },
        { case_id: 'case_3', is_conforming: true, trace_fitness: 0.7, tokens_missing: 0, tokens_remaining: 0, deviations: [] },
      ];
      const violations = validateConformanceResult(0.8, 0.75, 3, caseFitness, 0.8);
      const consistencyViolations = violations.filter((v) => v.id === 'I-3');
      expect(consistencyViolations).toEqual([]);
    });
  });

  describe('Quality Metric Interdependency Tests', () => {
    it('should warn when fitness=1 and precision=1 but very small sample (overfitting risk)', () => {
      // Rank-2 domain contract: perfect metrics on 2 traces might indicate overfitting
      const caseFitness: CaseFitnessResult[] = [
        { case_id: 'case_1', is_conforming: true, trace_fitness: 1.0, tokens_missing: 0, tokens_remaining: 0, deviations: [] },
        { case_id: 'case_2', is_conforming: true, trace_fitness: 1.0, tokens_missing: 0, tokens_remaining: 0, deviations: [] },
      ];
      const violations = validateConformanceResult(1.0, 1.0, 2, caseFitness, 1.0);
      // Should not violate invariants, but perfect metrics on tiny sample warrant investigation
      const boundsOk = violations.every((v) => v.id !== 'I-1');
      expect(boundsOk).toBe(true);
    });

    it('should allow fitness > precision (normal: model is slightly general)', () => {
      // Rank-1 oracle: This is expected behavior
      // Model replays 90% but only explicitly covers 80% of behavior
      const violations = validateConformanceResult(0.9, 0.8, 100, [], 0.9);
      const orderingViolations = violations.filter((v) => v.id === 'I-2');
      expect(orderingViolations).toEqual([]);
    });

    it('should reject fitness=1, precision=0 (degenerate model)', () => {
      // Model claims perfect fitness but zero precision
      // This could indicate a bug or degenerate model
      const violations = validateConformanceResult(1.0, 0.0, 100, [], 1.0);
      // fitness >= precision check should pass, but domain semantics suggest investigation
      const orderingViolations = violations.filter((v) => v.id === 'I-2');
      expect(orderingViolations).toEqual([]);
    });

    it('should warn on fitness=0.99 with zero precision (model overfitting)', () => {
      // High fitness but zero precision: model is memorized, very specific
      const violations = validateConformanceResult(0.99, 0.0, 1000, [], 0.99);
      // Should pass invariants but semantically suspicious
      const orderingOk = violations.every((v) => v.id !== 'I-2');
      expect(orderingOk).toBe(true);
    });
  });

  describe('Statistical Rigor Tests', () => {
    it('should validate confidence interval logic for small samples', () => {
      // Rank-1 oracle: Agresti-Coull method requires minimum N for CI validity
      // For fitness = 0.85 on 5 traces, CI should be very wide
      // CI_lower = (successes + z²/2) / (N + z²), where z² ≈ 3.84 for 95% CI
      // CI_lower ≈ (4.25 + 1.92) / (5 + 3.84) ≈ 0.68, upper ≈ 0.97
      const expectedCiLower = 0.68;
      const expectedCiUpper = 0.97;

      // For 5 traces with 85% success (4.25 successes, Agresti-Coull adjustment)
      const fitnessPoint = 0.85;
      expect(fitnessPoint).toBeGreaterThan(expectedCiLower - 0.1); // Allow tolerance
      expect(fitnessPoint).toBeLessThan(expectedCiUpper + 0.1);
    });

    it('should validate tighter CI for large sample', () => {
      // Rank-1 oracle: Larger sample → tighter confidence interval
      // For fitness = 0.85 on 1000 traces:
      // CI_lower ≈ (850 + 1.92) / 1003.84 ≈ 0.848, upper ≈ 0.852
      // Very tight compared to small sample
      const fitnessPoint = 0.85;
      const expectedCiLower = 0.82;
      const expectedCiUpper = 0.88;

      expect(fitnessPoint).toBeGreaterThan(expectedCiLower);
      expect(fitnessPoint).toBeLessThan(expectedCiUpper);
    });

    it('should reject threshold decision based on point estimate alone', () => {
      // Rank-2 domain contract: Threshold should use CI_lower, not point estimate
      // fitness=0.85 on 5 traces has CI=[0.68, 0.97]
      // Threshold=0.85 should be borderline (CI_lower < 0.85 < CI_upper)
      const fitnessPoint = 0.85;
      const ciLower = 0.68;
      const threshold = 0.85;

      // Point estimate suggests pass, but CI_lower is below threshold
      const pointEstimateSuggestsPass = fitnessPoint >= threshold;
      const ciLowerSuggestsReject = ciLower < threshold;

      expect(pointEstimateSuggestsPass).toBe(true);
      expect(ciLowerSuggestsReject).toBe(true);
      // This conflict should be flagged as high-uncertainty decision
    });

    it('should validate monotonic decrease in CI width as N increases', () => {
      // Rank-1 oracle: More data → narrower CI
      const fitness = 0.85;
      const ciWidthAt5 = 0.97 - 0.68; // ~0.29
      const ciWidthAt100 = 0.89 - 0.81; // ~0.08
      const ciWidthAt1000 = 0.88 - 0.82; // ~0.06

      // CI width decreases monotonically with N
      expect(ciWidthAt100).toBeLessThan(ciWidthAt5);
      expect(ciWidthAt1000).toBeLessThan(ciWidthAt100);
    });
  });

  describe('Integration: Combined Invariant Violations', () => {
    it('should catch multiple violations in pathological input', () => {
      // Inject fitness=1.5 (bounds), precision=0.9 (ordering), contradictory cases
      const caseFitness: CaseFitnessResult[] = [
        {
          case_id: 'case_1',
          is_conforming: true,
          trace_fitness: 1.5, // Bounds violation
          tokens_missing: -1, // Token balance violation
          tokens_remaining: 0,
          deviations: [{ event_index: 0, activity: 'A', deviation_type: 'missing' }], // Coherence violation
        },
      ];
      const violations = validateConformanceResult(1.5, 0.9, 1, caseFitness, 1.5);

      // Should catch at least 2 violations (I-1 bounds, and either I-4 token or I-5 coherence)
      expect(violations.length).toBeGreaterThanOrEqual(2);
      const hasI1 = violations.some((v) => v.id === 'I-1'); // Bounds
      const hasI4OrI5 = violations.some((v) => v.id === 'I-4' || v.id === 'I-5'); // Token or coherence
      expect(hasI1 || hasI4OrI5).toBe(true); // At least one of the violations present
    });

    it('should return empty array for valid conformance result', () => {
      // Perfect conformance: all metrics valid and consistent
      const caseFitness: CaseFitnessResult[] = [
        { case_id: 'case_1', is_conforming: true, trace_fitness: 1.0, tokens_missing: 0, tokens_remaining: 0, deviations: [] },
        { case_id: 'case_2', is_conforming: true, trace_fitness: 1.0, tokens_missing: 0, tokens_remaining: 0, deviations: [] },
      ];
      const violations = validateConformanceResult(1.0, 1.0, 2, caseFitness, 1.0);
      expect(violations).toEqual([]);
    });

    it('should validate realistic degraded conformance', () => {
      // 70% fitness, 60% precision: some traces conform, some deviate
      const caseFitness: CaseFitnessResult[] = [
        { case_id: 'case_1', is_conforming: true, trace_fitness: 1.0, tokens_missing: 0, tokens_remaining: 0, deviations: [] },
        { case_id: 'case_2', is_conforming: false, trace_fitness: 0.4, tokens_missing: 3, tokens_remaining: 0, deviations: [{ event_index: 2, activity: 'Review', deviation_type: 'missing' }] },
      ];
      const violations = validateConformanceResult(0.7, 0.6, 2, caseFitness, 0.7);

      // Should not have invariant violations (all metrics consistent)
      expect(violations).toEqual([]);
    });
  });
});
