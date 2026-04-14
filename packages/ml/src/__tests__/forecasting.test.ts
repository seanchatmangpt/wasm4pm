import { describe, it, expect } from 'vitest';
import { forecastThroughput, buildThroughputSeries, forecastSeries } from '../forecasting.js';

describe('buildThroughputSeries', () => {
  it('builds series from timestamps', () => {
    const timestamps = [
      1000, 1500, 2000,   // window 0: 3 events
      5000,               // window 1: 1 event
      8000, 8500, 9000,   // window 2: 3 events
    ];
    const { series, windowStarts } = buildThroughputSeries(timestamps, 3000);
    expect(series.slice(0, 3)).toEqual([3, 1, 3]);
    expect(windowStarts[0]).toBe(1000);
    expect(windowStarts[1]).toBe(4000);
    expect(windowStarts[2]).toBe(7000);
  });

  it('handles empty timestamps', () => {
    const { series, windowStarts } = buildThroughputSeries([], 1000);
    expect(series).toEqual([]);
    expect(windowStarts).toEqual([]);
  });

  it('handles single timestamp', () => {
    const { series } = buildThroughputSeries([5000], 1000);
    expect(series).toEqual([1]);
  });
});

describe('forecastThroughput', () => {
  it('forecasts with upward trend', async () => {
    // Generate an upward-trending series
    const timestamps: number[] = [];
    const base = 1_700_000_000_000; // ms
    let count = 1;
    for (let w = 0; w < 10; w++) {
      for (let e = 0; e < count; e++) {
        timestamps.push(base + w * 3600_000 + e * 60_000);
      }
      count++;
    }

    const result = await forecastThroughput(timestamps, {
      windowSizeMs: 3600_000,
      forecastPeriods: 3,
    });

    expect(result.eventCounts.length).toBeGreaterThanOrEqual(10);
    expect(result.trend.direction).toBe('up');
    expect(result.forecast).toHaveLength(3);
    expect(result.windowSizeMs).toBe(3600_000);
  });

  it('returns minimal result for short series', async () => {
    const result = await forecastThroughput([1000, 2000], { windowSizeMs: 1000 });
    expect(result.trend.direction).toBe('unknown');
    expect(result.forecast).toBeUndefined();
  });

  it('returns empty result for no timestamps', async () => {
    const result = await forecastThroughput([]);
    expect(result.eventCounts).toEqual([]);
  });
});

describe('forecastSeries', () => {
  it('forecasts with linear trend', async () => {
    const series = [10, 12, 14, 16, 18, 20, 22, 24, 26, 28];
    const result = await forecastSeries(series, { forecastPeriods: 3 });
    expect(result.seriesLength).toBe(10);
    expect(result.trend.direction).toBe('up');
    expect(result.trend.slope).toBeGreaterThan(0);
    expect(result.forecast).toBeDefined();
    expect(result.forecast).toHaveLength(3);
  });

  it('forecasts with exponential growth', async () => {
    const series = [1, 2, 4, 8, 16, 32, 64, 128];
    const result = await forecastSeries(series, { forecastPeriods: 3, useExponential: true });
    expect(result.seriesLength).toBe(8);
    expect(result.trend.direction).toBe('up');
    // Exponential forecast should be produced for exponential data
    expect(result.exponentialForecast).toBeDefined();
    expect(result.exponentialForecast).toHaveLength(3);
    // Values should increase
    expect(result.exponentialForecast![2]).toBeGreaterThan(result.exponentialForecast![0]);
  });

  it('detects seasonality in periodic series', async () => {
    // Sinusoidal pattern with period ~4
    const series = [10, 20, 10, 20, 10, 20, 10, 20, 10, 20, 10, 20];
    const result = await forecastSeries(series, { forecastPeriods: 4 });
    expect(result.seriesLength).toBe(12);
    expect(result.seasonality).toBeDefined();
    expect(result.seasonality!.period).toBeGreaterThan(1);
    expect(result.seasonality!.strength).toBeGreaterThan(0);
  });

  it('detects seasonality at correct period for sine wave', async () => {
    // Sine wave with clear period 8
    const series = Array.from({ length: 24 }, (_, i) =>
      Math.round(50 + 30 * Math.sin(2 * Math.PI * i / 8))
    );
    const result = await forecastSeries(series, { forecastPeriods: 4 });
    expect(result.seriesLength).toBe(24);
    expect(result.seasonality).toBeDefined();
    // Period should be 8 (or a divisor like 4), not 1 or 2
    expect(result.seasonality!.period).toBeGreaterThanOrEqual(4);
    expect(result.seasonality!.strength).toBeGreaterThan(0);
  });

  it('returns unknown trend for short series', async () => {
    const result = await forecastSeries([1, 2]);
    expect(result.trend.direction).toBe('unknown');
  });

  it('handles empty series', async () => {
    const result = await forecastSeries([]);
    expect(result.seriesLength).toBe(0);
    expect(result.trend.direction).toBe('unknown');
  });
});

// ---------------------------------------------------------------------------
// Edge Cases
// ---------------------------------------------------------------------------

describe('forecastSeries edge cases', () => {
  it('handles no seasonality case (pure linear trend)', async () => {
    // Strictly increasing series with no periodicity
    const series = Array.from({ length: 20 }, (_, i) => 10 + i * 2);
    const result = await forecastSeries(series, { forecastPeriods: 5 });
    expect(result.seriesLength).toBe(20);
    expect(result.trend.direction).toBe('up');
    // Seasonality may or may not be detected for a pure trend
  });

  it('handles constant series (zero trend)', async () => {
    const series = Array.from({ length: 20 }, () => 42);
    const result = await forecastSeries(series, { forecastPeriods: 5 });
    expect(result.trend.direction).toBe('flat');
    expect(result.trend.slope).toBeCloseTo(0, 5);
  });

  it('handles decreasing series', async () => {
    const series = Array.from({ length: 20 }, (_, i) => 100 - i * 3);
    const result = await forecastSeries(series, { forecastPeriods: 5 });
    expect(result.trend.direction).toBe('down');
    expect(result.trend.slope).toBeLessThan(0);
  });

  it('handles exponential growth pattern', async () => {
    const series = Array.from({ length: 20 }, (_, i) =>
      Math.round(10 * Math.pow(1.15, i))
    );
    const result = await forecastSeries(series, { forecastPeriods: 5 });
    expect(result.seriesLength).toBe(20);
    expect(result.trend.direction).toBe('up');
    expect(result.trend.slope).toBeGreaterThan(0);
    // Exponential growth produces strong linear fit (R² via slope magnitude)
    expect(result.trend.strength).toBeGreaterThan(0.05);
  });

  it('handles very short series (2 points)', async () => {
    const series = [5, 10];
    const result = await forecastSeries(series, { forecastPeriods: 3 });
    expect(result.seriesLength).toBe(2);
    // Series < 3 points returns unknown trend
    expect(result.trend.direction).toBe('unknown');
  });

  it('handles single point series', async () => {
    const result = await forecastSeries([42], { forecastPeriods: 3 });
    expect(result.seriesLength).toBe(1);
    expect(result.trend.direction).toBe('unknown');
  });

  it('detects strong vs weak seasonality', async () => {
    // Strong seasonality: clear sine wave with amplitude 30 on mean 50
    const strongSeasonal = Array.from({ length: 32 }, (_, i) =>
      Math.round(50 + 30 * Math.sin(2 * Math.PI * i / 8))
    );
    const strongResult = await forecastSeries(strongSeasonal, { forecastPeriods: 4 });

    // Weak seasonality: noise-dominated (small amplitude on large mean)
    const weakSeasonal = Array.from({ length: 32 }, (_, i) =>
      Math.round(1000 + 5 * Math.sin(2 * Math.PI * i / 8) + (Math.random() - 0.5) * 200)
    );
    const weakResult = await forecastSeries(weakSeasonal, { forecastPeriods: 4 });

    // Strong seasonal data should have detected seasonality
    expect(strongResult.seasonality).toBeDefined();
    expect(strongResult.seasonality!.period).toBeGreaterThanOrEqual(4);
    expect(strongResult.seasonality!.strength).toBeGreaterThan(0);

    // Weak seasonal data should have lower or no detected seasonality strength
    // compared to the strong seasonal signal
    if (weakResult.seasonality) {
      expect(weakResult.seasonality.strength).toBeLessThanOrEqual(strongResult.seasonality!.strength);
    }
  });
});
