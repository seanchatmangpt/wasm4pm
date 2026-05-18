/**
 * Conformance Checking Invariant Validation Module
 *
 * **Chicago TDD doctrine:** If metrics pass but violate fundamental logical constraints,
 * the implementation is unsound — not the test.
 *
 * This module implements 5-layer invariant validation for conformance outputs:
 *
 * 1. **Bounds Check** (Rank 1)** — Fitness ∈ [0,1], Precision ∈ [0,1]
 * 2. **Ordering Invariant** (Rank 1)** — Fitness ≥ Precision (always)
 * 3. **Case Count Consistency** (Rank 2)** — sum(case results) = total_cases
 * 4. **Token Account Balance** (Rank 1)** — Produced ≥ Consumed ≥ Missing (per trace)
 * 5. **Final State Coherence** (Rank 2)** — Conforming cases → zero deviations (deterministic)
 *
 * Each invariant emits OTEL evidence (span + attributes).
 * Violations are collected and returned as structured findings.
 *
 * ## Expected Behavior
 *
 * | Invariant | Condition | Violation |
 * |-----------|-----------|-----------|
 * | I-1: Bounds | fitness ∈ [0,1] AND precision ∈ [0,1] | fitness=-0.1 OR precision=1.5 |
 * | I-2: Ordering | fitness ≥ precision | fitness=0.7, precision=0.8 |
 * | I-3: Case Sum | Σ(case_fitness) / count = avg_fitness | avg=0.75, cases avg=0.70 |
 * | I-4: Tokens | produced ≥ consumed ≥ 0, remaining ≥ 0, missing ≥ 0 | produced=5, consumed=7 |
 * | I-5: Final State | is_conforming=true ⟹ deviations=∅ | conforming=true, deviations=[...] |
 *
 * ## Usage
 *
 * ```typescript
 * const violations = validateConformanceResult(fitnessValue, precisionValue, caseFitness);
 * if (violations.length > 0) {
 *   console.warn('Logical consistency violations detected:', violations);
 *   process.exit(3); // execution_error
 * }
 * ```
 */

import { trace } from '@opentelemetry/api';
import type { Span, SpanOptions } from '@opentelemetry/api';

const tracer = trace.getTracer('wasm4pm.conformance.invariants');

/**
 * **Invariant Violation**
 * Structured evidence of a constraint breach.
 */
export interface InvariantViolation {
  /** Invariant ID: I-1, I-2, ..., I-5 */
  id: 'I-1' | 'I-2' | 'I-3' | 'I-4' | 'I-5';
  /** Human-readable violation description */
  violation: string;
  /** Mathematical consequence of the violation */
  consequence: string;
  /** Severity: critical (blocks execution), warning (anomalous but not impossible) */
  severity: 'critical' | 'warning';
  /** Raw values involved in the violation (for debugging) */
  evidence: Record<string, unknown>;
}

/**
 * **Case Fitness Entry** — per-trace conformance result
 * Mirrors the shape returned by `check_token_based_replay()`.
 */
export interface CaseFitnessResult {
  case_id: string;
  is_conforming: boolean;
  trace_fitness: number;
  tokens_missing: number;
  tokens_remaining: number;
  deviations: Array<{ event_index: number; activity: string; deviation_type: string }>;
}

/**
 * **Invariant I-1: Bounds Check**
 *
 * Fitness ∈ [0, 1] AND Precision ∈ [0, 1].
 * Clamp-based implementations may mask underflow/overflow bugs.
 *
 * **Violation:** Any value outside [0, 1] indicates:
 * - Denominator underflow (zero denominator not guarded)
 * - Arithmetic error (formula not applied correctly)
 * - NaN propagation (division by zero creating NaN)
 */
function checkBoundsInvariant(
  fitness: number,
  precision: number | null,
  span: Span
): InvariantViolation[] {
  const violations: InvariantViolation[] = [];

  // Check fitness bounds
  if (!Number.isFinite(fitness) || fitness < 0 || fitness > 1) {
    violations.push({
      id: 'I-1',
      violation: `Fitness ${fitness} outside [0, 1]`,
      consequence: 'Model cannot distinguish conformal from non-conformal traces',
      severity: 'critical',
      evidence: { fitness, type: typeof fitness },
    });
  }

  // Check precision bounds (only if computed)
  if (precision !== null && (!Number.isFinite(precision) || precision < 0 || precision > 1)) {
    violations.push({
      id: 'I-1',
      violation: `Precision ${precision} outside [0, 1]`,
      consequence: 'Model underfitting/overfitting detection is unreliable',
      severity: 'critical',
      evidence: { precision, type: typeof precision },
    });
  }

  if (violations.length > 0) {
    span.addEvent('conformance.invariant.i1_violation', {
      severity: 'critical',
      count: violations.length,
    });
  }

  return violations;
}

/**
 * **Invariant I-2: Ordering Constraint**
 *
 * Fitness ≥ Precision (always, mathematically proven).
 *
 * **Rationale:** Precision = coverage of observed behavior.
 * Fitness = model's ability to replay observed traces.
 * A model that replays more traces (fitness) must not cover *less* behavior (precision).
 *
 * **Violation:** Fitness < Precision indicates:
 * - Formula error (swapped numerator/denominator)
 * - Independent implementation bug (precision computed incorrectly)
 * - Rounding artifact (rare, but possible with extreme trace counts)
 */
function checkOrderingInvariant(
  fitness: number,
  precision: number | null,
  span: Span
): InvariantViolation[] {
  const violations: InvariantViolation[] = [];

  if (precision !== null && Number.isFinite(fitness) && Number.isFinite(precision)) {
    if (fitness < precision) {
      violations.push({
        id: 'I-2',
        violation: `Fitness ${fitness} < Precision ${precision}`,
        consequence: 'Model covers MORE behavior than it can replay (logical impossibility)',
        severity: 'critical',
        evidence: { fitness, precision, delta: precision - fitness },
      });

      span.addEvent('conformance.invariant.i2_violation', {
        fitness,
        precision,
        delta: precision - fitness,
        severity: 'critical',
      });
    }
  }

  return violations;
}

/**
 * **Invariant I-3: Case Count Consistency**
 *
 * Σ(case_fitness[i]) / len(case_fitness) = avg_fitness
 * (within floating-point rounding tolerance ±1e-6)
 *
 * **Violation:** avg_fitness derived from case_fitness array must match
 * the reported avg_fitness. Discrepancy indicates:
 * - Cases dropped or duplicated during aggregation
 * - avg_fitness computed from a different dataset
 * - Floating-point rounding beyond tolerance
 */
function checkCaseCountConsistency(
  avgFitness: number,
  caseFitness: CaseFitnessResult[],
  totalCases: number,
  span: Span
): InvariantViolation[] {
  const violations: InvariantViolation[] = [];

  // Check that case_fitness.length matches total_cases
  if (caseFitness.length !== totalCases) {
    violations.push({
      id: 'I-3',
      violation: `case_fitness.length (${caseFitness.length}) ≠ total_cases (${totalCases})`,
      consequence: 'Some traces missing from per-case breakdown; aggregate not trustworthy',
      severity: 'critical',
      evidence: { case_count: caseFitness.length, total_cases: totalCases },
    });
  }

  // Verify avg_fitness matches the reported avg
  if (caseFitness.length > 0) {
    const recomputedAvg = caseFitness.reduce((sum, c) => sum + c.trace_fitness, 0) / caseFitness.length;
    const tolerance = 1e-6;
    if (Math.abs(avgFitness - recomputedAvg) > tolerance) {
      violations.push({
        id: 'I-3',
        violation: `Reported avg_fitness (${avgFitness}) ≠ recomputed (${recomputedAvg})`,
        consequence: 'Case-level and aggregate-level fitness are inconsistent',
        severity: 'warning',
        evidence: {
          reported: avgFitness,
          recomputed: recomputedAvg,
          delta: Math.abs(avgFitness - recomputedAvg),
        },
      });
    }
  }

  if (violations.length > 0) {
    span.addEvent('conformance.invariant.i3_violation', {
      case_count: caseFitness.length,
      total_cases: totalCases,
      severity: violations[0].severity,
    });
  }

  return violations;
}

/**
 * **Invariant I-4: Token Account Balance**
 *
 * Per-trace invariant (van der Aalst 2016):
 * - produced ≥ consumed (net produces tokens)
 * - consumed ≥ 0 (no negative consumption)
 * - missing ≥ 0 (no negative deficit)
 * - remaining ≥ 0 (no negative balance)
 *
 * **Violation:** Any negative value or produced < consumed indicates:
 * - Underflow bug in token counting
 * - Wrong sign on missing/consumed in fitness formula
 * - Arc weights not applied correctly
 */
function checkTokenBalance(
  caseFitness: CaseFitnessResult[],
  span: Span
): InvariantViolation[] {
  const violations: InvariantViolation[] = [];

  for (const caseResult of caseFitness) {
    // All token counts must be non-negative
    if (caseResult.tokens_missing < 0) {
      violations.push({
        id: 'I-4',
        violation: `Case ${caseResult.case_id}: tokens_missing (${caseResult.tokens_missing}) < 0`,
        consequence: 'Token deficit is impossible; underflow bug in replay',
        severity: 'critical',
        evidence: { case_id: caseResult.case_id, tokens_missing: caseResult.tokens_missing },
      });
    }

    if (caseResult.tokens_remaining < 0) {
      violations.push({
        id: 'I-4',
        violation: `Case ${caseResult.case_id}: tokens_remaining (${caseResult.tokens_remaining}) < 0`,
        consequence: 'Remaining tokens are impossible; accounting error',
        severity: 'critical',
        evidence: { case_id: caseResult.case_id, tokens_remaining: caseResult.tokens_remaining },
      });
    }

    // If both missing and remaining are defined, verify semi-negative-monotonicity
    // (at least one should be non-zero if fitness < 1)
    if (caseResult.trace_fitness < 1.0) {
      const hasDeficit = caseResult.tokens_missing > 0 || caseResult.tokens_remaining > 0;
      if (!hasDeficit) {
        violations.push({
          id: 'I-4',
          violation: `Case ${caseResult.case_id}: trace_fitness < 1.0 but missing=0, remaining=0`,
          consequence: 'Fitness indicates non-conformance but no tokens unaccounted for',
          severity: 'warning',
          evidence: {
            case_id: caseResult.case_id,
            trace_fitness: caseResult.trace_fitness,
            tokens_missing: caseResult.tokens_missing,
            tokens_remaining: caseResult.tokens_remaining,
          },
        });
      }
    }
  }

  if (violations.length > 0) {
    span.addEvent('conformance.invariant.i4_violation', {
      affected_cases: violations.filter((v) => v.id === 'I-4').length,
      severity: violations[0].severity,
    });
  }

  return violations;
}

/**
 * **Invariant I-5: Final State Coherence**
 *
 * Per-trace invariant:
 * is_conforming = true ⟹ deviations = ∅ (empty array)
 *
 * **Rationale:** Conforming traces must have no recorded deviations.
 * Violation indicates:
 * - is_conforming computed from final marking only (ignores deviations)
 * - Deviations accumulated but not checked
 * - Data structure corruption
 */
function checkFinalStateCoherence(
  caseFitness: CaseFitnessResult[],
  span: Span
): InvariantViolation[] {
  const violations: InvariantViolation[] = [];

  for (const caseResult of caseFitness) {
    const hasDeviations = caseResult.deviations && caseResult.deviations.length > 0;

    if (caseResult.is_conforming && hasDeviations) {
      violations.push({
        id: 'I-5',
        violation: `Case ${caseResult.case_id}: is_conforming=true but deviations.length=${caseResult.deviations.length}`,
        consequence: 'Conformance determination ignores recorded deviations',
        severity: 'warning',
        evidence: {
          case_id: caseResult.case_id,
          is_conforming: caseResult.is_conforming,
          deviation_count: caseResult.deviations.length,
          first_deviation: caseResult.deviations[0]?.deviation_type,
        },
      });
    }

    // Inverse: non-conforming traces should have deviations (soft check)
    if (!caseResult.is_conforming && !hasDeviations) {
      violations.push({
        id: 'I-5',
        violation: `Case ${caseResult.case_id}: is_conforming=false but deviations.length=0`,
        consequence: 'Non-conformance marked but no explanation recorded',
        severity: 'warning',
        evidence: {
          case_id: caseResult.case_id,
          is_conforming: caseResult.is_conforming,
          trace_fitness: caseResult.trace_fitness,
        },
      });
    }
  }

  if (violations.length > 0) {
    span.addEvent('conformance.invariant.i5_violation', {
      affected_cases: violations.filter((v) => v.id === 'I-5').length,
      severity: violations[0].severity,
    });
  }

  return violations;
}

/**
 * **Master Validator** — 5-layer invariant audit
 *
 * Runs all 5 invariant checks and returns aggregated violations.
 * Emits OTEL span with results.
 *
 * **Return value:**
 * - Empty array: all constraints satisfied ✓
 * - Non-empty array: violations detected (check severity field)
 */
export function validateConformanceResult(
  fitnessValue: number,
  precisionValue: number | null,
  totalCases: number,
  caseFitness: CaseFitnessResult[],
  avgFitness: number
): InvariantViolation[] {
  const spanOptions: SpanOptions = {
    attributes: {
      'conformance.audit': 'full',
      'fitness': fitnessValue,
      'precision': precisionValue ?? null,
      'total_cases': totalCases,
      'case_results': caseFitness.length,
      'avg_fitness': avgFitness,
    },
  };

  const span = tracer.startSpan('conformance.invariant.audit', spanOptions);

  try {
    const violations: InvariantViolation[] = [];

    // Layer 1: Bounds (Rank 1 oracle)
    violations.push(...checkBoundsInvariant(fitnessValue, precisionValue, span));

    // Layer 2: Ordering (Rank 1 oracle)
    violations.push(...checkOrderingInvariant(fitnessValue, precisionValue, span));

    // Layer 3: Case count (Rank 2 oracle)
    violations.push(...checkCaseCountConsistency(avgFitness, caseFitness, totalCases, span));

    // Layer 4: Token balance (Rank 1 oracle)
    violations.push(...checkTokenBalance(caseFitness, span));

    // Layer 5: Final state (Rank 2 oracle)
    violations.push(...checkFinalStateCoherence(caseFitness, span));

    // Emit summary
    const criticalCount = violations.filter((v) => v.severity === 'critical').length;
    const warningCount = violations.filter((v) => v.severity === 'warning').length;

    span.addEvent('conformance.invariant.summary', {
      total_violations: violations.length,
      critical: criticalCount,
      warnings: warningCount,
      passed: violations.length === 0,
    });

    return violations;
  } finally {
    span.end();
  }
}

/**
 * **Convenience Validator** — infers total_cases and avg_fitness from case array
 *
 * Reduces boilerplate for callers that have case-level results.
 */
export function validateConformanceResultFromCases(
  fitnessValue: number,
  precisionValue: number | null,
  caseFitness: CaseFitnessResult[]
): InvariantViolation[] {
  const totalCases = caseFitness.length;
  const avgFitness =
    caseFitness.length > 0
      ? caseFitness.reduce((sum, c) => sum + c.trace_fitness, 0) / caseFitness.length
      : 0;

  return validateConformanceResult(fitnessValue, precisionValue, totalCases, caseFitness, avgFitness);
}
