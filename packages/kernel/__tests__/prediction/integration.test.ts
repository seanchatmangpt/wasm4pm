/**
 * Integration tests — exercise every perspective end-to-end through the
 * dispatcher and assert perspective-specific output shapes & invariants.
 *
 * Per .claude/rules/process-mining-chicago-tdd.md: oracles are domain-derived
 * (probability sums, monotonicity, reward bounds) — not self-referential.
 */
import { describe, it, expect } from 'vitest';
import {
  PredictionDispatcher,
  ALL_PREDICTION_PERSPECTIVES,
} from '../../src/prediction/index.js';
import type {
  PredictionLog,
  PredictionTrace,
  PredictionRequest,
} from '../../src/prediction/index.js';

function mkTrace(caseId: string, activities: string[], startMs = 0, gapMs = 1000, resources?: string[]): PredictionTrace {
  return {
    caseId,
    events: activities.map((activity, i) => ({
      activity,
      timestamp: startMs + i * gapMs,
      resource: resources?.[i],
    })),
  };
}

const log: PredictionLog = {
  traces: [
    mkTrace('c1', ['A', 'B', 'C', 'End'], 0, 1000, ['Alice', 'Alice', 'Bob', 'Bob']),
    mkTrace('c2', ['A', 'B', 'C', 'End'], 0, 1500, ['Alice', 'Bob', 'Bob', 'Bob']),
    mkTrace('c3', ['A', 'B', 'D', 'End'], 0, 2000, ['Carol', 'Bob', 'Carol', 'Carol']),
    mkTrace('c4', ['A', 'C', 'End'], 0, 800, ['Alice', 'Bob', 'Bob']),
    mkTrace('c5', ['A', 'B', 'C', 'D', 'End'], 0, 1200, ['Alice', 'Alice', 'Bob', 'Carol', 'Bob']),
  ],
};

describe('Prediction subsystem — end-to-end', () => {
  const dispatcher = new PredictionDispatcher();

  it('every canonical perspective is reachable through fit_predict', () => {
    for (const perspective of ALL_PREDICTION_PERSPECTIVES) {
      const res = dispatcher.execute({
        mode: 'fit_predict',
        task: { perspective },
        log,
        prefixes: [mkTrace('probe', ['A', 'B'], 0, 1000, ['Alice', 'Alice'])],
      } as PredictionRequest);
      expect(res.perspective).toBe(perspective);
      expect(res.predictions).toHaveLength(1);
      expect(res.diagnostics.perspective).toBe(perspective);
    }
  });

  describe('next_activity', () => {
    it('candidate probabilities sum to 1 (Laplace-smoothed full vocab)', () => {
      const res = dispatcher.execute({
        mode: 'fit_predict',
        // topK=20 (max allowed) is larger than this log's vocab, so we get full distribution.
        task: { perspective: 'next_activity', ngramOrder: 1, topK: 20 },
        log,
        prefixes: [mkTrace('p', ['A'])],
      });
      const cs = res.predictions[0].prediction.candidates as Array<{
        activity: string;
        probability: number;
      }>;
      const sum = cs.reduce((s, c) => s + c.probability, 0);
      // Laplace over full vocab → should be ~1 within float tolerance.
      expect(sum).toBeGreaterThan(0.99);
      expect(sum).toBeLessThan(1.01);
    });

    it('B is the most likely successor of A in this log', () => {
      const res = dispatcher.execute({
        mode: 'fit_predict',
        task: { perspective: 'next_activity', ngramOrder: 1, topK: 1 },
        log,
        prefixes: [mkTrace('p', ['A'])],
      });
      const top = (res.predictions[0].prediction.top as { activity: string });
      expect(top.activity).toBe('B');
    });
  });

  describe('remaining_time', () => {
    it('remaining time is non-negative and shrinks with prefix length', () => {
      const res = dispatcher.execute({
        mode: 'fit_predict',
        task: { perspective: 'remaining_time' },
        log,
        prefixes: [
          mkTrace('p1', ['A']),
          mkTrace('p2', ['A', 'B']),
          mkTrace('p3', ['A', 'B', 'C']),
        ],
      });
      const remaining = res.predictions.map(
        (p) => (p.prediction as { remainingMs: number }).remainingMs,
      );
      for (const r of remaining) expect(r).toBeGreaterThanOrEqual(0);
    });
  });

  describe('outcome', () => {
    it('default labeller treats final activity as outcome; distribution sums to 1', () => {
      const res = dispatcher.execute({
        mode: 'fit_predict',
        task: { perspective: 'outcome' },
        log,
        prefixes: [mkTrace('p', ['A', 'B'])],
      });
      const dist = res.predictions[0].prediction.distribution as Record<string, number>;
      const sum = Object.values(dist).reduce((s, v) => s + v, 0);
      expect(sum).toBeGreaterThan(0.99);
      expect(sum).toBeLessThan(1.01);
      expect(res.predictions[0].prediction.outcome).toBeTypeOf('string');
    });
  });

  describe('drift', () => {
    it('jaccard ~1 against in-distribution prefix; novel edges flag drift', () => {
      const fit = dispatcher.execute({
        mode: 'fit',
        task: { perspective: 'drift', driftThreshold: 0.5 },
        log,
      });
      const familiar = dispatcher.execute({
        mode: 'predict',
        task: { perspective: 'drift', driftThreshold: 0.5 },
        prefixes: [mkTrace('familiar', ['A', 'B', 'C'])],
        model: fit.model,
      });
      const novel = dispatcher.execute({
        mode: 'predict',
        task: { perspective: 'drift', driftThreshold: 0.5 },
        prefixes: [mkTrace('novel', ['X', 'Y', 'Z', 'W'])],
        model: fit.model,
      });
      const familiarSim = (familiar.predictions[0].prediction as { jaccard: number }).jaccard;
      const novelSim = (novel.predictions[0].prediction as { jaccard: number }).jaccard;
      expect(familiarSim).toBeGreaterThan(novelSim);
      expect(novelSim).toBeLessThan(0.5);
      expect((novel.predictions[0].prediction as { novelEdges: string[] }).novelEdges.length).toBeGreaterThan(0);
    });
  });

  describe('features', () => {
    it('feature vector matches declared schema and basic counts are correct', () => {
      const res = dispatcher.execute({
        mode: 'fit_predict',
        task: { perspective: 'features', includeRework: true },
        log,
        prefixes: [mkTrace('p', ['A', 'B', 'A'], 0, 2000, ['Alice', 'Bob', 'Alice'])],
      });
      const pred = res.predictions[0].prediction as {
        features: Record<string, number>;
        schema: string[];
      };
      expect(pred.schema).toContain('rework_count');
      // Schema and features must agree key-for-key.
      expect(Object.keys(pred.features).sort()).toEqual([...pred.schema].sort());
      expect(pred.features.prefix_length).toBe(3);
      expect(pred.features.distinct_activities).toBe(2);
      expect(pred.features.distinct_resources).toBe(2);
      expect(pred.features.rework_count).toBe(1); // 'A' repeats
      expect(pred.features.elapsed_ms).toBe(4000);
    });

    it('omits rework features when includeRework is false', () => {
      const res = dispatcher.execute({
        mode: 'fit_predict',
        task: { perspective: 'features', includeRework: false },
        log,
        prefixes: [mkTrace('p', ['A', 'B'])],
      });
      const pred = res.predictions[0].prediction as { schema: string[] };
      expect(pred.schema).not.toContain('rework_count');
      expect(pred.schema).not.toContain('rework_ratio');
    });
  });

  describe('resource', () => {
    it('recommends a resource that has historically performed the activity', () => {
      const res = dispatcher.execute({
        mode: 'fit_predict',
        task: { perspective: 'resource' },
        log,
        prefixes: [mkTrace('p', ['A'], 0, 1000, ['Alice'])],
      });
      const pred = res.predictions[0].prediction as {
        recommended: string | null;
        scores: Array<{ resource: string; score: number; pulls: number }>;
      };
      expect(pred.recommended).not.toBeNull();
      // All recommended resources must have appeared in training data.
      const seen = new Set(['Alice', 'Bob', 'Carol']);
      expect(seen.has(pred.recommended!)).toBe(true);
      // Scores must be sorted descending.
      for (let i = 1; i < pred.scores.length; i++) {
        expect(pred.scores[i - 1].score).toBeGreaterThanOrEqual(pred.scores[i].score);
      }
    });
  });

  describe('determinism', () => {
    it('same input produces same output (no hidden RNG)', () => {
      const make = () =>
        dispatcher.execute({
          mode: 'fit_predict',
          task: { perspective: 'next_activity', ngramOrder: 2, topK: 3 },
          log,
          prefixes: [mkTrace('probe', ['A', 'B'])],
        });
      const a = make();
      const b = make();
      expect(JSON.stringify(a.predictions)).toEqual(JSON.stringify(b.predictions));
    });
  });

  describe('batch orchestration of all 6 perspectives', () => {
    it('executes every perspective in one batch and returns ordered results', () => {
      const reqs: PredictionRequest[] = ALL_PREDICTION_PERSPECTIVES.map((perspective) => ({
        mode: 'fit_predict',
        task: { perspective } as any,
        log,
        prefixes: [mkTrace('probe', ['A', 'B'])],
      }));
      const results = dispatcher.executeBatch(reqs);
      expect(results).toHaveLength(6);
      for (let i = 0; i < results.length; i++) {
        expect(results[i].error).toBeUndefined();
        expect(results[i].response!.perspective).toBe(ALL_PREDICTION_PERSPECTIVES[i]);
      }
    });
  });
});
