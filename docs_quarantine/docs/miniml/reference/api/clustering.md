# Clustering API

Complete reference for all clustering algorithms exported by `miniml`.

---

## K-Means

```ts
kmeans(data, options): Promise<KMeansModel>
```

Lloyd's algorithm for partitioning n observations into k clusters. Minimizes within-cluster sum of squares (inertia).

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `data` | `number[][]` | -- | Training features (nSamples x nFeatures) |
| `options.k` | `number` | -- | Number of clusters |
| `options.maxIterations` | `number` | `100` | Maximum iterations |

**Returns:** `KMeansModel`

| Property / Method | Return Type | Description |
|--------------------|-------------|-------------|
| `.k` | `number` (readonly) | Number of clusters |
| `.iterations` | `number` (readonly) | Iterations run until convergence |
| `.inertia` | `number` (readonly) | Within-cluster sum of squares |
| `.getCentroids()` | `number[][]` | Cluster centroid coordinates (k x nFeatures) |
| `.getAssignments()` | `number[]` | Training sample cluster assignments |
| `.predict(data)` | `Promise<number[]>` | Cluster assignments for new data |
| `.toString()` | `string` | Human-readable description |

```ts
const model = await kmeans([[1,2],[1,4],[10,10],[10,12]], { k: 2 });
console.log(model.inertia);       // Within-cluster variance
console.log(model.getCentroids()); // [[1,3], [10,11]]
console.log(await model.predict([[2,3]])); // [0]
```

---

## K-Means++ (WASM-level)

```ts
kmeansPlus(x, nClusters, maxIter, nSamples, nFeatures): Promise<any>
```

K-Means with improved initialization (k-means++ seeding). Accepts flat arrays directly.

| Parameter | Type | Description |
|-----------|------|-------------|
| `x` | `number[]` | Flat feature data (nSamples * nFeatures) |
| `nClusters` | `number` | Number of clusters |
| `maxIter` | `number` | Maximum iterations |
| `nSamples` | `number` | Number of samples |
| `nFeatures` | `number` | Features per sample |

**Returns:** Raw WASM model object.

For the high-level API, prefer `kmeans()` which uses 2D arrays.

---

## DBSCAN

```ts
dbscan(data, options): Promise<DbscanResult>
```

Density-Based Spatial Clustering of Applications with Noise. Discovers arbitrary-shaped clusters and identifies noise points.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `data` | `number[][]` | -- | Features (nSamples x nFeatures) |
| `options.eps` | `number` | -- | Neighborhood radius |
| `options.minPoints` | `number` | `5` | Minimum points to form a dense region |

**Returns:** `DbscanResult`

| Property / Method | Return Type | Description |
|--------------------|-------------|-------------|
| `.nClusters` | `number` (readonly) | Number of clusters found |
| `.nNoise` | `number` (readonly) | Noise points (label = -1) |
| `.getLabels()` | `number[]` | Cluster assignment per sample (-1 = noise) |
| `.toString()` | `string` | Human-readable description |

```ts
const result = await dbscan(data, { eps: 0.5, minPoints: 5 });
console.log(result.nClusters); // e.g. 3
console.log(result.getLabels()); // [0, 0, 1, -1, 1, 2, 2, ...]
```

---

## Hierarchical Clustering

```ts
hierarchicalClustering(x, nFeatures, nClusters): Promise<number[]>
```

Agglomerative hierarchical clustering with single linkage (minimum inter-cluster distance).

| Parameter | Type | Description |
|-----------|------|-------------|
| `x` | `number[]` | Flat feature data (nSamples * nFeatures) |
| `nFeatures` | `number` | Features per sample |
| `nClusters` | `number` | Desired number of clusters |

**Returns:** `number[]` -- Cluster assignment per sample (0-indexed).

```ts
const labels = await hierarchicalClustering(flatData, 10, 3);
// labels[i] = cluster index for sample i
```

---

## Clustering Metrics

### Silhouette Score

```ts
silhouetteScore(x, labels, nSamples, nFeatures): Promise<number>
```

Measures how similar an object is to its own cluster compared to other clusters. Range: [-1, 1]. Higher is better.

| Parameter | Type | Description |
|-----------|------|-------------|
| `x` | `number[]` | Flat feature data |
| `labels` | `number[]` | Cluster assignments |
| `nSamples` | `number` | Number of samples |
| `nFeatures` | `number` | Features per sample |

### Calinski-Harabasz Index

```ts
calinskiHarabaszScore(x, labels, nSamples, nFeatures): Promise<number>
```

Ratio of between-cluster dispersion to within-cluster dispersion. Higher is better.

### Davies-Bouldin Index

```ts
daviesBouldinScore(x, labels, nSamples, nFeatures): Promise<number>
```

Average similarity of each cluster with its most similar cluster. Lower is better.
