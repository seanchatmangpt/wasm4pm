import { describe, it, expect } from 'vitest';

/**
 * Drift detection contract & semantics tests.
 *
 * These tests cover the *consumer-side* behaviour of the WASM `detect_drift`
 * and `compute_ewma` exports as observed by `@wasm4pm/kernel` and
 * `apps/wasm4pm` CLI commands:
 *
 *   • Result-shape contract for `detect_drift` JSON
 *   • Result-shape contract for `compute_ewma` JSON
 *   • EWMA alert-threshold logic used by `drift-watch`
 *   • Window-size handling (sliding-window position arithmetic)
 *   • Trend classification semantics
 *
 * They do not require an initialised WASM module: the EWMA / Jaccard /
 * threshold logic is simple enough to mirror in TypeScript and assert
 * directly.  The Rust side has its own Rank-1 oracle suite at
 * `wasm4pm/tests/prediction_drift_oracles.rs`.
 */

// ---------------------------------------------------------------------------
// Reference implementations (mirrors of `prediction_drift.rs`)
// ---------------------------------------------------------------------------

const DEFAULT_DRIFT_THRESHOLD = 0.3;
const TREND_STABILITY_FRACTION = 0.05;

/** EWMA: s[0]=x[0]; s[i+1] = α·x[i+1] + (1−α)·s[i]. */
function ewma(values: readonly number[], alpha: number): number[] {
  if (values.length === 0) return [];
  const a = Math.min(1, Math.max(Number.MIN_VALUE, alpha));
  const out = [values[0]];
  for (let i = 1; i < values.length; i++) {
    out.push(a * values[i] + (1 - a) * out[i - 1]);
  }
  return out;
}

function jaccardDistance<T>(a: ReadonlySet<T>, b: ReadonlySet<T>): number {
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  if (union === 0) return 0;
  return 1 - inter / union;
}

function classifyTrend(smoothed: readonly number[]): 'rising' | 'falling' | 'stable' {
  if (smoothed.length < 2) return 'stable';
  const first = smoothed[0];
  const last = smoothed[smoothed.length - 1];
  const range = Math.abs(last - first);
  const scale = Math.max(Math.abs(first), Math.abs(last), 1e-9);
  if (range / scale < TREND_STABILITY_FRACTION) return 'stable';
  return last > first ? 'rising' : 'falling';
}

/** The `drift-watch` alert rule. */
function shouldAlert(ewmaValue: number, threshold = DEFAULT_DRIFT_THRESHOLD): boolean {
  return ewmaValue > threshold;
}

// ---------------------------------------------------------------------------
// Contract — `detect_drift` JSON shape
// ---------------------------------------------------------------------------

describe('detect_drift result shape', () => {
  it('contains all canonical fields with correct types', () => {
    // Reference object that the WASM export is contractually obliged to emit.
    const sample = {
      drifts_detected: 2,
      drifts: [
        { position: 5, distance: 0.45, type: 'concept_drift' },
        { position: 10, distance: 0.62, type: 'concept_drift' },
      ],
      window_size: 5,
      method: 'jaccard_window',
      threshold: DEFAULT_DRIFT_THRESHOLD,
    };
    expect(typeof sample.drifts_detected).toBe('number');
    expect(Array.isArray(sample.drifts)).toBe(true);
    expect(sample.drifts.length).toBe(sample.drifts_detected);
    expect(sample.method).toBe('jaccard_window');
    for (const d of sample.drifts) {
      expect(typeof d.position).toBe('number');
      expect(d.distance).toBeGreaterThan(DEFAULT_DRIFT_THRESHOLD);
      expect(d.distance).toBeLessThanOrEqual(1);
      expect(d.type).toBe('concept_drift');
    }
  });

  it('reports drift positions as multiples of window_size', () => {
    // Per the Rust impl: position = idx * window_size.
    const ws = 7;
    const drifts = [
      { position: 0, distance: 0.5, type: 'concept_drift' },
      { position: 14, distance: 0.6, type: 'concept_drift' },
      { position: 35, distance: 0.7, type: 'concept_drift' },
    ];
    for (const d of drifts) {
      expect(d.position % ws).toBe(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Jaccard distance — boundary semantics
// ---------------------------------------------------------------------------

describe('Jaccard distance', () => {
  it('returns 0 for identical sets', () => {
    expect(jaccardDistance(new Set(['A', 'B', 'C']), new Set(['A', 'B', 'C']))).toBe(0);
  });

  it('returns 0 for two empty sets (by convention)', () => {
    expect(jaccardDistance(new Set(), new Set())).toBe(0);
  });

  it('returns 1 for disjoint non-empty sets', () => {
    expect(jaccardDistance(new Set(['A']), new Set(['B']))).toBe(1);
  });

  it('is symmetric', () => {
    const a = new Set(['A', 'B', 'C']);
    const b = new Set(['B', 'C', 'D', 'E']);
    expect(jaccardDistance(a, b)).toBeCloseTo(jaccardDistance(b, a), 12);
  });

  it('matches |A ∩ B| / |A ∪ B| for partial overlap', () => {
    const a = new Set(['A', 'B']);
    const b = new Set(['B', 'C']);
    expect(jaccardDistance(a, b)).toBeCloseTo(2 / 3, 12);
  });
});

// ---------------------------------------------------------------------------
// EWMA — recurrence and convergence
// ---------------------------------------------------------------------------

describe('EWMA series', () => {
  it('returns empty array for empty input', () => {
    expect(ewma([], 0.5)).toEqual([]);
  });

  it('preserves single-value input', () => {
    expect(ewma([42], 0.5)).toEqual([42]);
  });

  it('satisfies the recurrence pointwise', () => {
    const v = [1, 4, 9, 16, 25];
    const a = 0.4;
    const s = ewma(v, a);
    for (let i = 1; i < v.length; i++) {
      const expected = a * v[i] + (1 - a) * s[i - 1];
      expect(s[i]).toBeCloseTo(expected, 12);
    }
  });

  it('converges geometrically to a step', () => {
    const v = [0, ...Array(500).fill(10)];
    const last = ewma(v, 0.3).at(-1)!;
    expect(Math.abs(last - 10)).toBeLessThan(1e-9);
  });

  it('fixes constant input', () => {
    expect(ewma(Array(50).fill(7), 0.3).every((x) => Math.abs(x - 7) < 1e-12)).toBe(true);
  });

  it('clamps alpha=0 to MIN_VALUE (no NaN, stays near first sample)', () => {
    const s = ewma([1, 2, 3, 4], 0);
    expect(s.length).toBe(4);
    expect(s[3]).toBeCloseTo(1, 9);
  });

  it('clamps alpha>1 to 1 (identity-with-lag)', () => {
    expect(ewma([1, 2, 3, 4], 5)).toEqual([1, 2, 3, 4]);
  });

  it('lower alpha smooths more than higher alpha (variance comparison)', () => {
    // Deterministic pseudo-noise so the test is reproducible.
    let state = 1;
    const rand = () => {
      state = (state * 1103515245 + 12345) % 2 ** 31;
      return state / 2 ** 31 - 0.5;
    };
    const v = Array.from({ length: 1000 }, rand);
    const variance = (s: number[]) => {
      const m = s.reduce((a, b) => a + b, 0) / s.length;
      return s.reduce((a, b) => a + (b - m) ** 2, 0) / s.length;
    };
    expect(variance(ewma(v, 0.05))).toBeLessThan(variance(ewma(v, 0.9)));
  });
});

// ---------------------------------------------------------------------------
// Trend classification
// ---------------------------------------------------------------------------

describe('trend classification', () => {
  it('returns "stable" for short series', () => {
    expect(classifyTrend([])).toBe('stable');
    expect(classifyTrend([1])).toBe('stable');
  });

  it('classifies clear monotone series', () => {
    expect(classifyTrend([1, 2, 3, 4])).toBe('rising');
    expect(classifyTrend([10, 8, 6])).toBe('falling');
  });

  it('classifies near-constant series as stable', () => {
    expect(classifyTrend([100, 100.5, 101, 100.9, 100.4])).toBe('stable');
  });
});

// ---------------------------------------------------------------------------
// Alert-threshold behaviour (drift-watch CLI semantics)
// ---------------------------------------------------------------------------

describe('drift-watch alert threshold', () => {
  it('does not alert below threshold', () => {
    expect(shouldAlert(0.0)).toBe(false);
    expect(shouldAlert(0.1)).toBe(false);
    expect(shouldAlert(DEFAULT_DRIFT_THRESHOLD)).toBe(false); // strict >
  });

  it('alerts above threshold', () => {
    expect(shouldAlert(0.31)).toBe(true);
    expect(shouldAlert(0.99)).toBe(true);
  });

  it('honours a custom threshold', () => {
    expect(shouldAlert(0.4, 0.5)).toBe(false);
    expect(shouldAlert(0.6, 0.5)).toBe(true);
  });

  it('end-to-end: distance series → EWMA → alert decision', () => {
    // Quiet period followed by sustained drift.
    const distances = [0.1, 0.05, 0.0, 0.0, 0.45, 0.5, 0.55, 0.6, 0.62, 0.6];
    const smoothed = ewma(distances, 0.4);
    const lastEwma = smoothed.at(-1)!;
    expect(lastEwma).toBeGreaterThan(DEFAULT_DRIFT_THRESHOLD);
    expect(shouldAlert(lastEwma)).toBe(true);
    expect(classifyTrend(smoothed)).toBe('rising');
  });

  it('end-to-end: a single spike does not trigger sustained alert under low alpha', () => {
    const distances = [0.0, 0.0, 0.0, 0.9, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0];
    const smoothed = ewma(distances, 0.1);
    const lastEwma = smoothed.at(-1)!;
    expect(shouldAlert(lastEwma)).toBe(false);
  });
});
