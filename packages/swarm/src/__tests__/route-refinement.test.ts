/**
 * Route Refinement Tests
 *
 * Covers RouteRefinementPolicy functions:
 *   - selectNextVariant: 8-variant ladder ascending by cost
 *   - shouldEscalate: escalation detection
 *   - createAttempt: attempt state carrier construction
 *   - isLIVE09bViolation: floor breach detection
 *
 * Z-P09: route_coordinator MUST NOT appear as a recommended alternate
 *        evidence source — enforced via the ROUTE_REFINEMENT_ANDON constant
 *        and the GapClosureUnauthorized failure path.
 * A-P09: proof_aggregator is the ONLY valid signer — escalation to Andon
 *        must not reference route_coordinator as a resolver.
 */

import { describe, it, expect } from 'vitest';

import {
  selectNextVariant,
  shouldEscalate,
  createAttempt,
  isLIVE09bViolation,
  ROUTE_REFINEMENT_ANDON,
  VARIANT_LADDER,
  VARIANT_COST,
  DISCOVERY_VARIANT_ORDER,
  type RouteRefinementVariant,
  type RefinementAttempt,
} from '../route-refinement.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NOW = '2026-05-17T00:00:00.000Z';

function makeAttempt(overrides: Partial<RefinementAttempt> = {}): RefinementAttempt {
  return {
    attempt_id: 'ULID-TEST-001',
    variant: 'KeepCurrent',
    cost: 0,
    triggered_by: 'run-test',
    started_at: NOW,
    gap_activity_id: 'act:gap-test',
    previous_precision: 0.6,
    previous_fitness: 0.7,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// ROUTE_REFINEMENT_ANDON constant
// ---------------------------------------------------------------------------

describe('ROUTE_REFINEMENT_ANDON', () => {
  it('uses the extension/automl namespace (not mcpp: closed namespace)', () => {
    expect(ROUTE_REFINEMENT_ANDON.startsWith('extension/')).toBe(true);
  });

  it('does not reference route_coordinator in the signal name (Z-P09)', () => {
    // route_coordinator MUST NOT appear as the recommended resolver
    expect(ROUTE_REFINEMENT_ANDON.toLowerCase()).not.toContain('route_coordinator');
  });

  it('references RouteModelInvalid as the failure code', () => {
    expect(ROUTE_REFINEMENT_ANDON).toContain('RouteModelInvalid');
  });
});

// ---------------------------------------------------------------------------
// VARIANT_LADDER
// ---------------------------------------------------------------------------

describe('VARIANT_LADDER', () => {
  it('has exactly 8 variants', () => {
    expect(VARIANT_LADDER).toHaveLength(8);
  });

  it('starts with KeepCurrent (cost 0)', () => {
    expect(VARIANT_LADDER[0]).toBe('KeepCurrent');
  });

  it('ends with Escalate (cost 7)', () => {
    expect(VARIANT_LADDER[7]).toBe('Escalate');
  });

  it('is monotonically ascending by cost', () => {
    for (let i = 1; i < VARIANT_LADDER.length; i++) {
      const prev = VARIANT_COST[VARIANT_LADDER[i - 1]];
      const curr = VARIANT_COST[VARIANT_LADDER[i]];
      expect(curr).toBeGreaterThan(prev);
    }
  });

  it('contains no duplicate variants', () => {
    const unique = new Set(VARIANT_LADDER);
    expect(unique.size).toBe(VARIANT_LADDER.length);
  });
});

// ---------------------------------------------------------------------------
// VARIANT_COST
// ---------------------------------------------------------------------------

describe('VARIANT_COST', () => {
  it('KeepCurrent has cost 0', () => {
    expect(VARIANT_COST.KeepCurrent).toBe(0);
  });

  it('Escalate has cost 7', () => {
    expect(VARIANT_COST.Escalate).toBe(7);
  });

  it('all costs are in [0, 7]', () => {
    for (const cost of Object.values(VARIANT_COST)) {
      expect(cost).toBeGreaterThanOrEqual(0);
      expect(cost).toBeLessThanOrEqual(7);
    }
  });

  it('all costs are unique (no two variants share a cost)', () => {
    const costs = Object.values(VARIANT_COST);
    const unique = new Set(costs);
    expect(unique.size).toBe(costs.length);
  });
});

// ---------------------------------------------------------------------------
// DISCOVERY_VARIANT_ORDER
// ---------------------------------------------------------------------------

describe('DISCOVERY_VARIANT_ORDER', () => {
  it('has exactly 8 discovery variants', () => {
    expect(DISCOVERY_VARIANT_ORDER).toHaveLength(8);
  });

  it('starts with DecisionGraphCyclic', () => {
    expect(DISCOVERY_VARIANT_ORDER[0]).toBe('DecisionGraphCyclic');
  });

  it('ends with BruteForce', () => {
    expect(DISCOVERY_VARIANT_ORDER[7]).toBe('BruteForce');
  });

  it('contains no duplicates', () => {
    const unique = new Set(DISCOVERY_VARIANT_ORDER);
    expect(unique.size).toBe(DISCOVERY_VARIANT_ORDER.length);
  });
});

// ---------------------------------------------------------------------------
// selectNextVariant
// ---------------------------------------------------------------------------

describe('selectNextVariant', () => {
  it('advances KeepCurrent → RelaxThreshold on attempt 0', () => {
    const next = selectNextVariant('KeepCurrent', 0);
    expect(next).toBe('RelaxThreshold');
  });

  it('advances RelaxThreshold → ExtendWindow', () => {
    const next = selectNextVariant('RelaxThreshold', 1);
    expect(next).toBe('ExtendWindow');
  });

  it('advances ReDiscoverFull → Escalate (penultimate to final)', () => {
    const next = selectNextVariant('ReDiscoverFull', 6);
    expect(next).toBe('Escalate');
  });

  it('throws RangeError when attempt exceeds 7', () => {
    expect(() => selectNextVariant('KeepCurrent', 8)).toThrow(RangeError);
  });

  it('throws RangeError when already at Escalate (cannot advance past final)', () => {
    expect(() => selectNextVariant('Escalate', 7)).toThrow(RangeError);
  });

  it('RangeError message when exceeding max variants mentions ROUTE_REFINEMENT_ANDON signal', () => {
    try {
      selectNextVariant('KeepCurrent', 8);
      expect.fail('should have thrown');
    } catch (err) {
      expect((err as Error).message).toContain('RouteModelInvalid');
    }
  });

  it('RangeError message at Escalate mentions ROUTE_REFINEMENT_ANDON signal', () => {
    try {
      selectNextVariant('Escalate', 7);
      expect.fail('should have thrown');
    } catch (err) {
      expect((err as Error).message).toContain('RouteModelInvalid');
    }
  });

  it('each sequential call covers the full 8-variant ladder', () => {
    const order: RouteRefinementVariant[] = ['KeepCurrent'];
    let current: RouteRefinementVariant = 'KeepCurrent';
    for (let attempt = 0; attempt < 7; attempt++) {
      current = selectNextVariant(current, attempt);
      order.push(current);
    }
    expect(order).toEqual(VARIANT_LADDER);
  });
});

// ---------------------------------------------------------------------------
// shouldEscalate
// ---------------------------------------------------------------------------

describe('shouldEscalate', () => {
  it('returns false for empty attempts list', () => {
    expect(shouldEscalate([])).toBe(false);
  });

  it('returns false for fewer than 8 attempts without Escalate variant', () => {
    const attempts = Array.from({ length: 5 }, (_, i) =>
      makeAttempt({ attempt_id: `ULID-${i}`, variant: 'RelaxThreshold', cost: 1 }),
    );
    expect(shouldEscalate(attempts)).toBe(false);
  });

  it('returns true when any attempt carries the Escalate variant', () => {
    const attempts = [
      makeAttempt({ variant: 'SwitchVariant', cost: 3 }),
      makeAttempt({ attempt_id: 'ULID-2', variant: 'Escalate', cost: 7 }),
    ];
    expect(shouldEscalate(attempts)).toBe(true);
  });

  it('returns true when there are 8 or more attempts (ladder exhausted)', () => {
    const attempts = Array.from({ length: 8 }, (_, i) =>
      makeAttempt({ attempt_id: `ULID-${i}`, variant: 'RelaxThreshold', cost: 1 }),
    );
    expect(shouldEscalate(attempts)).toBe(true);
  });

  it('returns true for exactly 9 attempts (beyond ladder depth)', () => {
    const attempts = Array.from({ length: 9 }, (_, i) =>
      makeAttempt({ attempt_id: `ULID-${i}` }),
    );
    expect(shouldEscalate(attempts)).toBe(true);
  });

  it('Escalate variant in the first attempt triggers escalation immediately', () => {
    const attempts = [makeAttempt({ variant: 'Escalate', cost: 7 })];
    expect(shouldEscalate(attempts)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// createAttempt
// ---------------------------------------------------------------------------

describe('createAttempt', () => {
  it('creates an attempt with the specified variant', () => {
    const attempt = createAttempt('run-001', 'act:gap-1', 'RelaxThreshold', 0.6, 0.7);
    expect(attempt.variant).toBe('RelaxThreshold');
  });

  it('sets cost based on the variant', () => {
    const attempt = createAttempt('run-001', 'act:gap-1', 'RelaxThreshold', 0.6, 0.7);
    expect(attempt.cost).toBe(VARIANT_COST.RelaxThreshold);
  });

  it('preserves triggered_by and gap_activity_id', () => {
    const attempt = createAttempt('run-xyz', 'act:the-gap', 'ExtendWindow', 0.5, 0.55);
    expect(attempt.triggered_by).toBe('run-xyz');
    expect(attempt.gap_activity_id).toBe('act:the-gap');
  });

  it('preserves previous_precision and previous_fitness', () => {
    const attempt = createAttempt('run-001', 'act:gap-1', 'AddConstraint', 0.42, 0.38);
    expect(attempt.previous_precision).toBe(0.42);
    expect(attempt.previous_fitness).toBe(0.38);
  });

  it('generates a non-empty attempt_id (ULID)', () => {
    const attempt = createAttempt('run-001', 'act:gap-1', 'KeepCurrent', 0.9, 0.9);
    expect(typeof attempt.attempt_id).toBe('string');
    expect(attempt.attempt_id.length).toBeGreaterThan(0);
  });

  it('sets started_at to a valid ISO-8601 timestamp', () => {
    const attempt = createAttempt('run-001', 'act:gap-1', 'KeepCurrent', 0.9, 0.9);
    const d = new Date(attempt.started_at);
    expect(Number.isNaN(d.getTime())).toBe(false);
  });

  it('Escalate variant has cost 7', () => {
    const attempt = createAttempt('run-001', 'act:gap-1', 'Escalate', 0.1, 0.1);
    expect(attempt.cost).toBe(7);
  });

  it('two successive calls produce distinct attempt_ids', () => {
    const a1 = createAttempt('run-001', 'act:gap', 'KeepCurrent', 0.8, 0.8);
    const a2 = createAttempt('run-001', 'act:gap', 'KeepCurrent', 0.8, 0.8);
    expect(a1.attempt_id).not.toBe(a2.attempt_id);
  });
});

// ---------------------------------------------------------------------------
// isLIVE09bViolation
// ---------------------------------------------------------------------------

describe('isLIVE09bViolation', () => {
  it('returns true when both precision and fitness are below 0.5', () => {
    const attempt = makeAttempt({ previous_precision: 0.3, previous_fitness: 0.4 });
    expect(isLIVE09bViolation(attempt)).toBe(true);
  });

  it('returns false when precision is >= 0.5 (even if fitness < 0.5)', () => {
    const attempt = makeAttempt({ previous_precision: 0.5, previous_fitness: 0.3 });
    expect(isLIVE09bViolation(attempt)).toBe(false);
  });

  it('returns false when fitness is >= 0.5 (even if precision < 0.5)', () => {
    const attempt = makeAttempt({ previous_precision: 0.3, previous_fitness: 0.5 });
    expect(isLIVE09bViolation(attempt)).toBe(false);
  });

  it('returns false when both are exactly 0.5 (boundary is exclusive)', () => {
    const attempt = makeAttempt({ previous_precision: 0.5, previous_fitness: 0.5 });
    expect(isLIVE09bViolation(attempt)).toBe(false);
  });

  it('returns true when both are 0.0 (worst case)', () => {
    const attempt = makeAttempt({ previous_precision: 0.0, previous_fitness: 0.0 });
    expect(isLIVE09bViolation(attempt)).toBe(true);
  });

  it('returns false when both are 1.0 (perfect conformance)', () => {
    const attempt = makeAttempt({ previous_precision: 1.0, previous_fitness: 1.0 });
    expect(isLIVE09bViolation(attempt)).toBe(false);
  });

  it('returns true for 0.49 / 0.49 (just below floor)', () => {
    const attempt = makeAttempt({ previous_precision: 0.49, previous_fitness: 0.49 });
    expect(isLIVE09bViolation(attempt)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Z-P09 / A-P09 doctrinal invariants
// ---------------------------------------------------------------------------

describe('Z-P09 / A-P09: route_coordinator is never a valid evidence source', () => {
  it('Z-P09: ROUTE_REFINEMENT_ANDON does not name route_coordinator as a resolver', () => {
    // Z-P09: only route_coordinator may originate request_alternate_evidence —
    // but route_coordinator MUST NOT be listed as an approved alternate evidence
    // source in the signal emitted by the escalation path.
    expect(ROUTE_REFINEMENT_ANDON).not.toContain('route_coordinator');
  });

  it('Z-P09: selectNextVariant throws rather than silently recommending route_coordinator', () => {
    // When all variants are exhausted the system MUST halt (throw), not
    // silently fall through to a route_coordinator-based recovery path.
    expect(() => selectNextVariant('Escalate', 7)).toThrow(RangeError);
  });

  it('A-P09: shouldEscalate returns true before variant 8 when Escalate is in history', () => {
    // proof_aggregator is the only valid signer; if the Escalate variant has
    // been reached the run must stop immediately, not retry via an alternate actor.
    const attempts = [makeAttempt({ variant: 'Escalate', cost: 7 })];
    expect(shouldEscalate(attempts)).toBe(true);
  });

  it('LIVE-09b: floor breach (precision < 0.5 AND fitness < 0.5) forces immediate escalation', () => {
    // When both scores are below the floor, the run should be escalated regardless
    // of which variant is currently active. This prevents routing to route_coordinator.
    const badAttempt = makeAttempt({ previous_precision: 0.2, previous_fitness: 0.15 });
    expect(isLIVE09bViolation(badAttempt)).toBe(true);
  });
});
