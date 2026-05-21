# Clustering Algorithms

Clustering groups data points into clusters such that points within a cluster are more similar to each other than to points in other clusters. Unlike classification, clustering is unsupervised -- there are no predefined labels. miniml implements four clustering algorithms, each based on a different notion of what makes a "good" cluster.

## Overview of Approaches

Clustering algorithms differ in how they define clusters:

| Approach | Cluster Definition | Finds K Automatically | Handles Arbitrary Shapes |
|----------|-------------------|----------------------|------------------------|
| **Centroid-based** (K-Means) | Points close to a center | No (K is a parameter) | No (assumes spherical) |
| **Density-based** (DBSCAN) | Dense regions separated by sparse regions | Yes | Yes |
| **Hierarchical** | Nested partitions (tree) | Yes (cut dendrogram) | Depends on linkage |

## K-Means

K-Means partitions data into K clusters by minimizing the within-cluster sum of squares (inertia):

```
minimize  sum_{k=1}^{K} sum_{x in C_k} ||x - mu_k||^2
```

where mu_k is the centroid of cluster C_k.

### Lloyd's Algorithm

K-Means uses an iterative algorithm that alternates between two steps:

```
Initialize K centroids (random or K-Means++)
Repeat until convergence:
    Assignment: assign each point to nearest centroid
    Update: recompute centroids as mean of assigned points
```

### Convergence

The algorithm is guaranteed to converge because each step reduces (or maintains) the objective function:
- **Assignment step:** Each point moves to the nearest centroid, reducing its distance
- **Update step:** The mean minimizes the sum of squared distances within a cluster

However, convergence is to a **local minimum**, not necessarily the global minimum. The result depends on initialization.

### Strengths and Weaknesses

| Strengths | Weaknesses |
|-----------|------------|
| Simple to understand and implement | Requires specifying K |
| Scales to large datasets (O(n*K*d) per iteration) | Assumes spherical, equally-sized clusters |
| Fast convergence (typically 10-30 iterations) | Sensitive to initialization (run multiple times) |
| Low memory usage (only stores centroids and assignments) | Sensitive to outliers (centroids pulled by extreme points) |

## K-Means++

K-Means++ improves the initialization step of standard K-Means. Instead of choosing random centroids, it selects initial centroids that are spread apart:

```
1. Choose first centroid uniformly at random from data points
2. For each subsequent centroid:
    a. For each data point, compute D(x) = distance to nearest existing centroid
    b. Choose next centroid with probability proportional to D(x)^2
3. Proceed with standard Lloyd's algorithm
```

This seeding algorithm provides an O(log K)-competitive approximation to the optimal K-Means objective. In practice, it produces significantly better and more consistent results than random initialization.

The cost of K-Means++ initialization is O(n*K*d), which is typically negligible compared to the total K-Means cost.

## DBSCAN

DBSCAN (Density-Based Spatial Clustering of Applications with Noise) defines clusters as dense regions separated by sparse regions. It does not require specifying the number of clusters.

### Core Concepts

DBSCAN classifies each point as one of three types:

- **Core point:** has at least `min_pts` points within radius `epsilon`
- **Border point:** within `epsilon` of a core point, but not itself a core point
- **Noise point:** neither core nor border

A cluster is a maximal set of density-connected points (core points reachable from each other through a chain of core points, plus their border points).

### Algorithm

```
For each unvisited point p:
    Find all points within epsilon of p (neighborhood query)
    If |neighborhood| < min_pts:
        Mark p as noise (may later become border point)
    Else:
        Create new cluster C
        Expand C: add all reachable core points and their border points
```

### Strengths and Weaknesses

| Strengths | Weaknesses |
|-----------|------------|
| No need to specify K (finds clusters automatically) | Sensitive to epsilon and min_pts parameters |
| Discovers clusters of arbitrary shape | Struggles with clusters of varying density |
| Identifies noise/outlier points | Distance metric choice affects results |
| Only two parameters | Can merge clusters connected by a thin bridge |
| Non-convex clusters handled naturally | Neighborhood query is O(n^2) without spatial index |

### Choosing Epsilon and min_pts

A practical approach is to plot the distance from each point to its k-th nearest neighbor (k = min_pts), sorted in ascending order. The "elbow" in this plot suggests a good epsilon value -- below the elbow, points have many close neighbors (core points); above it, distances increase sharply.

## Hierarchical Clustering

Hierarchical clustering builds a tree of clusters (dendrogram) by iteratively merging the closest pair of clusters (agglomerative, bottom-up) or splitting the most heterogeneous cluster (divisive, top-down). miniml implements agglomerative clustering.

### Linkage Methods

The choice of linkage determines how "distance between clusters" is defined:

| Linkage | Definition | Properties |
|---------|-----------|------------|
| **Single** | min distance between any two points in different clusters | Tends to produce elongated clusters; chaining effect |
| **Complete** | max distance between any two points in different clusters | Produces compact, spherical clusters |
| **Average** | average distance between all pairs across clusters | Balanced compromise |
| **Ward** | minimizes total within-cluster variance | Tends to produce equal-sized clusters |

### Algorithm

```
Start: each point is its own cluster (n clusters)
Repeat until 1 cluster remains:
    Compute distance matrix between all pairs of clusters
    Merge the two closest clusters
    Record merge in dendrogram
Cut dendrogram at desired number of clusters
```

### Dendrograms

The dendrogram is a tree that records the merge history. The y-axis represents the distance at which two clusters were merged. Cutting the dendrogram at a height h produces a flat clustering.

```
Height
  4 |         [merge A,B,C,D]
  3 |    [merge A,B]     [merge C,D]
  2 |     |    |          |    |
  1 |     A    B          C    D
```

Cutting at height 2.5 produces 2 clusters: {A, B} and {C, D}. Cutting at height 1.5 produces 4 clusters (each point is its own cluster).

### Strengths and Weaknesses

| Strengths | Weaknesses |
|-----------|------------|
| No need to specify K (cut dendrogram later) | O(n^2) memory for distance matrix |
| Visual hierarchy provides insight at multiple scales | O(n^3) time for naive implementation |
| Any number of clusters from a single run | Irreversible merges (greedy, can't undo) |
| Deterministic (given linkage and distance metric) | Sensitive to noise and outliers |
| Works well with small-to-medium datasets | Does not scale to large datasets |

## Choosing the Right Algorithm

| Situation | Recommended Algorithm | Why |
|-----------|----------------------|-----|
| Know K, roughly spherical clusters | K-Means / K-Means++ | Fast, optimal for this structure |
| Don't know K, want automatic detection | DBSCAN | Density-based, no K required |
| Want to explore multiple K values | Hierarchical | Single run, cut at any level |
| Arbitrary cluster shapes | DBSCAN | Density-based handles non-convex shapes |
| Large dataset (>10K points) | K-Means | O(n*K*d) scales well |
| Small dataset, need hierarchy | Hierarchical | Full dendrogram, visual insight |
| Data with noise/outliers | DBSCAN | Explicit noise classification |
| Need reproducible results | K-Means (fixed seed) or Hierarchical | Deterministic linkage merges |

## See Also

- [Classification Algorithms](classification.md) -- Supervised counterpart to clustering
- [What is AutoML?](../automl/overview.md) -- Automated pipeline selection including clustering
- [Algorithm Reference](../../../algorithms.md) -- API details and parameter defaults
