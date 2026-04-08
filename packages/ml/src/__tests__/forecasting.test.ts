import { describe, it, expect } from 'vitest';
import { forecastThroughput, buildThroughputSeries } from '../forecasting.js';

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
