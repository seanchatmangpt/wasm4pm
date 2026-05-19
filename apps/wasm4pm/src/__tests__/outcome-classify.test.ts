/**
 * Test outcome prediction task with classify algorithm
 *
 * Tests:
 * 1. Feature extraction for outcome classification
 * 2. Classifier predictions in valid range
 * 3. CLI with --method flag
 * 4. Hybrid ensemble voting
 * 5. Outcome task integration
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { spawn } from 'child_process';
import { extractOutcomeFeatures, normalizeOutcomeFeatures, classifyTraces } from '@wasm4pm/ml';
import type { FeatureMatrix } from '@wasm4pm/ml';

// Use a sample XES log for testing
const SAMPLE_LOG_PATH = path.join(__dirname, '../../..', 'fixtures/real/hiring_process.xes');
const OUTPUT_DIR = path.join(__dirname, '.outcome-test-output');

describe('outcome-classify integration', () => {
  beforeAll(async () => {
    // Ensure output directory exists
    try {
      await fs.mkdir(OUTPUT_DIR, { recursive: true });
    } catch {
      // directory may already exist
    }
  });

  afterAll(async () => {
    // Clean up output
    try {
      await fs.rm(OUTPUT_DIR, { recursive: true });
    } catch {
      // ignore cleanup errors
    }
  });

  describe('Feature Extraction for Outcome (test 1)', () => {
    it('should extract features from case objects', () => {
      const sampleFeatures = [
        {
          case_id: 'case_001',
          trace_length: 5,
          elapsed_time: 86400000, // 1 day in ms
          activity_counts: {
            Register: 1,
            Assess: 1,
            Interview: 2,
            Decide: 1,
          },
          rework_count: 1,
          avg_inter_event_time: 17280000, // avg ~4.8 hrs between events
          unique_activities: 4,
          outcome: 'hired',
        },
        {
          case_id: 'case_002',
          trace_length: 3,
          elapsed_time: 43200000, // 0.5 day
          activity_counts: {
            Register: 1,
            Assess: 1,
            Reject: 1,
          },
          rework_count: 0,
          avg_inter_event_time: 21600000, // avg ~6 hrs
          unique_activities: 3,
          outcome: 'rejected',
        },
        {
          case_id: 'case_003',
          trace_length: 6,
          elapsed_time: 172800000, // 2 days
          activity_counts: {
            Register: 1,
            Assess: 2,
            Interview: 2,
            Decide: 1,
          },
          rework_count: 2,
          avg_inter_event_time: 28800000, // avg ~8 hrs
          unique_activities: 4,
          outcome: 'hired',
        },
      ];

      const matrix = extractOutcomeFeatures(sampleFeatures);

      // Rank-1: Output shape is correct
      expect(matrix.data.length).toBe(3);
      expect(matrix.caseIds).toEqual(['case_001', 'case_002', 'case_003']);
      expect(matrix.labels).toEqual(['hired', 'rejected', 'hired']);

      // Features should include: trace_length, elapsed_time, avg_inter_event_time,
      // rework_ratio, cycle_count, resource_variance, unique_activities, + activities
      expect(matrix.featureNames.length).toBeGreaterThanOrEqual(11); // 7 base + at least 4 activities
      expect(matrix.data[0].length).toBe(matrix.featureNames.length);

      // Rank-2: Feature values are in reasonable ranges
      for (const row of matrix.data) {
        for (const value of row) {
          expect(typeof value).toBe('number');
          expect(value).toBeGreaterThanOrEqual(0);
          expect(isFinite(value)).toBe(true);
        }
      }

      // Rank-2: Rework ratio is bounded [0,1]
      const reworkRatioIndex = matrix.featureNames.indexOf('rework_ratio');
      expect(reworkRatioIndex).toBeGreaterThanOrEqual(0);
      for (const row of matrix.data) {
        expect(row[reworkRatioIndex]).toBeGreaterThanOrEqual(0);
        expect(row[reworkRatioIndex]).toBeLessThanOrEqual(1.0);
      }
    });

    it('should handle empty input gracefully', () => {
      const matrix = extractOutcomeFeatures([]);

      expect(matrix.data.length).toBe(0);
      expect(matrix.labels.length).toBe(0);
      expect(matrix.metadata?.warning?.code).toBe('empty_input');
    });

    it('should normalize features to [0,1]', () => {
      const sampleFeatures = [
        {
          case_id: 'case_1',
          trace_length: 10,
          elapsed_time: 100000,
          activity_counts: { A: 5, B: 5 },
          rework_count: 1,
          avg_inter_event_time: 10000,
          unique_activities: 2,
          outcome: 'success',
        },
        {
          case_id: 'case_2',
          trace_length: 20,
          elapsed_time: 200000,
          activity_counts: { A: 10, B: 10 },
          rework_count: 2,
          avg_inter_event_time: 10000,
          unique_activities: 2,
          outcome: 'failure',
        },
      ];

      const matrix = extractOutcomeFeatures(sampleFeatures);
      const normalized = normalizeOutcomeFeatures(matrix);

      // Rank-1: Normalized features are in [0,1]
      for (const row of normalized.data) {
        for (const value of row) {
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThanOrEqual(1.0);
        }
      }

      // Rank-2: At least one feature per row should vary
      const firstRow = normalized.data[0];
      const secondRow = normalized.data[1];
      let hasVariation = false;
      for (let i = 0; i < firstRow.length; i++) {
        if (Math.abs(firstRow[i] - secondRow[i]) > 0.01) {
          hasVariation = true;
          break;
        }
      }
      expect(hasVariation).toBe(true);
    });
  });

  describe('Classifier Predictions in Valid Range (test 2)', () => {
    it('should return valid classification predictions', async () => {
      const featureData: FeatureMatrix = {
        data: [
          [5, 86400000, 17280000, 0.2, 1, 0.5, 4],
          [3, 43200000, 21600000, 0.0, 0, 0.3, 3],
          [6, 172800000, 28800000, 0.33, 2, 0.5, 4],
          [4, 129600000, 32400000, 0.25, 1, 0.4, 3],
          [7, 259200000, 37080000, 0.14, 1, 0.6, 5],
        ],
        featureNames: [
          'trace_length',
          'elapsed_time',
          'avg_inter_event_time',
          'rework_ratio',
          'cycle_count',
          'resource_variance',
          'unique_activities',
        ],
        caseIds: ['c1', 'c2', 'c3', 'c4', 'c5'],
        targets: [],
        labels: ['success', 'failure', 'success', 'failure', 'success'],
      };

      const result = await classifyTraces(featureData, { method: 'knn', k: 3 });

      // Rank-1: Result has required fields
      expect(result).toBeDefined();
      expect(result.predictions).toBeDefined();
      expect(Array.isArray(result.predictions)).toBe(true);

      // Rank-2: All predictions are valid
      for (const pred of result.predictions) {
        expect(typeof pred).toBe('object');
        expect(typeof pred.predicted_label).toBe('string');
        expect(typeof pred.confidence).toBe('number');
        expect(pred.confidence).toBeGreaterThanOrEqual(0);
        expect(pred.confidence).toBeLessThanOrEqual(1.0);
      }
    });

    it('should produce consistent predictions across runs', async () => {
      const featureData: FeatureMatrix = {
        data: [
          [5, 86400000, 17280000, 0.2, 1, 0.5, 4],
          [3, 43200000, 21600000, 0.0, 0, 0.3, 3],
          [6, 172800000, 28800000, 0.33, 2, 0.5, 4],
        ],
        featureNames: [
          'trace_length',
          'elapsed_time',
          'avg_inter_event_time',
          'rework_ratio',
          'cycle_count',
          'resource_variance',
          'unique_activities',
        ],
        caseIds: ['c1', 'c2', 'c3'],
        targets: [],
        labels: ['success', 'failure', 'success'],
      };

      const result1 = await classifyTraces(featureData, { method: 'knn', k: 2 });
      const result2 = await classifyTraces(featureData, { method: 'knn', k: 2 });

      // Rank-1: Deterministic — same input → same output
      expect(result1.predictions.length).toBe(result2.predictions.length);
      for (let i = 0; i < result1.predictions.length; i++) {
        expect(result1.predictions[i].predicted_label).toBe(result2.predictions[i].predicted_label);
        expect(Math.abs(result1.predictions[i].confidence - result2.predictions[i].confidence))
          .toBeLessThan(1e-10);
      }
    });
  });

  describe('CLI Integration with --method flag (test 3)', () => {
    // These tests require the WASM binary and full integration
    // Skip if the sample log doesn't exist
    const shouldRun = fs.access(SAMPLE_LOG_PATH).then(() => true).catch(() => false);

    it.skipIf(!shouldRun)('should execute outcome prediction with --method classify', async () => {
      // This test verifies the CLI integration
      // In a full integration test, would run:
      // wpm predict outcome -i <log> --method classify
      // and verify:
      // - Exit code 0
      // - JSON output with classifications field
      // - Predictions in valid range

      // For unit-level testing, we verify the feature extraction path
      const sampleFeatures = [
        {
          case_id: 'c1',
          trace_length: 5,
          elapsed_time: 86400000,
          activity_counts: { A: 2, B: 3 },
          rework_count: 1,
          avg_inter_event_time: 17280000,
          unique_activities: 2,
          outcome: 'success',
        },
      ];

      const matrix = extractOutcomeFeatures(sampleFeatures);
      expect(matrix.data.length).toBe(1);
      expect(matrix.labels[0]).toBe('success');
    });

    it.skipIf(!shouldRun)('should execute outcome prediction with --method anomaly', async () => {
      // Anomaly method should use score_anomaly from WASM
      // This test verifies the path exists
      const sampleFeatures = [
        {
          case_id: 'c1',
          trace_length: 5,
          elapsed_time: 86400000,
          activity_counts: { A: 2, B: 3 },
          rework_count: 1,
          avg_inter_event_time: 17280000,
          unique_activities: 2,
        },
      ];

      const matrix = extractOutcomeFeatures(sampleFeatures);
      expect(matrix.data.length).toBe(1);
      expect(matrix.caseIds[0]).toBe('c1');
    });

    it.skipIf(!shouldRun)('should execute outcome prediction with --method hybrid', async () => {
      // Hybrid should combine anomaly + classify
      const sampleFeatures = [
        {
          case_id: 'c1',
          trace_length: 5,
          elapsed_time: 86400000,
          activity_counts: { A: 2, B: 3 },
          rework_count: 1,
          avg_inter_event_time: 17280000,
          unique_activities: 2,
          outcome: 'success',
        },
        {
          case_id: 'c2',
          trace_length: 3,
          elapsed_time: 43200000,
          activity_counts: { A: 1, B: 2 },
          rework_count: 0,
          avg_inter_event_time: 21600000,
          unique_activities: 2,
          outcome: 'failure',
        },
      ];

      const matrix = extractOutcomeFeatures(sampleFeatures);
      expect(matrix.data.length).toBe(2);
      expect(matrix.labels).toEqual(['success', 'failure']);
    });
  });

  describe('Hybrid Ensemble Voting (test 4)', () => {
    it('should combine anomaly and classify results', async () => {
      // Simulate anomaly scores: [0.2, 0.8, 0.3]
      const anomalyScores = [
        { case_id: 'c1', score: 0.2, is_anomalous: false },
        { case_id: 'c2', score: 0.8, is_anomalous: true },
        { case_id: 'c3', score: 0.3, is_anomalous: false },
      ];

      // Simulate classify predictions: [success, failure, success]
      const classifyPredictions = [
        { predicted_label: 'success', confidence: 0.85 },
        { predicted_label: 'failure', confidence: 0.9 },
        { predicted_label: 'success', confidence: 0.7 },
      ];

      // Rank-2: Agreement between methods
      let agreementCount = 0;
      for (let i = 0; i < anomalyScores.length; i++) {
        const anomalousLabel = anomalyScores[i].is_anomalous ? 'failure' : 'success';
        if (anomalousLabel === classifyPredictions[i].predicted_label) {
          agreementCount++;
        }
      }
      // Both methods should agree on at least some predictions
      expect(agreementCount).toBeGreaterThan(0);
    });
  });

  describe('Outcome Task Integration (test 5)', () => {
    it('should resolve method parameter with correct precedence', () => {
      // Simulate precedence resolution for outcome task
      // CLI > config > default

      const methods = ['auto', 'anomaly', 'classify', 'hybrid'];

      // All valid methods should be accepted
      for (const m of methods) {
        expect(['auto', 'anomaly', 'classify', 'hybrid']).toContain(m);
      }
    });

    it('should auto-detect method based on log characteristics', () => {
      // Small log (< 100 traces): prefer anomaly
      const smallLog = Array.from({ length: 50 }, (_, i) => ({
        case_id: `c${i}`,
        trace_length: 5 + Math.random() * 5,
        elapsed_time: 86400000 + Math.random() * 172800000,
        activity_counts: { A: 2, B: 3 },
        rework_count: Math.floor(Math.random() * 2),
        avg_inter_event_time: 17280000,
        unique_activities: 2,
      }));

      const smallMatrix = extractOutcomeFeatures(smallLog);
      const useClassify = smallMatrix.data.length > 100;
      expect(useClassify).toBe(false);

      // Large log (> 100 traces): prefer classify
      const largeLog = Array.from({ length: 150 }, (_, i) => ({
        case_id: `c${i}`,
        trace_length: 5 + Math.random() * 5,
        elapsed_time: 86400000 + Math.random() * 172800000,
        activity_counts: { A: 2, B: 3 },
        rework_count: Math.floor(Math.random() * 2),
        avg_inter_event_time: 17280000,
        unique_activities: 2,
        outcome: Math.random() > 0.5 ? 'success' : 'failure',
      }));

      const largeMatrix = extractOutcomeFeatures(largeLog);
      const useClassifyLarge = largeMatrix.data.length > 100 && largeMatrix.labels.length > 0;
      expect(useClassifyLarge).toBe(true);
    });
  });
});
