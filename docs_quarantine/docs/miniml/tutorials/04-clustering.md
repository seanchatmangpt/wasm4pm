# Customer Clustering

Segment customers with K-Means, K-Means++, and silhouette scoring.

## What You'll Learn

- Generating synthetic customer data with natural clusters
- Clustering with K-Means and K-Means++
- Evaluating cluster quality with silhouette score
- Using DBSCAN to find clusters of arbitrary shape
- Interpreting cluster assignments

## Generate Synthetic Customer Data

Imagine a dataset of customers with two features: annual spending and visit frequency. Customers naturally group into segments -- high-spenders, bargain-hunters, occasional shoppers.

```typescript
import {
  init, kmeans, kmeansPlus, dbscan,
  silhouetteScore, standardScaler,
} from '@seanchatmangpt/wminml';

await init();

// 30 customers, 2 features: [annual_spend, visits_per_month]
const nFeatures = 2;

// Cluster 0: budget shoppers (low spend, moderate visits)
const c0 = [
  [120, 8], [150, 6], [100, 10], [130, 7], [110, 9],
  [140, 5], [90, 11], [160, 6], [125, 8], [115, 7],
];

// Cluster 1: loyal regulars (moderate spend, high visits)
const c1 = [
  [400, 22], [380, 25], [420, 20], [390, 24], [410, 21],
  [370, 26], [430, 19], [405, 23], [395, 22], [385, 24],
];

// Cluster 2: VIP big-spenders (high spend, moderate visits)
const c2 = [
  [800, 14], [850, 12], [780, 15], [820, 13], [790, 16],
  [830, 11], [810, 14], [860, 10], [770, 17], [840, 12],
];

const data = [...c0, ...c1, ...c2];
```

## Scale the Features

Clustering algorithms are sensitive to feature scale. Spending ranges from 100 to 860, but visits range from 5 to 26. Without scaling, spending would dominate the distance calculations.

```typescript
const flatData = data.flat();
const scaled = await standardScaler(flatData, nFeatures);

console.log('Scaled data (first 5 customers):');
for (let i = 0; i < 5; i++) {
  const start = i * nFeatures;
  console.log(`  Customer ${i}: spend=${scaled[start].toFixed(2)}, visits=${scaled[start + 1].toFixed(2)}`);
}
```

`standardScaler` transforms each feature to have mean=0 and std=1. Now both features contribute equally to distance.

## K-Means Clustering

K-Means partitions data into K groups by minimizing the distance from each point to its cluster center.

```typescript
const k = 3;
const kmResult = await kmeans(data, { k, maxIterations: 100 });

console.log('\nK-Means cluster assignments:');
const kmLabels = kmResult.getAssignments();
for (let i = 0; i < data.length; i++) {
  console.log(`  Customer ${String(i).padStart(2)}: cluster ${kmLabels[i]}`);
}

console.log('\nCentroids:');
const centroids = kmResult.getCentroids();
for (let c = 0; c < k; c++) {
  console.log(`  Cluster ${c}: [${centroids[c][0].toFixed(2)}, ${centroids[c][1].toFixed(2)}]`);
}
```

K-Means starts with random centroids, so results can vary between runs. That's the problem K-Means++ solves.

## K-Means++ (Better Initialization)

K-Means++ picks initial centroids more carefully -- the first centroid is random, but each subsequent one is chosen to be far from existing centroids. This leads to better and more consistent results.

```typescript
const kmppLabels = await kmeansPlus(scaled, nFeatures, k, 100);

console.log('\nK-Means++ cluster assignments:');
for (let i = 0; i < data.length; i++) {
  console.log(`  Customer ${String(i).padStart(2)}: cluster ${kmppLabels[i]}`);
}
```

Run both K-Means and K-Means++ a few times. K-Means++ should give more consistent results, especially when clusters are uneven in size or close together.

## Evaluate with Silhouette Score

How good are your clusters? The silhouette score measures how similar a point is to its own cluster compared to the nearest other cluster. Values range from -1 (wrong cluster) to +1 (well-clustered).

```typescript
const score = await silhouetteScore(scaled, nFeatures, kmppLabels);
console.log(`\nSilhouette Score: ${score.toFixed(3)}`);
```

Interpretation:

| Score Range | Meaning |
|-------------|---------|
| 0.71 - 1.00 | Strong structure, well-defined clusters |
| 0.51 - 0.70 | Reasonable structure |
| 0.26 - 0.50 | Weak structure, clusters overlap |
| Below 0.25 | No meaningful structure |

On our synthetic data with well-separated clusters, you should see a score above 0.7.

## DBSCAN for Arbitrary Shapes

K-Means assumes clusters are spherical and roughly the same size. DBSCAN finds clusters of any shape by looking at local density.

```typescript
const dbscanResult = await dbscan(data, { eps: 0.8, minPoints: 3 });

console.log(`\nDBSCAN found ${dbscanResult.nClusters} clusters`);
console.log('Assignments:');
const dbLabels = dbscanResult.getLabels();
for (let i = 0; i < data.length; i++) {
  const label = dbLabels[i];
  const tag = label < 0 ? 'noise' : `cluster ${label}`;
  console.log(`  Customer ${String(i).padStart(2)}: ${tag}`);
}
```

Points labeled `-1` are noise -- DBSCAN couldn't assign them to any cluster. This is useful for outlier detection.

DBSCAN parameters:
- **eps**: Smaller values find tighter, smaller clusters. Larger values merge nearby clusters.
- **minPoints**: Larger values require denser regions. Reduces noise sensitivity but may miss small clusters.

## Comparing Results

```typescript
console.log('\nComparison:');
console.log(`  K-Means:      ${k} clusters (fixed)`);
console.log(`  K-Means++:    ${k} clusters (fixed)`);
console.log(`  DBSCAN:       ${dbscanResult.nClusters} clusters (automatic)`);
console.log(`  Silhouette:   ${score.toFixed(3)}`);
```

Key differences:
- **K-Means / K-Means++**: You choose K. Every point gets assigned to a cluster. Fast.
- **DBSCAN**: K is discovered automatically. Some points may be labeled as noise. Better for irregular shapes.

## Summary

1. **Scale first**: `standardScaler` prevents one feature from dominating
2. **K-Means**: Fast and simple, but sensitive to initialization
3. **K-Means++**: Same algorithm, smarter starting points, more consistent
4. **Silhouette score**: Quantifies cluster quality (aim for > 0.5)
5. **DBSCAN**: Finds arbitrary-shaped clusters, detects noise automatically

## Next Steps

- **How-to**: Advanced clustering techniques in [how_to/clustering/](../how_to/clustering/)
- **Explanation**: How K-Means converges and why initialization matters in [explanation/algorithms/](../explanation/algorithms/)
- **Tutorial 03**: Analyze time-based data with [Time Series Analysis](./03-time-series.md)
