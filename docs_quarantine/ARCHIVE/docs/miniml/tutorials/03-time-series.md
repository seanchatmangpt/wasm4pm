# Time Series Analysis

Forecast sales data with moving averages, exponential smoothing, and trend detection.

## What You'll Learn

- Creating synthetic time series data with trend and seasonality
- Smoothing noisy data with Simple Moving Average (SMA)
- Smoothing with Exponential Moving Average (EMA)
- Forecasting with Exponential Smoothing and trend projection
- Detecting peaks and troughs

## Create Synthetic Sales Data

Real sales data has three components: a trend (growing over time), seasonality (repeating patterns), and noise. Let's build that.

```typescript
import { init, sma, ema, exponentialSmoothing, trendForecast } from '@seanchatmangpt/wminml';

await init();

// 24 months of sales data (units sold)
const months = 24;
const sales = new Float64Array(months);

for (let t = 0; t < months; t++) {
  const trend = 100 + t * 5;            // linear growth: 100, 105, 110, ...
  const seasonality = 20 * Math.sin((t / 12) * 2 * Math.PI); // yearly cycle
  const noise = (Math.random() - 0.5) * 10; // random fluctuation
  sales[t] = trend + seasonality + noise;
}

console.log('Monthly sales:', Array.from(sales).map(v => v.toFixed(1)));
```

Your output will vary because of the random noise, but you should see a general upward trend with a wave pattern repeating every 12 months.

## Simple Moving Average

The SMA smooths data by averaging a sliding window. It removes short-term noise so you can see the underlying pattern.

```typescript
const window = 3;
const smoothed = sma(sales, window);

console.log('\nSMA (window=3):');
for (let t = 0; t < months; t++) {
  const raw = t < window - 1 ? '    '.repeat(window - 1) : sales[t].toFixed(1);
  const smaVal = smoothed[t]?.toFixed(1) ?? '  ---';
  console.log(`  Month ${String(t + 1).padStart(2)}: raw=${sales[t].toFixed(1).padStart(7)}  sma=${smaVal}`);
}
```

A window of 3 means each point is the average of the current month and the two before it. Larger windows produce smoother curves but lag behind sudden changes.

Try changing `window` to 5 or 7 and notice how the smoothed line becomes flatter.

## Exponential Moving Average

EMA is like SMA, but it gives more weight to recent data. This makes it more responsive to changes while still filtering noise.

```typescript
const emaSmoothed = ema(sales, 3);

console.log('\nEMA (window=3, smoothing=2):');
for (let t = 0; t < months; t++) {
  console.log(`  Month ${String(t + 1).padStart(2)}: raw=${sales[t].toFixed(1).padStart(7)}  ema=${emaSmoothed[t].toFixed(1)}`);
}
```

The `smoothing` parameter controls how much weight goes to recent values. Higher values (closer to the window size) make the EMA follow the data more closely.

## Exponential Smoothing

Exponential smoothing goes beyond EMA by also estimating the trend. This makes it suitable for forecasting.

```typescript
const alpha = 0.3; // smoothing factor (0 = smooth, 1 = raw)
const result = exponentialSmoothing(sales, alpha);

console.log('\nExponential Smoothing:');
console.log(`  Final level:  ${result.level.toFixed(1)}`);
console.log(`  Final trend:  ${result.trend.toFixed(1)}`);
console.log('  Smoothed:', Array.from(result.smoothed).map(v => v.toFixed(1)));
```

The `level` is the current baseline value and `trend` is the estimated slope. Together they tell you where the series is and where it's heading.

## Trend Forecasting

Use the estimated trend to project future values.

```typescript
const forecastPeriods = 6; // forecast 6 months ahead
const forecast = trendForecast(sales, forecastPeriods);

console.log('\nForecast (next 6 months):');
for (let i = 0; i < forecastPeriods; i++) {
  console.log(`  Month ${months + i + 1}: ${forecast[i].toFixed(1)}`);
}
```

`trendForecast` fits a linear trend to your data and extrapolates it forward. It's a simple baseline -- for real forecasting you'd combine it with seasonal decomposition.

## Peak and Trough Detection

Finding local maxima and minima is useful for identifying sales spikes and dips.

```typescript
console.log('\nPeaks and troughs:');
for (let t = 1; t < months - 1; t++) {
  const isPeak = sales[t] > sales[t - 1] && sales[t] > sales[t + 1];
  const isTrough = sales[t] < sales[t - 1] && sales[t] < sales[t + 1];

  if (isPeak) {
    console.log(`  Peak at month ${t + 1}: ${sales[t].toFixed(1)} units`);
  } else if (isTrough) {
    console.log(`  Trough at month ${t + 1}: ${sales[t].toFixed(1)} units`);
  }
}
```

Peaks correspond to high-selling months (perhaps holiday seasons) and troughs to slow periods. This is the kind of insight that drives inventory planning.

## Summary

1. **SMA** (`sma`): Simple sliding-window average. Good for removing noise.
2. **EMA** (`ema`): Weighted average favoring recent values. More responsive than SMA.
3. **Exponential Smoothing** (`exponentialSmoothing`): Estimates both level and trend.
4. **Trend Forecast** (`trendForecast`): Projects future values based on linear trend.
5. **Peaks/Troughs**: Find local maxima and minima with simple comparison.

## Next Steps

- **How-to**: Advanced time series techniques in [how_to/analytics/](../how_to/analytics/)
- **Explanation**: How exponential smoothing weights decay over time in [explanation/statistical/](../explanation/statistical/)
- **Tutorial 04**: Segment your customers with [Customer Clustering](./04-clustering.md)
