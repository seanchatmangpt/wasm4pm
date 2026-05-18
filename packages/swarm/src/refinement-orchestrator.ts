/**
 * refinement-orchestrator — Ties RouteRefinementPolicy functions together with
 * persistence-ready state management.
 *
 * The orchestrator owns the state machine that advances through the 8-variant
 * ladder. Callers drive iteration by calling `stepRefinement` in a loop and
 * persisting `serializeState` output to `proposals/<run_id>.json` after each step.
 */

import {
  type RefinementAttempt,
  type RouteRefinementVariant,
  createAttempt,
  isLIVE09bViolation,
  selectNextVariant,
  shouldEscalate,
} from './route-refinement.js';

import {
  type GapTraceRecord,
  emitGapDetected,
  emitGapClosed,
  emitGapExhausted,
} from './gap-events.js';

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

/** Persistent state for a single refinement run. Serialize with `serializeState`. */
export interface RefinementState {
  /** All attempts made so far, in creation order. */
  attempts: RefinementAttempt[];
  /** The variant currently active (reflects the most recent attempt, or initial). */
  current_variant: RouteRefinementVariant;
  /** True once the LIVE-09b or escalation Andon signal has been emitted. */
  andon_emitted: boolean;
  /** ISO-8601 timestamp when the refinement run was initialised. */
  started_at: string;
  /** Opaque run identifier — used as the filename stem in proposals/<run_id>.json. */
  run_id: string;
}

/** Caller-supplied context describing the current conformance measurements. */
export interface RefinementContext {
  /** Absolute path to the OCEL log file being evaluated. */
  ocel_path: string;
  /** Part / case identifier from the manufacturing pipeline. */
  part_id: string;
  /** Run identifier — must match the `run_id` in the associated `RefinementState`. */
  run_id: string;
  /** IRI or ID of the gap activity that exhausted its candidates. */
  gap_activity_id: string;
  /** Conformance precision score measured after the latest attempt (0–1). */
  current_precision: number;
  /** Conformance fitness score measured after the latest attempt (0–1). */
  current_fitness: number;
  /** Precision threshold at or above which the run is considered resolved (0–1). */
  threshold: number;
}

/** Action returned by `stepRefinement` describing the next instruction for the caller. */
export type RefinementAction = 'continue' | 'escalate' | 'resolved';

/** Return value of `stepRefinement`. */
export interface StepResult {
  next_state: RefinementState;
  action: RefinementAction;
}

// ---------------------------------------------------------------------------
// State initialisation
// ---------------------------------------------------------------------------

/**
 * Creates the initial `RefinementState` for a new run.
 *
 * The state begins with zero attempts and the `KeepCurrent` variant, which is
 * the cheapest position on the ladder (cost 0). Callers should immediately
 * persist the result via `serializeState`.
 *
 * @example
 * ```ts
 * const ctx: RefinementContext = { ... };
 * const state = initRefinementState(ctx);
 * fs.writeFileSync(`proposals/${ctx.run_id}.json`, serializeState(state));
 * ```
 */
export function initRefinementState(ctx: RefinementContext): RefinementState {
  return {
    attempts: [],
    current_variant: 'KeepCurrent',
    andon_emitted: false,
    started_at: new Date().toISOString(),
    run_id: ctx.run_id,
  };
}

// ---------------------------------------------------------------------------
// Step orchestrator
// ---------------------------------------------------------------------------

/**
 * Advances the refinement state machine by one step.
 *
 * Decision order (first matching rule wins):
 *
 * 1. **LIVE-09b violation** — if the latest attempt has both precision and
 *    fitness below 0.50, emit Andon and escalate immediately.
 * 2. **Escalation by history** — if `shouldEscalate` returns true (8+ attempts
 *    or an `Escalate` variant present), set `andon_emitted` and return
 *    `action: 'escalate'`.
 * 3. **Resolved** — if `current_precision >= threshold`, the run is done;
 *    return `action: 'resolved'`.
 * 4. **Continue** — advance to the next variant on the ladder, create a new
 *    attempt, append it to state, return `action: 'continue'`.
 *
 * The returned `next_state` is immutable relative to the input `state`; callers
 * must persist it after each step.
 */
export function stepRefinement(
  state: RefinementState,
  ctx: RefinementContext,
): StepResult {
  // Rule 1 — LIVE-09b violation on the latest recorded attempt.
  const latestAttempt = state.attempts.at(-1);
  if (latestAttempt !== undefined && isLIVE09bViolation(latestAttempt)) {
    const next_state: RefinementState = {
      ...state,
      andon_emitted: true,
    };
    return { next_state, action: 'escalate' };
  }

  // Rule 2 — History-based escalation.
  if (shouldEscalate(state.attempts)) {
    const next_state: RefinementState = {
      ...state,
      andon_emitted: true,
    };
    return { next_state, action: 'escalate' };
  }

  // Rule 3 — Threshold met; run is resolved.
  if (ctx.current_precision >= ctx.threshold) {
    return { next_state: { ...state }, action: 'resolved' };
  }

  // Rule 4 — Advance the ladder.
  const attemptIndex = state.attempts.length;
  const next_variant = selectNextVariant(state.current_variant, attemptIndex);

  const newAttempt = createAttempt(
    ctx.run_id,
    ctx.gap_activity_id,
    next_variant,
    ctx.current_precision,
    ctx.current_fitness,
  );

  const next_state: RefinementState = {
    ...state,
    attempts: [...state.attempts, newAttempt],
    current_variant: next_variant,
  };

  return { next_state, action: 'continue' };
}

// ---------------------------------------------------------------------------
// Serialisation / deserialisation
// ---------------------------------------------------------------------------

/**
 * Serialises a `RefinementState` to a JSON string for persistence.
 *
 * Intended for writing to `proposals/<run_id>.json`:
 *
 * @example
 * ```ts
 * fs.writeFileSync(`proposals/${state.run_id}.json`, serializeState(state));
 * ```
 */
export function serializeState(state: RefinementState): string {
  return JSON.stringify(state, null, 2);
}

/**
 * Deserialises a JSON string back into a `RefinementState`.
 *
 * Performs a structural type guard — throws `TypeError` if any required top-level
 * field is absent or of the wrong primitive type.
 *
 * @throws {TypeError} if the parsed value does not satisfy `RefinementState`.
 *
 * @example
 * ```ts
 * const json = fs.readFileSync(`proposals/${run_id}.json`, 'utf8');
 * const state = deserializeState(json);
 * ```
 */
export function deserializeState(json: string): RefinementState {
  const parsed: unknown = JSON.parse(json);

  if (parsed === null || typeof parsed !== 'object') {
    throw new TypeError('deserializeState: root value must be an object');
  }

  const obj = parsed as Record<string, unknown>;

  if (!Array.isArray(obj['attempts'])) {
    throw new TypeError('deserializeState: missing or invalid field "attempts"');
  }
  if (typeof obj['current_variant'] !== 'string') {
    throw new TypeError('deserializeState: missing or invalid field "current_variant"');
  }
  if (typeof obj['andon_emitted'] !== 'boolean') {
    throw new TypeError('deserializeState: missing or invalid field "andon_emitted"');
  }
  if (typeof obj['started_at'] !== 'string') {
    throw new TypeError('deserializeState: missing or invalid field "started_at"');
  }
  if (typeof obj['run_id'] !== 'string') {
    throw new TypeError('deserializeState: missing or invalid field "run_id"');
  }

  return obj as unknown as RefinementState;
}

// ---------------------------------------------------------------------------
// Gap lifecycle event derivation
// ---------------------------------------------------------------------------

/**
 * Derives LIVE-09 gap lifecycle span events from a state/result pair.
 *
 * Rules (first match wins):
 * - Empty attempts before step → `powl.gap.detected` (first encounter of this gap)
 * - Result action is `'escalate'` → `powl.gap.exhausted` (variants exhausted)
 * - Result action is `'resolved'` → `powl.gap.closed` (gap resolved)
 * - Otherwise → `[]` (mid-ladder advance; no lifecycle event)
 *
 * @param state  The `RefinementState` **before** `stepRefinement` was called.
 * @param result The `StepResult` returned by `stepRefinement`.
 * @param correlationId An opaque correlation identifier for the LIVE-09 rule.
 */
export function getGapEvents(
  state: RefinementState,
  result: StepResult,
  correlationId: string,
): GapTraceRecord[] {
  const now = new Date().toISOString();
  const gapActivityId = result.next_state.attempts.at(-1)?.gap_activity_id
    ?? state.attempts.at(-1)?.gap_activity_id
    ?? '';

  // First detection — no attempts existed before this step.
  if (state.attempts.length === 0) {
    return [
      emitGapDetected({
        runId: state.run_id,
        gapActivityId,
        correlationId,
        detectedAt: now,
      }),
    ];
  }

  // Escalation — all variants exhausted.
  if (result.action === 'escalate') {
    return [
      emitGapExhausted({
        runId: state.run_id,
        gapActivityId,
        correlationId,
        exhaustedAt: now,
        attemptsCount: result.next_state.attempts.length,
      }),
    ];
  }

  // Resolved — gap closed by a successful variant.
  if (result.action === 'resolved') {
    return [
      emitGapClosed({
        runId: state.run_id,
        gapActivityId,
        correlationId,
        closedAt: now,
        closingVariant: state.current_variant,
      }),
    ];
  }

  // Mid-ladder continue — no lifecycle boundary event.
  return [];
}
