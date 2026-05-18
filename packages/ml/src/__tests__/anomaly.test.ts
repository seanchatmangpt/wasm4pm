import { describe, it, expect } from 'vitest';
import { detectEnhancedAnomalies } from '../anomaly.js';

// ─── Basic structural invariants ─────────────────────────────────────────────

describe('detectEnhancedAnomalies — structural shape', () => {
  it('result always has originalLength equal to input length', async () => {
    const distances = [0.1, 0.12, 0.11, 0.13, 0.1, 0.85, 0.11, 0.12, 0.1, 0.11];
    const result = await detectEnhancedAnomalies(distances);
    expect(result.originalLength).toBe(distances.length);
  });

  it('smoothedSeries length equals originalLength', async () => {
    const distances = [0.1, 0.2, 0.5, 0.1, 0.1, 0.1, 0.2];
    const result = await detectEnhancedAnomalies(distances);
    expect(result.smoothedSeries.length).toBe(result.originalLength);
  });

  it('peakValues length equals peakIndices length', async () => {
    const distances = [0.1, 0.2, 0.9, 0.2, 0.1, 0.8, 0.2, 0.1];
    const result = await detectEnhancedAnomalies(distances);
    expect(result.peakValues.length).toBe(result.peakIndices.length);
  });

  it('peakValues correspond to values at peakIndices in the original series', async () => {
    const distances = [0.1, 0.12, 0.11, 0.13, 0.1, 0.85, 0.11, 0.12, 0.1, 0.11];
    const result = await detectEnhancedAnomalies(distances);
    for (let i = 0; i < result.peakIndices.length; i++) {
      expect(result.peakValues[i]).toBeCloseTo(distances[result.peakIndices[i]], 10);
    }
  });

  it('all smoothedSeries values are finite numbers', async () => {
    const distances = [0.1, 0.5, 0.2, 0.8, 0.1, 0.1, 0.3];
    const result = await detectEnhancedAnomalies(distances);
    for (const v of result.smoothedSeries) {
      expect(Number.isFinite(v)).toBe(true);
      expect(Number.isNaN(v)).toBe(false);
    }
  });

  it('all peakIndices are valid indices into the original series', async () => {
    const distances = [0.1, 0.12, 0.11, 0.13, 0.1, 0.85, 0.11, 0.12, 0.1, 0.11];
    const result = await detectEnhancedAnomalies(distances);
    for (const idx of result.peakIndices) {
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(distances.length);
    }
  });
});

// ─── Edge cases ───────────────────────────────────────────────────────────────

describe('detectEnhancedAnomalies — edge cases', () => {
  it('handles empty series', async () => {
    const result = await detectEnhancedAnomalies([]);
    expect(result.peakIndices).toEqual([]);
    expect(result.smoothedSeries).toEqual([]);
    expect(result.originalLength).toBe(0);
  });

  it('handles single-element series without crash', async () => {
    const result = await detectEnhancedAnomalies([0.5]);
    expect(result.peakIndices).toEqual([]);
    expect(result.smoothedSeries).toEqual([0.5]);
    expect(result.originalLength).toBe(1);
  });

  it('handles two-element series without crash', async () => {
    const result = await detectEnhancedAnomalies([0.1, 0.9]);
    expect(result.peakIndices).toEqual([]);
    expect(result.originalLength).toBe(2);
  });

  it('series of exactly 3 elements (boundary for peak detection)', async () => {
    const result = await detectEnhancedAnomalies([0.1, 0.9, 0.1]);
    // Middle element is a peak
    expect(result.peakIndices).toContain(1);
    expect(result.originalLength).toBe(3);
  });

  it('flat series produces no peaks', async () => {
    const result = await detectEnhancedAnomalies([0.1, 0.1, 0.1, 0.1, 0.1, 0.1]);
    expect(result.peakIndices).toHaveLength(0);
  });

  it('strictly increasing series produces no interior peaks', async () => {
    const result = await detectEnhancedAnomalies([1, 2, 3, 4, 5, 6, 7]);
    expect(result.peakIndices).toHaveLength(0);
  });

  it('strictly decreasing series produces no interior peaks', async () => {
    const result = await detectEnhancedAnomalies([7, 6, 5, 4, 3, 2, 1]);
    expect(result.peakIndices).toHaveLength(0);
  });
});

// ─── Peak detection correctness ───────────────────────────────────────────────

describe('detectEnhancedAnomalies — peak detection', () => {
  it('detects peaks in series with single spike', async () => {
    const distances = [0.1, 0.12, 0.11, 0.13, 0.1, 0.85, 0.11, 0.12, 0.1, 0.11];
    const result = await detectEnhancedAnomalies(distances);
    expect(result.peakIndices).toContain(5);
  });

  it('detects no peaks in flat series', async () => {
    const result = await detectEnhancedAnomalies([0.1, 0.1, 0.1, 0.1, 0.1, 0.1]);
    expect(result.peakIndices).toHaveLength(0);
  });

  it('detects peaks in multi-spike series', async () => {
    const distances = [0.1, 0.11, 0.12, 0.8, 0.11, 0.1, 0.1, 0.12, 0.13, 0.9, 0.11, 0.1];
    const result = await detectEnhancedAnomalies(distances);
    expect(result.peakIndices.length).toBeGreaterThanOrEqual(1);
  });

  it('known outlier (far from cluster) detected as peak', async () => {
    // Values near 0 with a single large outlier in the middle
    const distances = [0.05, 0.06, 0.05, 0.07, 10.0, 0.05, 0.06, 0.05];
    const result = await detectEnhancedAnomalies(distances);
    expect(result.peakIndices).toContain(4);
  });

  it('high-Z outlier (10 std devs away) is flagged as peak', async () => {
    // Normal values ~0.1 with a 10-sigma outlier at position 5
    const normal = Array.from({ length: 10 }, () => 0.1);
    normal[5] = 100.0; // ~1000 std devs above mean
    const result = await detectEnhancedAnomalies(normal);
    expect(result.peakIndices).toContain(5);
  });

  it('peakValues at peak positions are local maxima', async () => {
    const distances = [0.1, 0.12, 0.11, 0.13, 0.1, 0.85, 0.11, 0.12, 0.1, 0.11];
    const result = await detectEnhancedAnomalies(distances);
    for (const idx of result.peakIndices) {
      // A peak must be greater than both neighbors
      if (idx > 0 && idx < distances.length - 1) {
        expect(distances[idx]).toBeGreaterThan(distances[idx - 1]);
        expect(distances[idx]).toBeGreaterThan(distances[idx + 1]);
      }
    }
  });
});

// ─── Smoothing options ────────────────────────────────────────────────────────

describe('detectEnhancedAnomalies — smoothing options', () => {
  it('EMA smoothing: smoothedSeries has correct length', async () => {
    const series = [0.1, 0.1, 0.1, 0.9, 0.1, 0.1, 0.1, 0.1];
    const result = await detectEnhancedAnomalies(series, {
      smoothingMethod: 'ema',
      smoothingWindow: 3,
    });
    expect(result.smoothedSeries).toHaveLength(series.length);
  });

  it('EMA smoothing: peak at spike location is preserved', async () => {
    const series = [0.1, 0.1, 0.1, 0.9, 0.1, 0.1, 0.1, 0.1];
    const result = await detectEnhancedAnomalies(series, {
      smoothingMethod: 'ema',
      smoothingWindow: 3,
    });
    expect(result.peakIndices).toContain(3);
  });

  it('SMA smoothing (default): smoothedSeries has correct length', async () => {
    const series = [0.1, 0.2, 0.9, 0.2, 0.1, 0.1, 0.1, 0.1];
    const result = await detectEnhancedAnomalies(series, { smoothingMethod: 'sma' });
    expect(result.smoothedSeries).toHaveLength(series.length);
  });

  it('smoothingWindow=1 leaves each value as itself (SMA window=1)', async () => {
    const series = [1, 5, 1, 1, 1, 1];
    const result = await detectEnhancedAnomalies(series, {
      smoothingMethod: 'sma',
      smoothingWindow: 1,
    });
    // With window=1, SMA is identity
    for (let i = 0; i < series.length; i++) {
      expect(result.smoothedSeries[i]).toBeCloseTo(series[i], 5);
    }
  });

  it('large smoothingWindow (clamp to series length) does not crash', async () => {
    const series = [0.1, 0.5, 0.9, 0.3, 0.1, 0.2];
    const result = await detectEnhancedAnomalies(series, { smoothingWindow: 1000 });
    expect(result.smoothedSeries).toHaveLength(series.length);
  });
});

// ─── Metamorphic: adding a clear outlier increases its score ─────────────────

describe('detectEnhancedAnomalies — metamorphic', () => {
  it('adding a clear outlier to normal data → outlier becomes a detected peak', async () => {
    const normal = [0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1];
    const withOutlier = [...normal];
    withOutlier[4] = 50.0; // extreme outlier

    const resultNormal = await detectEnhancedAnomalies(normal);
    const resultWithOutlier = await detectEnhancedAnomalies(withOutlier);

    // The normal series should have no peaks; the outlier series should have at least one
    expect(resultNormal.peakIndices.length).toBe(0);
    expect(resultWithOutlier.peakIndices).toContain(4);
  });

  it('smoothedSeries values are between min and max of input (SMA property)', async () => {
    const series = [0.1, 0.5, 0.3, 0.8, 0.2, 0.4, 0.1];
    const min = Math.min(...series);
    const max = Math.max(...series);
    const result = await detectEnhancedAnomalies(series, { smoothingMethod: 'sma' });
    for (const v of result.smoothedSeries) {
      // SMA smoothed values must be within [min, max] of the original
      expect(v).toBeGreaterThanOrEqual(min - 1e-10);
      expect(v).toBeLessThanOrEqual(max + 1e-10);
    }
  });
});

// ─── Decomposition structure ──────────────────────────────────────────────────

describe('detectEnhancedAnomalies — decomposition', () => {
  it('decomposed is present for series >= 4 elements', async () => {
    const series = [0.1, 0.2, 0.9, 0.2, 0.1, 0.8, 0.2, 0.1];
    const result = await detectEnhancedAnomalies(series);
    expect(result.decomposed).toBeDefined();
  });

  it('decomposed is absent for series < 4 elements', async () => {
    const result = await detectEnhancedAnomalies([0.1, 0.5, 0.1]);
    // 3 elements: smoothed has length 3, then decompose only runs for smoothed.length >= 4
    expect(result.decomposed).toBeUndefined();
  });

  it('decomposed trend/seasonal/residual arrays each have the same length as the series', async () => {
    const series = [0.1, 0.2, 0.9, 0.2, 0.1, 0.8, 0.2, 0.1];
    const result = await detectEnhancedAnomalies(series);
    if (result.decomposed) {
      expect(result.decomposed.trend.length).toBe(series.length);
      expect(result.decomposed.seasonal.length).toBe(series.length);
      expect(result.decomposed.residual.length).toBe(series.length);
    }
  });
});

// ─── Rank 1 oracle: Mathematical theorems ─────────────────────────────────────
//
// Properties derivable from the algorithm definition — they hold for any
// correct implementation regardless of implementation detail.

describe('detectEnhancedAnomalies — Rank 1 oracle (mathematical theorems)', () => {
  it('zero-variance flat series: smoothedSeries values all equal the constant (SMA)', async () => {
    // Theorem: SMA of a constant series is the constant itself.
    const k = 0.42;
    const flat = Array.from({ length: 8 }, () => k);
    const result = await detectEnhancedAnomalies(flat, { smoothingMethod: 'sma' });
    for (const v of result.smoothedSeries) {
      expect(v).toBeCloseTo(k, 10);
    }
  });

  it('zero-variance flat series: smoothedSeries values all equal the constant (EMA)', async () => {
    // Theorem: EMA(alpha, series) where every element = k → output is k at every step.
    const k = 0.77;
    const flat = Array.from({ length: 8 }, () => k);
    const result = await detectEnhancedAnomalies(flat, { smoothingMethod: 'ema' });
    for (const v of result.smoothedSeries) {
      expect(v).toBeCloseTo(k, 5);
    }
  });

  it('zero-variance flat series: no NaN in any output field', async () => {
    // Guard: division by zero in autocorrelation/normalization must not produce NaN.
    const flat = Array.from({ length: 10 }, () => 1.0);
    const result = await detectEnhancedAnomalies(flat);
    for (const v of result.smoothedSeries) {
      expect(Number.isNaN(v)).toBe(false);
    }
    if (result.decomposed) {
      for (const v of result.decomposed.trend) expect(Number.isNaN(v)).toBe(false);
      for (const v of result.decomposed.seasonal) expect(Number.isNaN(v)).toBe(false);
      for (const v of result.decomposed.residual) expect(Number.isNaN(v)).toBe(false);
    }
  });

  it('EMA alpha=limit (window=1): each output equals the input value', async () => {
    // Theorem: EMA with alpha=1 (window=1) reduces to the identity.
    // alpha = 2/(1+1) = 1 → out[i] = 1*series[i] + 0*out[i-1] = series[i].
    const series = [0.1, 0.5, 0.9, 0.2, 0.3, 0.8, 0.1, 0.4];
    const result = await detectEnhancedAnomalies(series, {
      smoothingMethod: 'ema',
      smoothingWindow: 1,
    });
    for (let i = 0; i < series.length; i++) {
      expect(result.smoothedSeries[i]).toBeCloseTo(series[i], 5);
    }
  });

  it('peak at index i satisfies series[i] > series[i-1] AND series[i] > series[i+1]', async () => {
    // Theorem: peak definition — strictly greater than both neighbours.
    const series = [0.1, 0.3, 0.9, 0.3, 0.1, 0.5, 0.9, 0.5, 0.1];
    const result = await detectEnhancedAnomalies(series);
    for (const idx of result.peakIndices) {
      // Guard: only interior positions satisfy the peak invariant (implementation
      // already excludes first/last element from peak search).
      expect(idx).toBeGreaterThan(0);
      expect(idx).toBeLessThan(series.length - 1);
      expect(series[idx]).toBeGreaterThan(series[idx - 1]);
      expect(series[idx]).toBeGreaterThan(series[idx + 1]);
    }
  });

  it('series of all zeros has no peaks and produces no NaN', async () => {
    const zeros = Array.from({ length: 10 }, () => 0);
    const result = await detectEnhancedAnomalies(zeros);
    expect(result.peakIndices).toHaveLength(0);
    for (const v of result.smoothedSeries) {
      expect(Number.isNaN(v)).toBe(false);
      expect(v).toBeCloseTo(0, 10);
    }
  });

  it('residualPeaks indices are valid indices into smoothedSeries', async () => {
    // Theorem: residualPeaks are produced from the smoothed series, so every
    // index must be within bounds.
    const series = [0.1, 0.2, 0.9, 0.1, 0.2, 0.8, 0.1, 0.2, 0.3, 0.1];
    const result = await detectEnhancedAnomalies(series);
    if (result.residualPeaks) {
      for (const idx of result.residualPeaks) {
        expect(idx).toBeGreaterThanOrEqual(0);
        expect(idx).toBeLessThan(result.smoothedSeries.length);
      }
    }
  });
});

// ─── Rank 2 oracle: Domain contracts ─────────────────────────────────────────
//
// Properties decided by design — the API contract for this module.

describe('detectEnhancedAnomalies — Rank 2 oracle (domain contracts)', () => {
  it('result always returns an object with peakIndices, peakValues, smoothedSeries, originalLength', async () => {
    const result = await detectEnhancedAnomalies([0.1, 0.5, 0.3, 0.8]);
    expect(result).toHaveProperty('peakIndices');
    expect(result).toHaveProperty('peakValues');
    expect(result).toHaveProperty('smoothedSeries');
    expect(result).toHaveProperty('originalLength');
  });

  it('peakValues[i] is the original series value at peakIndices[i] (not the smoothed value)', async () => {
    // Domain contract: peaks are reported from the *original* series (preserves spike magnitude).
    const series = [0.1, 0.12, 0.11, 0.13, 0.1, 0.85, 0.11, 0.12, 0.1, 0.11];
    const result = await detectEnhancedAnomalies(series, {
      smoothingMethod: 'sma',
      smoothingWindow: 5,
    });
    for (let i = 0; i < result.peakIndices.length; i++) {
      expect(result.peakValues[i]).toBeCloseTo(series[result.peakIndices[i]], 10);
    }
  });

  it('no NaN or Infinity in peakValues', async () => {
    const series = [0.1, 0.5, 0.2, 0.9, 0.1, 0.3, 0.7, 0.1];
    const result = await detectEnhancedAnomalies(series);
    for (const v of result.peakValues) {
      expect(Number.isFinite(v)).toBe(true);
    }
  });

  it('smoothingWindow=0 (invalid) does not crash — clamps to 1', async () => {
    // Domain contract: invalid window is clamped, not rejected.
    const series = [0.1, 0.5, 0.1, 0.5, 0.1, 0.5, 0.1];
    const result = await detectEnhancedAnomalies(series, { smoothingWindow: 0 });
    expect(result.smoothedSeries).toHaveLength(series.length);
    expect(result.originalLength).toBe(series.length);
  });

  it('negative smoothingWindow (invalid) does not crash — clamps to 1', async () => {
    const series = [0.2, 0.8, 0.2, 0.8, 0.2, 0.8, 0.2];
    const result = await detectEnhancedAnomalies(series, { smoothingWindow: -5 });
    expect(result.smoothedSeries).toHaveLength(series.length);
  });
});

// ─── Rank 3 oracle: Metamorphic relations ────────────────────────────────────
//
// Input perturbation → predictable output relation. No absolute thresholds.

describe('detectEnhancedAnomalies — Rank 3 oracle (metamorphic relations)', () => {
  it('two identical series produce identical peakIndices (determinism)', async () => {
    const series = [0.1, 0.12, 0.9, 0.11, 0.1, 0.85, 0.12, 0.1, 0.11];
    const r1 = await detectEnhancedAnomalies(series);
    const r2 = await detectEnhancedAnomalies(series);
    expect(r1.peakIndices).toEqual(r2.peakIndices);
    expect(r1.peakValues).toEqual(r2.peakValues);
    expect(r1.smoothedSeries).toEqual(r2.smoothedSeries);
  });

  it('inserting an extreme spike makes it a detected peak', async () => {
    // Metamorphic: before-spike series has no peak at position 4;
    // after inserting extreme value at position 4 it must appear as a peak.
    const before = [0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1];
    const after = [...before];
    after[4] = 999.0;

    const resultBefore = await detectEnhancedAnomalies(before);
    const resultAfter = await detectEnhancedAnomalies(after);

    expect(resultBefore.peakIndices).not.toContain(4);
    expect(resultAfter.peakIndices).toContain(4);
  });

  it('scaling all values by a positive constant does not change peak positions', async () => {
    // Metamorphic: peak detection is order-preserving; multiplying by k > 0
    // cannot change which index is a local maximum.
    const series = [0.1, 0.12, 0.9, 0.11, 0.1, 0.7, 0.11, 0.1];
    const scaled = series.map((v) => v * 100);

    const rBase = await detectEnhancedAnomalies(series, { smoothingMethod: 'sma' });
    const rScaled = await detectEnhancedAnomalies(scaled, { smoothingMethod: 'sma' });

    expect(rBase.peakIndices).toEqual(rScaled.peakIndices);
  });

  it('removing a spike reduces peakValues max', async () => {
    // Metamorphic: series with extreme outlier has higher max(peakValues)
    // than series without it.
    const withSpike = [0.1, 0.1, 5.0, 0.1, 0.1, 0.1, 0.5, 0.1, 0.1];
    const noSpike = [0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.5, 0.1, 0.1];

    const rWith = await detectEnhancedAnomalies(withSpike);
    const rNo = await detectEnhancedAnomalies(noSpike);

    const maxWith = Math.max(...(rWith.peakValues.length > 0 ? rWith.peakValues : [0]));
    const maxNo = Math.max(...(rNo.peakValues.length > 0 ? rNo.peakValues : [0]));

    expect(maxWith).toBeGreaterThan(maxNo);
  });
});
