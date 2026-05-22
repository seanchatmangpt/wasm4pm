/**
 * Example — Time-series forecasting with @wasm4pm/ml
 *
 * Demonstrates:
 *   1. Building a throughput time series
 *   2. Forecasting with multiple methods (linear, polynomial, exponential)
 *   3. Comparing forecast accuracy
 *
 * Run:
 *   tsx examples/ml-forecast.ts ./sample.xes
 *
 * Docs:
 *   docs/ml-algorithms.md
 *   docs/tutorials/ml-selection.md
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { getRegistry } from 'wasm4pm';
import {
  buildThroughputSeries,
  forecastSeries,
  type ThroughputForecastResult,
  type SeriesForecastResult,
} from '@wasm4pm/ml';

async function main(logPath: string): Promise<void> {
  const xes = readFileSync(resolve(logPath), 'utf8');
  const registry = getRegistry();

  // 1. Load the log
  const handle = await registry.run('load_eventlog_from_xes', null, { xes });

  // 2. Build throughput series (events per time window)
  const throughputSeries = await buildThroughputSeries(handle, {
    windowSizeMs: 60000, // 1-minute windows
    activityKey: 'concept:name',
    timestampKey: 'time:timestamp',
  });

  console.log(`Throughput analysis`);
  console.log(`  Windows: ${throughputSeries.windowCount}`);
  console.log(`  Trend: ${throughputSeries.trend.direction} (slope=${throughputSeries.trend.slope.toFixed(2)})`);
  if (throughputSeries.seasonality) {
    console.log(
      `  Seasonality: period=${throughputSeries.seasonality.period}, strength=${throughputSeries.seasonality.strength.toFixed(2)}`
    );
  }

  // 3. Forecast with multiple methods
  const methods = ['linear', 'polynomial', 'exponential'] as const;
  const forecasts = await Promise.all(
    methods.map(method =>
      forecastSeries(throughputSeries.eventCounts, {
        method: method === 'linear' ? 'linear_regression' : method === 'polynomial' ? 'polynomial_regression' : 'exponential_regression',
      })
    )
  );

  console.log(`\nForecasts (next 5 periods):`);
  forecasts.forEach((forecast, idx) => {
    const method = methods[idx];
    console.log(`\n${method.toUpperCase()}:`);
    if (forecast.forecast) {
      console.log(`  Predicted: ${forecast.forecast.slice(0, 5).map(v => v.toFixed(0)).join(', ')}`);
    }
    console.log(`  Trend: ${forecast.trend.direction} (strength=${forecast.trend.strength.toFixed(2)})`);
  });

  // 4. Seasonality analysis (if present)
  if (throughputSeries.decomposition) {
    const { trend, seasonal, residual } = throughputSeries.decomposition;
    console.log(`\nDecomposition analysis:`);
    console.log(
      `  Trend variance: ${trend.reduce((a, b) => a + (b ** 2), 0) / trend.length}`
    );
    console.log(
      `  Seasonal variance: ${seasonal.reduce((a, b) => a + (b ** 2), 0) / seasonal.length}`
    );
    console.log(
      `  Residual variance: ${residual.reduce((a, b) => a + (b ** 2), 0) / residual.length}`
    );
  }
}

const logPath = process.argv[2] ?? './sample.xes';
main(logPath).catch(err => {
  console.error('Forecasting failed:', err);
  process.exit(1);
});
