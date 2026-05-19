/**
 * Tests for `swarmArtifactToOcel` and `swarmResultToOcelJsonl`.
 *
 * Oracle ranks used:
 *   Rank 1 — Mathematical invariant (event counts, uniqueness, field completeness)
 *   Rank 2 — Domain contract (activity names, omap references, vmap keys)
 *   Rank 3 — Metamorphic relation (converged → +1 event; failed worker → failed flag)
 */

import { describe, it, expect } from 'vitest';
import { isValidOcelEvent, fromMcppNativeJsonl } from '@wasm4pm/contracts';
import { swarmArtifactToOcel, swarmResultToOcelJsonl } from '../ocel-export.js';
import type { SwarmArtifact, WorkerResult } from '../types.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const UUID_V4 = '550e8400-e29b-41d4-a716-446655440000';
const NOW_ISO = '2026-05-18T12:00:00.000Z';
const RUN_ID = 'test-run-00000001';

function makeWorkerResult(overrides: Partial<WorkerResult> = {}): WorkerResult {
  return {
    workerId: 'worker-1',
    algorithmId: 'dfg',
    resultHash: 'deadbeef1234',
    result: { nodes: ['A', 'B'], edges: [] },
    runAt: NOW_ISO,
    durationMs: 42,
    resultType: 'discovery',
    ...overrides,
  };
}

function makeSwarmArtifact(
  results: WorkerResult[] = [makeWorkerResult()],
  converged = true,
): SwarmArtifact {
  return {
    episodes: [
      {
        episodeId: UUID_V4,
        ep: 1,
        workerResults: results,
        convergenceReport: {
          algorithm: 'dfg',
          converged,
          consensusRatio: converged ? 1.0 : 0.5,
          dominantHash: converged ? 'deadbeef1234' : null,
          dissentingWorkers: [],
          totalChecked: results.length,
          convergenceReason: converged
            ? `${results.length}/${results.length} workers agree`
            : 'not enough agreement',
        },
      },
    ],
    finalWorkerResults: results,
    converged,
    failedWorkers: results.filter((r) => r.failed).map((r) => r.workerId),
    healthyWorkerCount: results.filter((r) => !r.failed).length,
  };
}

// ---------------------------------------------------------------------------
// swarmArtifactToOcel — event count
// ---------------------------------------------------------------------------

describe('swarmArtifactToOcel — event count (Rank 1 — completeness)', () => {
  it('single worker + converged → exactly 3 events (2 worker + 1 convergence)', () => {
    const artifact = makeSwarmArtifact([makeWorkerResult()], true);
    const events = swarmArtifactToOcel(artifact, RUN_ID);
    expect(events).toHaveLength(3);
  });

  it('single worker + not converged → exactly 2 events (no convergence event)', () => {
    const artifact = makeSwarmArtifact([makeWorkerResult()], false);
    const events = swarmArtifactToOcel(artifact, RUN_ID);
    expect(events).toHaveLength(2);
  });

  it('N workers + converged → exactly 2N + 1 events', () => {
    const workers = [
      makeWorkerResult({ workerId: 'w1', algorithmId: 'dfg' }),
      makeWorkerResult({ workerId: 'w2', algorithmId: 'heuristic_miner' }),
      makeWorkerResult({ workerId: 'w3', algorithmId: 'inductive_miner' }),
    ];
    const artifact = makeSwarmArtifact(workers, true);
    const events = swarmArtifactToOcel(artifact, RUN_ID);
    expect(events).toHaveLength(2 * workers.length + 1);
  });

  it('N workers + not converged → exactly 2N events', () => {
    const workers = [
      makeWorkerResult({ workerId: 'w1' }),
      makeWorkerResult({ workerId: 'w2' }),
    ];
    const artifact = makeSwarmArtifact(workers, false);
    const events = swarmArtifactToOcel(artifact, RUN_ID);
    expect(events).toHaveLength(2 * workers.length);
  });

  it('empty finalWorkerResults + converged = 1 event (just convergence)', () => {
    const artifact = makeSwarmArtifact([], true);
    const events = swarmArtifactToOcel(artifact, RUN_ID);
    expect(events).toHaveLength(1);
    expect(events[0]?.['ocel:activity']).toBe('swarm.converged');
  });
});

// ---------------------------------------------------------------------------
// swarmArtifactToOcel — structural validity (Rank 1)
// ---------------------------------------------------------------------------

describe('swarmArtifactToOcel — structural validity (Rank 1 — field completeness)', () => {
  it('all events pass isValidOcelEvent guard', () => {
    const workers = [
      makeWorkerResult({ workerId: 'w1', algorithmId: 'dfg' }),
      makeWorkerResult({ workerId: 'w2', algorithmId: 'ilp' }),
    ];
    const artifact = makeSwarmArtifact(workers, true);
    const events = swarmArtifactToOcel(artifact, RUN_ID);

    for (const event of events) {
      expect(isValidOcelEvent(event)).toBe(true);
    }
  });

  it('all event IDs are unique (Rank 1 — no aliasing)', () => {
    const workers = [
      makeWorkerResult({ workerId: 'w1', algorithmId: 'dfg' }),
      makeWorkerResult({ workerId: 'w2', algorithmId: 'dfg' }),
      makeWorkerResult({ workerId: 'w3', algorithmId: 'dfg' }),
    ];
    const artifact = makeSwarmArtifact(workers, true);
    const events = swarmArtifactToOcel(artifact, RUN_ID);
    const eids = events.map((e) => e['ocel:eid']);
    const unique = new Set(eids);
    expect(unique.size).toBe(events.length);
  });

  it('all timestamps are valid ISO-8601 strings (Rank 1 — temporal soundness)', () => {
    const artifact = makeSwarmArtifact([makeWorkerResult()], true);
    const events = swarmArtifactToOcel(artifact, RUN_ID);

    for (const event of events) {
      const ts = event['ocel:timestamp'];
      expect(typeof ts).toBe('string');
      expect(ts).toContain('T');
      expect(isNaN(new Date(ts).getTime())).toBe(false);
    }
  });

  it('all ocel:omap arrays reference the supplied runId', () => {
    const artifact = makeSwarmArtifact([makeWorkerResult()], true);
    const events = swarmArtifactToOcel(artifact, RUN_ID);

    for (const event of events) {
      expect(event['ocel:omap']).toContain(RUN_ID);
    }
  });
});

// ---------------------------------------------------------------------------
// swarmArtifactToOcel — activity names (Rank 2 — domain contract)
// ---------------------------------------------------------------------------

describe('swarmArtifactToOcel — activity names (Rank 2 — domain contract)', () => {
  it('first event for each worker is swarm.worker.start', () => {
    const workers = [
      makeWorkerResult({ workerId: 'w1', algorithmId: 'dfg' }),
      makeWorkerResult({ workerId: 'w2', algorithmId: 'ilp' }),
    ];
    const artifact = makeSwarmArtifact(workers, false);
    const events = swarmArtifactToOcel(artifact, RUN_ID);

    // Events are ordered: [start(w1), complete(w1), start(w2), complete(w2)]
    expect(events[0]?.['ocel:activity']).toBe('swarm.worker.start');
    expect(events[2]?.['ocel:activity']).toBe('swarm.worker.start');
  });

  it('second event for each worker is swarm.worker.complete', () => {
    const workers = [
      makeWorkerResult({ workerId: 'w1' }),
      makeWorkerResult({ workerId: 'w2' }),
    ];
    const artifact = makeSwarmArtifact(workers, false);
    const events = swarmArtifactToOcel(artifact, RUN_ID);

    expect(events[1]?.['ocel:activity']).toBe('swarm.worker.complete');
    expect(events[3]?.['ocel:activity']).toBe('swarm.worker.complete');
  });

  it('convergence event activity is swarm.converged', () => {
    const artifact = makeSwarmArtifact([makeWorkerResult()], true);
    const events = swarmArtifactToOcel(artifact, RUN_ID);
    const last = events[events.length - 1];
    expect(last?.['ocel:activity']).toBe('swarm.converged');
  });
});

// ---------------------------------------------------------------------------
// swarmArtifactToOcel — vmap contents (Rank 2 — domain contract)
// ---------------------------------------------------------------------------

describe('swarmArtifactToOcel — vmap contents (Rank 2 — provenance chain)', () => {
  it('complete event vmap carries result_hash', () => {
    const artifact = makeSwarmArtifact(
      [makeWorkerResult({ resultHash: 'cafebabe99' })],
      false,
    );
    const events = swarmArtifactToOcel(artifact, RUN_ID);
    const completeEvent = events.find((e) => e['ocel:activity'] === 'swarm.worker.complete');
    expect(completeEvent?.['ocel:vmap']['result_hash']).toBe('cafebabe99');
  });

  it('complete event vmap carries duration_ms', () => {
    const artifact = makeSwarmArtifact(
      [makeWorkerResult({ durationMs: 137 })],
      false,
    );
    const events = swarmArtifactToOcel(artifact, RUN_ID);
    const completeEvent = events.find((e) => e['ocel:activity'] === 'swarm.worker.complete');
    expect(completeEvent?.['ocel:vmap']['duration_ms']).toBe(137);
  });

  it('complete event vmap carries worker_id and algorithm_id', () => {
    const artifact = makeSwarmArtifact(
      [makeWorkerResult({ workerId: 'wrkr-X', algorithmId: 'ilp' })],
      false,
    );
    const events = swarmArtifactToOcel(artifact, RUN_ID);
    const completeEvent = events.find((e) => e['ocel:activity'] === 'swarm.worker.complete');
    expect(completeEvent?.['ocel:vmap']['worker_id']).toBe('wrkr-X');
    expect(completeEvent?.['ocel:vmap']['algorithm_id']).toBe('ilp');
  });

  it('convergence event vmap carries episode_count and healthy_worker_count', () => {
    const workers = [makeWorkerResult({ workerId: 'w1' }), makeWorkerResult({ workerId: 'w2' })];
    const artifact = makeSwarmArtifact(workers, true);
    const events = swarmArtifactToOcel(artifact, RUN_ID);
    const convergedEvent = events.find((e) => e['ocel:activity'] === 'swarm.converged');
    expect(convergedEvent?.['ocel:vmap']['healthy_worker_count']).toBe(2);
    expect(convergedEvent?.['ocel:vmap']['episode_count']).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Metamorphic: failed worker (Rank 3)
// ---------------------------------------------------------------------------

describe('swarmArtifactToOcel — failed worker (Rank 3 — metamorphic)', () => {
  it('failed worker complete event carries failed=true and error in vmap', () => {
    const artifact = makeSwarmArtifact(
      [makeWorkerResult({ failed: true, error: 'worker timeout' })],
      false,
    );
    const events = swarmArtifactToOcel(artifact, RUN_ID);
    const completeEvent = events.find((e) => e['ocel:activity'] === 'swarm.worker.complete');
    expect(completeEvent?.['ocel:vmap']['failed']).toBe(true);
    expect(completeEvent?.['ocel:vmap']['error']).toBe('worker timeout');
  });

  it('healthy worker complete event carries failed=false (default)', () => {
    const artifact = makeSwarmArtifact([makeWorkerResult()], false);
    const events = swarmArtifactToOcel(artifact, RUN_ID);
    const completeEvent = events.find((e) => e['ocel:activity'] === 'swarm.worker.complete');
    expect(completeEvent?.['ocel:vmap']['failed']).toBe(false);
    expect('error' in (completeEvent?.['ocel:vmap'] ?? {})).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// swarmResultToOcelJsonl — NDJSON serialisation
// ---------------------------------------------------------------------------

describe('swarmResultToOcelJsonl — NDJSON serialisation (Rank 1 — format soundness)', () => {
  it('produces a non-empty string', () => {
    const artifact = makeSwarmArtifact([makeWorkerResult()], true);
    const ndjson = swarmResultToOcelJsonl(artifact, RUN_ID);
    expect(typeof ndjson).toBe('string');
    expect(ndjson.length).toBeGreaterThan(0);
  });

  it('each line is parseable JSON', () => {
    const workers = [makeWorkerResult({ workerId: 'w1' }), makeWorkerResult({ workerId: 'w2' })];
    const artifact = makeSwarmArtifact(workers, true);
    const ndjson = swarmResultToOcelJsonl(artifact, RUN_ID);
    const lines = ndjson.split('\n').filter((l) => l.trim().length > 0);

    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  });

  it('line count equals swarmArtifactToOcel event count', () => {
    const workers = [makeWorkerResult({ workerId: 'w1' }), makeWorkerResult({ workerId: 'w2' })];
    const artifact = makeSwarmArtifact(workers, true);
    const events = swarmArtifactToOcel(artifact, RUN_ID);
    const ndjson = swarmResultToOcelJsonl(artifact, RUN_ID);
    const lines = ndjson.split('\n').filter((l) => l.trim().length > 0);

    expect(lines).toHaveLength(events.length);
  });

  it('does not have a trailing newline', () => {
    const artifact = makeSwarmArtifact([makeWorkerResult()], false);
    const ndjson = swarmResultToOcelJsonl(artifact, RUN_ID);
    expect(ndjson.endsWith('\n')).toBe(false);
  });

  it('round-trip via fromMcppNativeJsonl returns valid events', () => {
    // fromMcppNativeJsonl accepts both native mcpp flat format and ocel: format
    const artifact = makeSwarmArtifact([makeWorkerResult()], true);
    const ndjson = swarmResultToOcelJsonl(artifact, RUN_ID);
    const parsed = fromMcppNativeJsonl(ndjson);

    expect(parsed).toHaveLength(3); // 2 worker + 1 convergence
    for (const event of parsed) {
      expect(isValidOcelEvent(event)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// runId stability (Rank 2 — determinism contract)
// ---------------------------------------------------------------------------

describe('swarmArtifactToOcel — runId stability (Rank 2 — determinism)', () => {
  it('supplied runId appears in all event ocel:omap arrays', () => {
    const artifact = makeSwarmArtifact(
      [makeWorkerResult({ workerId: 'w1' }), makeWorkerResult({ workerId: 'w2' })],
      true,
    );
    const stableId = 'stable-run-999';
    const events = swarmArtifactToOcel(artifact, stableId);

    for (const event of events) {
      expect(event['ocel:omap']).toContain(stableId);
    }
  });

  it('omitting runId still produces a non-empty omap per event', () => {
    const artifact = makeSwarmArtifact([makeWorkerResult()], false);
    // No runId supplied — UUID generated internally
    const events = swarmArtifactToOcel(artifact);

    for (const event of events) {
      expect(event['ocel:omap'].length).toBeGreaterThan(0);
      expect(typeof event['ocel:omap'][0]).toBe('string');
    }
  });
});
