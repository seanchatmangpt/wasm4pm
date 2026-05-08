# PageRank

Rank nodes in a graph by their importance using the PageRank algorithm.

## What You'll Learn

- Computing PageRank scores from an adjacency matrix
- Understanding damping factor and convergence
- Identifying the most important nodes in a network

## Prerequisites

```typescript
import { init, pageRank } from '@seanchatmangpt/wminml';
await init();
```

## Basic Usage

`pageRank` returns a flat array: `[converged, iterations, score0, score1, ..., scoreN]`

```typescript
// 3-node graph:
//   0 -> 1, 0 -> 2
//   1 -> 2
//   2 -> 0
const adjacency = new Float64Array([
  0, 1, 1,  // node 0 links to 1 and 2
  0, 0, 1,  // node 1 links to 2
  1, 0, 0,  // node 2 links to 0
]);
const nNodes = 3;

const result = pageRank(adjacency, nNodes, 0.85, 100, 1e-10);

const converged = result[0];
const iterations = result[1];
const scores = result.slice(2);

console.log(`Converged: ${converged === 1}`);
console.log(`Iterations: ${iterations}`);
console.log(`Scores: [${scores.map(s => s.toFixed(4)).join(', ')}]`);
```

## Understanding the Output

| Field | Description |
|-------|-------------|
| `result[0]` | 1.0 if converged, 0.0 otherwise |
| `result[1]` | Number of iterations used |
| `result[2..]` | PageRank score for each node (sum to 1.0) |

## Damping Factor

The damping factor (default 0.85) controls the probability of following a link vs. jumping randomly.

```typescript
// Low damping: more random jumps, scores more uniform
const low = pageRank(adjacency, nNodes, 0.5, 100, 1e-10);

// High damping: follow links more, scores reflect link structure
const high = pageRank(adjacency, nNodes, 0.95, 100, 1e-10);
```

## Practical Example: Finding Key Nodes

```typescript
// Web-like graph with 4 nodes
const web = new Float64Array([
  0, 1, 1, 0,  // A -> B, C
  0, 0, 1, 0,  // B -> C
  0, 0, 0, 1,  // C -> D
  1, 1, 0, 0,  // D -> A, B
]);

const result = pageRank(web, 4, 0.85, 100, 1e-10);
const scores = result.slice(2);

// Find the highest-ranked node
let maxIdx = 0;
for (let i = 1; i < 4; i++) {
  if (scores[i] > scores[maxIdx]) maxIdx = i;
}
console.log(`Most important node: ${maxIdx} (score: ${scores[maxIdx].toFixed(4)})`);
```

## Tips

- Adjacency matrix is row-major: `adjacency[i * nNodes + j]` is the weight from node i to node j.
- Non-zero values indicate edges. Values represent weights (use 1.0 for unweighted graphs).
- Damping must be strictly between 0 and 1 (exclusive).
- PageRank handles dangling nodes (nodes with no outgoing edges) automatically.
- Scores always sum to 1.0.
