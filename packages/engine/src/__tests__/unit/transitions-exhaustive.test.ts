/**
 * transitions-exhaustive.test.ts  (unit/)
 *
 * Exhaustive coverage of the VALID_TRANSITIONS state machine.
 *
 * Oracle ranks (Van der Aalst / Chicago TDD doctrine):
 *   Rank 1 — mathematical invariants: every declared transition is accepted;
 *             every undeclared transition is rejected (complete enumeration)
 *   Rank 2 — domain contracts: recovery paths, entry/exit constraints,
 *             terminal-like states
 *   Rank 3 — metamorphic relations: directed asymmetry (A→B ≠ B→A)
 *
 * Anti-FM-5 guarantee: Expected transitions are enumerated INDEPENDENTLY below.
 * They are NOT derived by importing VALID_TRANSITIONS and reflecting on it.
 * The ground-truth table is a hard-coded specification that matches the design
 * doc in packages/engine/src/transitions.ts but does not call that map.
 *
 * The `canTransition(from, to)` utility IS imported — it is the unit under test.
 * VALID_TRANSITIONS is also imported only for the exhaustive membership tests
 * (Groups 1 & 2) where the goal is to verify every entry the map declares, and
 * every pair the map omits.  The independently-derived table (EXPECTED_VALID) is
 * used as the reference oracle throughout all groups.
 */

import { describe, it, expect } from 'vitest';
import { canTransition, VALID_TRANSITIONS } from '../../transitions.js';
import type { EngineState } from '@wasm4pm/contracts';

// ── Canonical state list ──────────────────────────────────────────────────────
// Listed in lifecycle order; NOT derived from the implementation.

const ALL_STATES: EngineState[] = [
  'uninitialized',
  'bootstrapping',
  'ready',
  'planning',
  'running',
  'watching',
  'degraded',
  'failed',
];

// ── Independent ground-truth table (anti-FM-5 oracle) ────────────────────────
//
// This object is authored from the design specification (CLAUDE.md + transitions.ts
// comment block), NOT read from VALID_TRANSITIONS at runtime.  It is the Rank-1
// mathematical oracle.

const EXPECTED_VALID: Record<EngineState, Set<EngineState>> = {
  uninitialized: new Set(['bootstrapping']),
  bootstrapping: new Set(['ready', 'failed', 'degraded']),
  ready: new Set(['planning', 'running', 'watching', 'degraded', 'failed']),
  planning: new Set(['running', 'ready', 'degraded', 'failed']),
  running: new Set(['watching', 'ready', 'degraded', 'failed']),
  watching: new Set(['ready', 'degraded', 'failed']),
  degraded: new Set(['ready', 'bootstrapping', 'failed']),
  failed: new Set(['bootstrapping', 'ready']),
};

// Convenience: the full set of valid (from, to) pairs derived from the oracle.
const VALID_PAIRS: Array<[EngineState, EngineState]> = ALL_STATES.flatMap((from) =>
  [...EXPECTED_VALID[from]].map((to) => [from, to] as [EngineState, EngineState])
);

// Convenience: all 64 pairs, including invalid ones.
const ALL_PAIRS: Array<[EngineState, EngineState]> = ALL_STATES.flatMap((from) =>
  ALL_STATES.map((to) => [from, to] as [EngineState, EngineState])
);

// Complement: pairs that are NOT in the oracle (should be rejected).
const INVALID_PAIRS = ALL_PAIRS.filter(
  ([from, to]) => !EXPECTED_VALID[from].has(to)
);

// ─────────────────────────────────────────────────────────────────────────────
// Group 1 — Rank 1 (mathematical): every declared valid transition is accepted
// ─────────────────────────────────────────────────────────────────────────────

describe('Group 1 — Rank 1: every declared valid transition is accepted', () => {
  it('VALID_TRANSITIONS map covers exactly the same pairs as the oracle (pre-flight)', () => {
    // Cross-check: oracle and implementation must agree on the set of valid pairs.
    // If they differ, subsequent tests will catch it pair-by-pair, but this test
    // surfaces the discrepancy as a single aggregated diff first.
    for (const from of ALL_STATES) {
      const oracleSet = EXPECTED_VALID[from];
      const implSet = VALID_TRANSITIONS[from];
      const extraInImpl = [...implSet].filter((s) => !oracleSet.has(s as EngineState));
      const missingFromImpl = [...oracleSet].filter((s) => !implSet.has(s as EngineState));
      expect(extraInImpl, `VALID_TRANSITIONS[${from}] has extra target(s) not in oracle`).toEqual(
        []
      );
      expect(
        missingFromImpl,
        `VALID_TRANSITIONS[${from}] is missing target(s) that oracle expects`
      ).toEqual([]);
    }
  });

  // One test per valid pair — 27 tests (count of entries across all Sets in oracle).

  it('uninitialized → bootstrapping is accepted', () =>
    expect(canTransition('uninitialized', 'bootstrapping')).toBe(true));

  it('bootstrapping → ready is accepted', () =>
    expect(canTransition('bootstrapping', 'ready')).toBe(true));

  it('bootstrapping → failed is accepted', () =>
    expect(canTransition('bootstrapping', 'failed')).toBe(true));

  it('bootstrapping → degraded is accepted', () =>
    expect(canTransition('bootstrapping', 'degraded')).toBe(true));

  it('ready → planning is accepted', () =>
    expect(canTransition('ready', 'planning')).toBe(true));

  it('ready → running is accepted', () =>
    expect(canTransition('ready', 'running')).toBe(true));

  it('ready → watching is accepted', () =>
    expect(canTransition('ready', 'watching')).toBe(true));

  it('ready → degraded is accepted', () =>
    expect(canTransition('ready', 'degraded')).toBe(true));

  it('ready → failed is accepted', () =>
    expect(canTransition('ready', 'failed')).toBe(true));

  it('planning → running is accepted', () =>
    expect(canTransition('planning', 'running')).toBe(true));

  it('planning → ready is accepted', () =>
    expect(canTransition('planning', 'ready')).toBe(true));

  it('planning → degraded is accepted', () =>
    expect(canTransition('planning', 'degraded')).toBe(true));

  it('planning → failed is accepted', () =>
    expect(canTransition('planning', 'failed')).toBe(true));

  it('running → watching is accepted', () =>
    expect(canTransition('running', 'watching')).toBe(true));

  it('running → ready is accepted', () =>
    expect(canTransition('running', 'ready')).toBe(true));

  it('running → degraded is accepted', () =>
    expect(canTransition('running', 'degraded')).toBe(true));

  it('running → failed is accepted', () =>
    expect(canTransition('running', 'failed')).toBe(true));

  it('watching → ready is accepted', () =>
    expect(canTransition('watching', 'ready')).toBe(true));

  it('watching → degraded is accepted', () =>
    expect(canTransition('watching', 'degraded')).toBe(true));

  it('watching → failed is accepted', () =>
    expect(canTransition('watching', 'failed')).toBe(true));

  it('degraded → ready is accepted', () =>
    expect(canTransition('degraded', 'ready')).toBe(true));

  it('degraded → bootstrapping is accepted', () =>
    expect(canTransition('degraded', 'bootstrapping')).toBe(true));

  it('degraded → failed is accepted', () =>
    expect(canTransition('degraded', 'failed')).toBe(true));

  it('failed → bootstrapping is accepted', () =>
    expect(canTransition('failed', 'bootstrapping')).toBe(true));

  it('failed → ready is accepted (fast recovery path)', () =>
    expect(canTransition('failed', 'ready')).toBe(true));

  it('valid pair count from oracle is 25 (sanity)', () =>
    expect(VALID_PAIRS.length).toBe(25));
});

// ─────────────────────────────────────────────────────────────────────────────
// Group 2 — Rank 1 (mathematical): every undeclared transition is rejected
// ─────────────────────────────────────────────────────────────────────────────

describe('Group 2 — Rank 1: every undeclared transition is rejected (8×8 – 25 = 39 pairs)', () => {
  it('total invalid pair count is 39 (8×8 − 25 valid)', () =>
    expect(INVALID_PAIRS.length).toBe(39));

  // Self-loops — no state can transition to itself
  it('uninitialized → uninitialized is rejected', () =>
    expect(canTransition('uninitialized', 'uninitialized')).toBe(false));
  it('bootstrapping → bootstrapping is rejected', () =>
    expect(canTransition('bootstrapping', 'bootstrapping')).toBe(false));
  it('ready → ready is rejected', () =>
    expect(canTransition('ready', 'ready')).toBe(false));
  it('planning → planning is rejected', () =>
    expect(canTransition('planning', 'planning')).toBe(false));
  it('running → running is rejected', () =>
    expect(canTransition('running', 'running')).toBe(false));
  it('watching → watching is rejected', () =>
    expect(canTransition('watching', 'watching')).toBe(false));
  it('degraded → degraded is rejected', () =>
    expect(canTransition('degraded', 'degraded')).toBe(false));
  it('failed → failed is rejected', () =>
    expect(canTransition('failed', 'failed')).toBe(false));

  // From uninitialized — only bootstrapping is valid; all others are rejected
  it('uninitialized → ready is rejected', () =>
    expect(canTransition('uninitialized', 'ready')).toBe(false));
  it('uninitialized → planning is rejected', () =>
    expect(canTransition('uninitialized', 'planning')).toBe(false));
  it('uninitialized → running is rejected', () =>
    expect(canTransition('uninitialized', 'running')).toBe(false));
  it('uninitialized → watching is rejected', () =>
    expect(canTransition('uninitialized', 'watching')).toBe(false));
  it('uninitialized → degraded is rejected', () =>
    expect(canTransition('uninitialized', 'degraded')).toBe(false));
  it('uninitialized → failed is rejected', () =>
    expect(canTransition('uninitialized', 'failed')).toBe(false));

  // From bootstrapping — ready/failed/degraded are valid; others rejected
  it('bootstrapping → uninitialized is rejected', () =>
    expect(canTransition('bootstrapping', 'uninitialized')).toBe(false));
  it('bootstrapping → planning is rejected', () =>
    expect(canTransition('bootstrapping', 'planning')).toBe(false));
  it('bootstrapping → running is rejected', () =>
    expect(canTransition('bootstrapping', 'running')).toBe(false));
  it('bootstrapping → watching is rejected', () =>
    expect(canTransition('bootstrapping', 'watching')).toBe(false));

  // From ready — planning/running/watching/degraded/failed are valid; others rejected
  it('ready → uninitialized is rejected', () =>
    expect(canTransition('ready', 'uninitialized')).toBe(false));
  it('ready → bootstrapping is rejected', () =>
    expect(canTransition('ready', 'bootstrapping')).toBe(false));

  // From planning — running/ready/degraded/failed are valid; others rejected
  it('planning → uninitialized is rejected', () =>
    expect(canTransition('planning', 'uninitialized')).toBe(false));
  it('planning → bootstrapping is rejected', () =>
    expect(canTransition('planning', 'bootstrapping')).toBe(false));
  it('planning → watching is rejected', () =>
    expect(canTransition('planning', 'watching')).toBe(false));

  // From running — watching/ready/degraded/failed are valid; others rejected
  it('running → uninitialized is rejected', () =>
    expect(canTransition('running', 'uninitialized')).toBe(false));
  it('running → bootstrapping is rejected', () =>
    expect(canTransition('running', 'bootstrapping')).toBe(false));
  it('running → planning is rejected', () =>
    expect(canTransition('running', 'planning')).toBe(false));

  // From watching — ready/degraded/failed are valid; others rejected
  it('watching → uninitialized is rejected', () =>
    expect(canTransition('watching', 'uninitialized')).toBe(false));
  it('watching → bootstrapping is rejected', () =>
    expect(canTransition('watching', 'bootstrapping')).toBe(false));
  it('watching → planning is rejected', () =>
    expect(canTransition('watching', 'planning')).toBe(false));
  it('watching → running is rejected', () =>
    expect(canTransition('watching', 'running')).toBe(false));

  // From degraded — ready/bootstrapping/failed are valid; others rejected
  it('degraded → uninitialized is rejected', () =>
    expect(canTransition('degraded', 'uninitialized')).toBe(false));
  it('degraded → planning is rejected', () =>
    expect(canTransition('degraded', 'planning')).toBe(false));
  it('degraded → running is rejected', () =>
    expect(canTransition('degraded', 'running')).toBe(false));
  it('degraded → watching is rejected', () =>
    expect(canTransition('degraded', 'watching')).toBe(false));

  // From failed — bootstrapping/ready are valid; all others rejected
  it('failed → uninitialized is rejected', () =>
    expect(canTransition('failed', 'uninitialized')).toBe(false));
  it('failed → planning is rejected', () =>
    expect(canTransition('failed', 'planning')).toBe(false));
  it('failed → running is rejected', () =>
    expect(canTransition('failed', 'running')).toBe(false));
  it('failed → watching is rejected', () =>
    expect(canTransition('failed', 'watching')).toBe(false));
  it('failed → degraded is rejected', () =>
    expect(canTransition('failed', 'degraded')).toBe(false));

  it('total invalid pair count validated by exhaustive enumeration', () => {
    // Count all pairs the oracle marks invalid and compare to INVALID_PAIRS built above.
    let oracleInvalidCount = 0;
    for (const from of ALL_STATES) {
      for (const to of ALL_STATES) {
        if (!EXPECTED_VALID[from].has(to)) oracleInvalidCount++;
      }
    }
    expect(oracleInvalidCount).toBe(INVALID_PAIRS.length);
    expect(oracleInvalidCount).toBe(39);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Group 3 — Rank 2 (domain contract): recovery paths are strictly defined
// ─────────────────────────────────────────────────────────────────────────────

describe('Group 3 — Rank 2: recovery paths are strictly defined', () => {
  // Forward recovery paths (must be valid)
  it('failed → bootstrapping is valid (re-init recovery path)', () =>
    expect(canTransition('failed', 'bootstrapping')).toBe(true));

  it('failed → ready is valid (fast recovery path)', () =>
    expect(canTransition('failed', 'ready')).toBe(true));

  it('degraded → bootstrapping is valid (soft recovery path)', () =>
    expect(canTransition('degraded', 'bootstrapping')).toBe(true));

  it('degraded → ready is valid (direct soft recovery)', () =>
    expect(canTransition('degraded', 'ready')).toBe(true));

  it('watching → ready is valid (stop-watching path)', () =>
    expect(canTransition('watching', 'ready')).toBe(true));

  // Reverse recovery paths must NOT be valid (recovery is one-directional)
  it('bootstrapping → failed is valid (boot can fail) — but not a recovery reversal', () =>
    // bootstrapping→failed is a forward failure path, not a reversal.
    // Documented as valid in oracle.
    expect(canTransition('bootstrapping', 'failed')).toBe(true));

  it('ready → failed is valid (ready can fail) — not the same as failed→ready', () =>
    // ready→failed is intentional for shutdown/error; fails do not "un-happen".
    expect(canTransition('ready', 'failed')).toBe(true));

  // Illegal reversal: failed state cannot jump to planning or running directly
  it('failed → planning is invalid (must go through bootstrapping/ready first)', () =>
    expect(canTransition('failed', 'planning')).toBe(false));

  it('failed → running is invalid (must go through bootstrapping/ready first)', () =>
    expect(canTransition('failed', 'running')).toBe(false));

  it('failed → watching is invalid (must go through bootstrapping/ready first)', () =>
    expect(canTransition('failed', 'watching')).toBe(false));

  // Degraded cannot jump to running or watching
  it('degraded → running is invalid (must recover to ready first)', () =>
    expect(canTransition('degraded', 'running')).toBe(false));

  it('degraded → watching is invalid (must recover to ready first)', () =>
    expect(canTransition('degraded', 'watching')).toBe(false));

  it('degraded → planning is invalid (must recover to ready first)', () =>
    expect(canTransition('degraded', 'planning')).toBe(false));

  // Stop-watching: watching→ready is valid; watching cannot loop back to active states
  it('watching → planning is invalid', () =>
    expect(canTransition('watching', 'planning')).toBe(false));

  it('watching → running is invalid', () =>
    expect(canTransition('watching', 'running')).toBe(false));
});

// ─────────────────────────────────────────────────────────────────────────────
// Group 4 — Rank 2 (domain contract): terminal-like state constraints
// ─────────────────────────────────────────────────────────────────────────────

describe('Group 4 — Rank 2: terminal-like state entry/exit constraints', () => {
  // uninitialized — only starting point; can only go to bootstrapping
  it('from uninitialized, only bootstrapping is a valid next state', () => {
    const validFromUninitialized = ALL_STATES.filter((to) =>
      canTransition('uninitialized', to)
    );
    expect(validFromUninitialized).toEqual(['bootstrapping']);
  });

  it('from uninitialized, exactly 1 outgoing transition exists', () => {
    const count = ALL_STATES.filter((to) => canTransition('uninitialized', to)).length;
    expect(count).toBe(1);
  });

  it('from uninitialized, failed is not reachable directly', () =>
    expect(canTransition('uninitialized', 'failed')).toBe(false));

  it('from uninitialized, running is not reachable directly', () =>
    expect(canTransition('uninitialized', 'running')).toBe(false));

  it('from uninitialized, watching is not reachable directly', () =>
    expect(canTransition('uninitialized', 'watching')).toBe(false));

  // watching — can only exit to ready/degraded/failed; cannot reach uninitialized
  it('from watching, uninitialized is not reachable', () =>
    expect(canTransition('watching', 'uninitialized')).toBe(false));

  it('from watching, bootstrapping is not reachable', () =>
    expect(canTransition('watching', 'bootstrapping')).toBe(false));

  it('from watching, exactly 3 outgoing transitions exist (ready, degraded, failed)', () => {
    const validFromWatching = ALL_STATES.filter((to) => canTransition('watching', to));
    expect(validFromWatching.sort()).toEqual(['degraded', 'failed', 'ready']);
  });

  // failed — has exactly 2 valid exits (fast recovery paths)
  it('from failed, exactly 2 outgoing transitions exist (bootstrapping, ready)', () => {
    const validFromFailed = ALL_STATES.filter((to) => canTransition('failed', to));
    expect(validFromFailed.sort()).toEqual(['bootstrapping', 'ready']);
  });

  // No state can transition to uninitialized (it is the exclusive start state)
  it('no state can transition TO uninitialized', () => {
    const sourcesOfUninitialized = ALL_STATES.filter((from) =>
      canTransition(from, 'uninitialized')
    );
    expect(sourcesOfUninitialized).toEqual([]);
  });

  // uninitialized has no incoming transitions either (it's the birth state)
  it('no state can transition FROM uninitialized except to bootstrapping', () => {
    const others = ALL_STATES.filter(
      (to) => to !== 'bootstrapping' && canTransition('uninitialized', to)
    );
    expect(others).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Group 5 — Rank 3 (metamorphic): the graph is DIRECTED — A→B ≢ B→A
// ─────────────────────────────────────────────────────────────────────────────

describe('Group 5 — Rank 3 metamorphic: asymmetry — canTransition(A,B) ≠ canTransition(B,A)', () => {
  // Each example picks a valid A→B and shows B→A is invalid.
  // This proves the state machine is directed (not undirected).

  it('bootstrapping→ready is valid, but ready→bootstrapping is NOT', () => {
    expect(canTransition('bootstrapping', 'ready')).toBe(true);
    expect(canTransition('ready', 'bootstrapping')).toBe(false);
  });

  it('planning→running is valid, but running→planning is NOT', () => {
    expect(canTransition('planning', 'running')).toBe(true);
    expect(canTransition('running', 'planning')).toBe(false);
  });

  it('ready→watching is valid, but watching→ready is ALSO valid (not asymmetric here)', () => {
    // This intentional bidirectional pair (watching↔ready) is the exception,
    // not the rule — watching→ready is the "stop watching" path.
    expect(canTransition('ready', 'watching')).toBe(true);
    expect(canTransition('watching', 'ready')).toBe(true);
  });

  it('failed→ready is valid, but ready→failed is also valid — asymmetry is in planning/running', () => {
    // Both directions exist; the asymmetry test below covers directional non-invertibility.
    expect(canTransition('failed', 'ready')).toBe(true);
    expect(canTransition('ready', 'failed')).toBe(true);
  });

  it('uninitialized→bootstrapping is valid, but bootstrapping→uninitialized is NOT', () => {
    expect(canTransition('uninitialized', 'bootstrapping')).toBe(true);
    expect(canTransition('bootstrapping', 'uninitialized')).toBe(false);
  });

  it('degraded→bootstrapping is valid, but bootstrapping→degraded is ALSO valid (exception)', () => {
    // bootstrapping→degraded covers the case where bootstrapping itself partially fails.
    expect(canTransition('degraded', 'bootstrapping')).toBe(true);
    expect(canTransition('bootstrapping', 'degraded')).toBe(true);
  });

  it('ready→running is valid, but running→ready is ALSO valid (completion path — exception)', () => {
    // running→ready is the happy-path completion; both directions are intentional.
    expect(canTransition('ready', 'running')).toBe(true);
    expect(canTransition('running', 'ready')).toBe(true);
  });

  it('planning→watching is NOT valid and watching→planning is NOT valid', () => {
    // Double rejection — neither direction is allowed.
    expect(canTransition('planning', 'watching')).toBe(false);
    expect(canTransition('watching', 'planning')).toBe(false);
  });

  it('failed→planning is NOT valid and planning→failed IS valid (directed asymmetry)', () => {
    // planning can fail → failed; but failed cannot jump directly to planning.
    expect(canTransition('planning', 'failed')).toBe(true);
    expect(canTransition('failed', 'planning')).toBe(false);
  });

  it('failed→watching is NOT valid and watching→failed IS valid (directed asymmetry)', () => {
    expect(canTransition('watching', 'failed')).toBe(true);
    expect(canTransition('failed', 'watching')).toBe(false);
  });

  it('degraded→running is NOT valid and running→degraded IS valid (directed asymmetry)', () => {
    expect(canTransition('running', 'degraded')).toBe(true);
    expect(canTransition('degraded', 'running')).toBe(false);
  });

  it('degraded→watching is NOT valid and watching→degraded IS valid (directed asymmetry)', () => {
    expect(canTransition('watching', 'degraded')).toBe(true);
    expect(canTransition('degraded', 'watching')).toBe(false);
  });

  it('at least 20 of 56 non-self-loop pairs are asymmetric (true directed graph)', () => {
    // Count pairs (A,B) where A≠B and exactly one of canTransition(A,B) / canTransition(B,A) holds.
    let asymmetricCount = 0;
    for (const a of ALL_STATES) {
      for (const b of ALL_STATES) {
        if (a === b) continue;
        const ab = canTransition(a, b);
        const ba = canTransition(b, a);
        if (ab !== ba) asymmetricCount++;
      }
    }
    // Each asymmetric pair is counted twice (once as A→B invalid/B→A valid, once reversed).
    // We just assert the total is substantial.
    expect(asymmetricCount).toBeGreaterThanOrEqual(20);
  });
});
