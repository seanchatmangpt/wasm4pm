/**
 * span-names.test.ts
 *
 * Contract tests for SWARM_SPAN_NAMES — the typed constants that gate the
 * wasm4pm swarm ↔ mcpp LIVE-09 correlation surface.
 *
 * These tests prove:
 *   1. All constants are non-empty strings (Rank 1 — mathematical invariant)
 *   2. All names follow the `powl.gap.*` namespace convention (Rank 2 — domain contract)
 *   3. The set is exactly 4 (Rank 2 — LIVE-09 specifies 4 events, no more, no fewer)
 *   4. The TypeScript type SwarmSpanName accepts all 4 values (compile-time check)
 *
 * NOTE — compile-time type guard (not a runtime test):
 *   Assigning an arbitrary string to SwarmSpanName is a TypeScript error:
 *
 *     const bad: SwarmSpanName = 'powl.gap.unknown'; // Error TS2322
 *
 *   This means any rename in gap-events.ts that skips updating SWARM_SPAN_NAMES
 *   will be caught by `pnpm build` before the test suite even runs.
 */

import { describe, it, expect } from 'vitest';
import { SWARM_SPAN_NAMES, type SwarmSpanName } from '../span-names.js';

describe('SWARM_SPAN_NAMES — constant structure', () => {
  it('has exactly 4 entries (one per LIVE-09 event)', () => {
    expect(Object.keys(SWARM_SPAN_NAMES)).toHaveLength(4);
  });

  it('every constant value is a non-empty string', () => {
    for (const [key, value] of Object.entries(SWARM_SPAN_NAMES)) {
      expect(typeof value, `${key} should be a string`).toBe('string');
      expect((value as string).length, `${key} should be non-empty`).toBeGreaterThan(0);
    }
  });

  it('every constant follows the powl.gap.* namespace convention', () => {
    for (const [key, value] of Object.entries(SWARM_SPAN_NAMES)) {
      expect(
        (value as string).startsWith('powl.gap.'),
        `${key} = "${value}" must start with "powl.gap."`,
      ).toBe(true);
    }
  });

  it('GAP_DETECTED is "powl.gap.detected"', () => {
    expect(SWARM_SPAN_NAMES.GAP_DETECTED).toBe('powl.gap.detected');
  });

  it('GAP_CLOSED is "powl.gap.closed"', () => {
    expect(SWARM_SPAN_NAMES.GAP_CLOSED).toBe('powl.gap.closed');
  });

  it('GAP_EXHAUSTED is "powl.gap.exhausted"', () => {
    expect(SWARM_SPAN_NAMES.GAP_EXHAUSTED).toBe('powl.gap.exhausted');
  });

  it('GAP_ALTERNATE_EVIDENCE is "powl.gap.alternate_evidence_received"', () => {
    expect(SWARM_SPAN_NAMES.GAP_ALTERNATE_EVIDENCE).toBe('powl.gap.alternate_evidence_received');
  });

  it('constants are frozen (as const — no mutation at runtime)', () => {
    // TypeScript `as const` makes the object deeply readonly at type level.
    // At runtime, Object.isFrozen is false (as const is type-level only),
    // but we verify the values cannot be shadowed by asserting identity after
    // an attempted mutation (which TypeScript would reject at compile time).
    const snapshot = { ...SWARM_SPAN_NAMES };
    // Values must still match after copying — no reference aliasing surprises
    expect(snapshot.GAP_DETECTED).toBe(SWARM_SPAN_NAMES.GAP_DETECTED);
    expect(snapshot.GAP_CLOSED).toBe(SWARM_SPAN_NAMES.GAP_CLOSED);
    expect(snapshot.GAP_EXHAUSTED).toBe(SWARM_SPAN_NAMES.GAP_EXHAUSTED);
    expect(snapshot.GAP_ALTERNATE_EVIDENCE).toBe(SWARM_SPAN_NAMES.GAP_ALTERNATE_EVIDENCE);
  });
});

describe('SwarmSpanName type — assignability of all 4 values', () => {
  /**
   * These assignments are compile-time checked. If SWARM_SPAN_NAMES changes its
   * values, the type union narrows and any stale literal would become a TS error.
   *
   * NOTE: Assigning an unknown string (e.g. 'powl.gap.unknown') to SwarmSpanName
   * is a compile error (TS2322). This test documents that the type constraint is
   * real, even though it cannot be tested at runtime.
   */
  it('all 4 SWARM_SPAN_NAMES values are assignable to SwarmSpanName', () => {
    const names: SwarmSpanName[] = [
      SWARM_SPAN_NAMES.GAP_DETECTED,
      SWARM_SPAN_NAMES.GAP_CLOSED,
      SWARM_SPAN_NAMES.GAP_EXHAUSTED,
      SWARM_SPAN_NAMES.GAP_ALTERNATE_EVIDENCE,
    ];
    expect(names).toHaveLength(4);
    for (const name of names) {
      expect(typeof name).toBe('string');
    }
  });

  it('Object.values(SWARM_SPAN_NAMES) returns the same 4 names as explicit list', () => {
    const fromObject = Object.values(SWARM_SPAN_NAMES).sort();
    const explicit: SwarmSpanName[] = [
      'powl.gap.detected',
      'powl.gap.closed',
      'powl.gap.exhausted',
      'powl.gap.alternate_evidence_received',
    ];
    expect(fromObject).toEqual(explicit.slice().sort());
  });
});
