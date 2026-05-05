/**
 * e2e-prediction.test.ts
 *
 * E2E-04: Next-activity prediction through the PredictionDispatcher.
 *
 * The prediction subsystem is pure TypeScript (no WASM dependency) — the
 * PredictionDispatcher operates entirely on PredictionLog / PredictionTrace
 * objects. We exercise the full fit_predict path and assert domain-derived
 * invariants (probability constraints, output structure) rather than
 * self-referential exact values.
 *
 * Oracle rank per .claude/rules/chicago-tdd.md:
 *   - Laplace-smoothed probability bounds → Rank 1 (Mathematical theorem)
 *   - top candidate is the most probable → Rank 1 (Ordering invariant)
 *   - Response structure shape → Rank 2 (Domain contract)
 */

import { describe, it, expect } from 'vitest';
import { PredictionDispatcher } from '../prediction/index.js';
import type {
  PredictionLog,
  PredictionTrace,
  NextActivityTask,
} from '../prediction/index.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function mkTrace(
  caseId: string,
  activities: string[],
  startMs = 0,
  gapMs = 1_000,
  resources?: string[]
): PredictionTrace {
  return {
    caseId,
    events: activities.map((activity, i) => ({
      activity,
      timestamp: startMs + i * gapMs,
      resource: resources?.[i],
    })),
  };
}

/**
 * Five-trace training log that contains clear sequential patterns:
 *   A → B appears 4 times, so B is the most likely successor of A.
 *   B → C appears 3 times, B → D appears once.
 */
const TRAINING_LOG: PredictionLog = {
  traces: [
    mkTrace('c1', ['A', 'B', 'C', 'End'], 0, 1_000, ['Alice', 'Alice', 'Bob', 'Bob']),
    mkTrace('c2', ['A', 'B', 'C', 'End'], 0, 1_500, ['Alice', 'Bob', 'Bob', 'Bob']),
    mkTrace('c3', ['A', 'B', 'D', 'End'], 0, 2_000, ['Carol', 'Bob', 'Carol', 'Carol']),
    mkTrace('c4', ['A', 'C', 'End'], 0, 800, ['Alice', 'Bob', 'Bob']),
    mkTrace('c5', ['A', 'B', 'C', 'D', 'End'], 0, 1_200, ['Alice', 'Alice', 'Bob', 'Carol', 'Bob']),
  ],
};

// ─── E2E-04: Next-Activity Prediction ────────────────────────────────────────

describe('E2E-04: Next-Activity Prediction', () => {
  const dispatcher = new PredictionDispatcher();

  it('returns top predictions for a known prefix — response structure is valid', () => {
    const prefix = mkTrace('probe', ['A', 'B'], 0, 1_000, ['Alice', 'Alice']);

    const task: NextActivityTask = { perspective: 'next_activity', ngramOrder: 2, topK: 3 };
    const response = dispatcher.execute({
      mode: 'fit_predict',
      task,
      log: TRAINING_LOG,
      prefixes: [prefix],
    });

    // Response meta.
    expect(response.perspective).toBe('next_activity');
    expect(response.mode).toBe('fit_predict');

    // Exactly one prediction record — one prefix was submitted.
    expect(response.predictions).toHaveLength(1);

    const record = response.predictions[0];
    expect(record.caseId).toBe('probe');
    expect(record.prefixLength).toBe(2); // ['A', 'B']

    // Candidates array must be present and non-empty.
    const candidates = record.prediction.candidates as Array<{
      activity: string;
      probability: number;
    }>;
    expect(Array.isArray(candidates)).toBe(true);
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.length).toBeLessThanOrEqual(3); // topK=3

    // Each candidate must have an activity string and a probability in (0, 1].
    for (const c of candidates) {
      expect(typeof c.activity).toBe('string');
      expect(c.activity.length).toBeGreaterThan(0);
      expect(c.probability).toBeGreaterThan(0);
      expect(c.probability).toBeLessThanOrEqual(1);
    }
  });

  it('Rank-1 oracle: Laplace-smoothed full-vocab probabilities sum to ≈ 1', () => {
    // Request topK equal to the vocab size (via topK=20, larger than log vocab)
    // so we retrieve the full probability distribution and can verify it sums to 1.
    const task: NextActivityTask = {
      perspective: 'next_activity',
      ngramOrder: 1, // unigram context for a deterministic distribution
      topK: 20,
    };
    const prefix = mkTrace('p', ['A']);

    const response = dispatcher.execute({
      mode: 'fit_predict',
      task,
      log: TRAINING_LOG,
      prefixes: [prefix],
    });

    const candidates = response.predictions[0].prediction.candidates as Array<{
      probability: number;
    }>;
    const sum = candidates.reduce((s, c) => s + c.probability, 0);
    // Laplace smoothing over the full vocabulary → total must equal 1 within
    // floating-point tolerance.
    expect(sum).toBeGreaterThan(0.99);
    expect(sum).toBeLessThan(1.01);
  });

  it('Rank-1 oracle: candidates are sorted by probability descending', () => {
    const task: NextActivityTask = { perspective: 'next_activity', ngramOrder: 1, topK: 20 };
    const prefix = mkTrace('p', ['A']);

    const response = dispatcher.execute({
      mode: 'fit_predict',
      task,
      log: TRAINING_LOG,
      prefixes: [prefix],
    });

    const candidates = response.predictions[0].prediction.candidates as Array<{
      activity: string;
      probability: number;
    }>;

    for (let i = 1; i < candidates.length; i++) {
      expect(candidates[i].probability).toBeLessThanOrEqual(candidates[i - 1].probability);
    }
  });

  it('top candidate for prefix [A] is "B" — observed in 4 of 5 traces', () => {
    // A→B appears in c1, c2, c3, c5 (4 times).
    // A→C appears in c4 (1 time).
    // With Laplace smoothing B should remain the most probable successor.
    const task: NextActivityTask = { perspective: 'next_activity', ngramOrder: 1, topK: 1 };
    const prefix = mkTrace('p', ['A']);

    const response = dispatcher.execute({
      mode: 'fit_predict',
      task,
      log: TRAINING_LOG,
      prefixes: [prefix],
    });

    const top = response.predictions[0].prediction.top as { activity: string } | null;
    expect(top).not.toBeNull();
    expect(top?.activity).toBe('B');
  });

  it('confidence field equals the top candidate probability', () => {
    const task: NextActivityTask = { perspective: 'next_activity', ngramOrder: 1, topK: 3 };
    const prefix = mkTrace('p', ['A', 'B']);

    const response = dispatcher.execute({
      mode: 'fit_predict',
      task,
      log: TRAINING_LOG,
      prefixes: [prefix],
    });

    const record = response.predictions[0];
    const candidates = record.prediction.candidates as Array<{ probability: number }>;
    expect(record.confidence).toBeCloseTo(candidates[0].probability, 10);
  });

  it('diagnostics carry correct counters — scored=1, skipped=0 for one non-empty prefix', () => {
    const task: NextActivityTask = { perspective: 'next_activity', ngramOrder: 1, topK: 3 };
    const prefix = mkTrace('p', ['A']);

    const response = dispatcher.execute({
      mode: 'fit_predict',
      task,
      log: TRAINING_LOG,
      prefixes: [prefix],
    });

    expect(response.diagnostics.perspective).toBe('next_activity');
    expect(response.diagnostics.scored).toBe(1);
    expect(response.diagnostics.skipped).toBe(0);
    expect(response.diagnostics.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('empty prefix is skipped — scored=0, skipped=1', () => {
    const task: NextActivityTask = { perspective: 'next_activity', ngramOrder: 1, topK: 3 };
    const emptyPrefix: PredictionTrace = { caseId: 'empty', events: [] };

    const response = dispatcher.execute({
      mode: 'fit_predict',
      task,
      log: TRAINING_LOG,
      prefixes: [emptyPrefix],
    });

    expect(response.diagnostics.skipped).toBe(1);
    expect(response.diagnostics.scored).toBe(0);
    expect(response.predictions).toHaveLength(0);
  });

  it('fit mode returns a model without predictions', () => {
    const task: NextActivityTask = { perspective: 'next_activity', ngramOrder: 2, topK: 3 };

    const response = dispatcher.execute({
      mode: 'fit',
      task,
      log: TRAINING_LOG,
    });

    expect(response.model).toBeDefined();
    expect(response.model?.perspective).toBe('next_activity');
    expect(response.model?.trainedOn).toBe(TRAINING_LOG.traces.length);
    expect(response.predictions).toHaveLength(0);
  });

  it('predict mode applies a pre-fitted model without re-fitting', () => {
    const task: NextActivityTask = { perspective: 'next_activity', ngramOrder: 1, topK: 1 };

    // First: fit a model.
    const fitResponse = dispatcher.execute({ mode: 'fit', task, log: TRAINING_LOG });
    const model = fitResponse.model!;
    expect(model).toBeDefined();

    // Second: predict without supplying the log — model is reused.
    const prefix = mkTrace('p', ['A']);
    const predictResponse = dispatcher.execute({
      mode: 'predict',
      task,
      model,
      prefixes: [prefix],
    });

    expect(predictResponse.predictions).toHaveLength(1);
    const top = predictResponse.predictions[0].prediction.top as { activity: string } | null;
    expect(top?.activity).toBe('B');
  });
});
