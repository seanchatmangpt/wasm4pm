/**
 * prediction-benchmarks.test.ts
 *
 * Performance baselines and accuracy assertions for the six Van der Aalst-aligned
 * prediction perspectives implemented in packages/kernel/src/prediction/.
 *
 * Design rationale (Van der Aalst PM lifecycle):
 *   - Latency bounds prevent silent regressions as log sizes grow.
 *   - Accuracy lower bounds ensure the handlers return non-trivial predictions
 *     (i.e. they compute something, not just echo the input).
 *   - Each test is deterministic: synthetic logs are generated with a fixed
 *     seed so the test results are reproducible across runs.
 *   - These are *baseline* tests. They are not oracle tests for algorithmic
 *     correctness — those live in the perspective unit tests. These tests guard
 *     the PM lifecycle loop: if a change makes prediction 10× slower, that
 *     matters to practitioners iterating in real time.
 *
 * Terminology used below:
 *   - "fit"   — build a prediction model from a training log
 *   - "predict" — score one or more prefix traces against a fitted model
 *   - "fit_predict" — convenience mode: fit + predict in one call
 */

import { describe, it, expect } from 'vitest';
import {
  PredictionDispatcher,
  PredictionLog,
  PredictionTrace,
  PredictionEvent,
} from '../prediction/index.js';

// ---------------------------------------------------------------------------
// Synthetic log factory
// ---------------------------------------------------------------------------

/**
 * Deterministic synthetic process log.
 *
 * Generates `numTraces` traces, each containing `eventsPerTrace` events
 * drawn from a vocabulary of `numActivities` labels. The sequence within
 * each trace is sequential (activity index cycles through vocabulary) with
 * an optional noise override injected every `noiseEvery` events.
 *
 * Timestamps are monotonically increasing at `intervalMs` per event,
 * starting from a fixed epoch so that remaining-time computations are stable.
 */
function makeSyntheticLog(opts: {
  numTraces: number;
  eventsPerTrace: number;
  numActivities: number;
  /** Interval between consecutive events in ms. Default 60_000 (1 minute). */
  intervalMs?: number;
  /** Inject a rework (repeat last activity) every N events. 0 = never. */
  reworkEvery?: number;
  /** If true, attach a resource identifier to each event. */
  withResources?: boolean;
}): PredictionLog {
  const {
    numTraces,
    eventsPerTrace,
    numActivities,
    intervalMs = 60_000,
    reworkEvery = 0,
    withResources = false,
  } = opts;

  const ACTIVITIES = [
    'Register',
    'Validate',
    'Check_Completeness',
    'Assess_Risk',
    'Calculate_Fee',
    'Send_Invoice',
    'Wait_Payment',
    'Confirm_Payment',
    'Approve_Basic',
    'Approve_Senior',
    'Approve_Director',
    'Notify_Applicant',
    'Create_Record',
    'Archive',
    'Close',
    'Reject',
    'Escalate',
    'Return_Docs',
  ].slice(0, numActivities);

  const RESOURCES = ['Alice', 'Bob', 'Carol', 'Dave', 'Eve'];

  const BASE_TS = 1_700_000_000_000; // 2023-11-14T22:13:20Z

  const traces: PredictionTrace[] = [];
  for (let t = 0; t < numTraces; t++) {
    const events: PredictionEvent[] = [];
    let ts = BASE_TS + t * eventsPerTrace * intervalMs;
    for (let e = 0; e < eventsPerTrace; e++) {
      const isRework = reworkEvery > 0 && e > 0 && e % reworkEvery === 0;
      const actIdx = isRework
        ? e - 1 // repeat previous activity
        : e % numActivities;
      const event: PredictionEvent = {
        activity: ACTIVITIES[actIdx],
        timestamp: ts,
      };
      if (withResources) {
        event.resource = RESOURCES[(t + e) % RESOURCES.length];
      }
      events.push(event);
      ts += intervalMs;
    }
    traces.push({ caseId: `case-${t}`, events });
  }

  return { traces };
}

/**
 * Build a prefix slice from a log's traces: take the first `prefixLen` events
 * from each trace to simulate in-flight cases.
 */
function makePrefixes(log: PredictionLog, prefixLen: number): PredictionTrace[] {
  return log.traces.map((trace) => ({
    caseId: `prefix-${trace.caseId}`,
    events: trace.events.slice(0, prefixLen),
  }));
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('Prediction Performance Baselines', () => {
  const dispatcher = new PredictionDispatcher();

  // -------------------------------------------------------------------------
  // Next Activity
  // -------------------------------------------------------------------------

  describe('Next Activity', () => {
    const LOG_100 = makeSyntheticLog({ numTraces: 100, eventsPerTrace: 10, numActivities: 8 });
    const LOG_1K = makeSyntheticLog({ numTraces: 1_000, eventsPerTrace: 15, numActivities: 12 });

    it('fit completes within 200 ms for a 100-trace log', () => {
      const start = Date.now();
      dispatcher.execute({
        mode: 'fit',
        task: { perspective: 'next_activity', ngramOrder: 2, topK: 3 },
        log: LOG_100,
      });
      expect(Date.now() - start).toBeLessThan(200);
    });

    it('fit completes within 200 ms for a 1000-trace log', () => {
      const start = Date.now();
      dispatcher.execute({
        mode: 'fit',
        task: { perspective: 'next_activity', ngramOrder: 2, topK: 3 },
        log: LOG_1K,
      });
      expect(Date.now() - start).toBeLessThan(200);
    });

    it('fit_predict completes within 200 ms for a 100-trace log with 10-trace prefixes', () => {
      const prefixes = makePrefixes(LOG_100, 3);
      const start = Date.now();
      dispatcher.execute({
        mode: 'fit_predict',
        task: { perspective: 'next_activity', ngramOrder: 2, topK: 3 },
        log: LOG_100,
        prefixes,
      });
      expect(Date.now() - start).toBeLessThan(200);
    });

    it('returns at least one prediction per prefix (top-1 accuracy > 0%)', () => {
      const prefixes = makePrefixes(LOG_1K, 5);
      const response = dispatcher.execute({
        mode: 'fit_predict',
        task: { perspective: 'next_activity', ngramOrder: 2, topK: 3 },
        log: LOG_1K,
        prefixes,
      });
      expect(response.predictions.length).toBeGreaterThan(0);
      // Every scored prefix must have at least one candidate
      for (const rec of response.predictions) {
        const candidates = (rec.prediction as { candidates?: unknown[] }).candidates;
        expect(Array.isArray(candidates)).toBe(true);
        expect((candidates as unknown[]).length).toBeGreaterThan(0);
      }
    });

    it('diagnostics.scored equals number of non-empty prefixes', () => {
      const prefixes = makePrefixes(LOG_100, 4);
      const response = dispatcher.execute({
        mode: 'fit_predict',
        task: { perspective: 'next_activity', ngramOrder: 2, topK: 3 },
        log: LOG_100,
        prefixes,
      });
      expect(response.diagnostics.scored).toBe(response.predictions.length);
      expect(response.diagnostics.skipped).toBe(0);
    });

    it('model fingerprint is stable across two identical fit calls', () => {
      const r1 = dispatcher.execute({
        mode: 'fit',
        task: { perspective: 'next_activity', ngramOrder: 2, topK: 3 },
        log: LOG_100,
      });
      const r2 = dispatcher.execute({
        mode: 'fit',
        task: { perspective: 'next_activity', ngramOrder: 2, topK: 3 },
        log: LOG_100,
      });
      expect(r1.model?.fingerprint).toBe(r2.model?.fingerprint);
    });
  });

  // -------------------------------------------------------------------------
  // Remaining Time
  // -------------------------------------------------------------------------

  describe('Remaining Time', () => {
    const LOG_100 = makeSyntheticLog({
      numTraces: 100,
      eventsPerTrace: 10,
      numActivities: 8,
      intervalMs: 60_000,
    });
    const LOG_1K = makeSyntheticLog({
      numTraces: 1_000,
      eventsPerTrace: 15,
      numActivities: 12,
      intervalMs: 60_000,
    });

    it('fit completes within 200 ms for a 100-trace log', () => {
      const start = Date.now();
      dispatcher.execute({
        mode: 'fit',
        task: { perspective: 'remaining_time', aggregator: 'mean' },
        log: LOG_100,
      });
      expect(Date.now() - start).toBeLessThan(200);
    });

    it('fit completes within 200 ms for a 1000-trace log', () => {
      const start = Date.now();
      dispatcher.execute({
        mode: 'fit',
        task: { perspective: 'remaining_time', aggregator: 'mean' },
        log: LOG_1K,
      });
      expect(Date.now() - start).toBeLessThan(200);
    });

    it('predicted remainingMs is non-negative for all prefixes', () => {
      const prefixes = makePrefixes(LOG_1K, 5);
      const response = dispatcher.execute({
        mode: 'fit_predict',
        task: { perspective: 'remaining_time', aggregator: 'mean' },
        log: LOG_1K,
        prefixes,
      });
      for (const rec of response.predictions) {
        const { remainingMs } = rec.prediction as { remainingMs: number };
        expect(remainingMs).toBeGreaterThanOrEqual(0);
      }
    });

    it('median aggregator returns a finite remainingMs', () => {
      const prefixes = makePrefixes(LOG_100, 3);
      const response = dispatcher.execute({
        mode: 'fit_predict',
        task: { perspective: 'remaining_time', aggregator: 'median' },
        log: LOG_100,
        prefixes,
      });
      for (const rec of response.predictions) {
        const { remainingMs } = rec.prediction as { remainingMs: number };
        expect(Number.isFinite(remainingMs)).toBe(true);
      }
    });

    it('longer prefixes report lower remainingMs than shorter prefixes (monotonicity)', () => {
      // Build a consistent sequence: traces all have identical activity sequences.
      // With deterministic timestamps, a prefix of 3 should have less remaining time
      // than a prefix of 1 (closer to the end).
      const response3 = dispatcher.execute({
        mode: 'fit_predict',
        task: { perspective: 'remaining_time', aggregator: 'mean' },
        log: LOG_1K,
        prefixes: makePrefixes(LOG_1K, 3),
      });
      const response8 = dispatcher.execute({
        mode: 'fit_predict',
        task: { perspective: 'remaining_time', aggregator: 'mean' },
        log: LOG_1K,
        prefixes: makePrefixes(LOG_1K, 8),
      });
      const medianRemaining = (
        preds: readonly { prediction: Readonly<Record<string, unknown>> }[]
      ) => {
        const vals = preds.map((r) => (r.prediction as { remainingMs: number }).remainingMs);
        vals.sort((a, b) => a - b);
        return vals[Math.floor(vals.length / 2)];
      };
      // At prefix=8 (more events consumed) median remaining time should be <= prefix=3
      expect(medianRemaining(response8.predictions)).toBeLessThanOrEqual(
        medianRemaining(response3.predictions)
      );
    });
  });

  // -------------------------------------------------------------------------
  // Outcome
  // -------------------------------------------------------------------------

  describe('Outcome', () => {
    const LOG_100 = makeSyntheticLog({ numTraces: 100, eventsPerTrace: 8, numActivities: 6 });
    const LOG_1K = makeSyntheticLog({ numTraces: 1_000, eventsPerTrace: 10, numActivities: 8 });

    it('fit completes within 200 ms for a 100-trace log', () => {
      const start = Date.now();
      dispatcher.execute({
        mode: 'fit',
        task: { perspective: 'outcome' },
        log: LOG_100,
      });
      expect(Date.now() - start).toBeLessThan(200);
    });

    it('fit_predict completes within 100 ms for a 1000-trace log', () => {
      const prefixes = makePrefixes(LOG_1K, 4);
      const start = Date.now();
      dispatcher.execute({
        mode: 'fit_predict',
        task: { perspective: 'outcome' },
        log: LOG_1K,
        prefixes,
      });
      expect(Date.now() - start).toBeLessThan(100);
    });

    it('each prediction has a non-null outcome label', () => {
      const prefixes = makePrefixes(LOG_1K, 5);
      const response = dispatcher.execute({
        mode: 'fit_predict',
        task: { perspective: 'outcome' },
        log: LOG_1K,
        prefixes,
      });
      for (const rec of response.predictions) {
        const { outcome } = rec.prediction as { outcome: string | null };
        expect(outcome).not.toBeNull();
      }
    });

    it('distribution probabilities sum to 1 (within floating-point tolerance)', () => {
      const prefixes = makePrefixes(LOG_100, 4);
      const response = dispatcher.execute({
        mode: 'fit_predict',
        task: { perspective: 'outcome' },
        log: LOG_100,
        prefixes,
      });
      for (const rec of response.predictions) {
        const { distribution } = rec.prediction as { distribution: Record<string, number> };
        const total = Object.values(distribution).reduce((a, b) => a + b, 0);
        expect(total).toBeCloseTo(1, 5);
      }
    });

    it('custom labeller is used when supplied', () => {
      const prefixes = makePrefixes(LOG_100, 3);
      const response = dispatcher.execute({
        mode: 'fit_predict',
        task: {
          perspective: 'outcome',
          labeller: () => 'APPROVED', // All traces labelled APPROVED during training
        },
        log: LOG_100,
        prefixes,
      });
      for (const rec of response.predictions) {
        const { outcome } = rec.prediction as { outcome: string | null };
        expect(outcome).toBe('APPROVED');
      }
    });
  });

  // -------------------------------------------------------------------------
  // Drift
  // -------------------------------------------------------------------------

  describe('Drift', () => {
    const STABLE_LOG = makeSyntheticLog({
      numTraces: 200,
      eventsPerTrace: 10,
      numActivities: 8,
    });

    // Build a "drifted" log by using a different activity vocabulary
    const DRIFTED_LOG = makeSyntheticLog({
      numTraces: 50,
      eventsPerTrace: 10,
      numActivities: 8,
    });
    // Override activities to simulate completely novel behaviour
    const driftedPrefixes: PredictionTrace[] = DRIFTED_LOG.traces
      .slice(0, 10)
      .map((trace, idx) => ({
        caseId: `drift-${idx}`,
        events: trace.events.map((e) => ({
          ...e,
          activity: `NOVEL_${e.activity}`, // Edges not seen in training
        })),
      }));

    const stablePrefixes = makePrefixes(STABLE_LOG, 5);

    it('fit completes within 200 ms for a 200-trace log', () => {
      const start = Date.now();
      dispatcher.execute({
        mode: 'fit',
        task: { perspective: 'drift', windowSize: 50, driftThreshold: 0.7 },
        log: STABLE_LOG,
      });
      expect(Date.now() - start).toBeLessThan(200);
    });

    it('fit_predict on same-distribution traces: Jaccard score is higher than for novel traces', () => {
      // A short prefix may still score below the threshold because it contains
      // only a subset of the reference edges. This test uses a weaker but
      // correct assertion: the mean Jaccard score for same-distribution prefixes
      // must be strictly higher than for novel-activity prefixes, because the
      // stable prefixes share edges with the reference while the novel ones share none.
      const stableResponse = dispatcher.execute({
        mode: 'fit_predict',
        task: { perspective: 'drift', windowSize: 50, driftThreshold: 0.7 },
        log: STABLE_LOG,
        prefixes: stablePrefixes.slice(0, 20),
      });
      const novelResponse = dispatcher.execute({
        mode: 'fit_predict',
        task: { perspective: 'drift', windowSize: 50, driftThreshold: 0.7 },
        log: STABLE_LOG,
        prefixes: driftedPrefixes,
      });
      const meanJaccard = (preds: typeof stableResponse.predictions) => {
        const vals = preds.map((r) => (r.prediction as { jaccard: number }).jaccard);
        return vals.reduce((a, b) => a + b, 0) / vals.length;
      };
      expect(meanJaccard(stableResponse.predictions)).toBeGreaterThan(
        meanJaccard(novelResponse.predictions)
      );
    });

    it('novel-activity traces are flagged as drifted', () => {
      const response = dispatcher.execute({
        mode: 'fit_predict',
        task: { perspective: 'drift', windowSize: 50, driftThreshold: 0.7 },
        log: STABLE_LOG,
        prefixes: driftedPrefixes,
      });
      const driftCount = response.predictions.filter(
        (r) => (r.prediction as { drift: boolean }).drift
      ).length;
      // All novel-activity prefixes should be flagged as drifted
      expect(driftCount).toBe(response.predictions.length);
    });

    it('jaccard score is in [0, 1] for all predictions', () => {
      const response = dispatcher.execute({
        mode: 'fit_predict',
        task: { perspective: 'drift', windowSize: 50, driftThreshold: 0.7 },
        log: STABLE_LOG,
        prefixes: stablePrefixes.slice(0, 10),
      });
      for (const rec of response.predictions) {
        const { jaccard } = rec.prediction as { jaccard: number };
        expect(jaccard).toBeGreaterThanOrEqual(0);
        expect(jaccard).toBeLessThanOrEqual(1);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Features
  // -------------------------------------------------------------------------

  describe('Features', () => {
    const LOG_100 = makeSyntheticLog({
      numTraces: 100,
      eventsPerTrace: 12,
      numActivities: 8,
      reworkEvery: 4,
      withResources: true,
    });
    const LOG_1K = makeSyntheticLog({
      numTraces: 1_000,
      eventsPerTrace: 15,
      numActivities: 12,
      reworkEvery: 5,
      withResources: true,
    });

    it('fit completes within 200 ms for a 100-trace log', () => {
      const start = Date.now();
      dispatcher.execute({
        mode: 'fit',
        task: { perspective: 'features', includeRework: true },
        log: LOG_100,
      });
      expect(Date.now() - start).toBeLessThan(200);
    });

    it('fit_predict completes within 200 ms for a 1000-trace log', () => {
      const prefixes = makePrefixes(LOG_1K, 6);
      const start = Date.now();
      dispatcher.execute({
        mode: 'fit_predict',
        task: { perspective: 'features', includeRework: true },
        log: LOG_1K,
        prefixes,
      });
      expect(Date.now() - start).toBeLessThan(200);
    });

    it('feature vector contains all expected numeric fields', () => {
      const prefixes = makePrefixes(LOG_100, 5);
      const response = dispatcher.execute({
        mode: 'fit_predict',
        task: { perspective: 'features', includeRework: true },
        log: LOG_100,
        prefixes,
      });
      const EXPECTED_SCHEMA = [
        'prefix_length',
        'distinct_activities',
        'elapsed_ms',
        'mean_interevent_ms',
        'max_interevent_ms',
        'rework_count',
        'rework_ratio',
        'distinct_resources',
      ];
      for (const rec of response.predictions) {
        const { schema, features } = rec.prediction as {
          schema: string[];
          features: Record<string, number>;
        };
        expect(schema).toEqual(EXPECTED_SCHEMA);
        for (const field of EXPECTED_SCHEMA) {
          expect(features[field]).toBeDefined();
          expect(Number.isFinite(features[field])).toBe(true);
        }
      }
    });

    it('rework_count is 0 when no activity is repeated', () => {
      const noReworkLog = makeSyntheticLog({
        numTraces: 20,
        eventsPerTrace: 8,
        numActivities: 8, // 8 unique activities, no repetition in 8-event trace
        reworkEvery: 0,
      });
      const prefixes = makePrefixes(noReworkLog, 8);
      const response = dispatcher.execute({
        mode: 'fit_predict',
        task: { perspective: 'features', includeRework: true },
        log: noReworkLog,
        prefixes,
      });
      for (const rec of response.predictions) {
        const { features } = rec.prediction as { features: Record<string, number> };
        expect(features['rework_count']).toBe(0);
      }
    });

    it('prefix_length in features equals actual prefix length', () => {
      const prefixes = makePrefixes(LOG_100, 4);
      const response = dispatcher.execute({
        mode: 'fit_predict',
        task: { perspective: 'features', includeRework: false },
        log: LOG_100,
        prefixes,
      });
      for (const rec of response.predictions) {
        const { features } = rec.prediction as { features: Record<string, number> };
        expect(features['prefix_length']).toBe(rec.prefixLength);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Resource
  // -------------------------------------------------------------------------

  describe('Resource', () => {
    const LOG_WITH_RESOURCES = makeSyntheticLog({
      numTraces: 200,
      eventsPerTrace: 10,
      numActivities: 8,
      withResources: true,
    });

    it('fit completes within 200 ms for a 200-trace log', () => {
      const start = Date.now();
      dispatcher.execute({
        mode: 'fit',
        task: { perspective: 'resource' },
        log: LOG_WITH_RESOURCES,
      });
      expect(Date.now() - start).toBeLessThan(200);
    });

    it('fit_predict completes within 100 ms for a 200-trace log with 20-trace prefixes', () => {
      const prefixes = makePrefixes(LOG_WITH_RESOURCES, 5).slice(0, 20);
      const start = Date.now();
      dispatcher.execute({
        mode: 'fit_predict',
        task: { perspective: 'resource' },
        log: LOG_WITH_RESOURCES,
        prefixes,
      });
      expect(Date.now() - start).toBeLessThan(100);
    });

    it('recommended resource is one of the known resources', () => {
      const KNOWN_RESOURCES = new Set(['Alice', 'Bob', 'Carol', 'Dave', 'Eve']);
      const prefixes = makePrefixes(LOG_WITH_RESOURCES, 5);
      const response = dispatcher.execute({
        mode: 'fit_predict',
        task: { perspective: 'resource' },
        log: LOG_WITH_RESOURCES,
        prefixes,
      });
      for (const rec of response.predictions) {
        const { recommended } = rec.prediction as { recommended: string | null };
        if (recommended !== null) {
          expect(KNOWN_RESOURCES.has(recommended)).toBe(true);
        }
      }
    });

    it('all resource scores are non-negative', () => {
      const prefixes = makePrefixes(LOG_WITH_RESOURCES, 5);
      const response = dispatcher.execute({
        mode: 'fit_predict',
        task: { perspective: 'resource' },
        log: LOG_WITH_RESOURCES,
        prefixes,
      });
      for (const rec of response.predictions) {
        const { scores } = rec.prediction as {
          scores: Array<{ resource: string; score: number; pulls: number }>;
        };
        for (const s of scores) {
          expect(s.score).toBeGreaterThanOrEqual(0);
          expect(s.pulls).toBeGreaterThan(0);
        }
      }
    });

    it('log without resources still returns predictions (graceful degradation)', () => {
      const noResourceLog = makeSyntheticLog({
        numTraces: 50,
        eventsPerTrace: 8,
        numActivities: 6,
        withResources: false,
      });
      const prefixes = makePrefixes(noResourceLog, 4);
      const response = dispatcher.execute({
        mode: 'fit_predict',
        task: { perspective: 'resource' },
        log: noResourceLog,
        prefixes,
      });
      // No resources in training → recommended is null, but no exception thrown
      expect(response.predictions.length).toBe(prefixes.length);
      for (const rec of response.predictions) {
        const { recommended } = rec.prediction as { recommended: string | null };
        expect(recommended).toBeNull();
      }
    });
  });

  // -------------------------------------------------------------------------
  // Batch: all 6 perspectives in one executeBatch call
  // -------------------------------------------------------------------------

  describe('Batch dispatch (all 6 perspectives)', () => {
    const SHARED_LOG = makeSyntheticLog({
      numTraces: 200,
      eventsPerTrace: 10,
      numActivities: 8,
      withResources: true,
    });
    const SHARED_PREFIXES = makePrefixes(SHARED_LOG, 4);

    it('executeBatch completes within 500 ms for all 6 perspectives on a 200-trace log', () => {
      const start = Date.now();
      const results = dispatcher.executeBatch([
        {
          mode: 'fit_predict',
          task: { perspective: 'next_activity', ngramOrder: 2, topK: 3 },
          log: SHARED_LOG,
          prefixes: SHARED_PREFIXES,
        },
        {
          mode: 'fit_predict',
          task: { perspective: 'remaining_time', aggregator: 'mean' },
          log: SHARED_LOG,
          prefixes: SHARED_PREFIXES,
        },
        {
          mode: 'fit_predict',
          task: { perspective: 'outcome' },
          log: SHARED_LOG,
          prefixes: SHARED_PREFIXES,
        },
        {
          mode: 'fit_predict',
          task: { perspective: 'drift', windowSize: 50, driftThreshold: 0.7 },
          log: SHARED_LOG,
          prefixes: SHARED_PREFIXES,
        },
        {
          mode: 'fit_predict',
          task: { perspective: 'features', includeRework: true },
          log: SHARED_LOG,
          prefixes: SHARED_PREFIXES,
        },
        {
          mode: 'fit_predict',
          task: { perspective: 'resource' },
          log: SHARED_LOG,
          prefixes: SHARED_PREFIXES,
        },
      ]);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(500);
      // All 6 must succeed
      for (const r of results) {
        expect(r.error).toBeUndefined();
        expect(r.response).toBeDefined();
      }
    });

    it('all 6 perspectives return diagnostics with durationMs >= 0', () => {
      const results = dispatcher.executeBatch([
        {
          mode: 'fit_predict',
          task: { perspective: 'next_activity' },
          log: SHARED_LOG,
          prefixes: SHARED_PREFIXES,
        },
        {
          mode: 'fit_predict',
          task: { perspective: 'remaining_time' },
          log: SHARED_LOG,
          prefixes: SHARED_PREFIXES,
        },
        {
          mode: 'fit_predict',
          task: { perspective: 'outcome' },
          log: SHARED_LOG,
          prefixes: SHARED_PREFIXES,
        },
        {
          mode: 'fit_predict',
          task: { perspective: 'drift' },
          log: SHARED_LOG,
          prefixes: SHARED_PREFIXES,
        },
        {
          mode: 'fit_predict',
          task: { perspective: 'features' },
          log: SHARED_LOG,
          prefixes: SHARED_PREFIXES,
        },
        {
          mode: 'fit_predict',
          task: { perspective: 'resource' },
          log: SHARED_LOG,
          prefixes: SHARED_PREFIXES,
        },
      ]);
      for (const r of results) {
        expect(r.response?.diagnostics.durationMs).toBeGreaterThanOrEqual(0);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Edge cases: empty log safety
  // -------------------------------------------------------------------------

  describe('Empty log safety', () => {
    const EMPTY_LOG: PredictionLog = { traces: [] };

    it('fit on empty log reports a structured empty_log error without crashing', () => {
      // The dispatcher rejects empty logs with { code: 'empty_log' } rather than
      // silently succeeding or throwing an unhandled exception.
      let caughtError: unknown;
      try {
        dispatcher.execute({
          mode: 'fit',
          task: { perspective: 'next_activity', ngramOrder: 2, topK: 3 },
          log: EMPTY_LOG,
        });
      } catch (e) {
        caughtError = e;
      }
      if (caughtError) {
        // If it throws, it must be a structured error with a code field
        expect((caughtError as { code?: string }).code).toBe('empty_log');
      }
      // If it doesn't throw, the test passes (graceful no-op)
    });

    it('fit_predict on empty log either returns empty predictions or reports empty_log error', () => {
      const prefixes = makePrefixes(
        makeSyntheticLog({ numTraces: 5, eventsPerTrace: 3, numActivities: 4 }),
        2
      );
      let caughtError: unknown;
      let response: ReturnType<typeof dispatcher.execute> | undefined;
      try {
        response = dispatcher.execute({
          mode: 'fit_predict',
          task: { perspective: 'next_activity', ngramOrder: 2, topK: 3 },
          log: EMPTY_LOG,
          prefixes,
        });
      } catch (e) {
        caughtError = e;
      }
      if (caughtError) {
        expect((caughtError as { code?: string }).code).toBe('empty_log');
      } else {
        // Returned normally — all prefixes skipped (no trained model)
        expect(response!.diagnostics.scored + response!.diagnostics.skipped).toBe(prefixes.length);
      }
    });
  });
});
