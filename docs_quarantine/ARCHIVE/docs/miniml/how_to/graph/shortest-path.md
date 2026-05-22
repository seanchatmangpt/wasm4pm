# Shortest Path

Find the shortest distances from a source node to all other nodes using Dijkstra's algorithm.

## What You'll Learn

- Computing shortest path distances
- Reconstructing paths using predecessors
- Working with weighted graphs

## Prerequisites

```typescript
import { init, shortestPath } from '@seanchatmangpt/wminml';
await init();
```

## Basic Usage

`shortestPath` returns a flat array: `[source, dist0, dist1, ..., distN, pred0, pred1, ..., predN]`

```typescript
// 4-node graph with weighted edges
const adjacency = new Float64Array([
  0,  4,  2, 0,  // node 0: to 1 (w=4), to 2 (w=2)
  4,  0,  1, 5,  // node 1: to 0 (w=4), to 2 (w=1), to 3 (w=5)
  2,  1,  0, 8,  // node 2: to 0 (w=2), to 1 (w=1), to 3 (w=8)
  0,  5,  8, 0,  // node 3: to 1 (w=5), to 2 (w=8)
]);
const nNodes = 4;
const source = 0;

const result = shortestPath(adjacency, nNodes, source);

const src = result[0];
const distances = result.slice(1, 1 + nNodes);
const predecessors = result.slice(1 + nNodes, 1 + 2 * nNodes);

console.log(`Source: ${src}`);
console.log(`Distances: [${distances.map(d => d === Infinity ? 'inf' : d.toFixed(1)).join(', ')}]`);
console.log(`Predecessors: [${predecessors.map(p => p < 0 ? '-' : p).join(', ')}]`);
```

## Reconstructing a Path

Follow predecessors backwards from the target to the source.

```typescript
function reconstructPath(predecessors, source, target) {
  const path = [target];
  let current = target;
  while (current !== source && predecessors[current] >= 0) {
    current = predecessors[current];
    path.push(current);
  }
  if (current !== source) return null; // no path exists
  return path.reverse();
}

const path = reconstructPath(predecessors, 0, 3);
console.log(`Shortest path 0 -> 3: ${path.join(' -> ')}`);
// e.g., [0, 2, 1, 3] with total distance 2+1+5=8
```

## Understanding the Output

| Field | Description |
|-------|-------------|
| `result[0]` | Source node index |
| `result[1..1+N]` | Shortest distance from source to each node (Infinity if unreachable) |
| `result[1+N..1+2N]` | Predecessor of each node in the shortest path tree (-1 if none) |

## Unweighted Graphs

Use 1.0 for all edge weights to find the minimum-hop path.

```typescript
const unweighted = new Float64Array([
  0, 1, 1, 0,
  1, 0, 0, 1,
  1, 0, 0, 1,
  0, 1, 1, 0,
]);

const result = shortestPath(unweighted, 4, 0);
const distances = result.slice(1, 5);
// distances = [0, 1, 1, 2]
```

## Tips

- Zero values in the adjacency matrix mean no edge (except self-loops).
- Negative edge weights are not supported (use Bellman-Ford for that).
- Distance to the source node is always 0.
- Unreachable nodes have distance `Infinity`.
- The adjacency matrix is row-major and must be square (nNodes x nNodes).
