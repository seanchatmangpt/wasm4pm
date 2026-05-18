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
