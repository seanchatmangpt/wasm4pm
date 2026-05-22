# Community Detection

Discover groups of densely connected nodes using label propagation.

## What You'll Learn

- Detecting communities in a graph
- Reading community labels
- Understanding the number of detected communities

## Prerequisites

```typescript
import { init, communityDetection } from '@seanchatmangpt/wminml';
await init();
```

## Basic Usage

`communityDetection` returns a flat array: `[nCommunities, label0, label1, ..., labelN]`

```typescript
// 6-node graph with two clear communities
const adjacency = new Float64Array([
  // Community A: nodes 0,1,2
  0, 1, 1, 0, 0, 0,  // node 0
  1, 0, 1, 0, 0, 0,  // node 1
  1, 1, 0, 0, 0, 0,  // node 2
  // Community B: nodes 3,4,5
  0, 0, 0, 0, 1, 1,  // node 3
  0, 0, 0, 1, 0, 1,  // node 4
  0, 0, 0, 1, 1, 0,  // node 5
]);
const nNodes = 6;

const result = communityDetection(adjacency, nNodes);

const nCommunities = result[0];
const labels = result.slice(1);

console.log(`Number of communities: ${nCommunities}`);
console.log(`Labels: [${labels.join(', ')}]`);
// Expected: 2 communities, e.g., [0, 0, 0, 1, 1, 1]
```

## Understanding the Output

| Field | Description |
|-------|-------------|
| `result[0]` | Number of detected communities |
| `result[1..1+N]` | Community label for each node (0-indexed) |

## Grouping Nodes by Community

```typescript
const communities = {};
for (let i = 0; i < nNodes; i++) {
  const label = labels[i];
  if (!communities[label]) communities[label] = [];
  communities[label].push(i);
}

for (const [label, nodes] of Object.entries(communities)) {
  console.log(`Community ${label}: nodes [${nodes.join(', ')}]`);
}
```

## Graph with Bridges

```typescript
// Two communities connected by a single bridge edge
const bridge = new Float64Array([
  0, 1, 1, 1, 0, 0,  // node 0: connected to 1,2,3
  1, 0, 1, 0, 0, 0,  // node 1: connected to 0,2
  1, 1, 0, 0, 0, 0,  // node 2: connected to 0,1
  1, 0, 0, 0, 1, 1,  // node 3: bridge to community B
  0, 0, 0, 1, 0, 1,  // node 4
  0, 0, 0, 1, 1, 0,  // node 5
]);

const result = communityDetection(bridge, 6);
const nComm = result[0];
console.log(`Detected ${nComm} communities`);
```

## Tips

- Label propagation is a randomized algorithm. Different graph structures may produce different results.
- Nodes with no edges form their own community.
- The algorithm works best on undirected graphs (symmetric adjacency matrices).
- Use `communityDetection` as a quick first pass; follow up with more sophisticated methods if needed.
- The adjacency matrix is row-major: `adjacency[i * nNodes + j]` is the weight from node i to node j.
