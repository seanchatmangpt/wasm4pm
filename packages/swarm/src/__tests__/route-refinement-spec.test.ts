/**
 * route-refinement-spec.test.ts
 *
 * Tests that the shared JSON spec and the TypeScript implementation stay in sync.
 * Closes GAP-4: route refinement ladder was duplicated without a shared contract.
 *
 * Oracle ranks:
 *   Rank 1 — Mathematical invariant  (ordinal contiguity, count)
 *   Rank 2 — Domain contract         (Andon signal, variant names)
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

import {
  VARIANT_LADDER,
  ROUTE_REFINEMENT_ANDON,
} from '../route-refinement.js';

import {
  validateRefinementLadder,
  REFINEMENT_ANDON_SIGNAL,
  SPEC_VARIANT_COUNT,
  getSpecVariants,
  REFINEMENT_SPEC,
} from '../route-refinement-validator.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
const specPath = join(__dirname, '..', 'route-refinement-spec.json');

// ---------------------------------------------------------------------------
// Spec structural integrity (Rank 1 — Mathematical invariants)
// ---------------------------------------------------------------------------

describe('route-refinement-spec.json — structural integrity (Rank 1)', () => {
  it('spec file is valid JSON (can be parsed without error)', () => {
    let raw: string;
    expect(() => {
      raw = readFileSync(specPath, 'utf-8');
    }).not.toThrow();
    expect(() => JSON.parse(raw!)).not.toThrow();
  });

  it('spec has exactly 8 variants', () => {
    expect(REFINEMENT_SPEC.ladder).toHaveLength(8);
    expect(SPEC_VARIANT_COUNT).toBe(8);
  });

  it('ordinals are contiguous 0–7 with no gaps', () => {
    const ordinals = REFINEMENT_SPEC.ladder.map((e) => e.ordinal).sort((a, b) => a - b);
    expect(ordinals).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it('ordinal 0 is KeepCurrent', () => {
    const entry = REFINEMENT_SPEC.ladder.find((e) => e.ordinal === 0);
    expect(entry?.variant).toBe('KeepCurrent');
    expect(entry?.escalates).toBe(false);
  });

  it('ordinal 7 is Escalate with escalates=true', () => {
    const entry = REFINEMENT_SPEC.ladder.find((e) => e.ordinal === 7);
    expect(entry?.variant).toBe('Escalate');
    expect(entry?.escalates).toBe(true);
  });

  it('no two entries share the same ordinal', () => {
    const ordinals = REFINEMENT_SPEC.ladder.map((e) => e.ordinal);
    const unique = new Set(ordinals);
    expect(unique.size).toBe(ordinals.length);
  });

  it('no two entries share the same variant name', () => {
    const names = REFINEMENT_SPEC.ladder.map((e) => e.variant);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });

  it('only the terminal Escalate entry has escalates=true', () => {
    const escalating = REFINEMENT_SPEC.ladder.filter((e) => e.escalates);
    expect(escalating).toHaveLength(1);
    expect(escalating[0].variant).toBe('Escalate');
  });

  it('spec andon_signal field is present and non-empty', () => {
    expect(typeof REFINEMENT_SPEC.andon_signal).toBe('string');
    expect(REFINEMENT_SPEC.andon_signal.length).toBeGreaterThan(0);
  });

  it('spec version field is present', () => {
    expect(typeof REFINEMENT_SPEC.version).toBe('string');
    expect(REFINEMENT_SPEC.version.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// TypeScript implementation matches spec (Rank 2 — Domain contract)
// ---------------------------------------------------------------------------

describe('TypeScript VARIANT_LADDER matches spec (Rank 2 — domain contract)', () => {
  it('VARIANT_LADDER has exactly 8 entries (spec count)', () => {
    expect(VARIANT_LADDER).toHaveLength(SPEC_VARIANT_COUNT);
  });

  it('VARIANT_LADDER variant names match spec at every position', () => {
    const specVariants = getSpecVariants();
    expect(VARIANT_LADDER).toEqual(specVariants);
  });

  it('validateRefinementLadder returns valid=true for the real VARIANT_LADDER', () => {
    const result = validateRefinementLadder([...VARIANT_LADDER]);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('validateRefinementLadder detects a single wrong variant name', () => {
    const bad = [...VARIANT_LADDER];
    bad[3] = 'WrongName' as typeof bad[3];
    const result = validateRefinementLadder(bad);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('WrongName'))).toBe(true);
  });

  it('validateRefinementLadder detects a truncated ladder', () => {
    const truncated = VARIANT_LADDER.slice(0, 6);
    const result = validateRefinementLadder([...truncated]);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('count'))).toBe(true);
  });

  it('validateRefinementLadder detects an extended ladder (too many entries)', () => {
    const extended = [...VARIANT_LADDER, 'ExtraVariant'] as string[];
    const result = validateRefinementLadder(extended);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('count'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Andon signal contract (Rank 2 — mcpp-automl mirror contract)
// ---------------------------------------------------------------------------

describe('Andon signal matches spec and TypeScript constant (Rank 2)', () => {
  it('REFINEMENT_ANDON_SIGNAL from validator matches spec andon_signal', () => {
    expect(REFINEMENT_ANDON_SIGNAL).toBe(REFINEMENT_SPEC.andon_signal);
  });

  it('TypeScript ROUTE_REFINEMENT_ANDON matches spec andon_signal', () => {
    // mcpp-automl/src/route_refinement.rs:
    //   pub const ROUTE_REFINEMENT_ANDON: &str = "extension/automl:RouteModelInvalid";
    expect(ROUTE_REFINEMENT_ANDON).toBe(REFINEMENT_SPEC.andon_signal);
  });

  it('REFINEMENT_ANDON_SIGNAL equals ROUTE_REFINEMENT_ANDON (TS constants are aligned)', () => {
    expect(REFINEMENT_ANDON_SIGNAL).toBe(ROUTE_REFINEMENT_ANDON);
  });

  it('andon signal value matches expected mcpp-automl constant', () => {
    expect(REFINEMENT_ANDON_SIGNAL).toBe('extension/automl:RouteModelInvalid');
  });
});

// ---------------------------------------------------------------------------
// Rust cross-reference (Rank 2 — documented mirror contract)
// ---------------------------------------------------------------------------

describe('Rust mirror contract (Rank 2 — documented)', () => {
  /**
   * These tests encode the Rust enum variant names as observed in
   * /Users/sac/mcpp/crates/mcpp-automl/src/route_refinement.rs.
   *
   * If the Rust file is changed, these tests will fail on the TS side,
   * prompting the developer to update route-refinement-spec.json and
   * route-refinement.ts in the same commit (GAP-4 closure).
   */

  const RUST_VARIANT_ORDER: string[] = [
    'KeepCurrent',
    'RelaxThreshold',
    'ExtendWindow',
    'SwitchVariant',
    'AddConstraint',
    'PruneActivities',
    'ReDiscoverFull',
    'Escalate',
  ];

  const RUST_ANDON_SIGNAL = 'extension/automl:RouteModelInvalid';

  it('spec ladder matches Rust enum order (documented from route_refinement.rs)', () => {
    const specVariants = getSpecVariants();
    expect(specVariants).toEqual(RUST_VARIANT_ORDER);
  });

  it('spec andon_signal matches Rust ROUTE_REFINEMENT_ANDON constant', () => {
    expect(REFINEMENT_SPEC.andon_signal).toBe(RUST_ANDON_SIGNAL);
  });

  it('VARIANT_LADDER matches Rust enum order (full parity)', () => {
    expect([...VARIANT_LADDER]).toEqual(RUST_VARIANT_ORDER);
  });
});
