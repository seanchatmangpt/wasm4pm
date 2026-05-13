# Choose K for K-Means

Determine the optimal number of clusters for your data.

## Problem

K-Means requires you to specify `k` (the number of clusters) upfront. Too few clusters merge distinct groups; too many split natural groups into fragments. You need a principled way to pick the right value.

## Solution

Use the silhouette score to evaluate cluster quality across different values of k. The silhouette score measures how well each point fits within its assigned cluster compared to neighboring clusters.

### Step 1: Try a range of k values

```typescript
import { kmeans, silhouetteScore, standardScaler } from "@seanchatmangpt/wminml";

const nFeatures = 4;

// Scale features first -- K-Means is distance-based
const scaled = standardScaler(X, nFeatures);

// Reshape flat data to 2D for kmeans
const data2D = [];
for (let i = 0; i < scaled.length; i += nFeatures) {
  data2D.push(scaled.slice(i, i + nFeatures));
}

const nSamples = data2D.length;
const maxK = Math.min(10, Math.floor(nSamples / 2));

for (let k = 2; k <= maxK; k++) {
  const model = kmeans(data2D, { k });
  const labels = model.getAssignments();
  const score = silhouetteScore(scaled, nFeatures, labels);
  console.log(`k=${k}: silhouette=${score.toFixed(4)}`);
}
```

### Step 2: Pick the best k

```typescript
// Find best k by silhouette score (higher is better, range -1 to 1)
let bestScore = -Infinity;
let bestK = 2;
let bestLabels: number[] = [];

for (let k = 2; k <= maxK; k++) {
  const model = kmeans(data2D, { k });
  const labels = model.getAssignments();
  const score = silhouetteScore(scaled, nFeatures, labels);

  if (score > bestScore) {
    bestScore = score;
    bestK = k;
    bestLabels = labels;
  }
}

console.log(`\nBest k=${bestK} (silhouette=${bestScore.toFixed(4)})`);

// Apply the final clustering with the optimal k
const finalModel = kmeans(data2D, { k: bestK, maxIterations: 200 });
const finalLabels = finalModel.getAssignments();
const centroids = finalModel.getCentroids();
```

### Step 3: Inspect cluster sizes

After choosing k, verify the clusters are reasonable.

```typescript
const clusterCounts = new Map<number, number>();
for (let i = 0; i < finalLabels.length; i++) {
  const cluster = finalLabels[i];
  clusterCounts.set(cluster, (clusterCounts.get(cluster) || 0) + 1);
}

console.log("\nCluster sizes:");
for (const [cluster, count] of clusterCounts) {
  console.log(`  Cluster ${cluster}: ${count} samples`);
}

// Flag any suspiciously small or empty clusters
for (const [cluster, count] of clusterCounts) {
  if (count < 3) {
    console.log(
      `  WARNING: Cluster ${cluster} has only ${count} samples -- consider reducing k`
    );
  }
}
```

### Step 4: Use K-Means++ for better initialization

K-Means++ chooses initial centroids more intelligently than random initialization, leading to more stable results.

```typescript
import { kmeansPlus } from "@seanchatmangpt/wminml";

const labelsPP = kmeansPlus(scaled, nFeatures, best.k);

const scorePP = silhouetteScore(scaled, nFeatures, labelsPP);
console.log(`K-Means++ silhouette: ${scorePP.toFixed(4)}`);

// Compare with standard K-Means
console.log(`Standard K-Means silhouette: ${bestScore.toFixed(4)}`);
```

### Interpreting silhouette scores

| Score Range | Interpretation |
|-------------|---------------|
| 0.7 - 1.0 | Strong, well-separated clusters |
| 0.5 - 0.7 | Reasonable structure |
| 0.25 - 0.5 | Weak structure, clusters overlap |
| < 0.25 | No meaningful structure (or wrong k) |
| < 0 | Points assigned to wrong cluster |

## Tips

- Always scale features before K-Means. Unscaled features with larger ranges dominate the distance calculation.
- Run K-Means multiple times with different random seeds if results vary. K-Means++ reduces this variance.
- If all silhouette scores are low (< 0.25), the data may not have natural clusters. Consider DBSCAN instead (see [Handle Arbitrary Shapes](dbscan.md)).
- Silhouette scores above 0.5 indicate reliable clustering. Above 0.7 is excellent.

## See Also

- [Handle Arbitrary Shapes](dbscan.md) -- when clusters are not spherical
- [Hierarchical Clustering](hierarchical.md) -- alternative that does not require k upfront
- [Scale Your Features](../preprocessing/scaling.md) -- essential before K-Means
