/**
 * Throughput forecasting — trend analysis, seasonal decomposition,
 * and event rate prediction using micro-ml.
 */

import {
  trendForecast,
  detectSeasonality,
  seasonalDecompose,
  exponentialRegression,
} from 'micro-ml';
import type { ThroughputForecastResult } from './types.js';

/**
 * Build event count time series from timestamps.
 *
 * Groups events into fixed-width time windows.
 */
export function buildThroughputSeries(
  eventTimestamps: number[],
  windowSizeMs: number,
): { series: number[]; windowStarts: number[] } {
  if (eventTimestamps.length === 0) {
    return { series: [], windowStarts: [] };
  }

  const sorted = [...eventTimestamps].sort((a, b) => a - b);
  const start = sorted[0];
  const end = sorted[sorted.length - 1];
  const windowCount = Math.ceil((end - start) / windowSizeMs) + 1;

  const windowStarts: number[] = [];
  const series: number[] = new Array(windowCount).fill(0);

  for (let w = 0; w < windowCount; w++) {
    windowStarts.push(start + w * windowSizeMs);
  }

  for (const ts of sorted) {
    const idx = Math.min(
      Math.floor((ts - start) / windowSizeMs),
      windowCount - 1,
    );
    series[idx]++;
  }

  return { series, windowStarts };
}

/**
 * Forecast future process throughput and detect seasonal patterns.
 *
 * @param eventTimestamps - Array of event timestamps in ms since epoch
 * @param options - Forecasting configuration
 */
export async function forecastThroughput(
  eventTimestamps: number[],
  options: {
    windowSizeMs?: number;
    forecastPeriods?: number;
    useExponential?: boolean;
  } = {},
): Promise<ThroughputForecastResult> {
  const windowSizeMs = options.windowSizeMs ?? 3_600_000; // 1 hour default
  const { series } = buildThroughputSeries(eventTimestamps, windowSizeMs);

  if (series.length < 3) {
    return {
      eventCounts: series,
      windowCount: series.length,
      trend: { direction: 'unknown', slope: 0, strength: 0 },
      windowSizeMs,
    };
  }

  const forecastPeriods = options.forecastPeriods ?? 5;
  const trendModel = await trendForecast(series, forecastPeriods);

  // Seasonality detection (non-fatal if it fails)
  let seasonality: { period: number; strength: number } | undefined;
  let decomposition:
    | { trend: number[]; seasonal: number[]; residual: number[] }
    | undefined;

  try {
    if (series.length >= 4) {
      const seasonResult = await detectSeasonality(series);
      seasonality = {
        period: seasonResult.period,
        strength: seasonResult.strength,
      };

      if (
        seasonResult.period > 1 &&
        seasonResult.period < series.length
      ) {
        const decomp = await seasonalDecompose(
          series,
          seasonResult.period,
        );
        decomposition = {
          trend: decomp.getTrend(),
          seasonal: decomp.getSeasonal(),
          residual: decomp.getResidual(),
        };
      }
    }
  } catch {
    // Seasonality detection can fail on short series — non-fatal
  }

  // Exponential growth modeling (non-fatal, augments linear forecast)
  let exponentialForecast: number[] | undefined;
  if (options.useExponential && series.length >= 3) {
    try {
      const x = series.map((_, i) => i);
      const expModel = await exponentialRegression(x, series);
      if (expModel.rSquared > 0.5) {
        exponentialForecast = expModel.predict(
          Array.from(
            { length: forecastPeriods },
            (_, i) => series.length + i,
          ),
        );
      }
    } catch {
      // Non-fatal
    }
  }

  return {
    eventCounts: series,
    windowCount: series.length,
    trend: {
      direction: trendModel.direction,
      slope: trendModel.slope,
      strength: trendModel.strength,
    },
    forecast: trendModel.getForecast(),
    seasonality,
    decomposition,
    windowSizeMs,
    exponentialForecast,
  };
}
