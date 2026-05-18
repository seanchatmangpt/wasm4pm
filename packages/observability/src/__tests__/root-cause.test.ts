import { describe, it, expect } from 'vitest';
import {
  diagnose,
  type ConformanceResult,
  type LogStats,
} from '../root-cause.js';

describe('root-cause diagnosis', () => {
  describe('healthy case', () => {
    it('should classify fitness >= 0.85 as healthy', () => {
      const conformanceResult: ConformanceResult = {
        fitness: 0.90,
        precision: 0.88,
        conformance_rate: 0.90,
        deviating_cases: 10,
      };

      const logStats: LogStats = {
        event_count: 5000,
        trace_count: 100,
        unique_activities: 15,
        unique_variants: 20,
        min_trace_length: 3,
        max_trace_length: 25,
        avg_trace_length: 8,
      };

      const diagnosis = diagnose(conformanceResult, logStats);
      expect(diagnosis.category).toBe('healthy');
      expect(diagnosis.severity).toBe('low');
      expect(diagnosis.confidence).toBeGreaterThan(0.9);
    });

    it('should provide monitoring recommendations for healthy models', () => {
      const conformanceResult: ConformanceResult = {
        fitness: 0.92,
        precision: 0.90,
        conformance_rate: 0.92,
        deviating_cases: 8,
      };

      const logStats: LogStats = {
        event_count: 5000,
        trace_count: 100,
        unique_activities: 12,
        unique_variants: 18,
        min_trace_length: 2,
        max_trace_length: 20,
        avg_trace_length: 7.5,
      };

      const diagnosis = diagnose(conformanceResult, logStats);
      expect(diagnosis.recommendations).toContain('Monitor for drift in future runs.');
    });
  });

  describe('insufficient traces', () => {
    it('should detect logs with fewer than 10 traces', () => {
      const conformanceResult: ConformanceResult = {
        fitness: 0.75,
        precision: 0.70,
        conformance_rate: 0.75,
        deviating_cases: 5,
        deviating_traces: [],
      };

      const logStats: LogStats = {
        event_count: 50,
        trace_count: 5, // Too small
        unique_activities: 8,
        unique_variants: 5,
        min_trace_length: 5,
        max_trace_length: 15,
        avg_trace_length: 10,
      };

      const diagnosis = diagnose(conformanceResult, logStats);
      expect(diagnosis.category).toBe('insufficient_traces');
      expect(diagnosis.severity).toBe('high');
    });

    it('should provide data collection recommendations', () => {
      const conformanceResult: ConformanceResult = {
        fitness: 0.70,
        precision: null,
        conformance_rate: 0.70,
        deviating_cases: 3,
      };

      const logStats: LogStats = {
        event_count: 30,
        trace_count: 3,
        unique_activities: 5,
        unique_variants: 3,
        min_trace_length: 8,
        max_trace_length: 12,
        avg_trace_length: 10,
      };

      const diagnosis = diagnose(conformanceResult, logStats);
      expect(diagnosis.recommendations).toContain('Collect more event data (target: 50+ traces minimum).');
    });
  });

  describe('rework loop detection', () => {
    it('should detect high rework ratio (>30%)', () => {
      const conformanceResult: ConformanceResult = {
        fitness: 0.60,
        precision: 0.65,
        conformance_rate: 0.60,
        deviating_cases: 40,
      };

      const logStats: LogStats = {
        event_count: 5000,
        trace_count: 100,
        unique_activities: 10,
        unique_variants: 50,
        min_trace_length: 10,
        max_trace_length: 80, // Long traces suggest rework
        avg_trace_length: 50, // High ratio: 50 / 10 = 5, suggests 4x repeat rate
        rework_ratio: 0.45,
      };

      const diagnosis = diagnose(conformanceResult, logStats);
      expect(diagnosis.category).toBe('rework_loop');
      expect(diagnosis.severity).toBe('high');
    });

    it('should provide rework investigation recommendations', () => {
      const conformanceResult: ConformanceResult = {
        fitness: 0.55,
        precision: 0.60,
        conformance_rate: 0.55,
        deviating_cases: 45,
      };

      const logStats: LogStats = {
        event_count: 4000,
        trace_count: 80,
        unique_activities: 8,
        unique_variants: 40,
        min_trace_length: 15,
        max_trace_length: 70,
        avg_trace_length: 50,
        rework_ratio: 0.4,
      };

      const diagnosis = diagnose(conformanceResult, logStats);
      expect(diagnosis.recommendations).toContain(
        'Investigate root causes of rework (system errors, compliance exceptions, etc.).'
      );
    });
  });

  describe('activity ordering violations', () => {
    it('should detect ordering violations in deviating traces', () => {
      const conformanceResult: ConformanceResult = {
        fitness: 0.65,
        precision: 0.70,
        conformance_rate: 0.65,
        deviating_cases: 35,
        deviating_traces: [
          {
            case_id: 'case1',
            trace_fitness: 0.5,
            tokens_missing: 2,
            tokens_remaining: 1,
            deviations: [
              { activity: 'ActivityA', deviation_type: 'activity_out_of_order' },
              { activity: 'ActivityB', deviation_type: 'activity_out_of_order' },
            ],
          },
          {
            case_id: 'case2',
            trace_fitness: 0.6,
            tokens_missing: 1,
            tokens_remaining: 0,
            deviations: [
              { activity: 'ActivityC', deviation_type: 'activity_out_of_order' },
            ],
          },
        ],
      };

      const logStats: LogStats = {
        event_count: 3500,
        trace_count: 100,
        unique_activities: 12,
        unique_variants: 30,
        min_trace_length: 5,
        max_trace_length: 20,
        avg_trace_length: 7,
      };

      const diagnosis = diagnose(conformanceResult, logStats);
      expect(diagnosis.category).toBe('activity_ordering_violation');
      expect(diagnosis.severity).toBe('critical');
    });

    it('should recommend stricter algorithms for ordering violations', () => {
      const conformanceResult: ConformanceResult = {
        fitness: 0.62,
        precision: 0.68,
        conformance_rate: 0.62,
        deviating_cases: 38,
        deviating_traces: [
          {
            case_id: 'case1',
            trace_fitness: 0.4,
            tokens_missing: 3,
            tokens_remaining: 2,
            deviations: [
              { activity: 'A', deviation_type: 'activity_out_of_order' },
              { activity: 'B', deviation_type: 'activity_missing' },
              { activity: 'C', deviation_type: 'activity_out_of_order' },
            ],
          },
        ],
      };

      const logStats: LogStats = {
        event_count: 3000,
        trace_count: 100,
        unique_activities: 10,
        unique_variants: 25,
        min_trace_length: 5,
        max_trace_length: 18,
        avg_trace_length: 6.5,
      };

      const diagnosis = diagnose(conformanceResult, logStats);
      expect(diagnosis.recommendations).toContain(
        'Re-run discovery with a stricter algorithm (e.g., inductive_miner, genetic_algorithm).'
      );
    });
  });

  describe('insufficient coverage', () => {
    it('should detect when model covers <80% of activities', () => {
      const conformanceResult: ConformanceResult = {
        fitness: 0.75,
        precision: 0.60, // Low precision suggests missing activities
        conformance_rate: 0.75,
        deviating_cases: 25,
      };

      const logStats: LogStats = {
        event_count: 2500,
        trace_count: 100,
        unique_activities: 15, // Many activities
        unique_variants: 40,
        min_trace_length: 3,
        max_trace_length: 15,
        avg_trace_length: 6.5,
      };

      const diagnosis = diagnose(conformanceResult, logStats);
      expect(diagnosis.category).toBe('insufficient_coverage');
      expect(diagnosis.severity).toBe('high');
    });

    it('should provide activity discovery recommendations', () => {
      const conformanceResult: ConformanceResult = {
        fitness: 0.70,
        precision: 0.55,
        conformance_rate: 0.70,
        deviating_cases: 30,
      };

      const logStats: LogStats = {
        event_count: 2000,
        trace_count: 100,
        unique_activities: 20,
        unique_variants: 45,
        min_trace_length: 4,
        max_trace_length: 16,
        avg_trace_length: 6.8,
      };

      const diagnosis = diagnose(conformanceResult, logStats);
      expect(diagnosis.recommendations).toContain(
        'Use quality-focused algorithm (genetic_algorithm, ilp) to capture rare variants.'
      );
    });
  });

  describe('low fitness default', () => {
    it('should default to low_fitness when other categories do not apply', () => {
      const conformanceResult: ConformanceResult = {
        fitness: 0.75, // Below 0.85
        precision: 0.88, // Good precision => good coverage
        conformance_rate: 0.75,
        deviating_cases: 25,
      };

      const logStats: LogStats = {
        event_count: 2500,
        trace_count: 100, // Sufficient traces
        unique_activities: 5, // Few activities relative to trace length
        unique_variants: 25,
        min_trace_length: 5,
        max_trace_length: 15,
        avg_trace_length: 7,
        rework_ratio: 0.15, // Normal rework
      };

      const diagnosis = diagnose(conformanceResult, logStats);
      expect(diagnosis.category).toBe('low_fitness');
      expect(diagnosis.severity).toBe('medium');
    });

    it('should provide improvement recommendations for low fitness', () => {
      const conformanceResult: ConformanceResult = {
        fitness: 0.78,
        precision: 0.82,
        conformance_rate: 0.78,
        deviating_cases: 22,
      };

      const logStats: LogStats = {
        event_count: 2200,
        trace_count: 100,
        unique_activities: 8,
        unique_variants: 20,
        min_trace_length: 4,
        max_trace_length: 14,
        avg_trace_length: 6.5,
      };

      const diagnosis = diagnose(conformanceResult, logStats);
      expect(diagnosis.recommendations).toContain(
        'Try higher-quality discovery algorithm (genetic_algorithm, ilp, aco).'
      );
      expect(diagnosis.recommendations).toContain(
        'Verify the process model reflects the actual business process being mined.'
      );
    });
  });

  describe('edge cases', () => {
    it('should handle zero activities gracefully', () => {
      const conformanceResult: ConformanceResult = {
        fitness: 0.70,
        precision: null,
        conformance_rate: 0.70,
        deviating_cases: 0,
      };

      const logStats: LogStats = {
        event_count: 0,
        trace_count: 10,
        unique_activities: 0, // Edge case: zero activities
        unique_variants: 1,
        min_trace_length: 0,
        max_trace_length: 0,
        avg_trace_length: 0,
      };

      const diagnosis = diagnose(conformanceResult, logStats);
      // With zero activities, coverage becomes 0%, triggering insufficient_coverage
      expect(['insufficient_coverage', 'low_fitness']).toContain(diagnosis.category);
      expect(diagnosis).toBeDefined();
    });

    it('should handle missing deviating_traces property', () => {
      const conformanceResult: ConformanceResult = {
        fitness: 0.72,
        precision: 0.90, // Good precision ensures we don't trigger coverage check
        conformance_rate: 0.72,
        deviating_cases: 28,
        // deviating_traces is optional
      };

      const logStats: LogStats = {
        event_count: 2800,
        trace_count: 100,
        unique_activities: 5, // Few activities
        unique_variants: 30,
        min_trace_length: 5,
        max_trace_length: 15,
        avg_trace_length: 7,
      };

      const diagnosis = diagnose(conformanceResult, logStats);
      expect(diagnosis).toBeDefined();
      expect(diagnosis.category).toBe('low_fitness');
    });

    it('should respect confidence thresholds', () => {
      const conformanceResult: ConformanceResult = {
        fitness: 0.75,
        precision: 0.70,
        conformance_rate: 0.75,
        deviating_cases: 25,
      };

      const logStats: LogStats = {
        event_count: 2500,
        trace_count: 100,
        unique_activities: 12,
        unique_variants: 35,
        min_trace_length: 4,
        max_trace_length: 16,
        avg_trace_length: 6.8,
      };

      const diagnosis = diagnose(conformanceResult, logStats);
      expect(diagnosis.confidence).toBeGreaterThanOrEqual(0);
      expect(diagnosis.confidence).toBeLessThanOrEqual(1);
    });
  });

  describe('diagnosis metrics', () => {
    it('should include relevant metrics in diagnosis result', () => {
      const conformanceResult: ConformanceResult = {
        fitness: 0.72,
        precision: 0.75,
        conformance_rate: 0.72,
        deviating_cases: 28,
      };

      const logStats: LogStats = {
        event_count: 2800,
        trace_count: 100,
        unique_activities: 10,
        unique_variants: 30,
        min_trace_length: 5,
        max_trace_length: 15,
        avg_trace_length: 7,
      };

      const diagnosis = diagnose(conformanceResult, logStats);
      expect(diagnosis.metrics).toBeDefined();
      expect(diagnosis.metrics.fitness).toBeDefined();
      expect(diagnosis.metrics.fitness).toBe(0.72);
    });

    it('should populate metrics for rework loop diagnosis', () => {
      const conformanceResult: ConformanceResult = {
        fitness: 0.60,
        precision: 0.65,
        conformance_rate: 0.60,
        deviating_cases: 40,
      };

      const logStats: LogStats = {
        event_count: 4000,
        trace_count: 100,
        unique_activities: 8,
        unique_variants: 50,
        min_trace_length: 10,
        max_trace_length: 80,
        avg_trace_length: 50,
        rework_ratio: 0.4,
      };

      const diagnosis = diagnose(conformanceResult, logStats);
      expect(diagnosis.metrics.rework_ratio).toBeCloseTo(0.4, 1);
    });
  });
});
