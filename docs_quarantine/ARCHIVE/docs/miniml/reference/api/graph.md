# Graph API

Graph analytics: centrality, shortest paths, and community detection. Call `await init()` before use.

All functions operate on dense adjacency matrices (`Float64Array`, row-major).

---

## PageRank

### `pagerank`

```ts
function pagerank(
  adjacency: Float64Array,
  nNodes: number,
  damping: number = 0.85,
  maxIter: number = 100,
  tol: number = 1e-6
): PageRankResult
```

Computes PageRank scores for each node in a directed graph using the power iteration method.

| Parameter | Type | Description |
|-----------|------|-------------|
| `adjacency` | `Float64Array` | Adjacency matrix (nNodes x nNodes), row-major. `adjacency[i][j]` > 0 indicates an edge from node i to node j. |
| `nNodes` | `number` | Number of nodes in the graph |
| `damping` | `number` | Damping factor (teleportation probability). Default: 0.85. Must be in (0, 1). |
| `maxIter` | `number` | Maximum power iterations. Default: 100. |
| `tol` | `number` | Convergence tolerance on L1 norm of score change. Default: 1e-6. |

**Returns:** `PageRankResult`

```ts
interface PageRankResult {
  scores: Float64Array;   // PageRank scores (length nNodes), sum to 1.0
}
```

**Behavior:**
- Dangling nodes (nodes with no outgoing edges) redistribute their rank uniformly to all nodes.
- The algorithm converges when the L1 norm of the score vector change is less than `tol`.
- Scores are normalized so they sum to 1.0.

---

## Shortest Path

### `shortestPath`

```ts
function shortestPath(
  adjacency: Float64Array,
  nNodes: number,
  source: number
): ShortestPathResult
```

Computes single-source shortest paths using Dijkstra's algorithm.

| Parameter | Type | Description |
|-----------|------|-------------|
| `adjacency` | `Float64Array` | Adjacency matrix (nNodes x nNodes), row-major. `adjacency[i][j]` is the edge weight (>= 0). Use 0 or Infinity to indicate no edge. |
| `nNodes` | `number` | Number of nodes in the graph |
| `source` | `number` | Source node index (0-based) |

**Returns:** `ShortestPathResult`

```ts
interface ShortestPathResult {
  distances: Float64Array;     // Shortest distance from source to each node (length nNodes). Unreachable nodes have distance Infinity.
  predecessors: Int32Array;    // Predecessor node in the shortest path tree (length nNodes). Source node has predecessor -1.
}
```

**Behavior:**
- Edge weights must be non-negative. Zero-weight edges are treated as zero-cost connections.
- To reconstruct a path from source to target, walk backwards through `predecessors` from target to source.
- Nodes unreachable from the source have `distances[i] = Infinity` and `predecessors[i] = -1`.

---

## Community Detection

### `communityDetection`

```ts
function communityDetection(
  adjacency: Float64Array,
  nNodes: number
): CommunityResult
```

Detects communities in an undirected graph using label propagation.

| Parameter | Type | Description |
|-----------|------|-------------|
| `adjacency` | `Float64Array` | Adjacency matrix (nNodes x nNodes), row-major, symmetric. `adjacency[i][j]` > 0 indicates an edge between node i and node j. |
| `nNodes` | `number` | Number of nodes in the graph |

**Returns:** `CommunityResult`

```ts
interface CommunityResult {
  labels: Uint32Array;         // Community assignment per node (length nNodes). Labels are 0-based contiguous integers.
  nCommunities: number;        // Number of detected communities
}
```

**Behavior:**
- Each node is initialized with a unique label.
- In each iteration, each node adopts the label most frequent among its neighbors (ties broken arbitrarily).
- Convergence is reached when no node changes label.
- Results are non-deterministic due to tie-breaking and iteration order. Use a fixed seed for reproducibility (set via global PRNG state).

---

## Usage Notes

- All adjacency matrices are dense, row-major `Float64Array` of shape (nNodes x nNodes).
- For sparse graphs, consider converting your sparse representation to dense before calling these functions. Memory usage is O(nNodes^2).
- `pagerank` and `shortestPath` operate on directed graphs. `communityDetection` operates on undirected graphs (the adjacency matrix should be symmetric).
- For `shortestPath`, use 0.0 or `Infinity` to indicate the absence of an edge. The algorithm treats any value <= 0 as no edge.
