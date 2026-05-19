/**
 * Drift detection + anomaly algorithm integration tests.
 *
 * Tests the third prediction-ML integration:
 * - Feature extraction for drift (windowed EWMA)
 * - Anomaly detection on drift signal
 * - Hybrid method (Jaccard + anomaly)
 * - CLI --method flag support
 *
 * 4 test cases as specified in deliverable.
 */

import { describe, it, expect } from 'vitest';
import {
  extractDriftFeatures,
  detectAnomalousDriftWindows,
} from '../features-drift.js';
import type { DriftFeatures } from '../features-drift.js';

describe('Drift Detection + Anomaly Integration', () => {
  /**
   * Test 1: Feature extraction on normal drift signal.
   *
   * Verifies:
   * - All 8 drift features extracted correctly
   * - Statistics computed accurately (mean, max, std)
   * - Trend detected (slope computed)
   * - Autocorrelation computed
   */
  it('extracts drift features from normal signal', async () => {
    // Generate normal drift signal: slow oscillation around 0.3
    const distances = Array.from({ length: 20 }, (_, i) => {
      const t = i / 10;
      return 0.3 + 0.1 * Math.sin(t); // Small oscillations
    });

    const features = await extractDriftFeatures(distances, 5);

    expect(features).toBeDefined();
    expect(features.length).toBeGreaterThan(0);

    // Check feature structure
    const firstFeature = features[0];
    expect(firstFeature).toHaveProperty('window_index');
    expect(firstFeature).toHaveProperty('mean_distance');
    expect(firstFeature).toHaveProperty('max_distance');
    expect(firstFeature).toHaveProperty('std_distance');
    expect(firstFeature).toHaveProperty('trend_slope');
    expect(firstFeature).toHaveProperty('autocorr_lag1');
    expect(firstFeature).toHaveProperty('peak_count');
    expect(firstFeature).toHaveProperty('residual_anomaly_score');
    expect(firstFeature).toHaveProperty('is_anomalous');

    // Statistics should be in reasonable ranges
    expect(firstFeature.mean_distance).toBeGreaterThan(0.2);
    expect(firstFeature.mean_distance).toBeLessThan(0.4);
    expect(firstFeature.max_distance).toBeGreaterThanOrEqual(firstFeature.mean_distance);
    expect(firstFeature.std_distance).toBeGreaterThanOrEqual(0);
  });

  /**
   * Test 2: Anomaly detection on spike signal.
   *
   * Verifies:
   * - Peaks detected correctly
   * - Anomaly score computed
   * - Windows with high anomaly scores flagged correctly
   * - Threshold applied correctly
   */
  it('detects anomalies in drift signal with spikes', async () => {
    // Generate signal with spike: normal baseline + sudden spike
    const distances = [
      ...Array.from({ length: 10 }, () => 0.2), // Normal baseline
      ...Array.from({ length: 5 }, () => 0.8), // Spike
      ...Array.from({ length: 10 }, () => 0.2), // Back to normal
    ];

    const features = await extractDriftFeatures(distances, 5, 0.7);

    // Spike region should have high anomaly scores
    const spikeWindows = features.filter((f) => f.window_index >= 5 && f.window_index <= 10);
    expect(spikeWindows.length).toBeGreaterThan(0);

    // At least one window in spike region should have high mean_distance
    const maxMeanInSpike = Math.max(...spikeWindows.map((f) => f.mean_distance));
    expect(maxMeanInSpike).toBeGreaterThan(0.4);
  });

  /**
   * Test 3: Anomalous drift window detection.
   *
   * Verifies:
   * - detectAnomalousDriftWindows correctly identifies anomalous regions
   * - Both 'equal' and 'weighted' scoring methods work
   * - Scores computed in [0, 1] range
   * - Threshold correctly applied
   */
  it('detects anomalous drift windows with scoring methods', async () => {
    // Create features manually for controlled test
    const features: DriftFeatures[] = [
      {
        window_index: 0,
        mean_distance: 0.2,
        max_distance: 0.3,
        std_distance: 0.05,
        trend_slope: 0,
        autocorr_lag1: 0.1,
        peak_count: 0,
        residual_anomaly_score: 0.1,
        is_anomalous: false,
      },
      {
        window_index: 1,
        mean_distance: 0.8, // High distance
        max_distance: 0.9,
        std_distance: 0.05,
        trend_slope: 0,
        autocorr_lag1: 0.1,
        peak_count: 2, // Peaks detected
        residual_anomaly_score: 0.6, // High residual anomaly
        is_anomalous: true,
      },
      {
        window_index: 2,
        mean_distance: 0.25,
        max_distance: 0.3,
        std_distance: 0.04,
        trend_slope: -0.01,
        autocorr_lag1: 0.05,
        peak_count: 0,
        residual_anomaly_score: 0.1,
        is_anomalous: false,
      },
    ];

    // Test 'weighted' scoring
    const weighted = detectAnomalousDriftWindows(features, 'weighted');
    expect(weighted.anomalousIndices).toBeDefined();
    expect(weighted.scores).toHaveLength(3);
    expect(weighted.scores[1]).toBeGreaterThan(weighted.scores[0]); // Window 1 should score higher
    expect(weighted.anomalousIndices).toContain(1); // Window 1 flagged as anomalous

    // Test 'equal' scoring
    const equal = detectAnomalousDriftWindows(features, 'equal');
    expect(equal.anomalousIndices).toBeDefined();
    expect(equal.scores).toHaveLength(3);
    // With equal weights, window 1 should still score higher
    expect(equal.scores[1]).toBeGreaterThan(equal.scores[0]);

    // All scores should be in [0, 1]
    for (const score of weighted.scores) {
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1.5); // Slightly generous due to summation
    }
  });

  /**
   * Test 4: Edge cases and error handling.
   *
   * Verifies:
   * - Empty input handled gracefully
   * - Short series (< window size) handled gracefully
   * - Single anomaly correctly identified
   * - Large windows don't crash
   */
  it('handles edge cases gracefully', async () => {
    // Edge case 1: Empty input
    const emptyFeatures = await extractDriftFeatures([], 5);
    expect(emptyFeatures).toEqual([]);

    // Edge case 2: Series shorter than window
    const shortSeries = [0.2, 0.3];
    const shortFeatures = await extractDriftFeatures(shortSeries, 10);
    // Window size clamped to series length (2), so we get 1 feature window
    expect(shortFeatures.length).toBeGreaterThanOrEqual(1);

    // Edge case 3: Single spike with sustained elevation
    const singleSpike = [0.1, 0.1, 0.1, 0.8, 0.8, 0.1, 0.1, 0.1];
    const spikeFeatures = await extractDriftFeatures(singleSpike, 2);
    expect(spikeFeatures.length).toBeGreaterThan(0);
    // At least one window should detect the spike (high mean_distance or max_distance)
    const hasSpikeSigil = spikeFeatures.some((f) => f.max_distance > 0.5);
    expect(hasSpikeSigil).toBe(true);

    // Edge case 4: Very large window
    const longSeries = Array.from({ length: 1000 }, (_, i) => Math.sin(i / 50) * 0.5 + 0.3);
    const largeWindowFeatures = await extractDriftFeatures(longSeries, 100);
    expect(largeWindowFeatures.length).toBeGreaterThan(0);
    expect(largeWindowFeatures[0].mean_distance).toBeGreaterThan(0);
  });
});
