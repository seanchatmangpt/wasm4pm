/**
 * OCEL 2.0 serialiser for SwarmArtifact.
 *
 * Converts a completed `SwarmArtifact` into an array of `OcelEvent` objects
 * consumable by mcpp's offline POWL route discovery pipeline.
 *
 * Event model per WorkerResult (2 events each):
 *   1. `swarm.worker.start`    — records algorithm identity at the worker run start
 *   2. `swarm.worker.complete` — records outcome metrics at the worker run end
 *
 * Additionally, when `artifact.converged` is true:
 *   3. `swarm.converged` — one aggregate convergence event at the end
 *
 * Object map (`ocel:omap`) for every event references the swarm run identifier
 * so that mcpp's POWL miner can group events by object lifecycle.
 *
 * Closes GAP-2 documented in `mcpp-swarm-coordination.test.ts`:
 *   "SwarmArtifact has no built-in OCEL serializer."
 */

import { v4 as uuidv4 } from 'uuid';
import type { OcelEvent } from '@wasm4pm/contracts';
import { toOcelJsonl, fromMcppNativeJsonl } from '@wasm4pm/contracts';
import type { SwarmArtifact, WorkerResult } from './types.js';

// Re-export contracts helpers so callers don't need two imports
export { toOcelJsonl, fromMcppNativeJsonl };

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Returns an ISO-8601 timestamp offset by `offsetMs` milliseconds from `base`.
 * Used to synthesise a plausible start time from `runAt` and `durationMs`.
 */
function subtractMs(isoTimestamp: string, offsetMs: number): string {
  const t = new Date(isoTimestamp).getTime();
  // If the timestamp is invalid, fall back to the original value
  if (isNaN(t)) return isoTimestamp;
  return new Date(t - offsetMs).toISOString();
}

/**
 * Builds a single `swarm.worker.start` event for a WorkerResult.
 *
 * @param result - The completed WorkerResult
 * @param eventIndex - Position of this result in `finalWorkerResults` (for unique eid)
 * @param runRef - Swarm run identifier used as the object reference
 */
function workerStartEvent(
  result: WorkerResult,
  eventIndex: number,
  runRef: string,
): OcelEvent {
  const startTimestamp = subtractMs(result.runAt, result.durationMs);
  return {
    'ocel:eid': `swarm_${result.workerId}_${result.algorithmId}_${eventIndex}_start`,
    'ocel:activity': 'swarm.worker.start',
    'ocel:timestamp': startTimestamp,
    'ocel:omap': [runRef],
    'ocel:vmap': {
      worker_id: result.workerId,
      algorithm_id: result.algorithmId,
      swarm_run_id: runRef,
    },
  };
}

/**
 * Builds a single `swarm.worker.complete` event for a WorkerResult.
 *
 * @param result - The completed WorkerResult
 * @param eventIndex - Position of this result in `finalWorkerResults` (for unique eid)
 * @param runRef - Swarm run identifier used as the object reference
 */
function workerCompleteEvent(
  result: WorkerResult,
  eventIndex: number,
  runRef: string,
): OcelEvent {
  const vmap: Record<string, unknown> = {
    worker_id: result.workerId,
    algorithm_id: result.algorithmId,
    result_hash: result.resultHash,
    duration_ms: result.durationMs,
    failed: result.failed ?? false,
    swarm_run_id: runRef,
  };
  if (result.error !== undefined) {
    vmap['error'] = result.error;
  }

  return {
    'ocel:eid': `swarm_${result.workerId}_${result.algorithmId}_${eventIndex}_complete`,
    'ocel:activity': 'swarm.worker.complete',
    'ocel:timestamp': result.runAt,
    'ocel:omap': [runRef],
    'ocel:vmap': vmap,
  };
}

/**
 * Builds the `swarm.converged` aggregate event emitted once for a converged artifact.
 *
 * The timestamp is derived from the last worker's `runAt` to reflect the point in
 * time when the final worker result was recorded (convergence can only be declared
 * after all workers complete).
 *
 * @param artifact - The converged SwarmArtifact
 * @param runRef - Swarm run identifier used as the object reference
 */
function swarmConvergedEvent(artifact: SwarmArtifact, runRef: string): OcelEvent {
  // Use the latest runAt among all final worker results, or current time as fallback
  const timestamps = artifact.finalWorkerResults
    .map((r) => r.runAt)
    .filter((ts) => !isNaN(new Date(ts).getTime()))
    .sort();
  const convergenceTimestamp = timestamps[timestamps.length - 1] ?? new Date().toISOString();

  return {
    'ocel:eid': `swarm_${runRef}_converged`,
    'ocel:activity': 'swarm.converged',
    'ocel:timestamp': convergenceTimestamp,
    'ocel:omap': [runRef],
    'ocel:vmap': {
      swarm_run_id: runRef,
      total_workers: artifact.finalWorkerResults.length,
      healthy_worker_count: artifact.healthyWorkerCount,
      failed_workers: artifact.failedWorkers,
      episode_count: artifact.episodes.length,
      converged: artifact.converged,
    },
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Converts a `SwarmArtifact` into an array of OCEL 2.0 events.
 *
 * Each `WorkerResult` in `artifact.finalWorkerResults` produces exactly two events:
 *   - `swarm.worker.start`    (synthesised start time = runAt − durationMs)
 *   - `swarm.worker.complete` (at runAt, carrying resultHash, durationMs, etc.)
 *
 * If `artifact.converged` is true, one additional `swarm.converged` event is appended.
 *
 * The `runId` parameter is the logical swarm run identifier used as the OCEL object
 * reference (`ocel:omap`). If omitted, a fresh UUID v4 is generated — callers that
 * need stable cross-call identities should supply their own.
 *
 * @param artifact - A completed SwarmArtifact (converged or timed-out)
 * @param runId    - Optional stable run identifier (defaults to a new UUID v4)
 * @returns Array of OcelEvent objects suitable for mcpp's offline POWL discovery
 */
export function swarmArtifactToOcel(artifact: SwarmArtifact, runId?: string): OcelEvent[] {
  const runRef = runId ?? uuidv4();

  const events: OcelEvent[] = [];

  artifact.finalWorkerResults.forEach((result, index) => {
    events.push(workerStartEvent(result, index, runRef));
    events.push(workerCompleteEvent(result, index, runRef));
  });

  if (artifact.converged) {
    events.push(swarmConvergedEvent(artifact, runRef));
  }

  return events;
}

/**
 * Serialises a `SwarmArtifact` to NDJSON (newline-delimited JSON) in OCEL 2.0 format.
 *
 * Each event becomes one JSON line; the string ends without a trailing newline.
 * The output is directly consumable by mcpp's POWL route discovery pipeline.
 *
 * @param artifact - A completed SwarmArtifact (converged or timed-out)
 * @param runId    - Optional stable run identifier (defaults to a new UUID v4)
 * @returns NDJSON string with one OCEL event per line
 */
export function swarmResultToOcelJsonl(artifact: SwarmArtifact, runId?: string): string {
  return toOcelJsonl(swarmArtifactToOcel(artifact, runId));
}
