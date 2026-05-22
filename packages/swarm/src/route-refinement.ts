/**
 * RouteRefinementPolicy — 8-variant ladder policy for route refinement.
 *
 * Triggered by the `powl.gap.exhausted` event when the POWL discovery loop
 * has exhausted all gap candidates for an activity. Variants escalate in
 * ascending cost order; the final variant emits an Andon signal and halts.
 *
 * Designed by research agent W4-8 for the mcpp-automl module.
 */

import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// Andon signal constant
// ---------------------------------------------------------------------------

/** Andon signal emitted by the `Escalate` variant to halt the pipeline. */
export const ROUTE_REFINEMENT_ANDON = 'extension/automl:RouteModelInvalid';

// ---------------------------------------------------------------------------
// DiscoveryVariant — 8-variant enum (ascending complexity)
// ---------------------------------------------------------------------------

export type DiscoveryVariant =
  | 'DecisionGraphCyclic'
  | 'DecisionGraphCyclicStrict'
  | 'DecisionGraphMax'
  | 'DecisionGraphClustering'
  | 'DynamicClustering'
  | 'Maximal'
  | 'Tree'
  | 'BruteForce';

const DISCOVERY_VARIANT_ORDER: DiscoveryVariant[] = [
  'DecisionGraphCyclic',
  'DecisionGraphCyclicStrict',
  'DecisionGraphMax',
  'DecisionGraphClustering',
  'DynamicClustering',
  'Maximal',
  'Tree',
  'BruteForce',
];

// ---------------------------------------------------------------------------
// RouteRefinementVariant — 8-variant ladder (ascending cost)
// ---------------------------------------------------------------------------

export type RouteRefinementVariant =
  | 'KeepCurrent'
  | 'RelaxThreshold'
  | 'ExtendWindow'
  | 'SwitchVariant'
  | 'AddConstraint'
  | 'PruneActivities'
  | 'ReDiscoverFull'
  | 'Escalate';

/** Cost assigned to each variant (index === cost). */
const VARIANT_COST: Record<RouteRefinementVariant, number> = {
  KeepCurrent: 0,
  RelaxThreshold: 1,
  ExtendWindow: 2,
  SwitchVariant: 3,
  AddConstraint: 4,
  PruneActivities: 5,
  ReDiscoverFull: 6,
  Escalate: 7,
};

/** Ordered variant ladder by ascending cost. */
const VARIANT_LADDER: RouteRefinementVariant[] = [
  'KeepCurrent',
  'RelaxThreshold',
  'ExtendWindow',
  'SwitchVariant',
  'AddConstraint',
  'PruneActivities',
  'ReDiscoverFull',
  'Escalate',
];

// ---------------------------------------------------------------------------
// RefinementAttempt — state carrier persisted in proposals/<attempt-id>.json
// ---------------------------------------------------------------------------

export interface RefinementAttempt {
  /** ULID identifying this attempt. */
  attempt_id: string;
  /** Variant applied in this attempt. */
  variant: RouteRefinementVariant;
  /** Cost of the variant (0–7). */
  cost: number;
  /** run_id of the trace that emitted `powl.gap.exhausted`. */
  triggered_by: string;
  /** ISO-8601 timestamp when the attempt was created. */
  started_at: string;
  /** The activity IRI/ID that exhausted its gaps. */
  gap_activity_id: string;
  /** Conformance precision score before this attempt. */
  previous_precision: number;
  /** Conformance fitness score before this attempt. */
  previous_fitness: number;
}

// ---------------------------------------------------------------------------
// ULID — lightweight implementation (no external dependency)
// ---------------------------------------------------------------------------

/**
 * Generates a lexicographically sortable ULID string.
 *
 * Format: 10-char timestamp base-32 + 16-char random base-32 = 26 chars.
 */
function ulid(): string {
  const ENCODING = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  const now = Date.now();

  // Encode 48-bit timestamp (10 characters)
  let t = now;
  let ts = '';
  for (let i = 9; i >= 0; i--) {
    ts = ENCODING[t % 32] + ts;
    t = Math.floor(t / 32);
  }

  // Encode 80-bit random component (16 characters)
  let rand = '';
  for (let i = 0; i < 16; i++) {
    rand += ENCODING[Math.floor(Math.random() * 32)];
  }

  return ts + rand;
}

// Use crypto.randomUUID as entropy seed when available; fall back to Math.random ULID.
void randomUUID; // referenced to satisfy noImplicitAny in strict mode

// ---------------------------------------------------------------------------
// Policy functions
// ---------------------------------------------------------------------------

/**
 * Returns the next variant by cost order given the current variant and the
 * zero-based attempt index.
 *
 * @param current - The variant used in the most recent attempt.
 * @param attempt - Zero-based attempt count (0 = first escalation attempt).
 * @throws {RangeError} if `attempt` exceeds 7 (the maximum number of variants).
 */
export function selectNextVariant(
  current: RouteRefinementVariant,
  attempt: number,
): RouteRefinementVariant {
  if (attempt > 7) {
    throw new RangeError(
      `Route refinement exceeded maximum variants: attempt=${attempt} (max 7). ` +
        `Current variant was '${current}'. Emit ${ROUTE_REFINEMENT_ANDON} and halt.`,
    );
  }

  const currentIndex = VARIANT_LADDER.indexOf(current);
  const nextIndex = currentIndex + 1;

  if (nextIndex >= VARIANT_LADDER.length) {
    // Already at Escalate — cannot advance further.
    throw new RangeError(
      `Cannot advance past 'Escalate' variant. ` +
        `Emit ${ROUTE_REFINEMENT_ANDON} and halt.`,
    );
  }

  return VARIANT_LADDER[nextIndex];
}

/**
 * Returns `true` if the swarm should escalate based on attempt history.
 *
 * Escalation is triggered when:
 * - Any attempt already carries the `Escalate` variant, OR
 * - There are 8 or more consecutive failed attempts.
 */
export function shouldEscalate(attempts: RefinementAttempt[]): boolean {
  if (attempts.some((a) => a.variant === 'Escalate')) {
    return true;
  }
  if (attempts.length >= 8) {
    return true;
  }
  return false;
}

/**
 * Creates a new `RefinementAttempt` with a ULID and the current UTC timestamp.
 */
export function createAttempt(
  triggeredBy: string,
  gapActivityId: string,
  variant: RouteRefinementVariant,
  prevPrecision: number,
  prevFitness: number,
): RefinementAttempt {
  return {
    attempt_id: ulid(),
    variant,
    cost: VARIANT_COST[variant],
    triggered_by: triggeredBy,
    started_at: new Date().toISOString(),
    gap_activity_id: gapActivityId,
    previous_precision: prevPrecision,
    previous_fitness: prevFitness,
  };
}

/**
 * LIVE-09b violation check.
 *
 * Returns `true` when BOTH `previous_precision` and `previous_fitness` are
 * below 0.50, indicating a floor breach that requires immediate escalation
 * regardless of the current variant position in the ladder.
 */
export function isLIVE09bViolation(attempt: RefinementAttempt): boolean {
  return attempt.previous_precision < 0.5 && attempt.previous_fitness < 0.5;
}

// ---------------------------------------------------------------------------
// Re-export supporting types for convenience
// ---------------------------------------------------------------------------

export { DISCOVERY_VARIANT_ORDER, VARIANT_LADDER, VARIANT_COST };
