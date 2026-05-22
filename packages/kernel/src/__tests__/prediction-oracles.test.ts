/**
 * prediction-oracles.test.ts
 *
 * Oracle-ranked tests for all six Van der Aalst prediction perspectives
 * implemented in packages/kernel/src/prediction/.
 *
 * Oracle rank follows .claude/rules/chicago-tdd.md and .claude/rules/ml-rl-testing.md:
 *
 *   Rank 1 — Mathematical theorem: properties that hold for any correct
 *             implementation regardless of training data.
 *   Rank 2 — Domain contract: design-decided properties derived from
 *             the six-perspective specification.
 *   Rank 3 — Metamorphic relation: input perturbation → output relation.
 *
 * The prediction layer is pure TypeScript (no WASM dependency). All tests
 * run without the WASM binary.
 *
 * Covered perspectives:
 *   next_activity   — n-gram confidence scores, topK, ordering
 *   remaining_time  — non-negative outputs, totalEstimate = elapsed + remaining
 *   outcome         — probability distribution sums, binary outcome class count
 *   drift           — jaccard in [0,1], drift boolean ↔ threshold, novelEdges
 *   features        — schema completeness, numeric values, rework correctness
 *   resource        — UCB1 score structure, recommended ≡ scores[0].resource
 */

import { describe, it, expect } from 'vitest';
import { PredictionDispatcher } from '../prediction/index.js';
import type {
  PredictionLog,
  PredictionTrace,
  PredictionEvent,
  NextActivityTask,
  RemainingTimeTask,
  OutcomeTask,
  DriftTask,
  FeaturesTask,
  ResourceTask,
} from '../prediction/index.js';

// ─── Shared fixtures ──────────────────────────────────────────────────────────

function mkEvent(activity: string, ts: number, resource?: string): PredictionEvent {
  return { activity, timestamp: ts, resource };
}

function mkTrace(
  caseId: string,
  activities: string[],
  baseMs = 0,
  gapMs = 60_000,
  resources?: string[]
): PredictionTrace {
  return {
    caseId,
    events: activities.map((activity, i) =>
      mkEvent(activity, baseMs + i * gapMs, resources?.[i])
    ),
  };
}

/**
 * Eight-trace training log with clear patterns across all six perspectives.
 *
 * Control-flow: A→B is the dominant transition (6/8 traces).
 * Outcomes: traces that end with 'Pass' (c1-c4) or 'Fail' (c5-c8).
 * Resources: Alice handles 'A', Bob handles 'B', Carol handles 'C'.
 * Timestamps: spaced at 60 000 ms (1 minute) per event for deterministic
 *             remaining-time arithmetic.
 */
const TRAINING_LOG: PredictionLog = {
  traces: [
    mkTrace('c1', ['A', 'B', 'C', 'Pass'], 0,       60_000, ['Alice', 'Bob', 'Carol', 'Carol']),
    mkTrace('c2', ['A', 'B', 'C', 'Pass'], 100_000, 60_000, ['Alice', 'Bob', 'Carol', 'Carol']),
    mkTrace('c3', ['A', 'B', 'Pass'],      200_000, 60_000, ['Alice', 'Bob', 'Bob']),
    mkTrace('c4', ['A', 'B', 'Pass'],      300_000, 60_000, ['Alice', 'Bob', 'Bob']),
    mkTrace('c5', ['A', 'C', 'Fail'],      400_000, 60_000, ['Alice', 'Carol', 'Carol']),
    mkTrace('c6', ['A', 'C', 'Fail'],      500_000, 60_000, ['Alice', 'Carol', 'Carol']),
    mkTrace('c7', ['A', 'B', 'D', 'Fail'], 600_000, 60_000, ['Alice', 'Bob', 'Carol', 'Carol']),
    mkTrace('c8', ['A', 'B', 'C', 'Pass'], 700_000, 60_000, ['Alice', 'Bob', 'Carol', 'Carol']),
  ],
};

// Dispatcher instance shared across all describe blocks (stateless).
const dispatcher = new PredictionDispatcher();

// ─── Helper ───────────────────────────────────────────────────────────────────

function fitPredict<T extends NextActivityTask | RemainingTimeTask | OutcomeTask | DriftTask | FeaturesTask | ResourceTask>(
  task: T,
  prefixes: PredictionTrace[]
) {
  return dispatcher.execute({ mode: 'fit_predict', task, log: TRAINING_LOG, prefixes });
}

// =============================================================================
// 1. next_activity perspective
// =============================================================================

describe('Prediction perspective: next_activity', () => {
  const task: NextActivityTask = { perspective: 'next_activity', ngramOrder: 1, topK: 3 };
  const prefix = mkTrace('p', ['A']);

  // ── Rank 1 ────────────────────────────────────────────────────────────────

  it('Rank-1: confidence scores are all in [0, 1]', () => {
    const response = fitPredict(task, [prefix]);
    const candidates = response.predictions[0].prediction.candidates as Array<{
      activity: string;
      probability: number;
    }>;
    for (const c of candidates) {
      expect(c.probability).toBeGreaterThanOrEqual(0);
      expect(c.probability).toBeLessThanOrEqual(1);
    }
  });

  it('Rank-1: full-vocab distribution sums to ≈ 1 (topK covers entire vocabulary)', () => {
    const broadTask: NextActivityTask = { perspective: 'next_activity', ngramOrder: 1, topK: 20 };
    const response = fitPredict(broadTask, [prefix]);
    const candidates = response.predictions[0].prediction.candidates as Array<{
      probability: number;
    }>;
    const sum = candidates.reduce((s, c) => s + c.probability, 0);
    // Laplace-smoothed distribution must sum to 1 within floating-point tolerance.
    expect(sum).toBeGreaterThan(0.99);
    expect(sum).toBeLessThan(1.01);
  });

  it('Rank-1: candidates are sorted by probability descending', () => {
    const broadTask: NextActivityTask = { perspective: 'next_activity', ngramOrder: 1, topK: 20 };
    const response = fitPredict(broadTask, [prefix]);
    const candidates = response.predictions[0].prediction.candidates as Array<{
      probability: number;
    }>;
    for (let i = 1; i < candidates.length; i++) {
      expect(candidates[i].probability).toBeLessThanOrEqual(candidates[i - 1].probability);
    }
  });

  it('Rank-1: topK=1 returns exactly one candidate', () => {
    const narrowTask: NextActivityTask = { perspective: 'next_activity', ngramOrder: 1, topK: 1 };
    const response = fitPredict(narrowTask, [prefix]);
    const candidates = response.predictions[0].prediction.candidates as unknown[];
    expect(candidates).toHaveLength(1);
  });

  it('Rank-1: topK=3 returns at most 3 candidates', () => {
    const response = fitPredict(task, [prefix]);
    const candidates = response.predictions[0].prediction.candidates as unknown[];
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.length).toBeLessThanOrEqual(3);
  });

  it('Rank-1: each candidate has a non-empty activity string', () => {
    const response = fitPredict(task, [prefix]);
    const candidates = response.predictions[0].prediction.candidates as Array<{
      activity: string;
    }>;
    for (const c of candidates) {
      expect(typeof c.activity).toBe('string');
      expect(c.activity.length).toBeGreaterThan(0);
    }
  });

  // ── Rank 2 ────────────────────────────────────────────────────────────────

  it('Rank-2: response perspective field equals next_activity', () => {
    const response = fitPredict(task, [prefix]);
    expect(response.perspective).toBe('next_activity');
  });

  it('Rank-2: top candidate for prefix [A] is B (dominant in training log)', () => {
    // A→B appears in c1, c2, c3, c4, c7, c8 (6 of 8 traces). Should be top.
    const narrowTask: NextActivityTask = { perspective: 'next_activity', ngramOrder: 1, topK: 1 };
    const response = fitPredict(narrowTask, [prefix]);
    const top = response.predictions[0].prediction.top as { activity: string } | null;
    expect(top).not.toBeNull();
    expect(top?.activity).toBe('B');
  });

  it('Rank-2: confidence field equals probability of top candidate', () => {
    const response = fitPredict(task, [prefix]);
    const record = response.predictions[0];
    const candidates = record.prediction.candidates as Array<{ probability: number }>;
    expect(record.confidence).toBeCloseTo(candidates[0].probability, 10);
  });

  it('Rank-2: diagnostics scored=1 skipped=0 for one non-empty prefix', () => {
    const response = fitPredict(task, [prefix]);
    expect(response.diagnostics.scored).toBe(1);
    expect(response.diagnostics.skipped).toBe(0);
  });

  it('Rank-2: empty prefix is skipped — scored=0 skipped=1', () => {
    const empty: PredictionTrace = { caseId: 'empty', events: [] };
    const response = fitPredict(task, [empty]);
    expect(response.diagnostics.scored).toBe(0);
    expect(response.diagnostics.skipped).toBe(1);
    expect(response.predictions).toHaveLength(0);
  });

  // ── Rank 3 ────────────────────────────────────────────────────────────────

  it('Rank-3: same prefix twice produces identical predictions (determinism)', () => {
    const r1 = fitPredict(task, [prefix]);
    const r2 = fitPredict(task, [prefix]);
    const c1 = r1.predictions[0].prediction.candidates as Array<{
      activity: string;
      probability: number;
    }>;
    const c2 = r2.predictions[0].prediction.candidates as Array<{
      activity: string;
      probability: number;
    }>;
    expect(c1).toEqual(c2);
  });
});

// =============================================================================
// 2. remaining_time perspective
// =============================================================================

describe('Prediction perspective: remaining_time', () => {
  const task: RemainingTimeTask = { perspective: 'remaining_time', aggregator: 'mean' };

  // ── Rank 1 ────────────────────────────────────────────────────────────────

  it('Rank-1: remainingMs is non-negative for every prefix', () => {
    const prefixes = [
      mkTrace('p1', ['A'], 0, 60_000),
      mkTrace('p2', ['A', 'B'], 0, 60_000),
      mkTrace('p3', ['A', 'B', 'C'], 0, 60_000),
    ];
    const response = fitPredict(task, prefixes);
    for (const record of response.predictions) {
      const pred = record.prediction as {
        remainingMs: number;
        elapsedMs: number;
        totalEstimateMs: number;
      };
      expect(pred.remainingMs).toBeGreaterThanOrEqual(0);
    }
  });

  it('Rank-1: elapsedMs is non-negative for every prefix', () => {
    const prefixes = [mkTrace('p', ['A', 'B'], 0, 60_000)];
    const response = fitPredict(task, prefixes);
    const pred = response.predictions[0].prediction as { elapsedMs: number };
    expect(pred.elapsedMs).toBeGreaterThanOrEqual(0);
  });

  it('Rank-1: totalEstimateMs = elapsedMs + remainingMs (additive decomposition)', () => {
    const prefix = mkTrace('p', ['A', 'B'], 0, 60_000);
    const response = fitPredict(task, [prefix]);
    const pred = response.predictions[0].prediction as {
      remainingMs: number;
      elapsedMs: number;
      totalEstimateMs: number;
    };
    expect(pred.totalEstimateMs).toBeCloseTo(pred.elapsedMs + pred.remainingMs, 5);
  });

  it('Rank-1: basedOnSamples is a non-negative integer', () => {
    const prefix = mkTrace('p', ['A'], 0, 60_000);
    const response = fitPredict(task, [prefix]);
    const pred = response.predictions[0].prediction as { basedOnSamples: number };
    expect(Number.isInteger(pred.basedOnSamples)).toBe(true);
    expect(pred.basedOnSamples).toBeGreaterThanOrEqual(0);
  });

  // ── Rank 2 ────────────────────────────────────────────────────────────────

  it('Rank-2: response perspective field equals remaining_time', () => {
    const response = fitPredict(task, [mkTrace('p', ['A'])]);
    expect(response.perspective).toBe('remaining_time');
  });

  it('Rank-2: median aggregator produces a valid non-negative remainingMs', () => {
    const medianTask: RemainingTimeTask = {
      perspective: 'remaining_time',
      aggregator: 'median',
    };
    const prefix = mkTrace('p', ['A', 'B'], 0, 60_000);
    const response = fitPredict(medianTask, [prefix]);
    const pred = response.predictions[0].prediction as { remainingMs: number };
    expect(pred.remainingMs).toBeGreaterThanOrEqual(0);
  });

  it('Rank-2: prediction output carries all four required fields', () => {
    const prefix = mkTrace('p', ['A', 'B'], 0, 60_000);
    const response = fitPredict(task, [prefix]);
    const pred = response.predictions[0].prediction;
    expect(pred).toHaveProperty('remainingMs');
    expect(pred).toHaveProperty('elapsedMs');
    expect(pred).toHaveProperty('totalEstimateMs');
    expect(pred).toHaveProperty('basedOnSamples');
  });

  // ── Rank 3 ────────────────────────────────────────────────────────────────

  it('Rank-3: longer prefix has less or equal remainingMs than shorter prefix (monotone)', () => {
    // A prefix of length 3 has consumed more of the trace than length 1, so
    // the estimated remaining should be ≤ that for length 1.
    const shortPrefix = mkTrace('short', ['A'], 0, 60_000);
    const longPrefix  = mkTrace('long',  ['A', 'B', 'C'], 0, 60_000);
    const response    = fitPredict(task, [shortPrefix, longPrefix]);
    const shortRemaining = (response.predictions[0].prediction as { remainingMs: number }).remainingMs;
    const longRemaining  = (response.predictions[1].prediction as { remainingMs: number }).remainingMs;
    // May not always hold for unseen prefix lengths (uses global fallback),
    // but for the dominant A→B→C→* pattern it should.
    expect(shortRemaining).toBeGreaterThanOrEqual(longRemaining);
  });
});

// =============================================================================
// 3. outcome perspective
// =============================================================================

describe('Prediction perspective: outcome', () => {
  // Labeller: outcome = last activity of completed trace.
  const labeller = (trace: PredictionTrace) =>
    trace.events[trace.events.length - 1]?.activity;

  const task: OutcomeTask = { perspective: 'outcome', labeller };

  // ── Rank 1 ────────────────────────────────────────────────────────────────

  it('Rank-1: outcome distribution probabilities are all in [0, 1]', () => {
    const prefix = mkTrace('p', ['A', 'B']);
    const response = fitPredict(task, [prefix]);
    const dist = response.predictions[0].prediction.distribution as Record<string, number>;
    for (const prob of Object.values(dist)) {
      expect(prob).toBeGreaterThanOrEqual(0);
      expect(prob).toBeLessThanOrEqual(1);
    }
  });

  it('Rank-1: outcome distribution probabilities sum to ≈ 1', () => {
    const prefix = mkTrace('p', ['A', 'B']);
    const response = fitPredict(task, [prefix]);
    const dist = response.predictions[0].prediction.distribution as Record<string, number>;
    const sum = Object.values(dist).reduce((s, v) => s + v, 0);
    expect(sum).toBeGreaterThan(0.99);
    expect(sum).toBeLessThan(1.01);
  });

  it('Rank-1: binary outcome task produces exactly 2 classes in distribution', () => {
    // Our training log has exactly two terminal activities: 'Pass' and 'Fail'.
    const binaryTask: OutcomeTask = {
      perspective: 'outcome',
      labeller,
      outcomes: ['Pass', 'Fail'],
    };
    const prefix = mkTrace('p', ['A', 'B']);
    const response = fitPredict(binaryTask, [prefix]);
    const dist = response.predictions[0].prediction.distribution as Record<string, number>;
    expect(Object.keys(dist)).toHaveLength(2);
    expect(Object.keys(dist)).toContain('Pass');
    expect(Object.keys(dist)).toContain('Fail');
  });

  // ── Rank 2 ────────────────────────────────────────────────────────────────

  it('Rank-2: response perspective field equals outcome', () => {
    const response = fitPredict(task, [mkTrace('p', ['A'])]);
    expect(response.perspective).toBe('outcome');
  });

  it('Rank-2: predicted outcome field is a string or null', () => {
    const prefix = mkTrace('p', ['A', 'B']);
    const response = fitPredict(task, [prefix]);
    const outcome = response.predictions[0].prediction.outcome;
    expect(outcome === null || typeof outcome === 'string').toBe(true);
  });

  it('Rank-2: dominant suffix A→B predicts Pass (trained on 5/8 A→B traces ending Pass)', () => {
    // A→B→Pass appears in c1, c2, c3, c4, c8 (5 traces).
    // A→B→Fail appears only in c7.
    const prefix = mkTrace('p', ['A', 'B']);
    const response = fitPredict(task, [prefix]);
    const dist = response.predictions[0].prediction.distribution as Record<string, number>;
    // Pass should have higher probability than Fail.
    expect((dist['Pass'] ?? 0)).toBeGreaterThan(dist['Fail'] ?? 0);
  });

  // ── Rank 3 ────────────────────────────────────────────────────────────────

  it('Rank-3: determinism — same prefix yields identical distributions on two calls', () => {
    const prefix = mkTrace('p', ['A', 'B']);
    const r1 = fitPredict(task, [prefix]);
    const r2 = fitPredict(task, [prefix]);
    expect(r1.predictions[0].prediction.distribution).toEqual(
      r2.predictions[0].prediction.distribution
    );
  });
});

// =============================================================================
// 4. drift perspective
// =============================================================================

describe('Prediction perspective: drift', () => {
  const task: DriftTask = {
    perspective: 'drift',
    ewmaAlpha: 0.3,
    driftThreshold: 0.7,
  };

  // ── Rank 1 ────────────────────────────────────────────────────────────────

  it('Rank-1: jaccard score is in [0, 1]', () => {
    const prefix = mkTrace('p', ['A', 'B', 'C']);
    const response = fitPredict(task, [prefix]);
    const pred = response.predictions[0].prediction as { jaccard: number };
    expect(pred.jaccard).toBeGreaterThanOrEqual(0);
    expect(pred.jaccard).toBeLessThanOrEqual(1);
  });

  it('Rank-1: ewmaScore is in [0, 1]', () => {
    const prefix = mkTrace('p', ['A', 'B', 'C']);
    const response = fitPredict(task, [prefix]);
    const pred = response.predictions[0].prediction as { ewmaScore: number };
    expect(pred.ewmaScore).toBeGreaterThanOrEqual(0);
    expect(pred.ewmaScore).toBeLessThanOrEqual(1);
  });

  it('Rank-1: drift=true iff ewmaScore < driftThreshold', () => {
    const prefix = mkTrace('p', ['A', 'B', 'C']);
    const response = fitPredict(task, [prefix]);
    const pred = response.predictions[0].prediction as {
      ewmaScore: number;
      drift: boolean;
    };
    const expectedDrift = pred.ewmaScore < 0.7;
    expect(pred.drift).toBe(expectedDrift);
  });

  it('Rank-1: novelEdges is an array of strings', () => {
    const prefix = mkTrace('p', ['A', 'B', 'C']);
    const response = fitPredict(task, [prefix]);
    const pred = response.predictions[0].prediction as { novelEdges: unknown[] };
    expect(Array.isArray(pred.novelEdges)).toBe(true);
    for (const e of pred.novelEdges) expect(typeof e).toBe('string');
  });

  it('Rank-1: prefix using only known edges has zero novel edges', () => {
    // A→B→C edges (A>B, B>C) are all present in the training log.
    // novelEdges should be empty even if jaccard < 1 (prefix ⊆ reference).
    const matchingPrefix = mkTrace('p', ['A', 'B', 'C']);
    const response = fitPredict(task, [matchingPrefix]);
    const pred = response.predictions[0].prediction as {
      jaccard: number;
      novelEdges: string[];
    };
    // All edges from this prefix are in the training reference — no novel edges.
    expect(pred.novelEdges).toHaveLength(0);
    // jaccard may be < 1 because the prefix is a strict subset of all training edges.
    expect(pred.jaccard).toBeGreaterThan(0);
    expect(pred.jaccard).toBeLessThanOrEqual(1);
  });

  // ── Rank 2 ────────────────────────────────────────────────────────────────

  it('Rank-2: response perspective field equals drift', () => {
    const response = fitPredict(task, [mkTrace('p', ['A', 'B'])]);
    expect(response.perspective).toBe('drift');
  });

  it('Rank-2: prediction output carries all four required fields', () => {
    const prefix = mkTrace('p', ['A', 'B']);
    const response = fitPredict(task, [prefix]);
    const pred = response.predictions[0].prediction;
    expect(pred).toHaveProperty('jaccard');
    expect(pred).toHaveProperty('ewmaScore');
    expect(pred).toHaveProperty('drift');
    expect(pred).toHaveProperty('novelEdges');
  });

  it('Rank-2: unknown activity edges become novelEdges', () => {
    // 'Z' never appears in training, so Z→Y is a novel edge.
    const novelPrefix = mkTrace('p', ['Z', 'Y']);
    const response = fitPredict(task, [novelPrefix]);
    const pred = response.predictions[0].prediction as { novelEdges: string[] };
    expect(pred.novelEdges.length).toBeGreaterThan(0);
    expect(pred.novelEdges).toContain('Z>Y');
  });

  // ── Rank 3 ────────────────────────────────────────────────────────────────

  it('Rank-3: unseen activity sequence has lower jaccard than known sequence', () => {
    const knownPrefix   = mkTrace('known',   ['A', 'B', 'C']);
    const unknownPrefix = mkTrace('unknown', ['X', 'Y', 'Z']);
    const response      = fitPredict(task, [knownPrefix, unknownPrefix]);
    const knownJaccard   = (response.predictions[0].prediction as { jaccard: number }).jaccard;
    const unknownJaccard = (response.predictions[1].prediction as { jaccard: number }).jaccard;
    expect(knownJaccard).toBeGreaterThan(unknownJaccard);
  });
});

// =============================================================================
// 5. features perspective
// =============================================================================

describe('Prediction perspective: features', () => {
  const task: FeaturesTask = { perspective: 'features', includeRework: true };

  // ── Rank 1 ────────────────────────────────────────────────────────────────

  it('Rank-1: all feature values are finite numbers', () => {
    const prefix = mkTrace('p', ['A', 'B', 'C'], 0, 60_000);
    const response = fitPredict(task, [prefix]);
    const pred = response.predictions[0].prediction as { features: Record<string, number> };
    for (const v of Object.values(pred.features)) {
      expect(typeof v).toBe('number');
      expect(Number.isFinite(v)).toBe(true);
    }
  });

  it('Rank-1: prefix_length equals the number of events in the prefix', () => {
    const prefix = mkTrace('p', ['A', 'B', 'C'], 0, 60_000);
    const response = fitPredict(task, [prefix]);
    const pred = response.predictions[0].prediction as { features: Record<string, number> };
    expect(pred.features['prefix_length']).toBe(3);
  });

  it('Rank-1: rework_count is 0 for a trace with no repeated activities', () => {
    // A, B, C — all unique.
    const prefix = mkTrace('p', ['A', 'B', 'C'], 0, 60_000);
    const response = fitPredict(task, [prefix]);
    const pred = response.predictions[0].prediction as { features: Record<string, number> };
    expect(pred.features['rework_count']).toBe(0);
  });

  it('Rank-1: rework_count is non-zero for a trace with repeated activity', () => {
    // A, B, B — 'B' repeated once → rework_count = 1.
    const prefix = mkTrace('p', ['A', 'B', 'B'], 0, 60_000);
    const response = fitPredict(task, [prefix]);
    const pred = response.predictions[0].prediction as { features: Record<string, number> };
    expect(pred.features['rework_count']).toBeGreaterThan(0);
  });

  it('Rank-1: rework_ratio is in [0, 1]', () => {
    const prefix = mkTrace('p', ['A', 'A', 'B'], 0, 60_000);
    const response = fitPredict(task, [prefix]);
    const pred = response.predictions[0].prediction as { features: Record<string, number> };
    expect(pred.features['rework_ratio']).toBeGreaterThanOrEqual(0);
    expect(pred.features['rework_ratio']).toBeLessThanOrEqual(1);
  });

  it('Rank-1: elapsed_ms = (last.timestamp - first.timestamp) for multi-event prefix', () => {
    const prefix = mkTrace('p', ['A', 'B', 'C'], 0, 60_000);
    const response = fitPredict(task, [prefix]);
    const pred = response.predictions[0].prediction as { features: Record<string, number> };
    // 3 events at 0, 60000, 120000 → elapsed = 120000.
    expect(pred.features['elapsed_ms']).toBe(120_000);
  });

  // ── Rank 2 ────────────────────────────────────────────────────────────────

  it('Rank-2: schema field is present and is an array of strings', () => {
    const prefix = mkTrace('p', ['A', 'B'], 0, 60_000);
    const response = fitPredict(task, [prefix]);
    const pred = response.predictions[0].prediction as { schema: unknown[] };
    expect(Array.isArray(pred.schema)).toBe(true);
    for (const s of pred.schema) expect(typeof s).toBe('string');
  });

  it('Rank-2: includeRework=true schema includes rework_count and rework_ratio', () => {
    const prefix = mkTrace('p', ['A', 'B'], 0, 60_000);
    const response = fitPredict(task, [prefix]);
    const pred = response.predictions[0].prediction as { schema: string[] };
    expect(pred.schema).toContain('rework_count');
    expect(pred.schema).toContain('rework_ratio');
  });

  it('Rank-2: includeRework=false schema excludes rework fields', () => {
    const noReworkTask: FeaturesTask = { perspective: 'features', includeRework: false };
    const prefix = mkTrace('p', ['A', 'B'], 0, 60_000);
    const response = fitPredict(noReworkTask, [prefix]);
    const pred = response.predictions[0].prediction as { schema: string[] };
    expect(pred.schema).not.toContain('rework_count');
    expect(pred.schema).not.toContain('rework_ratio');
  });

  it('Rank-2: distinct_resources equals number of unique resources in prefix', () => {
    const prefix = mkTrace('p', ['A', 'B', 'C'], 0, 60_000, ['Alice', 'Bob', 'Alice']);
    const response = fitPredict(task, [prefix]);
    const pred = response.predictions[0].prediction as { features: Record<string, number> };
    // Alice, Bob → 2 distinct resources.
    expect(pred.features['distinct_resources']).toBe(2);
  });

  // ── Rank 3 ────────────────────────────────────────────────────────────────

  it('Rank-3: longer prefix has larger or equal elapsed_ms than shorter prefix', () => {
    const shortPrefix = mkTrace('short', ['A', 'B'],    0, 60_000);
    const longPrefix  = mkTrace('long',  ['A', 'B', 'C'], 0, 60_000);
    const responseShort = fitPredict(task, [shortPrefix]);
    const responseLong  = fitPredict(task, [longPrefix]);
    const shortElapsed = (responseShort.predictions[0].prediction as { features: Record<string, number> }).features['elapsed_ms'];
    const longElapsed  = (responseLong.predictions[0].prediction as { features: Record<string, number> }).features['elapsed_ms'];
    expect(longElapsed).toBeGreaterThanOrEqual(shortElapsed);
  });
});

// =============================================================================
// 6. resource perspective
// =============================================================================

describe('Prediction perspective: resource', () => {
  const task: ResourceTask = { perspective: 'resource', ucbC: Math.SQRT2 };

  // ── Rank 1 ────────────────────────────────────────────────────────────────

  it('Rank-1: scores array contains objects with resource (string), score (number), pulls (int)', () => {
    const prefix = mkTrace('p', ['A'], 0, 60_000, ['Alice']);
    const response = fitPredict(task, [prefix]);
    const pred = response.predictions[0].prediction as {
      scores: Array<{ resource: string; score: number; pulls: number }>;
    };
    for (const s of pred.scores) {
      expect(typeof s.resource).toBe('string');
      expect(typeof s.score).toBe('number');
      expect(Number.isFinite(s.score)).toBe(true);
      expect(Number.isInteger(s.pulls)).toBe(true);
      expect(s.pulls).toBeGreaterThanOrEqual(0);
    }
  });

  it('Rank-1: recommended resource matches scores[0].resource (top UCB1 arm)', () => {
    // After seeing Alice handle 'A' in all 8 training traces, Alice should
    // be the recommended resource for the 'A' activity.
    const prefix = mkTrace('p', ['A'], 0, 60_000, ['Alice']);
    const response = fitPredict(task, [prefix]);
    const pred = response.predictions[0].prediction as {
      recommended: string | null;
      scores: Array<{ resource: string }>;
    };
    if (pred.scores.length > 0) {
      expect(pred.recommended).toBe(pred.scores[0].resource);
    } else {
      expect(pred.recommended).toBeNull();
    }
  });

  it('Rank-1: scores are sorted by score descending', () => {
    const prefix = mkTrace('p', ['A'], 0, 60_000, ['Alice']);
    const response = fitPredict(task, [prefix]);
    const scores = (response.predictions[0].prediction as { scores: Array<{ score: number }> }).scores;
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i].score).toBeLessThanOrEqual(scores[i - 1].score);
    }
  });

  // ── Rank 2 ────────────────────────────────────────────────────────────────

  it('Rank-2: response perspective field equals resource', () => {
    const response = fitPredict(task, [mkTrace('p', ['A'], 0, 60_000, ['Alice'])]);
    expect(response.perspective).toBe('resource');
  });

  it('Rank-2: recommended is Alice for activity A (she handled A in all 8 training traces)', () => {
    const prefix = mkTrace('p', ['A'], 0, 60_000, ['Alice']);
    const response = fitPredict(task, [prefix]);
    const pred = response.predictions[0].prediction as { recommended: string | null };
    expect(pred.recommended).toBe('Alice');
  });

  it('Rank-2: prediction output carries recommended and scores fields', () => {
    const prefix = mkTrace('p', ['A'], 0, 60_000, ['Alice']);
    const response = fitPredict(task, [prefix]);
    const pred = response.predictions[0].prediction;
    expect(pred).toHaveProperty('recommended');
    expect(pred).toHaveProperty('scores');
  });

  it('Rank-2: prefix with no training-seen activity returns recommended=null and empty scores', () => {
    const unknownPrefix = mkTrace('p', ['UNKNOWN_ACTIVITY'], 0, 60_000);
    const response = fitPredict(task, [unknownPrefix]);
    const pred = response.predictions[0].prediction as {
      recommended: string | null;
      scores: unknown[];
    };
    expect(pred.recommended).toBeNull();
    expect(pred.scores).toHaveLength(0);
  });

  // ── Rank 3 ────────────────────────────────────────────────────────────────

  it('Rank-3: determinism — same prefix yields identical recommendation on two calls', () => {
    const prefix = mkTrace('p', ['A'], 0, 60_000, ['Alice']);
    const r1 = fitPredict(task, [prefix]);
    const r2 = fitPredict(task, [prefix]);
    expect(r1.predictions[0].prediction.recommended).toBe(r2.predictions[0].prediction.recommended);
  });
});

// =============================================================================
// 7. All six perspectives — domain contract batch tests
// =============================================================================

describe('All six prediction perspectives — domain contracts', () => {
  const allTasks = [
    { perspective: 'next_activity', ngramOrder: 1, topK: 3 } as NextActivityTask,
    { perspective: 'remaining_time', aggregator: 'mean' } as RemainingTimeTask,
    {
      perspective: 'outcome',
      labeller: (t: PredictionTrace) => t.events[t.events.length - 1]?.activity,
    } as OutcomeTask,
    { perspective: 'drift', driftThreshold: 0.7 } as DriftTask,
    { perspective: 'features', includeRework: true } as FeaturesTask,
    { perspective: 'resource', ucbC: Math.SQRT2 } as ResourceTask,
  ];

  for (const task of allTasks) {
    it(`Rank-2: perspective="${task.perspective}" executes without error`, () => {
      const prefix = mkTrace('p', ['A', 'B'], 0, 60_000, ['Alice', 'Bob']);
      expect(() => fitPredict(task, [prefix])).not.toThrow();
    });

    it(`Rank-2: perspective="${task.perspective}" returns correct perspective field`, () => {
      const prefix = mkTrace('p', ['A', 'B'], 0, 60_000, ['Alice', 'Bob']);
      const response = fitPredict(task, [prefix]);
      expect(response.perspective).toBe(task.perspective);
    });

    it(`Rank-2: perspective="${task.perspective}" diagnostics.durationMs is non-negative`, () => {
      const prefix = mkTrace('p', ['A', 'B'], 0, 60_000, ['Alice', 'Bob']);
      const response = fitPredict(task, [prefix]);
      expect(response.diagnostics.durationMs).toBeGreaterThanOrEqual(0);
    });
  }

  it('Rank-1: executeBatch across all 6 perspectives returns 6 results', () => {
    const prefix = mkTrace('p', ['A', 'B'], 0, 60_000, ['Alice', 'Bob']);
    const labeller = (t: PredictionTrace) => t.events[t.events.length - 1]?.activity;
    const results = dispatcher.executeBatch(
      allTasks.map((task) => ({
        mode: 'fit_predict' as const,
        task: task.perspective === 'outcome' ? { ...task, labeller } : task,
        log: TRAINING_LOG,
        prefixes: [prefix],
      }))
    );
    expect(results).toHaveLength(6);
    for (const r of results) {
      // Each should succeed without error.
      expect(r.error).toBeUndefined();
      expect(r.response).toBeDefined();
    }
  });
});
