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
