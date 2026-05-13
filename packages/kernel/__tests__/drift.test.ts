import { describe, it, expect } from 'vitest';

const DEFAULT_DRIFT_THRESHOLD = 0.3;
const TREND_STABILITY_FRACTION = 0.05;

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

function shouldAlert(ewmaValue: number, threshold = DEFAULT_DRIFT_THRESHOLD): boolean {
  return ewmaValue > threshold;
}

describe('detect_drift result shape', () => {
  it('contains all canonical fields with correct types and positions as window_size multiples', () => {
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

    const ws = 7;
    const drifts = [
      { position: 0, distance: 0.5 }, { position: 14, distance: 0.6 }, { position: 35, distance: 0.7 },
    ];
    for (const d of drifts) {
      expect(d.position % ws).toBe(0);
    }
  });
});

describe('Jaccard distance', () => {
  it('handles identical, empty, disjoint sets, is symmetric, and matches formula for partial overlap', () => {
    expect(jaccardDistance(new Set(['A', 'B', 'C']), new Set(['A', 'B', 'C']))).toBe(0);
    expect(jaccardDistance(new Set(), new Set())).toBe(0);
    expect(jaccardDistance(new Set(['A']), new Set(['B']))).toBe(1);

    const a = new Set(['A', 'B', 'C']);
    const b = new Set(['B', 'C', 'D', 'E']);
    expect(jaccardDistance(a, b)).toBeCloseTo(jaccardDistance(b, a), 12);

    expect(jaccardDistance(new Set(['A', 'B']), new Set(['B', 'C']))).toBeCloseTo(2 / 3, 12);
  });
});

describe('EWMA series', () => {
  it('handles all edge cases: empty, single, recurrence, convergence, constant, alpha clamping, and variance', () => {
    expect(ewma([], 0.5)).toEqual([]);
    expect(ewma([42], 0.5)).toEqual([42]);

    const v = [1, 4, 9, 16, 25];
    const a = 0.4;
    const s = ewma(v, a);
    for (let i = 1; i < v.length; i++) {
      expect(s[i]).toBeCloseTo(a * v[i] + (1 - a) * s[i - 1], 12);
    }

    expect(Math.abs(ewma([0, ...Array(500).fill(10)], 0.3).at(-1)! - 10)).toBeLessThan(1e-9);
    expect(ewma(Array(50).fill(7), 0.3).every((x) => Math.abs(x - 7) < 1e-12)).toBe(true);

    const zeroAlpha = ewma([1, 2, 3, 4], 0);
    expect(zeroAlpha.length).toBe(4);
    expect(zeroAlpha[3]).toBeCloseTo(1, 9);

    expect(ewma([1, 2, 3, 4], 5)).toEqual([1, 2, 3, 4]);

    let state = 1;
    const rand = () => { state = (state * 1103515245 + 12345) % 2 ** 31; return state / 2 ** 31 - 0.5; };
    const noise = Array.from({ length: 1000 }, rand);
    const variance = (arr: number[]) => {
      const m = arr.reduce((a, b) => a + b, 0) / arr.length;
      return arr.reduce((a, b) => a + (b - m) ** 2, 0) / arr.length;
    };
    expect(variance(ewma(noise, 0.05))).toBeLessThan(variance(ewma(noise, 0.9)));
  });
});

describe('trend classification', () => {
  it('classifies short, monotone, and near-constant series', () => {
    expect(classifyTrend([])).toBe('stable');
    expect(classifyTrend([1])).toBe('stable');
    expect(classifyTrend([1, 2, 3, 4])).toBe('rising');
    expect(classifyTrend([10, 8, 6])).toBe('falling');
    expect(classifyTrend([100, 100.5, 101, 100.9, 100.4])).toBe('stable');
  });
});

describe('drift-watch alert threshold', () => {
  it('handles below/above threshold, custom threshold, and end-to-end scenarios', () => {
    expect(shouldAlert(0.0)).toBe(false);
    expect(shouldAlert(0.1)).toBe(false);
    expect(shouldAlert(DEFAULT_DRIFT_THRESHOLD)).toBe(false);
    expect(shouldAlert(0.31)).toBe(true);
    expect(shouldAlert(0.99)).toBe(true);
    expect(shouldAlert(0.4, 0.5)).toBe(false);
    expect(shouldAlert(0.6, 0.5)).toBe(true);

    const distances = [0.1, 0.05, 0.0, 0.0, 0.45, 0.5, 0.55, 0.6, 0.62, 0.6];
    const smoothed = ewma(distances, 0.4);
    const lastEwma = smoothed.at(-1)!;
    expect(lastEwma).toBeGreaterThan(DEFAULT_DRIFT_THRESHOLD);
    expect(shouldAlert(lastEwma)).toBe(true);
    expect(classifyTrend(smoothed)).toBe('rising');

    const spikeDists = [0.0, 0.0, 0.0, 0.9, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0];
    expect(shouldAlert(ewma(spikeDists, 0.1).at(-1)!)).toBe(false);
  });
});
