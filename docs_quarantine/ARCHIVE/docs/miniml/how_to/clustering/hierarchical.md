# Hierarchical Clustering

Cluster data with agglomerative clustering.

## Problem

You want to cluster your data but do not know the number of clusters in advance. K-Means requires specifying k; DBSCAN requires tuning epsilon. Hierarchical clustering builds a tree of clusters (dendrogram) and lets you decide where to cut -- giving you flexibility and visual insight into the data structure.

## Solution

Use hierarchical agglomerative clustering. It starts with each point as its own cluster and merges the closest pairs until all points are in one cluster.

### Step 1: Try different numbers of clusters

```typescript
import { hierarchicalClustering, standardScaler, silhouetteScore } from "@seanchatmangpt/wminml";

const nFeatures = 4;
const scaled = standardScaler(X, nFeatures);

for (let k = 2; k <= 6; k++) {
  const labels = hierarchicalClustering(scaled, nFeatures, k);
  const score = silhouetteScore(scaled, nFeatures, labels);
  console.log(`k=${k}: silhouette=${score.toFixed(4)}`);
}
```

### Step 2: Pick the best k

```typescript
let bestScore = -Infinity;
let bestK = 2;
let bestLabels: number[] = [];

for (let k = 2; k <= 8; k++) {
  const labels = hierarchicalClustering(scaled, nFeatures, k);
  const score = silhouetteScore(scaled, nFeatures, labels);

  if (score > bestScore) {
    bestScore = score;
    bestK = k;
    bestLabels = labels;
  }
}

console.log(`Best: k=${bestK}, silhouette=${bestScore.toFixed(4)}`);
```

### Step 3: Compare with K-Means

```typescript
import { kmeans } from "@seanchatmangpt/wminml";

// Reshape flat data to 2D for kmeans
const data2D = [];
for (let i = 0; i < scaled.length; i += nFeatures) {
  data2D.push(scaled.slice(i, i + nFeatures));
}

// K-Means with same k
const kmModel = kmeans(data2D, { k: bestK });
const kmLabels = kmModel.getAssignments();
const kmScore = silhouetteScore(scaled, nFeatures, kmLabels);

console.log("\nAlgorithm Comparison:");
console.log(`  Hierarchical (k=${bestK}): ${bestScore.toFixed(4)}`);
console.log(`  K-Means (k=${bestK}):      ${kmScore.toFixed(4)}`);
```

### When to use hierarchical over K-Means

| Condition | Prefer |
|-----------|--------|
| You do not know k in advance | Hierarchical |
| You need a hierarchy of cluster resolutions | Hierarchical |
| Clusters are roughly spherical and similar size | K-Means (faster) |
| Dataset is large (> 10k samples) | K-Means (hierarchical is O(n^2)) |
| You want to explore different numbers of clusters | Hierarchical (compute once, cut at different levels) |

## Tips

- Always scale features first. Hierarchical clustering uses distance.
- `hierarchicalClustering` takes a flat `number[]` and `nFeatures`, and returns `number[]` labels directly.
- For large datasets (> 1000 samples), hierarchical clustering becomes slow. Use K-Means or DBSCAN instead.

## See Also

- [Choose K for K-Means](choose-k.md) -- when you have spherical clusters
- [Handle Arbitrary Shapes](dbscan.md) -- when clusters are irregular
- [Scale Your Features](../preprocessing/scaling.md) -- required before clustering
