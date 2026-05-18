/**
 * @wasm4pm/swarm — Autonomic swarm coordinator for wasm4pm
 *
 * Exports:
 *   - createSwarmMcpServer: start the MCP server programmatically
 *   - runSwarm: run the Vercel AI SDK swarm loop
 *   - Worker registry and convergence utilities
 */

export { runSwarm } from './loop.js';
export type { SwarmConfig, SwarmArtifact, SwarmEpisode, WorkerSpec } from './loop.js';

export {
  spawnWorker,
  getWorker,
  listWorkers,
  dissolveWorkers,
  getSwarmId,
} from './worker-registry.js';

export {
  hashOutput,
  checkConvergence,
  checkSwarmConvergence,
  checkMlConvergence,
} from './convergence.js';

export {
  AlgorithmConsensus,
  computeQualityScore,
} from './algorithm-consensus.js';
export type { LogStats, AlgorithmPerformance, ConsensusDecision } from './algorithm-consensus.js';

export { ConsensusLogger, getConsensusLogger, resetConsensusLogger } from './consensus-logger.js';
export type { ConsensusLogEntry } from './consensus-logger.js';

export { aggregate } from './aggregation.js';
export type { AggregationStrategy } from './aggregation.js';

export { sendDirective } from './directive-bus.js';

export type {
  WorkerState,
  WorkerResult,
  WorkerStatus,
  SwarmConvergenceReport,
  Directive,
} from './types.js';

export { ConvergenceMaxIterationsError, ConvergenceTimeoutError } from './types.js';

// BEAM actor message bridge (A-P09 constraint enforcement)
export {
  assertNotAccept,
  convergenceToBeam,
  workerResultToBeam,
  exhaustionToBeam,
  type BeamMessage,
} from './beam-bridge.js';

// Typed span-name constants for mcpp LIVE-09 correlation (GAP-3 fix)
export { SWARM_SPAN_NAMES } from './span-names.js';
export type { SwarmSpanName } from './span-names.js';

// POWL gap lifecycle span event emitters (LIVE-09)
export {
  emitGapDetected,
  emitGapClosed,
  emitGapExhausted,
  emitGapAlternateEvidence,
  type GapDetectedEvent,
  type GapClosedEvent,
  type GapExhaustedEvent,
  type GapAlternateEvidenceEvent,
  type GapTraceRecord,
} from './gap-events.js';

// Route refinement policy (8-variant ladder)
export {
  ROUTE_REFINEMENT_ANDON,
  createAttempt,
  isLIVE09bViolation,
  selectNextVariant,
  shouldEscalate,
  type DiscoveryVariant,
  type RouteRefinementVariant,
  type RefinementAttempt,
} from './route-refinement.js';

// Refinement orchestrator (stateful ladder runner)
export {
  initRefinementState,
  stepRefinement,
  serializeState,
  deserializeState,
  getGapEvents,
  type RefinementState,
  type RefinementContext,
  type RefinementAction,
  type StepResult,
} from './refinement-orchestrator.js';

// OCEL 2.0 serialiser — closes GAP-2 (mcpp offline POWL discovery)
export { swarmArtifactToOcel, swarmResultToOcelJsonl } from './ocel-export.js';

// Shared route-refinement spec and validator — closes GAP-4
// (TS ladder + Rust mcpp-automl ladder both validated against this shared JSON spec)
export {
  validateRefinementLadder,
  REFINEMENT_ANDON_SIGNAL,
  SPEC_VARIANT_COUNT,
  getSpecVariants,
  REFINEMENT_SPEC,
  type ValidationResult,
} from './route-refinement-validator.js';

// BEAM message format shared schema and validator — closes GAP-1
// (typed schema for Erlang/AtomVM ↔ wasm4pm swarm protocol messages)
export {
  BEAM_PID_PATTERN,
  BEAM_REF_PATTERN,
  validateBeamMsg,
  validateBeamMonitor,
  parseBeamMessage,
  type BeamMsg,
  type BeamMonitor,
  type BeamMessage as BeamMessageSchema,
  type BeamMsgPayload,
  type BeamMonitorEvent,
} from './beam-message-validator.js';
