/**
 * Tests for algorithm-selector.ts
 *
 * Covers:
 * - Log profile extraction
 * - Algorithm selection for all 6 prediction tasks
 * - Confidence scoring
 * - Alternative algorithm suggestions
 * - Edge cases (empty logs, very large logs, etc.)
 */

import { describe, it, expect } from 'vitest';
import {
  extractLogProfile,
  selectBestAlgorithmForTask,
  recommendAlgorithm,
  type LogProfile,
  type AlgorithmRecommendation,
} from '../algorithm-selector.js';

describe('algorithm-selector', () => {
  describe('extractLogProfile', () => {
    it('should handle empty feature array', () => {
      const profile = extractLogProfile([]);
      expect(profile.traceCount).toBe(0);
      expect(profile.activityCount).toBe(0);
      expect(profile.entropy).toBe(0);
      expect(profile.avgTraceLength).toBe(0);
      expect(profile.featureVariance).toBe(0);
      expect(profile.variantCount).toBe(0);
    });

    it('should extract log characteristics from features', () => {
      const features = [
        { trace_length: 5, unique_activities: 3 },
        { trace_length: 7, unique_activities: 4 },
        { trace_length: 6, unique_activities: 3 },
      ];
      const profile = extractLogProfile(features);

      expect(profile.traceCount).toBe(3);
      expect(profile.avgTraceLength).toBe(6); // (5+7+6)/3
      expect(profile.activityCount).toBeGreaterThan(0); // Should detect unique activities
    });

    it('should compute entropy for diverse activities', () => {
      const features = [
        { trace_length: 5, unique_activities: 1 },
        { trace_length: 5, unique_activities: 5 },
        { trace_length: 5, unique_activities: 10 },
      ];
      const profile = extractLogProfile(features);

      // Diverse activity counts should produce non-zero entropy
      expect(profile.entropy).toBeGreaterThan(0);
    });

    it('should estimate variant count from trace combinations', () => {
      const features = [
        { trace_length: 5, unique_activities: 3 },
        { trace_length: 5, unique_activities: 3 }, // Duplicate
        { trace_length: 7, unique_activities: 4 }, // New variant
      ];
      const profile = extractLogProfile(features);

      // Should detect 2 unique variants (two distinct trace_length:activity combinations)
      expect(profile.variantCount).toBe(2);
    });
  });

  describe('selectBestAlgorithmForTask: next-activity', () => {
    it('should recommend ngram for large, diverse logs', () => {
      const profile: LogProfile = {
        traceCount: 1000,
        activityCount: 50,
        entropy: 0.8,
        avgTraceLength: 15,
        featureVariance: 2.0,
        variantCount: 500,
      };
      const rec = selectBestAlgorithmForTask('next-activity', profile);

      expect(rec.algorithm).toBe('ngram');
      expect(rec.confidence).toBeGreaterThan(0.8);
      expect(rec.alternatives).toContain('markov');
    });

    it('should recommend dfg for small logs', () => {
      const profile: LogProfile = {
        traceCount: 100,
        activityCount: 10,
        entropy: 0.3,
        avgTraceLength: 5,
        featureVariance: 0.5,
        variantCount: 20,
      };
      const rec = selectBestAlgorithmForTask('next-activity', profile);

      expect(rec.algorithm).toBe('dfg');
      expect(rec.confidence).toBeGreaterThan(0.7);
      expect(rec.reason).toMatch(/small|low/i);
    });

    it('should recommend markov for medium logs', () => {
      const profile: LogProfile = {
        traceCount: 400,
        activityCount: 20,
        entropy: 0.6,
        avgTraceLength: 10,
        featureVariance: 1.0,
        variantCount: 100,
      };
      const rec = selectBestAlgorithmForTask('next-activity', profile);

      expect(rec.algorithm).toBe('markov');
      expect(rec.confidence).toBeGreaterThan(0.7);
    });
  });

  describe('selectBestAlgorithmForTask: remaining-time', () => {
    it('should recommend regress for large logs with feature variance', () => {
      const profile: LogProfile = {
        traceCount: 2000,
        activityCount: 50,
        entropy: 0.7,
        avgTraceLength: 20,
        featureVariance: 2.0,
        variantCount: 600,
      };
      const rec = selectBestAlgorithmForTask('remaining-time', profile);

      expect(rec.algorithm).toBe('regress');
      expect(rec.confidence).toBeGreaterThan(0.85);
      expect(rec.alternatives).toContain('hybrid');
    });

    it('should recommend weibull for small logs', () => {
      const profile: LogProfile = {
        traceCount: 100,
        activityCount: 10,
        entropy: 0.3,
        avgTraceLength: 5,
        featureVariance: 0.3,
        variantCount: 20,
      };
      const rec = selectBestAlgorithmForTask('remaining-time', profile);

      expect(rec.algorithm).toBe('weibull');
      expect(rec.confidence).toBeGreaterThan(0.8);
      expect(rec.reason).toMatch(/small|log/i);
    });

    it('should recommend hybrid for medium logs', () => {
      const profile: LogProfile = {
        traceCount: 400,
        activityCount: 20,
        entropy: 0.5,
        avgTraceLength: 10,
        featureVariance: 0.8,
        variantCount: 100,
      };
      const rec = selectBestAlgorithmForTask('remaining-time', profile);

      expect(rec.algorithm).toBe('hybrid');
      expect(rec.confidence).toBeGreaterThan(0.7);
    });

    it('should recommend weibull when feature variance is low even in large logs', () => {
      const profile: LogProfile = {
        traceCount: 2000,
        activityCount: 50,
        entropy: 0.7,
        avgTraceLength: 20,
        featureVariance: 0.1, // Low variance
        variantCount: 600,
      };
      const rec = selectBestAlgorithmForTask('remaining-time', profile);

      // Should not recommend regress due to low feature variance
      expect(rec.algorithm).not.toBe('regress');
    });
  });

  describe('selectBestAlgorithmForTask: outcome', () => {
    it('should recommend anomaly_scoring for complex processes', () => {
      const profile: LogProfile = {
        traceCount: 1000,
        activityCount: 40,
        entropy: 0.8,
        avgTraceLength: 20,
        featureVariance: 1.5,
        variantCount: 300,
      };
      const rec = selectBestAlgorithmForTask('outcome', profile);

      expect(rec.algorithm).toBe('anomaly_scoring');
      expect(rec.confidence).toBeGreaterThan(0.7);
    });

    it('should recommend likelihood_scoring for simple processes', () => {
      const profile: LogProfile = {
        traceCount: 200,
        activityCount: 5,
        entropy: 0.2,
        avgTraceLength: 5,
        featureVariance: 0.3,
        variantCount: 10,
      };
      const rec = selectBestAlgorithmForTask('outcome', profile);

      expect(rec.algorithm).toBe('likelihood_scoring');
      expect(rec.confidence).toBeGreaterThan(0.7);
    });
  });

  describe('selectBestAlgorithmForTask: drift', () => {
    it('should recommend jaccard for large logs', () => {
      const profile: LogProfile = {
        traceCount: 1000,
        activityCount: 30,
        entropy: 0.7,
        avgTraceLength: 15,
        featureVariance: 1.2,
        variantCount: 200,
      };
      const rec = selectBestAlgorithmForTask('drift', profile);

      expect(rec.algorithm).toBe('jaccard_window');
      expect(rec.confidence).toBeGreaterThan(0.8);
      expect(rec.alternatives).toContain('euclidean_distance');
    });

    it('should recommend jaccard for small logs (safe default)', () => {
      const profile: LogProfile = {
        traceCount: 50,
        activityCount: 10,
        entropy: 0.4,
        avgTraceLength: 5,
        featureVariance: 0.5,
        variantCount: 10,
      };
      const rec = selectBestAlgorithmForTask('drift', profile);

      expect(rec.algorithm).toBe('jaccard_window');
      expect(rec.confidence).toBeGreaterThan(0.7);
    });
  });

  describe('selectBestAlgorithmForTask: features', () => {
    it('should recommend transition_probabilities', () => {
      const profile: LogProfile = {
        traceCount: 500,
        activityCount: 20,
        entropy: 0.6,
        avgTraceLength: 10,
        featureVariance: 1.0,
        variantCount: 100,
      };
      const rec = selectBestAlgorithmForTask('features', profile);

      expect(rec.algorithm).toBe('transition_probabilities');
      expect(rec.confidence).toBeGreaterThan(0.85);
      expect(rec.alternatives).toContain('prefix_features');
    });
  });

  describe('selectBestAlgorithmForTask: resource', () => {
    it('should recommend mm1_queue', () => {
      const profile: LogProfile = {
        traceCount: 500,
        activityCount: 20,
        entropy: 0.6,
        avgTraceLength: 10,
        featureVariance: 1.0,
        variantCount: 100,
      };
      const rec = selectBestAlgorithmForTask('resource', profile);

      expect(rec.algorithm).toBe('mm1_queue');
      expect(rec.confidence).toBeGreaterThan(0.75);
    });
  });

  describe('selectBestAlgorithmForTask: error handling', () => {
    it('should throw for unknown task', () => {
      const profile: LogProfile = {
        traceCount: 100,
        activityCount: 10,
        entropy: 0.5,
        avgTraceLength: 5,
        featureVariance: 0.5,
        variantCount: 10,
      };

      expect(() => {
        selectBestAlgorithmForTask('unknown_task', profile);
      }).toThrow('Unknown prediction task');
    });
  });

  describe('recommendAlgorithm (convenience wrapper)', () => {
    it('should extract profile and recommend in one call', () => {
      const features = [
        { trace_length: 5, unique_activities: 3 },
        { trace_length: 7, unique_activities: 4 },
        { trace_length: 6, unique_activities: 3 },
      ];
      const rec = recommendAlgorithm('next-activity', features);

      expect(rec).toHaveProperty('algorithm');
      expect(rec).toHaveProperty('confidence');
      expect(rec).toHaveProperty('reason');
      expect(rec).toHaveProperty('alternatives');
    });

    it('should handle empty features gracefully', () => {
      const rec = recommendAlgorithm('next-activity', []);

      expect(rec).toHaveProperty('algorithm');
      expect(rec.confidence).toBeGreaterThan(0);
    });
  });

  describe('recommendation properties', () => {
    it('should include algorithm name', () => {
      const profile: LogProfile = {
        traceCount: 100,
        activityCount: 10,
        entropy: 0.5,
        avgTraceLength: 5,
        featureVariance: 0.5,
        variantCount: 10,
      };
      const rec = selectBestAlgorithmForTask('next-activity', profile);

      expect(rec.algorithm).toBeTruthy();
      expect(typeof rec.algorithm).toBe('string');
      expect(rec.algorithm.length).toBeGreaterThan(0);
    });

    it('should include valid confidence score (0-1)', () => {
      const profile: LogProfile = {
        traceCount: 100,
        activityCount: 10,
        entropy: 0.5,
        avgTraceLength: 5,
        featureVariance: 0.5,
        variantCount: 10,
      };
      const rec = selectBestAlgorithmForTask('next-activity', profile);

      expect(rec.confidence).toBeGreaterThanOrEqual(0);
      expect(rec.confidence).toBeLessThanOrEqual(1);
    });

    it('should include human-readable reason', () => {
      const profile: LogProfile = {
        traceCount: 100,
        activityCount: 10,
        entropy: 0.5,
        avgTraceLength: 5,
        featureVariance: 0.5,
        variantCount: 10,
      };
      const rec = selectBestAlgorithmForTask('next-activity', profile);

      expect(rec.reason).toBeTruthy();
      expect(typeof rec.reason).toBe('string');
      expect(rec.reason.length).toBeGreaterThan(0);
    });

    it('should include alternatives array', () => {
      const profile: LogProfile = {
        traceCount: 100,
        activityCount: 10,
        entropy: 0.5,
        avgTraceLength: 5,
        featureVariance: 0.5,
        variantCount: 10,
      };
      const rec = selectBestAlgorithmForTask('next-activity', profile);

      expect(Array.isArray(rec.alternatives)).toBe(true);
      expect(rec.alternatives.length).toBeGreaterThan(0);
      expect(rec.alternatives).not.toContain(rec.algorithm); // Alternative should differ from primary
    });
  });

  describe('consistency across all tasks', () => {
    const allTasks = [
      'next-activity',
      'remaining-time',
      'outcome',
      'drift',
      'features',
      'resource',
    ];
    const testProfile: LogProfile = {
      traceCount: 500,
      activityCount: 20,
      entropy: 0.6,
      avgTraceLength: 10,
      featureVariance: 1.0,
      variantCount: 100,
    };

    for (const task of allTasks) {
      it(`should produce valid recommendation for ${task}`, () => {
        const rec = selectBestAlgorithmForTask(task, testProfile);

        expect(rec.algorithm).toBeTruthy();
        expect(rec.confidence).toBeGreaterThan(0);
        expect(rec.confidence).toBeLessThanOrEqual(1);
        expect(rec.reason).toBeTruthy();
        expect(rec.alternatives).toBeTruthy();
        expect(rec.alternatives.length).toBeGreaterThan(0);
      });
    }
  });
});
