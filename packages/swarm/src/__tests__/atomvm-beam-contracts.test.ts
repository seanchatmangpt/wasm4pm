/**
 * atomvm-beam-contracts.test.ts — AtomVM/BEAM runtime connection contract tests
 *
 * Validates the wasm4pm → mcpp → AtomVM/BEAM message protocol WITHOUT requiring
 * any runtime to be running. All tests are pure contract assertions over the
 * beam-bridge output types.
 *
 * Oracle ranks used:
 *   Rank 1 — mathematical invariants (tuple shape, atom format, JSON safety)
 *   Rank 2 — domain contracts (A-P09, Z-P09, CROSSRT X04/X05 skip protocol)
 *   Rank 3 — metamorphic relations (determinism, perturbation → output relation)
 *
 * mcpp CROSSRT reference: docs/CROSS_RUNTIME_VALIDATION.md Slice κ
 *   X04 — atomvm_layer_validated (SupportedSkip allowed when not available)
 *   X05 — erlang_layer_validated (SupportedSkip allowed)
 *   A-P09 — bridge must never emit tag "accepted"
 *   Z-P09 — route_coordinator must not appear as recommended source
 */

import { describe, it, expect } from 'vitest';
import {
  assertNotAccept,
  convergenceToBeam,
  workerResultToBeam,
  exhaustionToBeam,
  type BeamMessage,
} from '../beam-bridge.js';
import {
  ConvergenceMaxIterationsError,
  ConvergenceTimeoutError,
  type WorkerResult,
  type SwarmConvergenceReport,
} from '../types.js';

// ── Test helpers ──────────────────────────────────────────────────────────────

function makeWorkerResult(overrides: Partial<WorkerResult> = {}): WorkerResult {
  return {
    workerId: 'worker-log1-dfg',
    algorithmId: 'dfg',
    resultHash: 'abc123def456abc123def456abc123def456abc123def456abc123def456ab12',
    result: { nodes: [], edges: [] },
    runAt: '2026-05-17T00:00:00.000Z',
    durationMs: 42,
    ...overrides,
  };
}

function makeConvergenceReport(
  overrides: Partial<SwarmConvergenceReport> = {}
): SwarmConvergenceReport {
  return {
    algorithm: 'dfg',
    converged: true,
    consensusRatio: 1.0,
    dominantHash: 'abc123def456abc123def456abc123def456abc123def456abc123def456ab12',
    dissentingWorkers: [],
    totalChecked: 3,
    convergenceReason: '3/3 workers agree (unanimous)',
    ...overrides,
  };
}

/** All messages the bridge can produce from a complete swarm episode. */
function allBridgeMessages(): BeamMessage[] {
  const w = workerResultToBeam(makeWorkerResult(), 'discover_dfg');
  const c = convergenceToBeam(makeConvergenceReport({ converged: true, dominantHash: 'hash42' }));
  const e1 = exhaustionToBeam(new ConvergenceMaxIterationsError(10, 5, 0.3));
  const e2 = exhaustionToBeam(new ConvergenceTimeoutError(5, 5, 0.2));
  return [w, ...c, e1, e2];
}

/** Valid Erlang atom regex: starts with lowercase letter, followed by [a-z0-9_]* */
const ERLANG_ATOM_RE = /^[a-z][a-z0-9_]*$/;

// ── Rank 1: BeamMessage tuple shape invariants ────────────────────────────────

describe('Rank 1 — BeamMessage tuple shape invariants', () => {
  it('every message has exactly the fields "tag" and "payload" at top level', () => {
    for (const msg of allBridgeMessages()) {
      const keys = Object.keys(msg).sort();
      expect(keys).toEqual(['payload', 'tag']);
    }
  });

  it('tag is always a string (never undefined, null, number, or object)', () => {
    for (const msg of allBridgeMessages()) {
      expect(typeof msg.tag).toBe('string');
    }
  });

  it('payload is always a plain object (never null, array, or primitive)', () => {
    for (const msg of allBridgeMessages()) {
      expect(msg.payload).not.toBeNull();
      expect(typeof msg.payload).toBe('object');
      expect(Array.isArray(msg.payload)).toBe(false);
    }
  });

  it('convergenceToBeam with dissentingWorkers produces non-null payload for every message', () => {
    const report = makeConvergenceReport({
      converged: false,
      dissentingWorkers: ['w1', 'w2', 'w3'],
    });
    for (const msg of convergenceToBeam(report)) {
      expect(msg.payload).not.toBeNull();
      expect(msg.payload).not.toBeUndefined();
    }
  });
});

// ── Rank 1: Erlang atom format constraints ────────────────────────────────────

describe('Rank 1 — tags are valid Erlang atom format ([a-z][a-z0-9_]*)', () => {
  it('"collect" matches Erlang atom format', () => {
    expect('collect').toMatch(ERLANG_ATOM_RE);
  });

  it('"report_gap" matches Erlang atom format', () => {
    expect('report_gap').toMatch(ERLANG_ATOM_RE);
  });

  it('"activity" matches Erlang atom format', () => {
    expect('activity').toMatch(ERLANG_ATOM_RE);
  });

  it('"propagate_exhaustion" matches Erlang atom format', () => {
    expect('propagate_exhaustion').toMatch(ERLANG_ATOM_RE);
  });

  it('every tag produced by the bridge matches Erlang atom format', () => {
    for (const msg of allBridgeMessages()) {
      expect(msg.tag).toMatch(ERLANG_ATOM_RE);
    }
  });

  it('all tags are lowercase (no camelCase, no hyphens, no uppercase)', () => {
    for (const msg of allBridgeMessages()) {
      expect(msg.tag).toBe(msg.tag.toLowerCase());
      expect(msg.tag).not.toContain('-');
      expect(msg.tag).not.toMatch(/[A-Z]/);
    }
  });
});

// ── Rank 1: AtomVM JSON serialisation safety ──────────────────────────────────

describe('Rank 1 — AtomVM JSON encoding safety', () => {
  it('every message round-trips through JSON.stringify / JSON.parse without loss', () => {
    for (const msg of allBridgeMessages()) {
      const serialised = JSON.stringify(msg);
      const parsed = JSON.parse(serialised) as BeamMessage;
      expect(parsed.tag).toBe(msg.tag);
      expect(typeof parsed.payload).toBe('object');
    }
  });

  it('no payload value is undefined (undefined does not survive JSON round-trip)', () => {
    for (const msg of allBridgeMessages()) {
      const serialised = JSON.stringify(msg);
      expect(serialised).not.toContain('"undefined"');
      // Verify the round-trip does not introduce undefined fields
      const parsed = JSON.parse(serialised) as Record<string, unknown>;
      for (const val of Object.values(parsed['payload'] as Record<string, unknown>)) {
        expect(val).not.toBeUndefined();
      }
    }
  });

  it('all numeric payload fields are finite (no NaN, no Infinity)', () => {
    const msg = workerResultToBeam(makeWorkerResult({ durationMs: 99 }), 'act');
    for (const val of Object.values(msg.payload)) {
      if (typeof val === 'number') {
        expect(Number.isFinite(val)).toBe(true);
      }
    }
  });

  it('duration_ms of 0 survives JSON round-trip as 0 (not coerced to falsy omission)', () => {
    const msg = workerResultToBeam(makeWorkerResult({ durationMs: 0 }), 'act');
    const parsed = JSON.parse(JSON.stringify(msg)) as { payload: Record<string, unknown> };
    expect(parsed.payload['duration_ms']).toBe(0);
  });
});

// ── Rank 2: A-P09 — bridge never emits "accepted" ────────────────────────────

describe('Rank 2 — A-P09: bridge never emits tag "accepted"', () => {
  it('none of the four bridge functions produce tag="accepted" in any configuration', () => {
    for (const msg of allBridgeMessages()) {
      expect(msg.tag).not.toBe('accepted');
    }
  });

  it('assertNotAccept throws synchronously — no async escape hatch', () => {
    const forbidden: BeamMessage = { tag: 'accepted', payload: {} };
    let threw = false;
    try {
      assertNotAccept(forbidden);
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });

  it('assertNotAccept error is an instance of Error (not a raw string throw)', () => {
    const forbidden: BeamMessage = { tag: 'accepted', payload: {} };
    let caught: unknown = null;
    try {
      assertNotAccept(forbidden);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(Error);
  });
});

// ── Rank 2: Z-P09 — route_coordinator not as recommended source ───────────────

describe('Rank 2 — Z-P09: route_coordinator does not appear as recommended source', () => {
  it('collect message payload.activity is not "route_coordinator"', () => {
    const msgs = convergenceToBeam(makeConvergenceReport({ dominantHash: 'hash1' }));
    const collect = msgs.find((m) => m.tag === 'collect');
    expect(collect).toBeDefined();
    expect(collect!.payload.activity).not.toBe('route_coordinator');
  });

  it('no payload field named "recommended_source" exists in any bridge message', () => {
    for (const msg of allBridgeMessages()) {
      expect('recommended_source' in msg.payload).toBe(false);
    }
  });

  it('activity message worker_id field does not use the literal "route_coordinator"', () => {
    const msg = workerResultToBeam(makeWorkerResult({ workerId: 'worker-1' }), 'act');
    expect(msg.payload.worker_id).not.toBe('route_coordinator');
  });
});

// ── Rank 2: CROSSRT X04/X05 — supported-skip protocol constraints ────────────

describe('Rank 2 — CROSSRT X04/X05: AtomVM/Erlang supported-skip protocol', () => {
  it('propagate_exhaustion is the correct tag when AtomVM cannot be reached (exhaustion path)', () => {
    // X04 SupportedSkip: when AtomVM is not available the swarm exhausts and
    // the bridge emits propagate_exhaustion — never "accepted" or "collect".
    const error = new ConvergenceMaxIterationsError(10, 5, 0.1);
    const msg = exhaustionToBeam(error);
    expect(msg.tag).toBe('propagate_exhaustion');
    expect(msg.tag).not.toBe('collect');
    expect(msg.tag).not.toBe('accepted');
  });

  it('propagate_exhaustion payload has error_name that identifies the exhaustion class', () => {
    // X05: BEAM supervisor receives error_name to decide SupportedSkip vs real failure.
    const maxIter = exhaustionToBeam(new ConvergenceMaxIterationsError(10, 5, 0.1));
    const timeout = exhaustionToBeam(new ConvergenceTimeoutError(5, 5, 0.2));
    expect(typeof maxIter.payload.error_name).toBe('string');
    expect(typeof timeout.payload.error_name).toBe('string');
    expect((maxIter.payload.error_name as string).length).toBeGreaterThan(0);
    expect((timeout.payload.error_name as string).length).toBeGreaterThan(0);
  });

  it('propagate_exhaustion payload.reason is a non-empty string (evidence_ref for X04 skip)', () => {
    const msg = exhaustionToBeam(new ConvergenceTimeoutError(7, 7, 0.55));
    expect(typeof msg.payload.reason).toBe('string');
    expect((msg.payload.reason as string).length).toBeGreaterThan(0);
  });

  it('ConvergenceTimeoutError and ConvergenceMaxIterationsError produce distinguishable error_name values', () => {
    const maxIter = exhaustionToBeam(new ConvergenceMaxIterationsError(1, 1, 0.0));
    const timeout = exhaustionToBeam(new ConvergenceTimeoutError(1, 1, 0.0));
    // BEAM andon_supervisor uses error_name to route to the right refusal handler.
    expect(maxIter.payload.error_name).not.toBe(timeout.payload.error_name);
  });
});

// ── Rank 3: Metamorphic — determinism ─────────────────────────────────────────

describe('Rank 3 — determinism: same WorkerResult produces identical BeamMessage', () => {
  it('two calls to workerResultToBeam with identical input produce structurally equal messages', () => {
    const result = makeWorkerResult({ workerId: 'w-seed', durationMs: 77 });
    const m1 = workerResultToBeam(result, 'discover_dfg');
    const m2 = workerResultToBeam(result, 'discover_dfg');
    expect(JSON.stringify(m1)).toBe(JSON.stringify(m2));
  });

  it('two calls to convergenceToBeam with identical input produce structurally equal message arrays', () => {
    const report = makeConvergenceReport({ dominantHash: 'stable-hash' });
    const a1 = convergenceToBeam(report);
    const a2 = convergenceToBeam(report);
    expect(JSON.stringify(a1)).toBe(JSON.stringify(a2));
  });

  it('two exhaustionToBeam calls with same error produce structurally equal messages', () => {
    const err = new ConvergenceMaxIterationsError(42, 42, 0.0);
    const m1 = exhaustionToBeam(err);
    const m2 = exhaustionToBeam(err);
    expect(JSON.stringify(m1)).toBe(JSON.stringify(m2));
  });
});

// ── Rank 3: Metamorphic — perturbation → output relation ──────────────────────

describe('Rank 3 — metamorphic: input perturbation produces correct output change', () => {
  it('converged=true produces fewer messages than converged=false with 5 dissenters', () => {
    const converged = convergenceToBeam(makeConvergenceReport({ converged: true, dominantHash: 'h' }));
    const dissenting = convergenceToBeam(
      makeConvergenceReport({ converged: false, dissentingWorkers: ['w1', 'w2', 'w3', 'w4', 'w5'] })
    );
    expect(converged.length).toBeLessThan(dissenting.length);
  });

  it('failed=true WorkerResult includes error field; failed=false does not', () => {
    const failed = workerResultToBeam(makeWorkerResult({ failed: true, error: 'WASM crash' }), 'act');
    const ok = workerResultToBeam(makeWorkerResult({ failed: false }), 'act');
    expect('error' in failed.payload).toBe(true);
    expect('error' in ok.payload).toBe(false);
  });

  it('longer activityId string flows through to payload.activity_id unchanged', () => {
    const longId = 'a_very_long_activity_id_that_is_still_valid_erlang_atom_friendly';
    const msg = workerResultToBeam(makeWorkerResult(), longId);
    expect(msg.payload.activity_id).toBe(longId);
  });
});
