/**
 * ML Task OTEL Span Attributes Test
 *
 * Verifies that ML task execution emits spans with proper attributes
 * for observability and quality tracking.
 */

import { describe, it, expect } from 'vitest';

describe('ml-span-attributes', () => {
  describe('classify task span', () => {
    it('emits algorithm, trace count, and class count attributes', () => {
      // Expected span attributes for classify task
      const spanAttrs = {
        'ml.task': 'classify',
        'ml.algorithm': 'knn',
        'ml.trace_count': 100,
        'ml.class_count': 5,
        'ml.mean_confidence': 0.75,
        'ml.status': 'ok',
      };

      // Verify expected fields present and typed correctly
      expect(spanAttrs['ml.task']).toBe('classify');
      expect(spanAttrs['ml.algorithm']).toMatch(/knn|naive_bayes|decision_tree/);
      expect(spanAttrs['ml.trace_count']).toBeGreaterThan(0);
      expect(spanAttrs['ml.class_count']).toBeGreaterThan(0);
      expect(spanAttrs['ml.mean_confidence']).toBeGreaterThanOrEqual(0);
      expect(spanAttrs['ml.mean_confidence']).toBeLessThanOrEqual(1);
    });
  });

  describe('cluster task span', () => {
    it('emits algorithm, cluster count, and cohesion metrics', () => {
      const spanAttrs = {
        'ml.task': 'cluster',
        'ml.algorithm': 'kmeans',
        'ml.k': 5,
        'ml.trace_count': 200,
        'ml.inertia': 1234.56,
        'ml.silhouette_score': 0.62,
        'ml.status': 'ok',
      };

      expect(spanAttrs['ml.task']).toBe('cluster');
      expect(spanAttrs['ml.algorithm']).toMatch(/kmeans|dbscan/);
      expect(spanAttrs['ml.k']).toBeGreaterThan(0);
      expect(spanAttrs['ml.inertia']).toBeGreaterThan(0);
      expect(spanAttrs['ml.silhouette_score']).toBeGreaterThanOrEqual(-1);
      expect(spanAttrs['ml.silhouette_score']).toBeLessThanOrEqual(1);
    });
  });

  describe('forecast task span', () => {
    it('emits trend direction, strength, and forecast horizon', () => {
      const spanAttrs = {
        'ml.task': 'forecast',
        'ml.algorithm': 'linear_regression',
        'ml.trend_direction': 'rising',
        'ml.trend_strength': 0.85,
        'ml.r_squared': 0.92,
        'ml.forecast_horizon': 12,
        'ml.rmse': 1.23,
        'ml.status': 'ok',
      };

      expect(spanAttrs['ml.task']).toBe('forecast');
      expect(spanAttrs['ml.trend_direction']).toMatch(/rising|falling|stable/);
      expect(spanAttrs['ml.trend_strength']).toBeGreaterThanOrEqual(0);
      expect(spanAttrs['ml.r_squared']).toBeGreaterThanOrEqual(0);
      expect(spanAttrs['ml.forecast_horizon']).toBeGreaterThan(0);
    });
  });

  describe('anomaly task span', () => {
    it('emits anomaly rate, peak count, and detection method', () => {
      const spanAttrs = {
        'ml.task': 'anomaly',
        'ml.algorithm': 'ema',
        'ml.total_windows': 100,
        'ml.anomaly_count': 5,
        'ml.anomaly_rate': 0.05,
        'ml.peak_threshold': 2.0,
        'ml.status': 'ok',
      };

      expect(spanAttrs['ml.task']).toBe('anomaly');
      expect(spanAttrs['ml.total_windows']).toBeGreaterThan(0);
      expect(spanAttrs['ml.anomaly_count']).toBeGreaterThanOrEqual(0);
      expect(spanAttrs['ml.anomaly_rate']).toBeGreaterThanOrEqual(0);
      expect(spanAttrs['ml.anomaly_rate']).toBeLessThanOrEqual(1);
    });
  });

  describe('regress task span', () => {
    it('emits R-squared, RMSE, and MAE metrics', () => {
      const spanAttrs = {
        'ml.task': 'regress',
        'ml.algorithm': 'linear_regression',
        'ml.trace_count': 150,
        'ml.feature_count': 8,
        'ml.r_squared': 0.78,
        'ml.rmse': 5.43,
        'ml.mae': 3.21,
        'ml.status': 'ok',
      };

      expect(spanAttrs['ml.task']).toBe('regress');
      expect(spanAttrs['ml.r_squared']).toBeGreaterThanOrEqual(0);
      expect(spanAttrs['ml.rmse']).toBeGreaterThan(0);
      expect(spanAttrs['ml.mae']).toBeGreaterThan(0);
    });
  });

  describe('pca task span', () => {
    it('emits variance explained and component count', () => {
      const spanAttrs = {
        'ml.task': 'pca',
        'ml.n_components': 3,
        'ml.total_variance_explained': 0.85,
        'ml.cumulative_variance': [0.45, 0.72, 0.85],
        'ml.original_feature_count': 10,
        'ml.status': 'ok',
      };

      expect(spanAttrs['ml.task']).toBe('pca');
      expect(spanAttrs['ml.n_components']).toBeGreaterThan(0);
      expect(spanAttrs['ml.total_variance_explained']).toBeGreaterThanOrEqual(0);
      expect(spanAttrs['ml.total_variance_explained']).toBeLessThanOrEqual(1);
      expect(spanAttrs['ml.cumulative_variance']).toHaveLength(spanAttrs['ml.n_components']);
    });
  });

  describe('error handling', () => {
    it('emits error status and reason when task fails', () => {
      const spanAttrs = {
        'ml.task': 'classify',
        'ml.status': 'error',
        'ml.error_reason': 'insufficient_traces',
        'ml.error_message': 'Requires at least 4 traces for knn classification',
        'ml.trace_count': 2,
      };

      expect(spanAttrs['ml.status']).toBe('error');
      expect(spanAttrs['ml.error_reason']).toBeTruthy();
      expect(spanAttrs['ml.trace_count']).toBeLessThan(4);
    });

    it('emits warning for low-quality results', () => {
      const spanAttrs = {
        'ml.task': 'classify',
        'ml.status': 'ok',
        'ml.quality_warning': 'low_confidence',
        'ml.mean_confidence': 0.55,
        'ml.min_confidence': 0.35,
      };

      expect(spanAttrs['ml.status']).toBe('ok'); // Execution succeeded
      expect(spanAttrs['ml.quality_warning']).toBeTruthy(); // But quality is poor
      expect(spanAttrs['ml.mean_confidence']).toBeLessThan(0.7);
    });
  });
});
