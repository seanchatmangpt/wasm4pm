# Detect Concept Drift

Monitor your data for changes in distribution that indicate model degradation.

## Problem

Models degrade over time as the data distribution shifts. A model trained on last year's customer behavior may not predict this year's behavior accurately. You need to detect these shifts automatically.

## Solution

miniml provides three drift detection methods, each suited to different data types and drift patterns.

### Jaccard Window Drift Detection

Best for **sequence data** where you can compare the set of unique items in sliding windows.

```typescript
import { jaccardDriftWindow } from '@seanchatmangpt/wminml';

// User click sequences over time (each inner array is a session)
const sequences = [
  ['home', 'products', 'cart', 'checkout'],
  ['home', 'search', 'products', 'cart'],
  ['home', 'products', 'reviews', 'cart'],
  ['home', 'blog', 'about', 'contact'],   // different pattern
  ['home', 'blog', 'careers', 'contact'],  // different pattern
  ['home', 'blog', 'about', 'products'],
];

// Check for drift in a window of 3 sequences
const result = jaccardDriftWindow(sequences, 3);

console.log(`Drift detected: ${result.driftDetected}`);
console.log(`Jaccard index:  ${result.jaccardIndex.toFixed(4)}`);
console.log(`Window:         sequences ${result.windowStart} to ${result.windowEnd}`);
```

The Jaccard index measures similarity between consecutive windows. A value near 1.0 means no drift; a drop below your threshold signals a distribution change.

### Statistical Drift Detection (KS Test)

Best for **numeric data** where you compare a reference distribution against recent data.

```typescript
import { statisticalDrift } from '@seanchatmangpt/wminml';

// Reference distribution: feature values from training time
const reference = [2.1, 2.3, 2.0, 2.5, 2.2, 2.4, 2.1, 2.3, 2.0, 2.6];

// Current distribution: feature values from last week
const current = [3.1, 3.3, 3.0, 3.5, 3.2, 3.4, 3.1, 3.3, 3.8, 3.6];

const result = statisticalDrift(reference, current, 0.05);

console.log(`Drift detected: ${result.driftDetected}`);
console.log(`p-value:        ${result.pValue.toFixed(6)}`);
console.log(`Test statistic: ${result.statistic.toFixed(4)}`);
```

A low p-value (below your threshold) means the distributions are significantly different -- drift has occurred.

### Page-Hinkley Change Detection

Best for **time series data** where you want to detect a shift in the running mean.

```typescript
import { pageHinkley } from '@seanchatmangpt/wminml';

// Sensor readings over time (simulated drift at index 40)
const readings = [];
for (let i = 0; i < 80; i++) {
  readings.push(i < 40 ? 10.0 + (Math.random() - 0.5) * 0.5 : 12.0 + (Math.random() - 0.5) * 0.5);
}

const result = pageHinkley(readings, 5.0, 10);

console.log(`Change points detected: ${result.changePoints.length}`);
console.log(`Change point indices:   [${result.changePoints.join(', ')}]`);
```

The `threshold` parameter controls sensitivity. Lower values detect smaller shifts but increase false positives. `minSamples` prevents detection before enough data has accumulated.

## Which Method to Use

| Data Type | Method | Key Parameter |
|-----------|--------|---------------|
| Sequences / categories | `jaccardDriftWindow` | `windowSize` -- how many observations per window |
| Numeric features | `statisticalDrift` | `threshold` -- significance level (e.g., 0.05) |
| Time series / streaming | `pageHinkley` | `threshold` -- sensitivity to mean shifts |

## Tips

- Run drift detection on a schedule (daily, hourly) depending on your data velocity.
- Use `statisticalDrift` on individual features, not the full dataset, to identify which features are drifting.
- Set `minSamples` high enough to avoid false alarms from initial data variance.
- When drift is detected, retrain your model on recent data that includes the new distribution.
