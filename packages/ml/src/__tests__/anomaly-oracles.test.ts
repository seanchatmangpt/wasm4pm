/**
 * Oracle-ranked tests for detectEnhancedAnomalies
 *
 * Van der Aalst process mining — anomaly detection supports the deviation
 * perspective. Unusual drift distances indicate process change (concept drift),
 * outlier traces, or rework. The smoother the background, the sharper the signal.
 *
 * Oracle ranks follow the Chicago TDD hierarchy:
 *   Rank 1 — Mathematical theorem (provable from SMA/EMA/peak-finding definitions)
 *   Rank 2 — Domain contract  (design decisions enforced by the API)
 *   Rank 3 — Metamorphic relation (input perturbation → predictable output shift)
 *
 * API under test: detectEnhancedAnomalies(driftDistances, options)
 *                 → Promise<EnhancedAnomalyResult>
 *
 * EnhancedAnomalyResult shape:
 *   { peakIndices, peakValues, smoothedSeries, originalLength,
 *     decomposed?: { trend, seasonal, residual }, residualPeaks? }
 *
 * Key facts about the implementation:
 *   - Inputs < 3 elements: early-return (no smoothing, no peaks)
 *   - SMA: centered window; EMA: alpha = 2/(window+1)
 *   - Peaks are detected in the *original* series (not the smoothed one)
 *   - A peak at index i satisfies series[i] > series[i-1] AND series[i] > series[i+1]
 *   - smoothingWindow is clamped to [1, n]; values ≤ 0 clamp to 1
 *   - Decomposition runs only when smoothed.length ≥ 4
 */

import { describe, it, expect } from 'vitest';
import { detectEnhancedAnomalies } from '../anomaly.js';

// ─── Shared fixture builders ──────────────────────────────────────────────────

/** Flat series of length n — no anomalies, zero variance */
function flat(n: number, value = 0.1) {
  return Array.from({ length: n }, () => value);
}

/** Series with a single spike at position spikeIdx */
function withSpike(n: number, spikeIdx: number, spikeValue = 99.0) {
  const s = flat(n, 0.1);
  s[spikeIdx] = spikeValue;
  return s;
}

/** Smoothly increasing series 1, 2, 3, ..., n */
function increasing(n: number) {
  return Array.from({ length: n }, (_, i) => i + 1);
}

// =============================================================================
// RANK 1 — Mathematical Theorems
// Properties provable from the SMA, EMA, and peak-finding algorithm definitions.
// =============================================================================

describe('detectEnhancedAnomalies — Rank 1 (mathematical theorems)', () => {
  it('originalLength equals input array length', async () => {
    // Theorem: originalLength is set to driftDistances.length before any processing.
    for (const n of [0, 1, 2, 5, 10, 100]) {
      const result = await detectEnhancedAnomalies(flat(n));
      expect(result.originalLength).toBe(n);
    }
  });

  it('smoothedSeries length equals originalLength', async () => {
    // Theorem: both SMA and EMA are length-preserving transforms.
    // The output is always the same length as the input.
    for (const n of [3, 5, 8, 20]) {
      const result = await detectEnhancedAnomalies(flat(n));
      expect(result.smoothedSeries.length).toBe(result.originalLength);
    }
  });

  it('peakValues length equals peakIndices length (parallel arrays)', async () => {
    // Theorem: peakValues[i] = series[peakIndices[i]]; they are constructed in
    // lockstep so their lengths are identical.
    const series = [0.1, 0.5, 0.1, 0.9, 0.1, 0.3, 0.8, 0.2, 0.1];
    const result = await detectEnhancedAnomalies(series);
    expect(result.peakValues.length).toBe(result.peakIndices.length);
  });

  it('every peakIndex is a valid index into the original series', async () => {
    // Theorem: peak detection iterates i from 1 to n-2, so 0 and n-1 are never peaks.
    // All returned indices are in [1, n-2].
    const series = [0.1, 0.9, 0.1, 0.8, 0.1, 0.7, 0.1];
    const result = await detectEnhancedAnomalies(series);
    for (const idx of result.peakIndices) {
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(series.length);
    }
  });

  it('every peakValue equals the original series value at the corresponding index', async () => {
    // Theorem: peakValues are read from the original series, not the smoothed series.
    const series = [0.1, 0.12, 0.11, 0.13, 0.1, 0.85, 0.11, 0.12, 0.1, 0.11];
    const result = await detectEnhancedAnomalies(series);
    for (let i = 0; i < result.peakIndices.length; i++) {
      expect(result.peakValues[i]).toBeCloseTo(series[result.peakIndices[i]], 10);
    }
  });

  it('peak at index i satisfies series[i] > series[i-1] and series[i] > series[i+1]', async () => {
    // Theorem: the strict local-maximum invariant from the findPeaks implementation.
    const series = [0.1, 0.3, 0.9, 0.3, 0.1, 0.5, 0.9, 0.5, 0.1];
    const result = await detectEnhancedAnomalies(series);
    for (const idx of result.peakIndices) {
      expect(idx).toBeGreaterThan(0);
      expect(idx).toBeLessThan(series.length - 1);
      expect(series[idx]).toBeGreaterThan(series[idx - 1]);
      expect(series[idx]).toBeGreaterThan(series[idx + 1]);
    }
  });

  it('SMA of a constant series returns the constant at every position', async () => {
    // Theorem: SMA(k) of a series where every element = c returns c at every position.
    // Proof: every window average of [c, c, ..., c] is c.
    const c = 0.42;
    const result = await detectEnhancedAnomalies(flat(8, c), { smoothingMethod: 'sma' });
    for (const v of result.smoothedSeries) {
      expect(v).toBeCloseTo(c, 10);
    }
  });

  it('EMA of a constant series returns the constant at every position', async () => {
    // Theorem: EMA(alpha, [c, c, ..., c]) = c at every step.
    // Proof: out[0] = c; out[i] = alpha*c + (1-alpha)*c = c.
    const c = 0.77;
    const result = await detectEnhancedAnomalies(flat(8, c), { smoothingMethod: 'ema' });
    for (const v of result.smoothedSeries) {
      expect(v).toBeCloseTo(c, 5);
    }
  });

  it('EMA with smoothingWindow=1 is identity (alpha = 1)', async () => {
    // Theorem: alpha = 2/(1+1) = 1 → out[i] = 1*series[i] + 0*out[i-1] = series[i].
    const series = [0.1, 0.5, 0.9, 0.2, 0.3, 0.8, 0.1, 0.4];
    const result = await detectEnhancedAnomalies(series, {
      smoothingMethod: 'ema',
      smoothingWindow: 1,
    });
    for (let i = 0; i < series.length; i++) {
      expect(result.smoothedSeries[i]).toBeCloseTo(series[i], 5);
    }
  });

  it('SMA with smoothingWindow=1 is identity', async () => {
    // Theorem: SMA with window=1 is a 1-point average = identity.
    const series = [1, 5, 1, 1, 1, 1];
    const result = await detectEnhancedAnomalies(series, {
      smoothingMethod: 'sma',
      smoothingWindow: 1,
    });
    for (let i = 0; i < series.length; i++) {
      expect(result.smoothedSeries[i]).toBeCloseTo(series[i], 5);
    }
  });

  it('flat series has no peaks (no local maxima in constant signal)', async () => {
    // Theorem: for any i in [1, n-2], series[i] == series[i-1] fails the strict
    // > condition, so no peaks are ever reported.
    const result = await detectEnhancedAnomalies(flat(10));
    expect(result.peakIndices).toHaveLength(0);
  });

  it('strictly increasing series has no interior peaks', async () => {
    // Theorem: series[i] < series[i+1] for all i → no element is greater than
    // its right neighbour → no peaks.
    const result = await detectEnhancedAnomalies(increasing(8));
    expect(result.peakIndices).toHaveLength(0);
  });

  it('series < 3 elements: peakIndices is empty (boundary guard)', async () => {
    // Theorem: findPeaks requires n >= 3 to find any interior point. The early-
    // return path for length < 3 returns empty peakIndices unconditionally.
    for (const n of [0, 1, 2]) {
      const result = await detectEnhancedAnomalies(flat(n));
      expect(result.peakIndices).toHaveLength(0);
    }
  });

  it('smoothedSeries values are finite (no NaN or Infinity) for any finite input', async () => {
    // Theorem: SMA/EMA are finite arithmetic operations over finite inputs.
    // Division-by-zero guards in the implementation ensure no NaN propagation.
    const inputs = [
      flat(5, 0),        // all-zero
      flat(5, 1e-300),   // near-underflow
      flat(5, 1e300),    // near-overflow (still finite)
      increasing(8),
      withSpike(8, 4, 1e10),
    ];
    for (const series of inputs) {
      const result = await detectEnhancedAnomalies(series);
      for (const v of result.smoothedSeries) {
        expect(Number.isFinite(v) || v === 0).toBe(true);
        expect(Number.isNaN(v)).toBe(false);
      }
    }
  });

  it('all-zeros series: no NaN in any output field', async () => {
    // Theorem: the seasonality denominator guard (if den === 0) prevents NaN
    // propagation when the series has zero variance.
    const zeros = flat(10, 0);
    const result = await detectEnhancedAnomalies(zeros);
    for (const v of result.smoothedSeries) {
      expect(Number.isNaN(v)).toBe(false);
    }
    if (result.decomposed) {
      for (const v of [...result.decomposed.trend, ...result.decomposed.seasonal, ...result.decomposed.residual]) {
        expect(Number.isNaN(v)).toBe(false);
      }
    }
  });

  it('decomposed arrays each have the same length as the original series', async () => {
    // Theorem: decomposed trend/seasonal/residual are computed from the smoothed
    // series (same length as input), so all three arrays have length n.
    const series = [0.1, 0.2, 0.9, 0.2, 0.1, 0.8, 0.2, 0.1];
    const result = await detectEnhancedAnomalies(series);
    if (result.decomposed) {
      expect(result.decomposed.trend.length).toBe(series.length);
      expect(result.decomposed.seasonal.length).toBe(series.length);
      expect(result.decomposed.residual.length).toBe(series.length);
    }
  });

  it('residualPeaks indices are within bounds of smoothedSeries', async () => {
    // Theorem: residualPeaks are produced by findPeaks on the decomposed residual,
    // which has the same length as smoothedSeries.
    const series = [0.1, 0.2, 0.9, 0.1, 0.2, 0.8, 0.1, 0.2, 0.3, 0.1];
    const result = await detectEnhancedAnomalies(series);
    if (result.residualPeaks) {
      for (const idx of result.residualPeaks) {
        expect(idx).toBeGreaterThanOrEqual(0);
        expect(idx).toBeLessThan(result.smoothedSeries.length);
      }
    }
  });

  it('SMA smoothed values are bounded by [min, max] of original series', async () => {
    // Theorem: SMA is a convex combination of the original values. Any weighted
    // average of values in [a, b] lies in [a, b].
    const series = [0.1, 0.5, 0.3, 0.8, 0.2, 0.4, 0.1];
    const min = Math.min(...series);
    const max = Math.max(...series);
    const result = await detectEnhancedAnomalies(series, { smoothingMethod: 'sma' });
    for (const v of result.smoothedSeries) {
      expect(v).toBeGreaterThanOrEqual(min - 1e-10);
      expect(v).toBeLessThanOrEqual(max + 1e-10);
    }
  });
});

// =============================================================================
// RANK 2 — Domain Contracts
// Design-decided properties that every caller of detectEnhancedAnomalies relies on.
// =============================================================================

describe('detectEnhancedAnomalies — Rank 2 (domain contracts)', () => {
  it('result always has required fields: peakIndices, peakValues, smoothedSeries, originalLength', async () => {
    // Contract: EnhancedAnomalyResult shape is stable across all inputs including empty.
    for (const n of [0, 1, 2, 5, 10]) {
      const result = await detectEnhancedAnomalies(flat(n));
      expect(result).toHaveProperty('peakIndices');
      expect(result).toHaveProperty('peakValues');
      expect(result).toHaveProperty('smoothedSeries');
      expect(result).toHaveProperty('originalLength');
      expect(Array.isArray(result.peakIndices)).toBe(true);
      expect(Array.isArray(result.peakValues)).toBe(true);
      expect(Array.isArray(result.smoothedSeries)).toBe(true);
      expect(typeof result.originalLength).toBe('number');
    }
  });

  it('peakValues has no NaN or Infinity (all values are finite)', async () => {
    // Contract: peakValues are read directly from the input which is validated
    // by the caller. The contract is that NaN/Infinity must not leak into results.
    const series = [0.1, 0.5, 0.2, 0.9, 0.1, 0.3, 0.7, 0.1];
    const result = await detectEnhancedAnomalies(series);
    for (const v of result.peakValues) {
      expect(Number.isFinite(v)).toBe(true);
    }
  });

  it('smoothingWindow=0 clamps to 1 and does not crash', async () => {
    // Contract: invalid parameters are clamped, not rejected.
    const series = flat(7, 0.1);
    series[3] = 0.9;
    const result = await detectEnhancedAnomalies(series, { smoothingWindow: 0 });
    expect(result.smoothedSeries).toHaveLength(series.length);
    expect(result.originalLength).toBe(series.length);
  });

  it('negative smoothingWindow clamps to 1 and does not crash', async () => {
    // Contract: negative window is treated as invalid → clamped to 1.
    const result = await detectEnhancedAnomalies(flat(7, 0.2), { smoothingWindow: -10 });
    expect(result.smoothedSeries).toHaveLength(7);
  });

  it('smoothingWindow larger than series length clamps to series length and does not crash', async () => {
    // Contract: window is clamped to n, not allowed to exceed it.
    const series = [0.1, 0.5, 0.9, 0.3, 0.1, 0.2];
    const result = await detectEnhancedAnomalies(series, { smoothingWindow: 1000 });
    expect(result.smoothedSeries).toHaveLength(series.length);
    expect(result.originalLength).toBe(series.length);
  });

  it('decomposed is present when smoothed series has >= 4 elements', async () => {
    // Contract: decomposition only runs for series long enough to partition into
    // trend + seasonal + residual (requires at least 4 observations).
    const series = [0.1, 0.2, 0.9, 0.2, 0.1, 0.8, 0.2, 0.1];
    const result = await detectEnhancedAnomalies(series);
    expect(result.decomposed).toBeDefined();
  });

  it('decomposed is absent for series of exactly 3 elements', async () => {
    // Contract: 3 elements smooth to 3, but decompose requires smoothed.length >= 4.
    const result = await detectEnhancedAnomalies([0.1, 0.9, 0.1]);
    expect(result.decomposed).toBeUndefined();
  });

  it('smoothingMethod "sma" is accepted and produces a result', async () => {
    // Contract: both smoothing methods are valid algorithm choices.
    const series = flat(5, 0.3);
    series[2] = 0.9;
    const result = await detectEnhancedAnomalies(series, { smoothingMethod: 'sma' });
    expect(result.smoothedSeries).toHaveLength(5);
  });

  it('smoothingMethod "ema" is accepted and produces a result', async () => {
    // Contract: EMA is a first-class smoothing option, not a fallback.
    const series = flat(5, 0.3);
    series[2] = 0.9;
    const result = await detectEnhancedAnomalies(series, { smoothingMethod: 'ema' });
    expect(result.smoothedSeries).toHaveLength(5);
  });

  it('known spike at position 5 is reported as a peak', async () => {
    // Contract: a value that is strictly greater than both neighbours must appear
    // in peakIndices. This is the core utility contract for anomaly detection.
    const series = [0.1, 0.12, 0.11, 0.13, 0.1, 0.85, 0.11, 0.12, 0.1, 0.11];
    const result = await detectEnhancedAnomalies(series);
    expect(result.peakIndices).toContain(5);
  });

  it('high-sigma spike (1000x mean) is always reported as a peak', async () => {
    // Contract: the peak detector must surface extreme anomalies regardless of
    // smoothing window. A 1000x outlier is always a process deviation signal.
    const normal = flat(10, 0.1);
    normal[5] = 100.0; // ~1000x the baseline
    const result = await detectEnhancedAnomalies(normal, { smoothingWindow: 3 });
    expect(result.peakIndices).toContain(5);
  });

  it('peakValues are from the original series, not the smoothed series', async () => {
    // Contract: spike magnitude must be preserved in peakValues (not attenuated
    // by smoothing). This is critical for process mining — the practitioner needs
    // the unsmoothed deviation magnitude.
    const series = [0.1, 0.12, 0.11, 0.13, 0.1, 0.85, 0.11, 0.12, 0.1, 0.11];
    const result = await detectEnhancedAnomalies(series, {
      smoothingMethod: 'sma',
      smoothingWindow: 5,
    });
    for (let i = 0; i < result.peakIndices.length; i++) {
      const idx = result.peakIndices[i];
      expect(result.peakValues[i]).toBeCloseTo(series[idx], 10);
    }
  });
});

// =============================================================================
// RANK 3 — Metamorphic Relations
// Input perturbation → predictable output direction. No absolute thresholds.
// =============================================================================

describe('detectEnhancedAnomalies — Rank 3 (metamorphic relations)', () => {
  it('determinism: two calls with identical input produce identical output', async () => {
    // Metamorphic: the algorithm is purely functional (no random state).
    const series = [0.1, 0.12, 0.9, 0.11, 0.1, 0.85, 0.12, 0.1, 0.11];
    const r1 = await detectEnhancedAnomalies(series);
    const r2 = await detectEnhancedAnomalies(series);
    expect(r1.peakIndices).toEqual(r2.peakIndices);
    expect(r1.peakValues).toEqual(r2.peakValues);
    expect(r1.smoothedSeries).toEqual(r2.smoothedSeries);
    expect(r1.originalLength).toBe(r2.originalLength);
  });

  it('inserting a clear spike causes it to appear as a detected peak', async () => {
    // Metamorphic: before = flat; after = flat with one spike.
    // The spike position must appear in peakIndices after but not before.
    const before = flat(9, 0.1);
    const after = [...before];
    after[4] = 999.0;

    const rBefore = await detectEnhancedAnomalies(before);
    const rAfter = await detectEnhancedAnomalies(after);

    expect(rBefore.peakIndices).not.toContain(4);
    expect(rAfter.peakIndices).toContain(4);
  });

  it('scaling all values by a positive constant preserves peak positions', async () => {
    // Metamorphic: peak detection is order-preserving under positive scaling.
    // Multiplying by k > 0 cannot change which index is a local maximum.
    const series = [0.1, 0.12, 0.9, 0.11, 0.1, 0.7, 0.11, 0.1];
    const scaled = series.map((v) => v * 100);

    const rBase = await detectEnhancedAnomalies(series, { smoothingMethod: 'sma' });
    const rScaled = await detectEnhancedAnomalies(scaled, { smoothingMethod: 'sma' });

    expect(rBase.peakIndices).toEqual(rScaled.peakIndices);
  });

  it('removing a spike reduces the maximum peak value', async () => {
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

  it('larger smoothing window produces fewer or equal peaks (smoother signal)', async () => {
    // Metamorphic: wider smoothing attenuates spikes in the smoothed series. Since
    // peaks are detected in the *original* series, peak count is unchanged — but
    // residualPeaks (from the decomposed residual of smoothed) should decrease
    // with heavier smoothing. We verify peak count does not increase.
    //
    // Note: peaks are detected in the original (unsmoothed) series, so
    // peakIndices is unaffected by smoothingWindow. What changes is
    // residualPeaks and decomposed. We assert that increasing the window
    // does not introduce spurious peak detections in peakIndices.
    const series = [0.1, 0.5, 0.1, 0.9, 0.1, 0.3, 0.8, 0.2, 0.1, 0.4, 0.1];

    const rNarrow = await detectEnhancedAnomalies(series, { smoothingWindow: 1 });
    const rWide = await detectEnhancedAnomalies(series, { smoothingWindow: 7 });

    // Peak detection in original series is independent of smoothing window
    // Both must report the same peaks (same original series, same peak detection)
    expect(rNarrow.peakIndices).toEqual(rWide.peakIndices);
  });

  it('more unusual sequence → higher maximum peak value than common sequence', async () => {
    // Metamorphic: a series with a larger anomaly has a higher max peakValue.
    // Common sequence: gentle bumps. Unusual: one extreme deviation.
    const common = [0.1, 0.15, 0.1, 0.2, 0.1, 0.15, 0.1, 0.12, 0.1];
    const unusual = [0.1, 0.15, 0.1, 50.0, 0.1, 0.15, 0.1, 0.12, 0.1];

    const rCommon = await detectEnhancedAnomalies(common);
    const rUnusual = await detectEnhancedAnomalies(unusual);

    const maxCommon = Math.max(...(rCommon.peakValues.length > 0 ? rCommon.peakValues : [0]));
    const maxUnusual = Math.max(...(rUnusual.peakValues.length > 0 ? rUnusual.peakValues : [0]));

    expect(maxUnusual).toBeGreaterThan(maxCommon);
    // The extreme spike must appear in results
    expect(rUnusual.peakIndices).toContain(3);
  });

  it('adding a duplicate of the first element at position 0 shifts all indices by 1', async () => {
    // Metamorphic: prepending a value identical to series[0] inserts one element
    // at the front. Since the original series[0] is not an interior point, prepending
    // the same value creates a flat region at the start — does not introduce a new peak.
    // All existing peaks shift by +1.
    const base = [0.1, 0.12, 0.9, 0.11, 0.1, 0.85, 0.12, 0.1];
    const prepended = [base[0], ...base];

    const rBase = await detectEnhancedAnomalies(base);
    const rPrepended = await detectEnhancedAnomalies(prepended);

    // Every peak index in the prepended result should be exactly 1 more than in base
    const basePeaks = rBase.peakIndices;
    const prependedPeaks = rPrepended.peakIndices;

    for (const baseIdx of basePeaks) {
      expect(prependedPeaks).toContain(baseIdx + 1);
    }
  });
});
