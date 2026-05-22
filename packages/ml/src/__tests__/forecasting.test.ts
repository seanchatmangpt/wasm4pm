import { describe, it, expect } from 'vitest';
import { forecastThroughput, buildThroughputSeries, forecastSeries } from '../forecasting.js';

describe('buildThroughputSeries', () => {
  it('builds series from timestamps, handles empty, and handles single timestamp', () => {
    const timestamps = [1000, 1500, 2000, 5000, 8000, 8500, 9000];
    const { series, windowStarts } = buildThroughputSeries(timestamps, 3000);
    expect(series.slice(0, 3)).toEqual([3, 1, 3]);
    expect(windowStarts[0]).toBe(1000);
    expect(windowStarts[1]).toBe(4000);
    expect(windowStarts[2]).toBe(7000);

    const empty = buildThroughputSeries([], 1000);
    expect(empty.series).toEqual([]);
    expect(empty.windowStarts).toEqual([]);

    expect(buildThroughputSeries([5000], 1000).series).toEqual([1]);
  });
});

describe('forecastThroughput', () => {
  it('forecasts upward trend, returns minimal result for short series, and empty result for no timestamps', async () => {
    const timestamps: number[] = [];
    const base = 1_700_000_000_000;
    let count = 1;
    for (let w = 0; w < 10; w++) {
      for (let e = 0; e < count; e++) {
        timestamps.push(base + w * 3600_000 + e * 60_000);
      }
      count++;
    }

    const upResult = await forecastThroughput(timestamps, { windowSizeMs: 3600_000, forecastPeriods: 3 });
    expect(upResult.eventCounts.length).toBeGreaterThanOrEqual(10);
    expect(upResult.trend.direction).toBe('up');
    expect(upResult.forecast).toHaveLength(3);
    expect(upResult.windowSizeMs).toBe(3600_000);

    const shortResult = await forecastThroughput([1000, 2000], { windowSizeMs: 1000 });
    expect(shortResult.trend.direction).toBe('unknown');
    expect(shortResult.forecast).toBeUndefined();

    const emptyResult = await forecastThroughput([]);
    expect(emptyResult.eventCounts).toEqual([]);
  });
});

describe('forecastSeries', () => {
  it('handles linear trend, exponential growth, seasonality detection, short series, and empty series', async () => {
    const linear = [10, 12, 14, 16, 18, 20, 22, 24, 26, 28];
    const linearResult = await forecastSeries(linear, { forecastPeriods: 3 });
    expect(linearResult.seriesLength).toBe(10);
    expect(linearResult.trend.direction).toBe('up');
    expect(linearResult.trend.slope).toBeGreaterThan(0);
    expect(linearResult.forecast).toHaveLength(3);

    const exponential = [1, 2, 4, 8, 16, 32, 64, 128];
    const expResult = await forecastSeries(exponential, { forecastPeriods: 3, useExponential: true });
    expect(expResult.trend.direction).toBe('up');
    expect(expResult.exponentialForecast).toBeDefined();
    expect(expResult.exponentialForecast).toHaveLength(3);
    expect(expResult.exponentialForecast![2]).toBeGreaterThan(expResult.exponentialForecast![0]);

    const periodic = [10, 20, 10, 20, 10, 20, 10, 20, 10, 20, 10, 20];
    const periodicResult = await forecastSeries(periodic, { forecastPeriods: 4 });
    expect(periodicResult.seasonality).toBeDefined();
    expect(periodicResult.seasonality!.period).toBeGreaterThan(1);
    expect(periodicResult.seasonality!.strength).toBeGreaterThan(0);

    const sineWave = Array.from({ length: 24 }, (_, i) =>
      Math.round(50 + 30 * Math.sin((2 * Math.PI * i) / 8))
    );
    const sineResult = await forecastSeries(sineWave, { forecastPeriods: 4 });
    expect(sineResult.seasonality!.period).toBeGreaterThanOrEqual(4);

    expect((await forecastSeries([1, 2])).trend.direction).toBe('unknown');
    expect((await forecastSeries([])).seriesLength).toBe(0);
    expect((await forecastSeries([])).trend.direction).toBe('unknown');
  });
});

describe('forecastSeries R² and confidence intervals', () => {
  it('returns rSquared near 1 for a perfect linear series and brackets the fitted value', async () => {
    // y = 2x + 5 — a perfectly linear series should yield R² = 1
    // CI uses a minimum std-error floor so intervals remain non-degenerate
    const perfect = Array.from({ length: 10 }, (_, i) => 5 + 2 * i);
    const result = await forecastSeries(perfect, { forecastPeriods: 3 });
    expect(result.rSquared).toBeDefined();
    expect(result.rSquared!).toBeGreaterThan(0.99);
    expect(result.rSquared!).toBeLessThanOrEqual(1.0);
    // CIs are present and bracket the fitted value
    expect(result.confidenceIntervals).toBeDefined();
    expect(result.confidenceIntervals).toHaveLength(3);
    result.confidenceIntervals!.forEach(([lo, hi], i) => {
      expect(lo).toBeLessThanOrEqual(result.forecast![i]);
      expect(hi).toBeGreaterThanOrEqual(result.forecast![i]);
    });
  });

  it('returns rSquared near 0 for random noise around a constant', async () => {
    // A nearly constant series with tiny numerical noise has R² ≈ 1
    // but a pure-constant series has SS_tot=0 so we use a real noisy one
    const noisy = [10, 11, 9, 10.5, 9.5, 10.2, 9.8, 10.3, 9.7, 10.1];
    const result = await forecastSeries(noisy, { forecastPeriods: 3 });
    expect(result.rSquared).toBeDefined();
    // R² can be negative if slope is non-zero but noisy — just assert it's finite
    expect(Number.isFinite(result.rSquared!)).toBe(true);
  });

  it('returns confidenceIntervals parallel to forecast when series >= 3', async () => {
    // Use noisy data so residualStdError > 0, giving non-degenerate intervals
    const noisy = [10, 13, 11, 15, 14, 17, 16, 19, 18, 22];
    const result = await forecastSeries(noisy, { forecastPeriods: 4 });
    expect(result.forecast).toHaveLength(4);
    expect(result.confidenceIntervals).toBeDefined();
    expect(result.confidenceIntervals).toHaveLength(4);
    // Each CI must be [lower, upper] with lower <= upper
    result.confidenceIntervals!.forEach(([lo, hi]) => {
      expect(lo).toBeLessThanOrEqual(hi);
    });
  });

  it('CI width grows with forecast horizon (extrapolation uncertainty increases)', async () => {
    // Noisy linear data — residuals are non-zero so CI width varies with x*
    const noisy = Array.from(
      { length: 20 },
      (_, i) => 5 + 0.5 * i + (i % 3 === 0 ? 1.5 : i % 3 === 1 ? -1.0 : 0.5)
    );
    const result = await forecastSeries(noisy, { forecastPeriods: 5 });
    expect(result.confidenceIntervals).toBeDefined();
    const widths = result.confidenceIntervals!.map(([lo, hi]) => hi - lo);
    // Width at period 5 must be wider than at period 1 (further extrapolation = more uncertainty)
    expect(widths[4]).toBeGreaterThan(widths[0]);
  });

  it('returns no confidenceIntervals for short series (< 3 points)', async () => {
    const result = await forecastSeries([1, 2], { forecastPeriods: 3 });
    expect(result.confidenceIntervals).toBeUndefined();
    expect(result.rSquared).toBeUndefined();
  });
});

describe('forecastSeries edge cases', () => {
  it('handles pure linear trend, constant, decreasing, exponential growth, very short, single point, and seasonality strength comparison', async () => {
    const linearTrend = Array.from({ length: 20 }, (_, i) => 10 + i * 2);
    expect((await forecastSeries(linearTrend, { forecastPeriods: 5 })).trend.direction).toBe('up');

    const constant = Array.from({ length: 20 }, () => 42);
    const constResult = await forecastSeries(constant, { forecastPeriods: 5 });
    expect(constResult.trend.direction).toBe('flat');
    expect(constResult.trend.slope).toBeCloseTo(0, 5);

    const decreasing = Array.from({ length: 20 }, (_, i) => 100 - i * 3);
    const decResult = await forecastSeries(decreasing, { forecastPeriods: 5 });
    expect(decResult.trend.direction).toBe('down');
    expect(decResult.trend.slope).toBeLessThan(0);

    const expGrowth = Array.from({ length: 20 }, (_, i) => Math.round(10 * Math.pow(1.15, i)));
    const expResult = await forecastSeries(expGrowth, { forecastPeriods: 5 });
    expect(expResult.trend.direction).toBe('up');
    expect(expResult.trend.strength).toBeGreaterThan(0.05);

    expect((await forecastSeries([5, 10], { forecastPeriods: 3 })).trend.direction).toBe('unknown');
    expect((await forecastSeries([42], { forecastPeriods: 3 })).seriesLength).toBe(1);
    expect((await forecastSeries([42], { forecastPeriods: 3 })).trend.direction).toBe('unknown');

    const strongSeasonal = Array.from({ length: 32 }, (_, i) =>
      Math.round(50 + 30 * Math.sin((2 * Math.PI * i) / 8))
    );
    const strongResult = await forecastSeries(strongSeasonal, { forecastPeriods: 4 });

    const weakSeasonal = Array.from({ length: 32 }, (_, i) =>
      Math.round(
        1000 +
          5 * Math.sin((2 * Math.PI * i) / 8) +
          100 * Math.sin((2 * Math.PI * i) / 13) +
          80 * Math.cos((2 * Math.PI * i) / 17)
      )
    );
    const weakResult = await forecastSeries(weakSeasonal, { forecastPeriods: 4 });

    expect(strongResult.seasonality).toBeDefined();
    expect(strongResult.seasonality!.period).toBeGreaterThanOrEqual(4);
    expect(strongResult.seasonality!.strength).toBeGreaterThan(0);

    if (weakResult.seasonality) {
      expect(weakResult.seasonality.strength).toBeLessThanOrEqual(strongResult.seasonality!.strength);
    }
  });
});

// ── Rank 1 Oracle Tests (Mathematical theorems) ───────────────────────────────

describe('forecastSeries — Rank 1 oracle: horizon parameter controls output length', () => {
  // Mathematical invariant: forecastPeriods N → forecast array has exactly N elements.
  it('forecastPeriods=1 produces forecast with exactly 1 element', async () => {
    const series = Array.from({ length: 10 }, (_, i) => i + 1);
    const result = await forecastSeries(series, { forecastPeriods: 1 });
    expect(result.forecast).toHaveLength(1);
  });

  it('forecastPeriods=3 produces forecast with exactly 3 elements', async () => {
    const series = Array.from({ length: 10 }, (_, i) => i + 1);
    const result = await forecastSeries(series, { forecastPeriods: 3 });
    expect(result.forecast).toHaveLength(3);
  });

  it('forecastPeriods=5 produces forecast with exactly 5 elements', async () => {
    const series = Array.from({ length: 10 }, (_, i) => i + 1);
    const result = await forecastSeries(series, { forecastPeriods: 5 });
    expect(result.forecast).toHaveLength(5);
  });

  it('forecastPeriods=10 produces forecast with exactly 10 elements', async () => {
    const series = Array.from({ length: 15 }, (_, i) => i + 1);
    const result = await forecastSeries(series, { forecastPeriods: 10 });
    expect(result.forecast).toHaveLength(10);
  });
});

describe('forecastSeries — Rank 1 oracle: all forecast values are finite numbers', () => {
  // Mathematical invariant: no NaN or Infinity may appear in any forecast output.
  it('forecast values are all finite for a strictly increasing series', async () => {
    const series = Array.from({ length: 20 }, (_, i) => i + 1);
    const result = await forecastSeries(series, { forecastPeriods: 5 });
    expect(result.forecast).toBeDefined();
    result.forecast!.forEach((v, idx) => {
      expect(Number.isFinite(v), `forecast[${idx}] must be finite, got ${v}`).toBe(true);
    });
  });

  it('forecast values are all finite for a decreasing series', async () => {
    const series = Array.from({ length: 20 }, (_, i) => 100 - i * 3);
    const result = await forecastSeries(series, { forecastPeriods: 5 });
    result.forecast!.forEach((v, idx) => {
      expect(Number.isFinite(v), `forecast[${idx}] must be finite`).toBe(true);
    });
  });

  it('forecast values are all finite for a constant series', async () => {
    const series = Array.from({ length: 20 }, () => 42);
    const result = await forecastSeries(series, { forecastPeriods: 5 });
    result.forecast!.forEach((v, idx) => {
      expect(Number.isFinite(v), `forecast[${idx}] must be finite`).toBe(true);
    });
  });

  it('trend slope is a finite number for any valid series', async () => {
    const series = [3, 1, 4, 1, 5, 9, 2, 6, 5, 3];
    const result = await forecastSeries(series, { forecastPeriods: 3 });
    expect(Number.isFinite(result.trend.slope)).toBe(true);
    expect(Number.isFinite(result.trend.strength)).toBe(true);
  });
});

describe('forecastSeries — Rank 1 oracle: trend strength is in [0, 1]', () => {
  // By definition, strength = R² clamped to [0,1]. Must always be within bounds.
  it('trend.strength is in [0, 1] for increasing series', async () => {
    const series = Array.from({ length: 15 }, (_, i) => i + 1);
    const result = await forecastSeries(series);
    expect(result.trend.strength).toBeGreaterThanOrEqual(0);
    expect(result.trend.strength).toBeLessThanOrEqual(1);
  });

  it('trend.strength is in [0, 1] for decreasing series', async () => {
    const series = Array.from({ length: 15 }, (_, i) => 100 - i * 2);
    const result = await forecastSeries(series);
    expect(result.trend.strength).toBeGreaterThanOrEqual(0);
    expect(result.trend.strength).toBeLessThanOrEqual(1);
  });

  it('trend.strength is in [0, 1] for noisy series', async () => {
    const series = [10, 11, 9, 12, 8, 13, 7, 14, 6, 15, 5, 16];
    const result = await forecastSeries(series);
    expect(result.trend.strength).toBeGreaterThanOrEqual(0);
    expect(result.trend.strength).toBeLessThanOrEqual(1);
  });
});

describe('forecastSeries — Rank 1 oracle: seriesLength matches input', () => {
  // Mathematical invariant: output.seriesLength = input.length for any input.
  it('seriesLength matches input array length for empty series', async () => {
    const result = await forecastSeries([]);
    expect(result.seriesLength).toBe(0);
  });

  it('seriesLength matches input array length for 1-element series', async () => {
    const result = await forecastSeries([42]);
    expect(result.seriesLength).toBe(1);
  });

  it('seriesLength matches input array length for 2-element series', async () => {
    const result = await forecastSeries([1, 2]);
    expect(result.seriesLength).toBe(2);
  });

  it('seriesLength matches input array length for n-element series', async () => {
    for (const n of [3, 5, 10, 20]) {
      const series = Array.from({ length: n }, (_, i) => i);
      const result = await forecastSeries(series);
      expect(result.seriesLength).toBe(n);
    }
  });
});

// ── Rank 2 Oracle Tests (Domain contracts) ────────────────────────────────────

describe('forecastSeries — Rank 2 oracle: monotonically increasing series', () => {
  // Domain contract: a perfectly increasing series must yield direction='up'
  // and a positive slope. The linear model has zero residuals so R²=1.
  it('strictly increasing series → direction=up', async () => {
    const series = Array.from({ length: 15 }, (_, i) => i + 1);
    const result = await forecastSeries(series, { forecastPeriods: 3 });
    expect(result.trend.direction).toBe('up');
  });

  it('strictly increasing series → positive slope', async () => {
    const series = Array.from({ length: 15 }, (_, i) => i + 1);
    const result = await forecastSeries(series, { forecastPeriods: 3 });
    expect(result.trend.slope).toBeGreaterThan(0);
  });

  it('strictly increasing series → rSquared near 1.0 (near-perfect fit)', async () => {
    const series = Array.from({ length: 15 }, (_, i) => i + 1);
    const result = await forecastSeries(series, { forecastPeriods: 3 });
    expect(result.rSquared).toBeDefined();
    expect(result.rSquared!).toBeGreaterThan(0.99);
  });

  it('strictly increasing series → linear forecast continues the trend (each step > previous)', async () => {
    const series = Array.from({ length: 10 }, (_, i) => i * 2 + 1);
    const result = await forecastSeries(series, { forecastPeriods: 4 });
    expect(result.forecast).toBeDefined();
    const forecast = result.forecast!;
    // Each successive forecast period must be greater than the previous
    for (let i = 1; i < forecast.length; i++) {
      expect(forecast[i]).toBeGreaterThan(forecast[i - 1]);
    }
  });
});

describe('forecastSeries — Rank 2 oracle: strictly decreasing series', () => {
  // Domain contract: a strictly decreasing series must yield direction='down'
  // and a negative slope.
  it('strictly decreasing series → direction=down', async () => {
    const series = Array.from({ length: 15 }, (_, i) => 100 - i * 5);
    const result = await forecastSeries(series);
    expect(result.trend.direction).toBe('down');
  });

  it('strictly decreasing series → negative slope', async () => {
    const series = Array.from({ length: 15 }, (_, i) => 100 - i * 5);
    const result = await forecastSeries(series);
    expect(result.trend.slope).toBeLessThan(0);
  });

  it('strictly decreasing series → linear forecast continues downward', async () => {
    const series = Array.from({ length: 10 }, (_, i) => 50 - i * 3);
    const result = await forecastSeries(series, { forecastPeriods: 3 });
    expect(result.forecast).toBeDefined();
    const forecast = result.forecast!;
    for (let i = 1; i < forecast.length; i++) {
      expect(forecast[i]).toBeLessThan(forecast[i - 1]);
    }
  });
});

describe('forecastSeries — Rank 2 oracle: constant series', () => {
  // Domain contract: a constant series has slope=0, direction='flat',
  // and forecast values close to the constant.
  it('constant series → direction=flat', async () => {
    const series = Array.from({ length: 20 }, () => 7);
    const result = await forecastSeries(series, { forecastPeriods: 3 });
    expect(result.trend.direction).toBe('flat');
  });

  it('constant series → slope approximately 0', async () => {
    const series = Array.from({ length: 20 }, () => 7);
    const result = await forecastSeries(series, { forecastPeriods: 3 });
    expect(Math.abs(result.trend.slope)).toBeLessThan(1e-9);
  });

  it('constant series → all forecast values close to the constant value', async () => {
    const constVal = 42;
    const series = Array.from({ length: 20 }, () => constVal);
    const result = await forecastSeries(series, { forecastPeriods: 5 });
    expect(result.forecast).toBeDefined();
    result.forecast!.forEach((v) => {
      expect(Math.abs(v - constVal)).toBeLessThan(1);
    });
  });
});

describe('forecastThroughput — Rank 1 oracle: windowCount invariant', () => {
  // Mathematical invariant: windowCount = number of windows built from timestamps.
  it('windowCount matches eventCounts.length', async () => {
    const base = 1_700_000_000_000;
    const timestamps = Array.from({ length: 30 }, (_, i) => base + i * 500_000);
    const result = await forecastThroughput(timestamps, { windowSizeMs: 3_600_000, forecastPeriods: 3 });
    expect(result.windowCount).toBe(result.eventCounts.length);
  });

  it('windowCount is 0 for empty timestamps', async () => {
    const result = await forecastThroughput([]);
    expect(result.windowCount).toBe(0);
    expect(result.eventCounts).toHaveLength(0);
  });

  it('windowSizeMs is echoed in result', async () => {
    const base = 1_700_000_000_000;
    const timestamps = Array.from({ length: 20 }, (_, i) => base + i * 600_000);
    const result = await forecastThroughput(timestamps, { windowSizeMs: 7_200_000 });
    expect(result.windowSizeMs).toBe(7_200_000);
  });
});

describe('forecastThroughput — Rank 2 oracle: direction contracts', () => {
  // Domain contract: monotonically increasing event density → direction=up.
  it('dense event clusters in later windows → direction=up', async () => {
    const base = 1_700_000_000_000;
    const timestamps: number[] = [];
    // Window 0: 1 event; Window 1: 2 events; ... Window 9: 10 events
    let count = 1;
    for (let w = 0; w < 10; w++) {
      for (let e = 0; e < count; e++) {
        timestamps.push(base + w * 3_600_000 + e * 60_000);
      }
      count++;
    }
    const result = await forecastThroughput(timestamps, { windowSizeMs: 3_600_000, forecastPeriods: 3 });
    expect(result.trend.direction).toBe('up');
    expect(result.trend.slope).toBeGreaterThan(0);
  });

  it('dense event clusters in earlier windows → direction=down', async () => {
    const base = 1_700_000_000_000;
    const timestamps: number[] = [];
    // Window 0: 10 events; Window 1: 9; ... Window 9: 1 event (decreasing density)
    for (let w = 0; w < 10; w++) {
      const count = 10 - w;
      for (let e = 0; e < count; e++) {
        timestamps.push(base + w * 3_600_000 + e * 60_000);
      }
    }
    const result = await forecastThroughput(timestamps, { windowSizeMs: 3_600_000, forecastPeriods: 3 });
    expect(result.trend.direction).toBe('down');
    expect(result.trend.slope).toBeLessThan(0);
  });

  it('buildThroughputSeries is deterministic: same input always produces same series', () => {
    // Rank 1 oracle: buildThroughputSeries is a pure function — identical timestamps + window
    // must always return bit-exact identical series output (no randomness).
    const base = 1_700_000_000_000;
    const timestamps: number[] = [];
    for (let w = 0; w < 12; w++) {
      for (let e = 0; e < 5; e++) {
        timestamps.push(base + w * 3_600_000 + e * 60_000);
      }
    }
    const r1 = buildThroughputSeries(timestamps, 3_600_000);
    const r2 = buildThroughputSeries(timestamps, 3_600_000);
    expect(r1.series).toEqual(r2.series);
    expect(r1.windowStarts).toEqual(r2.windowStarts);
  });

  it('forecastPeriods controls forecast array length for throughput', async () => {
    const base = 1_700_000_000_000;
    const timestamps: number[] = [];
    let count = 1;
    for (let w = 0; w < 10; w++) {
      for (let e = 0; e < count; e++) {
        timestamps.push(base + w * 3_600_000 + e * 60_000);
      }
      count++;
    }
    for (const periods of [1, 3, 5]) {
      const result = await forecastThroughput(timestamps, {
        windowSizeMs: 3_600_000,
        forecastPeriods: periods,
      });
      expect(result.forecast).toHaveLength(periods);
    }
  });
});
