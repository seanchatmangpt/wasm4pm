# @wasm4pm/swarm

Multi-worker coordinator with convergence detection for parallel process mining.

## Features

- Parallel worker spawning with configurable pool size
- Convergence detection across workers
- Result aggregation and deduplication
- MCP server integration (`createSwarmMcpServer()`)

## Usage

```typescript
import { SwarmCoordinator } from '@wasm4pm/swarm';

const swarm = new SwarmCoordinator({ workers: 4 });
await swarm.discover(logHandle, ['dfg', 'alpha_plus_plus', 'heuristic_miner']);
const results = await swarm.converge();
```

## Convergence Criteria

Workers are considered converged when results stabilize across iterations (configurable threshold).
