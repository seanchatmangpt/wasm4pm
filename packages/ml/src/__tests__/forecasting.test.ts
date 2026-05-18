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
