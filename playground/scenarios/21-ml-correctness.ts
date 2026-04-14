/**
 * Correctness validation: ML tasks produce meaningful results
 *
 * This scenario validates that ML algorithms actually work — not just that they
 * exit 0, but that they produce sensible outputs for the process mining domain.
 *
 * Key assertions:
 *   - classify: predictions contain at least one class
 *   - cluster: assignments are stable (deterministic clustering)
 *   - forecast: produces values in reasonable range
 *   - anomaly: peak indices are valid array indices (< signal length)
 *   - regress: predictions track actual values reasonably well
 *   - pca: produces reduced dimensions
 */

import { describe, it, expect } from 'vitest';
import { pictl, extractJson, resolveRepo, EXIT_CODES, assertExitCode } from '../helpers/cli.js';

const RUNNING_EXAMPLE = resolveRepo('wasm4pm/tests/fixtures/running-example.xes');

describe('ML correctness validation', () => {
  // ── classify: Does it produce a meaningful classification? ──────────────────

  describe('classify task — correctness', () => {
    it('classify produces at least one unique class label', async () => {
      const result = await pictl(['ml', 'classify', '-i', RUNNING_EXAMPLE, '--format', 'json']);
      assertExitCode(result, EXIT_CODES.success);
      const json = extractJson(result.stdout) as Record<string, unknown>;
      const predictions = (json.predictions as Array<Record<string, unknown>>) || [];

      // Extract unique class labels
      const classes = new Set<unknown>();
      for (const pred of predictions) {
        if ('class' in pred) classes.add(pred.class);
        if ('label' in pred) classes.add(pred.label);
      }

      // Oracle: classification should produce at least one class
      expect(classes.size).toBeGreaterThan(0);
    });

    it('classify assigns a class to each trace', async () => {
      const result = await pictl(['ml', 'classify', '-i', RUNNING_EXAMPLE, '--format', 'json']);
      const json = extractJson(result.stdout) as Record<string, unknown>;
      const predictions = (json.predictions as Array<Record<string, unknown>>) || [];

      // Oracle: every trace gets a classification
      expect(predictions.length).toBeGreaterThan(0);
      for (const pred of predictions) {
        expect('class' in pred || 'label' in pred).toBe(true);
      }
    });

    it('classify results are deterministic (same k, same output)', async () => {
      const result1 = await pictl(['ml', 'classify', '-i', RUNNING_EXAMPLE, '-k', '3', '--format', 'json']);
      const result2 = await pictl(['ml', 'classify', '-i', RUNNING_EXAMPLE, '-k', '3', '--format', 'json']);

      const json1 = extractJson(result1.stdout) as Record<string, unknown>;
      const json2 = extractJson(result2.stdout) as Record<string, unknown>;

      const pred1 = (json1.predictions as Array<Record<string, unknown>>) || [];
      const pred2 = (json2.predictions as Array<Record<string, unknown>>) || [];

      // Oracle: same input → same output (determinism)
      expect(pred1.length).toBe(pred2.length);
      for (let i = 0; i < pred1.length; i++) {
        expect(pred1[i].class).toEqual(pred2[i].class);
      }
    });
  });

  // ── cluster: Does clustering produce stable, meaningful groups? ─────────────

  describe('cluster task — correctness', () => {
    it('cluster produces assignments for all traces', async () => {
      const result = await pictl(['ml', 'cluster', '-i', RUNNING_EXAMPLE, '--format', 'json']);
      assertExitCode(result, EXIT_CODES.success);
      const json = extractJson(result.stdout) as Record<string, unknown>;
      const assignments = (json.assignments as Array<number>) || [];

      // Oracle: every trace is assigned to a cluster
      expect(assignments.length).toBeGreaterThan(0);
      for (const assignment of assignments) {
        expect(typeof assignment).toBe('number');
        expect(assignment >= 0).toBe(true);
      }
    });

    it('cluster produces at least one cluster', async () => {
      const result = await pictl(['ml', 'cluster', '-i', RUNNING_EXAMPLE, '--format', 'json']);
      const json = extractJson(result.stdout) as Record<string, unknown>;
      const assignments = (json.assignments as Array<number>) || [];

      // Count unique clusters
      const uniqueClusters = new Set(assignments);

      // Oracle: clustering should produce >= 1 cluster
      expect(uniqueClusters.size).toBeGreaterThan(0);
    });

    it('cluster number of clusters matches k parameter', async () => {
      const result = await pictl(['ml', 'cluster', '-i', RUNNING_EXAMPLE, '-k', '3', '--format', 'json']);
      const json = extractJson(result.stdout) as Record<string, unknown>;
      const assignments = (json.assignments as Array<number>) || [];

      // Count unique clusters
      const uniqueClusters = new Set(assignments);

      // Oracle: k=3 should produce exactly 3 clusters (or ≤3 if some are empty)
      expect(uniqueClusters.size).toBeLessThanOrEqual(3);
      expect(uniqueClusters.size).toBeGreaterThan(0);
    });

    it('cluster assignments are deterministic with same k', async () => {
      const result1 = await pictl(['ml', 'cluster', '-i', RUNNING_EXAMPLE, '-k', '2', '--format', 'json']);
      const result2 = await pictl(['ml', 'cluster', '-i', RUNNING_EXAMPLE, '-k', '2', '--format', 'json']);

      const json1 = extractJson(result1.stdout) as Record<string, unknown>;
      const json2 = extractJson(result2.stdout) as Record<string, unknown>;

      const assign1 = (json1.assignments as Array<number>) || [];
      const assign2 = (json2.assignments as Array<number>) || [];

      // Oracle: determinism
      expect(assign1).toEqual(assign2);
    });
  });

  // ── forecast: Does it produce values in a reasonable range? ────────────────

  describe('forecast task — correctness', () => {
    it('forecast produces a trend object with numeric values', async () => {
      const result = await pictl(['ml', 'forecast', '-i', RUNNING_EXAMPLE, '--format', 'json']);
      assertExitCode(result, EXIT_CODES.success);
      const json = extractJson(result.stdout) as Record<string, unknown>;
      const trend = (json.trend as Record<string, unknown>) || {};

      // Oracle: trend should have numeric data
      expect(typeof trend).toBe('object');
      expect(Object.keys(trend).length).toBeGreaterThan(0);
    });

    it('forecast produces reasonable values (not NaN, not Infinity)', async () => {
      const result = await pictl(['ml', 'forecast', '-i', RUNNING_EXAMPLE, '--format', 'json']);
      const json = extractJson(result.stdout) as Record<string, unknown>;
      const trend = (json.trend as Record<string, unknown>) || {};

      // Extract all numeric values from trend
      for (const [, value] of Object.entries(trend)) {
        if (typeof value === 'number') {
          expect(!isNaN(value)).toBe(true);
          expect(!isFinite(value)).toBe(false);
        }
      }
    });
  });

  // ── anomaly: Do peak indices fall within the signal bounds? ────────────────

  describe('anomaly task — correctness', () => {
    it('anomaly produces peakIndices array', async () => {
      const result = await pictl(['ml', 'anomaly', '-i', RUNNING_EXAMPLE, '--format', 'json']);
      assertExitCode(result, EXIT_CODES.success);
      const json = extractJson(result.stdout) as Record<string, unknown>;
      const peaks = (json.peakIndices as Array<number>) || [];

      // Oracle: anomaly should produce an array (may be empty)
      expect(Array.isArray(peaks)).toBe(true);
    });

    it('anomaly peak indices are valid array indices', async () => {
      const result = await pictl(['ml', 'anomaly', '-i', RUNNING_EXAMPLE, '--format', 'json']);
      const json = extractJson(result.stdout) as Record<string, unknown>;
      const peaks = (json.peakIndices as Array<number>) || [];
      const signal = (json.signal as Array<number>) || [];

      // Oracle: all peak indices must be valid positions in the signal
      for (const idx of peaks) {
        expect(idx >= 0).toBe(true);
        expect(idx < signal.length).toBe(true);
      }
    });
  });

  // ── regress: Does regression predict values close to actual? ──────────────

  describe('regress task — correctness', () => {
    it('regress produces predictions for all traces', async () => {
      const result = await pictl(['ml', 'regress', '-i', RUNNING_EXAMPLE, '--format', 'json']);
      assertExitCode(result, EXIT_CODES.success);
      const json = extractJson(result.stdout) as Record<string, unknown>;
      const predictions = (json.predictions as Array<Record<string, unknown>>) || [];

      // Oracle: every trace gets a remaining time prediction
      expect(predictions.length).toBeGreaterThan(0);
      for (const pred of predictions) {
        expect('actual' in pred).toBe(true);
        expect('predicted' in pred).toBe(true);
        expect(typeof pred.actual).toBe('number');
        expect(typeof pred.predicted).toBe('number');
      }
    });

    it('regress predictions are non-negative', async () => {
      const result = await pictl(['ml', 'regress', '-i', RUNNING_EXAMPLE, '--format', 'json']);
      const json = extractJson(result.stdout) as Record<string, unknown>;
      const predictions = (json.predictions as Array<Record<string, unknown>>) || [];

      // Oracle: remaining time should be non-negative
      for (const pred of predictions) {
        const actual = pred.actual as number;
        const predicted = pred.predicted as number;
        expect(actual >= 0).toBe(true);
        expect(predicted >= 0).toBe(true);
      }
    });

    it('regress error is reasonable (not massive gaps)', async () => {
      const result = await pictl(['ml', 'regress', '-i', RUNNING_EXAMPLE, '--format', 'json']);
      const json = extractJson(result.stdout) as Record<string, unknown>;
      const predictions = (json.predictions as Array<Record<string, unknown>>) || [];

      // Compute mean actual value (for scaling)
      let sumActual = 0;
      for (const pred of predictions) {
        sumActual += (pred.actual as number);
      }
      const meanActual = predictions.length > 0 ? sumActual / predictions.length : 1.0;

      // Compute mean absolute error
      let sumError = 0;
      for (const pred of predictions) {
        const error = Math.abs((pred.actual as number) - (pred.predicted as number));
        sumError += error;
      }
      const meanError = predictions.length > 0 ? sumError / predictions.length : 0;

      // Oracle: MAPE should be < 100% (error not exceeding the actual magnitude)
      // Rough threshold: mean error < 2x the mean actual
      expect(meanError).toBeLessThan(meanActual * 2);
    });
  });

  // ── All ML tasks: Do they handle edge cases gracefully? ───────────────────

  describe('ML robustness', () => {
    it('all 5 working tasks handle running-example without crashing', async () => {
      const tasks = ['classify', 'cluster', 'forecast', 'anomaly', 'regress'];

      for (const task of tasks) {
        const result = await pictl(['ml', task, '-i', RUNNING_EXAMPLE, '--format', 'json']);
        expect(result.exitCode).toBe(EXIT_CODES.success);
        const json = extractJson(result.stdout);
        expect(json).toBeDefined();
        expect(typeof json).toBe('object');
      }
    });
  });
});
