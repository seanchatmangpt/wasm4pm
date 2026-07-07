/**
 * conformance-enhancements.test.ts — Enhanced conformance reporting tests
 *
 * Tests for:
 * 1. Fitness breakdown calculation and reporting
 * 2. Multi-model comparison
 * 3. Trace-level conformance details
 * 4. Bottleneck identification
 * 5. CSV export functionality
 * 6. Enhanced human-readable output
 */

import { describe, it, expect } from 'vitest';
import {
  formatFitnessBreakdown,
  compareModels,
  exportTracesAsCSV,
  identifyBottlenecks,
  type FitnessBreakdown,
  type ModelComparisonResult,
  type TraceConformanceDetail,
  type ActivityFitnessContribution,
} from '../commands/conformance-enhanced.js';

describe('Enhanced Conformance Reporting', () => {
  // ─── Test 1: Fitness Breakdown Formatting ─────────────────────────────────

  it('T1: formats fitness breakdown with all metrics', () => {
    const breakdown: FitnessBreakdown = {
      overall_fitness: 0.85,
      token_missing_pct: 5.0,
      token_produced_pct: 50.0,
      token_consumed_pct: 45.0,
      token_remaining_pct: 0.0,
      total_missing: 10,
      total_produced: 100,
      total_consumed: 90,
      total_remaining: 0,
    };

    const formatted = formatFitnessBreakdown(breakdown);

    expect(formatted).toContain('Fitness Breakdown:');
    expect(formatted).toContain('Overall Fitness:     0.850');
    expect(formatted).toContain('Token Missing:       5.0% (10 tokens)');
    expect(formatted).toContain('Token Produced:      50.0% (100 tokens)');
    expect(formatted).toContain('Token Consumed:      45.0% (90 tokens)');
    expect(formatted).toContain('Token Remaining:     0.0% (0 tokens)');
  });

  // ─── Test 2: CSV Export ─────────────────────────────────────────────────

  it('T2: exports trace details as valid CSV', () => {
    const traces: TraceConformanceDetail[] = [
      {
        case_id: 'case_001',
        is_conforming: true,
        trace_fitness: 1.0,
        tokens_missing: 0,
        tokens_remaining: 0,
        deviation_count: 0,
      },
      {
        case_id: 'case_002',
        is_conforming: false,
        trace_fitness: 0.75,
        tokens_missing: 2,
        tokens_remaining: 1,
        deviation_count: 1,
      },
    ];

    const csv = exportTracesAsCSV(traces);
    const lines = csv.split('\n');

    expect(lines[0]).toBe('case_id,is_conforming,trace_fitness,tokens_missing,tokens_remaining,deviation_count');
    expect(lines[1]).toContain('case_001,true,1.000,0,0,0');
    expect(lines[2]).toContain('case_002,false,0.750,2,1,1');
  });

  // ─── Test 3: Model Comparison Ranking ────────────────────────────────────

  it('T3: ranks models by fitness and returns best model', () => {
    const results = [
      {
        model_path: 'model_a.json',
        payload: {
          schema: 'test',
          status: 'success',
          input: 'log.xes',
          activityKey: 'concept:name',
          method: 'token-replay',
          threshold: 0.8,
          fitness: 0.75,
          precision: 0.72,
          precision_available: true,
          computed_at: 'fast' as const,
          generalization: null,
          isFit: false,
          summary: { total_cases: 0, conforming_cases: 0, deviating_cases: 0, conformance_rate: 0 },
          diagnostics: { traced: 0, remaining: 0, missing: 0, consumed: 0, produced: 0 },
          deviating_traces: [],
          modelHandle: 'handle_a',
        },
      },
      {
        model_path: 'model_b.json',
        payload: {
          schema: 'test',
          status: 'success',
          input: 'log.xes',
          activityKey: 'concept:name',
          method: 'token-replay',
          threshold: 0.8,
          fitness: 0.92,
          precision: 0.88,
          precision_available: true,
          computed_at: 'fast' as const,
          generalization: null,
          isFit: true,
          summary: { total_cases: 0, conforming_cases: 0, deviating_cases: 0, conformance_rate: 0 },
          diagnostics: { traced: 0, remaining: 0, missing: 0, consumed: 0, produced: 0 },
          deviating_traces: [],
          modelHandle: 'handle_b',
        },
      },
    ];

    const comparison = compareModels(results);

    expect(comparison.best_model).toBe('model_b.json');
    expect(comparison.models[0].rank).toBe(1);
    expect(comparison.models[0].fitness).toBe(0.92);
    expect(comparison.models[1].rank).toBe(2);
    expect(comparison.models[1].fitness).toBe(0.75);
    expect(comparison.recommendation).toContain('model_b.json');
  });

  // ─── Test 4: Model Comparison Below Threshold ──────────────────────────

  it('T4: provides recommendation when no model exceeds 0.85 threshold', () => {
    const results = [
      {
        model_path: 'model_a.json',
        payload: {
          schema: 'test',
          status: 'conformance_fail',
          input: 'log.xes',
          activityKey: 'concept:name',
          method: 'token-replay',
          threshold: 0.8,
          fitness: 0.72,
          precision: null,
          precision_available: false,
          computed_at: 'fast' as const,
          generalization: null,
          isFit: false,
          summary: { total_cases: 0, conforming_cases: 0, deviating_cases: 0, conformance_rate: 0 },
          diagnostics: { traced: 0, remaining: 0, missing: 0, consumed: 0, produced: 0 },
          deviating_traces: [],
          modelHandle: 'handle_a',
        },
      },
    ];

    const comparison = compareModels(results);

    expect(comparison.recommendation).toContain('No model achieved fitness > 0.85');
    expect(comparison.recommendation).toContain('model_a.json');
  });

  // ─── Test 5: Bottleneck Identification ──────────────────────────────────

  it('T5: identifies top bottleneck activities', () => {
    const activities: ActivityFitnessContribution[] = [
      {
        activity: 'Approve',
        occurrences: 100,
        conforming_occurrences: 95,
        fitness: 0.95,
        missing_tokens: 5,
      },
      {
        activity: 'Review',
        occurrences: 100,
        conforming_occurrences: 50,
        fitness: 0.5,
        missing_tokens: 50,
      },
      {
        activity: 'Validate',
        occurrences: 100,
        conforming_occurrences: 70,
        fitness: 0.7,
        missing_tokens: 30,
      },
    ];

    const bottlenecks = identifyBottlenecks(activities);

    expect(bottlenecks.length).toBeGreaterThan(0);
    expect(bottlenecks[0].activity).toBe('Review'); // Highest missing ratio: 50/100 = 0.5
    expect(bottlenecks[0].missing_ratio).toBe(0.5);
    expect(bottlenecks[1].activity).toBe('Validate'); // 30/100 = 0.3
  });

  // ─── Test 6: Empty Activities Handling ──────────────────────────────────

  it('T6: handles empty activities list gracefully', () => {
    const activities: ActivityFitnessContribution[] = [];
    const bottlenecks = identifyBottlenecks(activities);

    expect(bottlenecks).toEqual([]);
  });

  // ─── Test 7: CSV Header Correctness ────────────────────────────────────

  it('T7: generates correct CSV header', () => {
    const traces: TraceConformanceDetail[] = [];
    const csv = exportTracesAsCSV(traces);
    const header = csv.split('\n')[0];

    expect(header).toBe(
      'case_id,is_conforming,trace_fitness,tokens_missing,tokens_remaining,deviation_count'
    );
  });

  // ─── Test 8: Model Comparison with Precision Nulls ────────────────────

  it('T8: handles null precision values in model comparison', () => {
    const results = [
      {
        model_path: 'model_no_precision.json',
        payload: {
          schema: 'test',
          status: 'success',
          input: 'log.xes',
          activityKey: 'concept:name',
          method: 'token-replay',
          threshold: 0.8,
          fitness: 0.88,
          precision: null,
          precision_available: false,
          computed_at: 'fast' as const,
          generalization: null,
          isFit: true,
          summary: { total_cases: 0, conforming_cases: 0, deviating_cases: 0, conformance_rate: 0 },
          diagnostics: { traced: 0, remaining: 0, missing: 0, consumed: 0, produced: 0 },
          deviating_traces: [],
          modelHandle: 'handle',
        },
      },
    ];

    const comparison = compareModels(results);

    expect(comparison.models[0].precision).toBeNull();
    expect(comparison.best_model).toBe('model_no_precision.json');
  });
});
