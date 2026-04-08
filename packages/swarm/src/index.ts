/**
 * @pictl/swarm — Autonomic swarm coordinator for wasm4pm
 *
 * Exports:
 *   - createSwarmMcpServer: start the MCP server programmatically
 *   - runSwarm: run the Vercel AI SDK swarm loop
 *   - Worker registry and convergence utilities
 */

export { runSwarm } from './loop.js'
export type { SwarmConfig, SwarmArtifact, SwarmEpisode } from './loop.js'

export {
  spawnWorker,
  getWorker,
  listWorkers,
  dissolveWorkers,
  getSwarmId,
} from './worker-registry.js'

export {
  hashOutput,
  checkConvergence,
  checkSwarmConvergence,
  checkMlConvergence,
} from './convergence.js'

export { aggregate } from './aggregation.js'
export type { AggregationStrategy } from './aggregation.js'

export { sendDirective } from './directive-bus.js'

export type {
  WorkerState,
  WorkerResult,
  WorkerStatus,
  SwarmConvergenceReport,
  Directive,
} from './types.js'
