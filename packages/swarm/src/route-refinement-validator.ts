/**
 * route-refinement-validator.ts
 *
 * Validates that a TypeScript implementation of the route-refinement ladder
 * matches the shared JSON spec (`route-refinement-spec.json`).
 *
 * Used by tests to detect silent divergence between the TypeScript
 * (route-refinement.ts) and Rust (mcpp/crates/mcpp-automl/src/route_refinement.rs)
 * implementations (GAP-4 fix).
 */

import spec from './route-refinement-spec.json' with { type: 'json' };

// ---------------------------------------------------------------------------
// Re-export the Andon signal directly from the spec so callers never need to
// hard-code the string literal.
// ---------------------------------------------------------------------------

/** Andon signal constant sourced from the shared spec (closes GAP-4). */
export const REFINEMENT_ANDON_SIGNAL: string = spec.andon_signal;

// ---------------------------------------------------------------------------
// ValidationResult
// ---------------------------------------------------------------------------

export interface ValidationResult {
  /** True when the implementation perfectly matches the spec. */
  valid: boolean;
  /** Human-readable explanation of any mismatch found. */
  errors: string[];
}

// ---------------------------------------------------------------------------
// Spec helpers
// ---------------------------------------------------------------------------

/** Ordered variant names from the spec (ordinal 0 → 7). */
export function getSpecVariants(): string[] {
  return spec.ladder
    .slice()
    .sort((a, b) => a.ordinal - b.ordinal)
    .map((entry) => entry.variant);
}

/** Expected count of variants in the spec. */
export const SPEC_VARIANT_COUNT: number = spec.ladder.length;

// ---------------------------------------------------------------------------
// validateRefinementLadder
// ---------------------------------------------------------------------------

/**
 * Validates that the provided implementation ladder matches the shared spec.
 *
 * @param impl - Ordered array of variant names from the TypeScript implementation
 *               (e.g. `VARIANT_LADDER` from `route-refinement.ts`).
 * @returns `ValidationResult` — valid=true when impl perfectly matches the spec.
 *
 * Checks performed:
 *  1. Variant count matches spec (must be exactly 8).
 *  2. Each variant name at each position matches the spec.
 *  3. First variant has ordinal 0 (`KeepCurrent`).
 *  4. Last variant has escalates=true (`Escalate`).
 */
export function validateRefinementLadder(impl: string[]): ValidationResult {
  const errors: string[] = [];
  const specVariants = getSpecVariants();

  // Check 1: count
  if (impl.length !== specVariants.length) {
    errors.push(
      `Variant count mismatch: impl has ${impl.length}, spec requires ${specVariants.length}.`,
    );
  }

  // Check 2: per-position name match
  const checkLen = Math.min(impl.length, specVariants.length);
  for (let i = 0; i < checkLen; i++) {
    if (impl[i] !== specVariants[i]) {
      errors.push(
        `Ordinal ${i}: impl has '${impl[i]}', spec requires '${specVariants[i]}'.`,
      );
    }
  }

  // Check 3: first variant is KeepCurrent (ordinal 0)
  const firstSpec = spec.ladder.find((e) => e.ordinal === 0);
  if (impl[0] !== firstSpec?.variant) {
    errors.push(
      `First variant must be '${firstSpec?.variant ?? 'KeepCurrent'}', got '${impl[0]}'.`,
    );
  }

  // Check 4: last variant escalates
  const lastEntry = spec.ladder.find((e) => e.ordinal === spec.ladder.length - 1);
  if (lastEntry && !lastEntry.escalates) {
    errors.push(
      `Spec integrity error: last variant '${lastEntry.variant}' must have escalates=true.`,
    );
  }
  if (impl.length > 0) {
    const implLast = impl[impl.length - 1];
    if (lastEntry && implLast !== lastEntry.variant) {
      errors.push(
        `Last variant must be '${lastEntry.variant}', got '${implLast}'.`,
      );
    }
  }

  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// Re-export spec metadata for consumers
// ---------------------------------------------------------------------------

export { spec as REFINEMENT_SPEC };
