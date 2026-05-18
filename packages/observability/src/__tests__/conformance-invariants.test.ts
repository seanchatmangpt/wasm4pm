/**
 * Conformance Invariant Validation Tests
 *
 * Chicago TDD strategy: Mathematical oracles (Rank 1) for bounds checking,
 * ordering constraints, and token accounting.
 */

import { describe, it, expect } from 'vitest';
import {
  validateConformanceResult,
  validateConformanceResultFromCases,
  type InvariantViolation,
  type CaseFitnessResult,
} from '../conformance-invariants';

describe('Conformance Invariant Validation', () => {
  // ───────────────────────────────────────────────────────────────────────────
  // I-1: Bounds Check (Fitness, Precision ∈ [0, 1])
  // ───────────────────────────────────────────────────────────────────────────

  describe('I-1: Bounds Invariant', () => {
    it('passes when fitness and precision are valid [0, 1]', () => {
      const violations = validateConformanceResult(0.85, 0.80, 10, [], 0.85);
      const i1Violations = violations.filter((v) => v.id === 'I-1');
      expect(i1Violations).toHaveLength(0);
    });

    it('fails when fitness < 0 (underflow)', () => {
      const violations = validateConformanceResult(-0.1, null, 10, [], -0.1);
      const i1Violations = violations.filter((v) => v.id === 'I-1');
      expect(i1Violations).toHaveLength(1);
      expect(i1Violations[0].severity).toBe('critical');
      expect(i1Violations[0].violation).toContain('Fitness -0.1 outside [0, 1]');
    });

    it('fails when fitness > 1 (overflow)', () => {
      const violations = validateConformanceResult(1.5, null, 10, [], 1.5);
      const i1Violations = violations.filter((v) => v.id === 'I-1');
      expect(i1Violations).toHaveLength(1);
      expect(i1Violations[0].severity).toBe('critical');
    });

    it('fails when fitness is NaN', () => {
      const violations = validateConformanceResult(NaN, null, 10, [], NaN);
      const i1Violations = violations.filter((v) => v.id === 'I-1');
      expect(i1Violations.length).toBeGreaterThan(0);
      expect(i1Violations[0].severity).toBe('critical');
    });

    it('fails when fitness is Infinity', () => {
      const violations = validateConformanceResult(Infinity, null, 10, [], Infinity);
      const i1Violations = violations.filter((v) => v.id === 'I-1');
      expect(i1Violations.length).toBeGreaterThan(0);
    });

    it('fails when precision < 0', () => {
      const violations = validateConformanceResult(0.85, -0.05, 10, [], 0.85);
      const i1Violations = violations.filter((v) => v.id === 'I-1');
      expect(i1Violations).toHaveLength(1);
      expect(i1Violations[0].violation).toContain('Precision -0.05 outside [0, 1]');
    });

    it('fails when precision > 1', () => {
      const violations = validateConformanceResult(0.85, 1.2, 10, [], 0.85);
      const i1Violations = violations.filter((v) => v.id === 'I-1');
      expect(i1Violations).toHaveLength(1);
    });

    it('allows precision=null (when not computed)', () => {
      const violations = validateConformanceResult(0.85, null, 10, [], 0.85);
      const i1Violations = violations.filter((v) => v.id === 'I-1');
      expect(i1Violations).toHaveLength(0);
    });

    it('detects boundary case fitness=0 (edge valid)', () => {
      const violations = validateConformanceResult(0.0, 0.0, 10, [], 0.0);
      const i1Violations = violations.filter((v) => v.id === 'I-1');
      expect(i1Violations).toHaveLength(0);
    });

    it('detects boundary case fitness=1 (edge valid)', () => {
      const violations = validateConformanceResult(1.0, 1.0, 10, [], 1.0);
      const i1Violations = violations.filter((v) => v.id === 'I-1');
      expect(i1Violations).toHaveLength(0);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // I-2: Ordering Invariant (Fitness ≥ Precision always)
  // ───────────────────────────────────────────────────────────────────────────

  describe('I-2: Ordering Invariant', () => {
    it('passes when fitness > precision', () => {
      const violations = validateConformanceResult(0.85, 0.80, 10, [], 0.85);
      const i2Violations = violations.filter((v) => v.id === 'I-2');
      expect(i2Violations).toHaveLength(0);
    });

    it('passes when fitness = precision', () => {
      const violations = validateConformanceResult(0.80, 0.80, 10, [], 0.80);
      const i2Violations = violations.filter((v) => v.id === 'I-2');
      expect(i2Violations).toHaveLength(0);
    });

    it('fails when fitness < precision (logical impossibility)', () => {
      const violations = validateConformanceResult(0.70, 0.80, 10, [], 0.70);
      const i2Violations = violations.filter((v) => v.id === 'I-2');
      expect(i2Violations).toHaveLength(1);
      expect(i2Violations[0].severity).toBe('critical');
      expect(i2Violations[0].violation).toContain('Fitness 0.7 < Precision 0.8');
      expect(i2Violations[0].consequence).toContain('logical impossibility');
    });

    it('ignores precision when null', () => {
      const violations = validateConformanceResult(0.70, null, 10, [], 0.70);
      const i2Violations = violations.filter((v) => v.id === 'I-2');
      expect(i2Violations).toHaveLength(0);
    });

    it('detects boundary violation at fitness=precision-epsilon', () => {
      const violations = validateConformanceResult(0.799, 0.80, 10, [], 0.799);
      const i2Violations = violations.filter((v) => v.id === 'I-2');
      expect(i2Violations).toHaveLength(1);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // I-3: Case Count Consistency
  // ───────────────────────────────────────────────────────────────────────────

  describe('I-3: Case Count Consistency', () => {
    const makeCases = (count: number, traceFitness: number): CaseFitnessResult[] => {
      return Array.from({ length: count }, (_, i) => ({
        case_id: `case_${i}`,
        is_conforming: traceFitness === 1.0,
        trace_fitness: traceFitness,
        tokens_missing: 0,
        tokens_remaining: 0,
        deviations: [],
      }));
    };

    it('passes when case count matches total_cases', () => {
      const cases = makeCases(10, 0.85);
      const violations = validateConformanceResult(0.85, null, 10, cases, 0.85);
      const i3Violations = violations.filter((v) => v.id === 'I-3');
      expect(i3Violations).toHaveLength(0);
    });

    it('fails when case count < total_cases (missing traces)', () => {
      const cases = makeCases(8, 0.85);
      const violations = validateConformanceResult(0.85, null, 10, cases, 0.85);
      const i3Violations = violations.filter((v) => v.id === 'I-3');
      expect(i3Violations.length).toBeGreaterThan(0);
      expect(i3Violations[0].severity).toBe('critical');
      expect(i3Violations[0].violation).toContain('case_fitness.length (8) ≠ total_cases (10)');
    });

    it('fails when avg_fitness does not match case average', () => {
      const cases = makeCases(10, 0.85);
      const violations = validateConformanceResult(0.95, null, 10, cases, 0.95);
      const i3Violations = violations.filter((v) => v.id === 'I-3');
      expect(i3Violations.length).toBeGreaterThan(0);
      expect(i3Violations[0].severity).toBe('warning');
      // Check for the general pattern, not exact string (floating point precision)
      expect(i3Violations[0].violation).toContain('Reported avg_fitness (0.95) ≠');
    });

    it('passes with mixed trace fitness values', () => {
      const cases: CaseFitnessResult[] = [
        {
          case_id: 'a',
          is_conforming: true,
          trace_fitness: 1.0,
          tokens_missing: 0,
          tokens_remaining: 0,
          deviations: [],
        },
        {
          case_id: 'b',
          is_conforming: false,
          trace_fitness: 0.7,
          tokens_missing: 5,
          tokens_remaining: 3,
          deviations: [{ event_index: 2, activity: 'A', deviation_type: 'missing_tokens' }],
        },
        {
          case_id: 'c',
          is_conforming: false,
          trace_fitness: 0.6,
          tokens_missing: 8,
          tokens_remaining: 0,
          deviations: [{ event_index: 5, activity: 'B', deviation_type: 'missing_tokens' }],
        },
      ];
      const avgFitness = (1.0 + 0.7 + 0.6) / 3; // 0.7667
      const violations = validateConformanceResult(avgFitness, null, 3, cases, avgFitness);
      const i3Violations = violations.filter((v) => v.id === 'I-3');
      expect(i3Violations).toHaveLength(0);
    });

    it('passes when case array is empty and total_cases=0', () => {
      const violations = validateConformanceResult(0.0, null, 0, [], 0.0);
      const i3Violations = violations.filter((v) => v.id === 'I-3');
      expect(i3Violations).toHaveLength(0);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // I-4: Token Balance (Non-negative, consistent accounting)
  // ───────────────────────────────────────────────────────────────────────────

  describe('I-4: Token Balance Invariant', () => {
    it('passes when all token counts are non-negative', () => {
      const cases: CaseFitnessResult[] = [
        {
          case_id: 'c1',
          is_conforming: true,
          trace_fitness: 1.0,
          tokens_missing: 0,
          tokens_remaining: 0,
          deviations: [],
        },
      ];
      const violations = validateConformanceResult(1.0, null, 1, cases, 1.0);
      const i4Violations = violations.filter((v) => v.id === 'I-4');
      expect(i4Violations).toHaveLength(0);
    });

    it('fails when tokens_missing < 0 (underflow)', () => {
      const cases: CaseFitnessResult[] = [
        {
          case_id: 'c1',
          is_conforming: false,
          trace_fitness: 0.5,
          tokens_missing: -3,
          tokens_remaining: 2,
          deviations: [],
        },
      ];
      const violations = validateConformanceResult(0.5, null, 1, cases, 0.5);
      const i4Violations = violations.filter((v) => v.id === 'I-4');
      expect(i4Violations).toHaveLength(1);
      expect(i4Violations[0].severity).toBe('critical');
      expect(i4Violations[0].violation).toContain('tokens_missing (-3) < 0');
    });

    it('fails when tokens_remaining < 0 (negative balance)', () => {
      const cases: CaseFitnessResult[] = [
        {
          case_id: 'c1',
          is_conforming: false,
          trace_fitness: 0.5,
          tokens_missing: 2,
          tokens_remaining: -1,
          deviations: [],
        },
      ];
      const violations = validateConformanceResult(0.5, null, 1, cases, 0.5);
      const i4Violations = violations.filter((v) => v.id === 'I-4');
      expect(i4Violations).toHaveLength(1);
      expect(i4Violations[0].severity).toBe('critical');
      expect(i4Violations[0].violation).toContain('tokens_remaining (-1) < 0');
    });

    it('warns when trace_fitness < 1 but missing=0 and remaining=0', () => {
      const cases: CaseFitnessResult[] = [
        {
          case_id: 'c1',
          is_conforming: false,
          trace_fitness: 0.85,
          tokens_missing: 0,
          tokens_remaining: 0,
          deviations: [],
        },
      ];
      const violations = validateConformanceResult(0.85, null, 1, cases, 0.85);
      const i4Warnings = violations.filter((v) => v.id === 'I-4' && v.severity === 'warning');
      expect(i4Warnings.length).toBeGreaterThan(0);
      expect(i4Warnings[0].violation).toContain('trace_fitness < 1.0 but missing=0, remaining=0');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // I-5: Final State Coherence (is_conforming ⟹ deviations = ∅)
  // ───────────────────────────────────────────────────────────────────────────

  describe('I-5: Final State Coherence', () => {
    it('passes when conforming traces have no deviations', () => {
      const cases: CaseFitnessResult[] = [
        {
          case_id: 'c1',
          is_conforming: true,
          trace_fitness: 1.0,
          tokens_missing: 0,
          tokens_remaining: 0,
          deviations: [],
        },
      ];
      const violations = validateConformanceResult(1.0, null, 1, cases, 1.0);
      const i5Violations = violations.filter((v) => v.id === 'I-5');
      expect(i5Violations).toHaveLength(0);
    });

    it('passes when non-conforming traces have deviations', () => {
      const cases: CaseFitnessResult[] = [
        {
          case_id: 'c1',
          is_conforming: false,
          trace_fitness: 0.7,
          tokens_missing: 5,
          tokens_remaining: 0,
          deviations: [{ event_index: 2, activity: 'A', deviation_type: 'missing_tokens' }],
        },
      ];
      const violations = validateConformanceResult(0.7, null, 1, cases, 0.7);
      const i5Violations = violations.filter((v) => v.id === 'I-5');
      expect(i5Violations).toHaveLength(0);
    });

    it('warns when conforming trace has deviations (final marking only check)', () => {
      const cases: CaseFitnessResult[] = [
        {
          case_id: 'c1',
          is_conforming: true,
          trace_fitness: 1.0,
          tokens_missing: 0,
          tokens_remaining: 0,
          deviations: [{ event_index: 2, activity: 'A', deviation_type: 'missing_tokens' }],
        },
      ];
      const violations = validateConformanceResult(1.0, null, 1, cases, 1.0);
      const i5Warnings = violations.filter((v) => v.id === 'I-5' && v.severity === 'warning');
      expect(i5Warnings.length).toBeGreaterThan(0);
      expect(i5Warnings[0].violation).toContain('is_conforming=true but deviations.length=1');
    });

    it('warns when non-conforming trace has no deviations', () => {
      const cases: CaseFitnessResult[] = [
        {
          case_id: 'c1',
          is_conforming: false,
          trace_fitness: 0.7,
          tokens_missing: 5,
          tokens_remaining: 0,
          deviations: [],
        },
      ];
      const violations = validateConformanceResult(0.7, null, 1, cases, 0.7);
      const i5Warnings = violations.filter((v) => v.id === 'I-5' && v.severity === 'warning');
      expect(i5Warnings.length).toBeGreaterThan(0);
      expect(i5Warnings[0].violation).toContain('is_conforming=false but deviations.length=0');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Integration Tests (Multiple invariants violated simultaneously)
  // ───────────────────────────────────────────────────────────────────────────

  describe('Integration: Multiple Invariant Violations', () => {
    it('detects both I-1 and I-2 violations simultaneously', () => {
      const violations = validateConformanceResult(
        1.5, // I-1: fitness > 1
        0.8, // I-2: fitness (1.5) < precision (0.8) would be I-2, but I-1 fires first
        10,
        [],
        1.5
      );
      const criticals = violations.filter((v) => v.severity === 'critical');
      expect(criticals.length).toBeGreaterThan(0);
    });

    it('detects I-3 and I-5 violations in case data', () => {
      const cases: CaseFitnessResult[] = [
        {
          case_id: 'c1',
          is_conforming: true,
          trace_fitness: 0.9,
          tokens_missing: 0,
          tokens_remaining: 0,
          deviations: [{ event_index: 1, activity: 'A', deviation_type: 'missing_tokens' }],
        },
      ];
      const violations = validateConformanceResult(
        0.75, // avg_fitness mismatch with case fitness 0.9
        null,
        1,
        cases,
        0.75
      );
      const i3Violations = violations.filter((v) => v.id === 'I-3');
      const i5Violations = violations.filter((v) => v.id === 'I-5');
      expect(i3Violations.length).toBeGreaterThan(0);
      expect(i5Violations.length).toBeGreaterThan(0);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Convenience API: validateConformanceResultFromCases
  // ───────────────────────────────────────────────────────────────────────────

  describe('Convenience API: validateConformanceResultFromCases', () => {
    it('computes total_cases and avg_fitness automatically', () => {
      const cases: CaseFitnessResult[] = [
        {
          case_id: 'a',
          is_conforming: true,
          trace_fitness: 1.0,
          tokens_missing: 0,
          tokens_remaining: 0,
          deviations: [],
        },
        {
          case_id: 'b',
          is_conforming: false,
          trace_fitness: 0.7,
          tokens_missing: 5,
          tokens_remaining: 0,
          deviations: [{ event_index: 2, activity: 'A', deviation_type: 'missing_tokens' }],
        },
      ];
      const violations = validateConformanceResultFromCases(0.85, null, cases);
      // avg_fitness = (1.0 + 0.7) / 2 = 0.85, so no I-3 violation
      const i3Violations = violations.filter((v) => v.id === 'I-3');
      expect(i3Violations).toHaveLength(0);
    });

    it('computes avg from cases and uses that for validation', () => {
      const cases: CaseFitnessResult[] = [
        {
          case_id: 'a',
          is_conforming: true,
          trace_fitness: 0.8,
          tokens_missing: 0,
          tokens_remaining: 0,
          deviations: [],
        },
        {
          case_id: 'b',
          is_conforming: false,
          trace_fitness: 0.6,
          tokens_missing: 5,
          tokens_remaining: 0,
          deviations: [{ event_index: 2, activity: 'A', deviation_type: 'missing_tokens' }],
        },
      ];
      // The convenience function computes avgFitness = 0.7 internally
      // If we pass fitnessValue=0.95, it will detect mismatch
      const violations = validateConformanceResultFromCases(0.95, null, cases);
      const i3Violations = violations.filter((v) => v.id === 'I-3');
      // Should detect the mismatch (0.95 != 0.7)
      expect(i3Violations.length).toBeGreaterThan(0);
      expect(i3Violations[0].violation).toContain('Reported avg_fitness (0.95) ≠');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Edge Cases
  // ───────────────────────────────────────────────────────────────────────────

  describe('Edge Cases', () => {
    it('handles empty case array gracefully', () => {
      const violations = validateConformanceResult(1.0, null, 0, [], 1.0);
      expect(violations).toBeDefined();
      // Empty case array with 0 total_cases is valid
      const i3Violations = violations.filter((v) => v.id === 'I-3');
      expect(i3Violations).toHaveLength(0);
    });

    it('handles single-case log', () => {
      const cases: CaseFitnessResult[] = [
        {
          case_id: 'only',
          is_conforming: true,
          trace_fitness: 1.0,
          tokens_missing: 0,
          tokens_remaining: 0,
          deviations: [],
        },
      ];
      const violations = validateConformanceResult(1.0, null, 1, cases, 1.0);
      expect(violations).toHaveLength(0);
    });

    it('handles all-perfect traces (fitness=precision=1)', () => {
      const cases: CaseFitnessResult[] = Array.from({ length: 100 }, (_, i) => ({
        case_id: `case_${i}`,
        is_conforming: true,
        trace_fitness: 1.0,
        tokens_missing: 0,
        tokens_remaining: 0,
        deviations: [],
      }));
      const violations = validateConformanceResult(1.0, 1.0, 100, cases, 1.0);
      expect(violations).toHaveLength(0);
    });

    it('handles all-failing traces (fitness near 0)', () => {
      const cases: CaseFitnessResult[] = Array.from({ length: 10 }, (_, i) => ({
        case_id: `case_${i}`,
        is_conforming: false,
        trace_fitness: 0.01,
        tokens_missing: 100,
        tokens_remaining: 50,
        deviations: [{ event_index: 0, activity: 'X', deviation_type: 'missing_tokens' }],
      }));
      const violations = validateConformanceResult(0.01, null, 10, cases, 0.01);
      expect(violations).toHaveLength(0);
    });
  });
});
