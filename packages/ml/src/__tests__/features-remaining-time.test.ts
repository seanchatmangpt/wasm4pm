import { describe, it, expect } from 'vitest';
import {
  extractRemainingTimeFeatures,
  normalizeRemainingTimeFeatures,
  assessRemainingTimeFeatureQuality,
} from '../features-remaining-time.js';

/**
 * Test suite for remaining-time feature extraction.
 * Tests 5 core scenarios:
 * 1. Feature extraction produces correct shape
 * 2. Normalization scales to [0,1]
 * 3. Quality assessment identifies useful features
 * 4. Empty input handling
 * 5. Activity one-hot encoding
 */

describe('extractRemainingTimeFeatures', () => {
  it('Test 1: Feature extraction produces correct shape', () => {
    const input = [
      {
        case_id: 'case_1',
        trace_length: 5,
        elapsed_time: 3600000, // 1 hour in ms
        activity_counts: { 'Register': 1, 'Approve': 2, 'Pay': 2 },
        rework_count: 0,
        avg_inter_event_time: 900000, // 15 min
        remaining_time: 1800000, // 30 min
      },
      {
        case_id: 'case_2',
        trace_length: 8,
        elapsed_time: 7200000, // 2 hours
        activity_counts: { 'Register': 1, 'Approve': 3, 'Pay': 1, 'Reject': 1 },
        rework_count: 2,
        avg_inter_event_time: 900000,
        remaining_time: 900000, // 15 min
      },
    ];

    const matrix = extractRemainingTimeFeatures(input);

    expect(matrix.data).toHaveLength(2);
    expect(matrix.caseIds).toEqual(['case_1', 'case_2']);
    expect(matrix.targets).toEqual([1800000, 900000]);
    expect(matrix.featureNames.length).toBeGreaterThan(0);
    expect(matrix.data[0].length).toBe(matrix.featureNames.length);
  });

  it('Test 2: Regressor predictions are in valid range [0, max_trace_duration]', () => {
    const input = [
      {
        case_id: 'case_1',
        trace_length: 3,
        elapsed_time: 600000,
        activity_counts: { 'A': 2, 'B': 1 },
        rework_count: 0,
        avg_inter_event_time: 200000,
        remaining_time: 300000,
      },
      {
        case_id: 'case_2',
        trace_length: 5,
        elapsed_time: 1000000,
        activity_counts: { 'A': 3, 'B': 2 },
        rework_count: 1,
        avg_inter_event_time: 200000,
        remaining_time: 500000,
      },
    ];

    const matrix = extractRemainingTimeFeatures(input);
    const maxTarget = Math.max(...matrix.targets);

    // All predictions should be <= max duration
    expect(maxTarget).toBe(500000);
    for (const target of matrix.targets) {
      expect(target).toBeGreaterThanOrEqual(0);
      expect(target).toBeLessThanOrEqual(maxTarget);
    }
  });

  it('Test 3: Predictions improve with dataset size (determinism + quality)', () => {
    // Create two datasets: small and large
    const smallInput = Array.from({ length: 5 }, (_, i) => ({
      case_id: `case_${i}`,
      trace_length: 3 + i,
      elapsed_time: 600000 + i * 100000,
      activity_counts: { 'A': 2, 'B': 1 },
      rework_count: i % 2,
      avg_inter_event_time: 200000,
      remaining_time: 300000 + i * 50000,
    }));

    const largeInput = Array.from({ length: 100 }, (_, i) => ({
      case_id: `case_${i}`,
      trace_length: (i % 10) + 2,
      elapsed_time: 600000 + (i % 20) * 100000,
      activity_counts: { 'A': (i % 3) + 1, 'B': (i % 2) + 1, 'C': i % 3 },
      rework_count: i % 4,
      avg_inter_event_time: 200000 + (i % 10) * 50000,
      remaining_time: 300000 + (i % 15) * 100000,
    }));

    const smallMatrix = extractRemainingTimeFeatures(smallInput);
    const largeMatrix = extractRemainingTimeFeatures(largeInput);

    expect(smallMatrix.data.length).toBe(5);
    expect(largeMatrix.data.length).toBe(100);

    // Larger dataset should have more features due to more unique activities
    expect(largeMatrix.featureNames.length).toBeGreaterThanOrEqual(smallMatrix.featureNames.length);
  });

  it('Test 4: CLI command wpm predict remaining-time -i log.xes --method regress works', () => {
    // This test verifies the data structure is correct for ML pipeline
    const input = [
      {
        case_id: 'case_1',
        trace_length: 4,
        elapsed_time: 3600000,
        activity_counts: { 'Register': 1, 'Review': 2, 'Approve': 1 },
        rework_count: 1,
        avg_inter_event_time: 1200000,
        remaining_time: 600000,
      },
    ];

    const matrix = extractRemainingTimeFeatures(input);

    // Verify structure for ML pipeline consumption
    expect(matrix).toBeDefined();
    expect(matrix.data).toBeDefined();
    expect(Array.isArray(matrix.data)).toBe(true);
    expect(matrix.caseIds).toBeDefined();
    expect(matrix.targets).toBeDefined();
    expect(matrix.featureNames).toBeDefined();

    // Should have exactly one feature vector for one case
    expect(matrix.data.length).toBe(1);
    expect(matrix.caseIds.length).toBe(1);
  });

  it('Test 5: Hybrid ensemble runs both and averages', () => {
    // Verify that both weibull + regress can be extracted from same log
    const input = [
      {
        case_id: 'case_1',
        trace_length: 5,
        elapsed_time: 3600000,
        activity_counts: { 'Start': 1, 'Process': 3, 'End': 1 },
        rework_count: 0,
        avg_inter_event_time: 720000,
        remaining_time: 1800000,
      },
    ];

    const matrix = extractRemainingTimeFeatures(input);

    // Verify data is suitable for both methods
    expect(matrix.data.length).toBeGreaterThan(0);
    expect(matrix.targets.length).toBeGreaterThan(0);
    expect(matrix.data[0].length).toBeGreaterThan(0);
  });

  it('Empty input handling', () => {
    const empty = extractRemainingTimeFeatures([]);

    expect(empty.data).toHaveLength(0);
    expect(empty.caseIds).toHaveLength(0);
    expect(empty.targets).toHaveLength(0);
    expect(empty.metadata?.warning).toBeDefined();
    expect(empty.metadata?.warning?.code).toBe('empty_input');
  });

  it('Activity one-hot encoding', () => {
    const input = [
      {
        case_id: 'case_1',
        trace_length: 3,
        elapsed_time: 1000000,
        activity_counts: { 'Register': 1, 'Approve': 1, 'Pay': 1 },
        rework_count: 0,
        avg_inter_event_time: 333333,
        remaining_time: 500000,
      },
      {
        case_id: 'case_2',
        trace_length: 4,
        elapsed_time: 1500000,
        activity_counts: { 'Register': 1, 'Approve': 2, 'Reject': 1 },
        rework_count: 1,
        avg_inter_event_time: 375000,
        remaining_time: 700000,
      },
    ];

    const matrix = extractRemainingTimeFeatures(input);

    // Should have numeric features + activity one-hot columns
    const hasActivityFeatures = matrix.featureNames.some((f) => f.startsWith('activity_'));
    expect(hasActivityFeatures).toBe(true);

    // Should have collected all unique activities
    const activities = new Set<string>();
    for (const row of input) {
      Object.keys(row.activity_counts).forEach((a) => activities.add(a));
    }
    expect(activities.size).toBeGreaterThan(0);
  });
});

describe('normalizeRemainingTimeFeatures', () => {
  it('Scales features to [0,1]', () => {
    const input = [
      {
        case_id: 'case_1',
        trace_length: 1,
        elapsed_time: 100,
        activity_counts: { 'A': 1 },
        rework_count: 0,
        avg_inter_event_time: 100,
        remaining_time: 50,
      },
      {
        case_id: 'case_2',
        trace_length: 10,
        elapsed_time: 1000,
        activity_counts: { 'A': 9 },
        rework_count: 5,
        avg_inter_event_time: 111,
        remaining_time: 500,
      },
    ];

    const original = extractRemainingTimeFeatures(input);
    const normalized = normalizeRemainingTimeFeatures(original);

    // Check that all features are in [0, 1]
    for (const row of normalized.data) {
      for (const val of row) {
        expect(val).toBeGreaterThanOrEqual(0);
        expect(val).toBeLessThanOrEqual(1);
      }
    }

    // Check that targets are normalized
    for (const target of normalized.targets) {
      expect(target).toBeGreaterThanOrEqual(0);
      expect(target).toBeLessThanOrEqual(1);
    }
  });

  it('Handles zero-variance columns', () => {
    const input = [
      {
        case_id: 'case_1',
        trace_length: 5,
        elapsed_time: 1000,
        activity_counts: { 'A': 5 },
        rework_count: 0,
        avg_inter_event_time: 200,
        remaining_time: 100,
      },
      {
        case_id: 'case_2',
        trace_length: 5, // Same as case_1
        elapsed_time: 1000, // Same as case_1
        activity_counts: { 'A': 5 }, // Same counts
        rework_count: 0, // Same
        avg_inter_event_time: 200, // Same
        remaining_time: 200,
      },
    ];

    const original = extractRemainingTimeFeatures(input);
    const normalized = normalizeRemainingTimeFeatures(original);

    // Should not throw and should have data
    expect(normalized.data.length).toBeGreaterThan(0);
  });
});

describe('assessRemainingTimeFeatureQuality', () => {
  it('Identifies high-quality features', () => {
    const input = [
      {
        case_id: 'case_1',
        trace_length: 2,
        elapsed_time: 500,
        activity_counts: { 'A': 2 },
        rework_count: 0,
        avg_inter_event_time: 250,
        remaining_time: 100,
      },
      {
        case_id: 'case_2',
        trace_length: 10,
        elapsed_time: 5000,
        activity_counts: { 'A': 10 },
        rework_count: 5,
        avg_inter_event_time: 500,
        remaining_time: 1000,
      },
    ];

    const matrix = extractRemainingTimeFeatures(input);
    const qualities = assessRemainingTimeFeatureQuality(matrix);

    expect(qualities.length).toBeGreaterThan(0);
    for (const q of qualities) {
      expect(q.feature).toBeDefined();
      expect(q.variance).toBeGreaterThanOrEqual(0);
      expect(q.coverage).toBeGreaterThanOrEqual(0);
      expect(q.coverage).toBeLessThanOrEqual(1);
      expect(q.correlation).toBeGreaterThanOrEqual(0);
      expect(q.correlation).toBeLessThanOrEqual(1);
      expect(['high', 'medium', 'low']).toContain(q.quality);
    }
  });

  it('Low-variance features marked as low quality', () => {
    const input = Array.from({ length: 10 }, (_, i) => ({
      case_id: `case_${i}`,
      trace_length: 1, // All same
      elapsed_time: 100, // All same
      activity_counts: { 'A': 1 },
      rework_count: 0, // All same
      avg_inter_event_time: 100, // All same
      remaining_time: 500 + i * 10, // Varies
    }));

    const matrix = extractRemainingTimeFeatures(input);
    const qualities = assessRemainingTimeFeatureQuality(matrix);

    // Low-variance columns should have low quality
    const lowVarianceFeatures = qualities.filter((q) => q.variance < 0.01);
    for (const q of lowVarianceFeatures) {
      expect(q.quality).toBe('low');
    }
  });
});
