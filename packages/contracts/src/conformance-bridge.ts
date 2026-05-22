/**
 * Conformance Bridge — mcpp ConformanceThresholds ↔ wasm4pm FitnessResult
 *
 * Maps mcpp's 5-dimension ConformanceThresholds (Option<f64> in Rust) to
 * wasm4pm's FitnessResult and evaluates whether observed signals meet the spec.
 *
 * Semantics:
 *   - threshold undefined/null → dimension not required; passes trivially
 *   - ALL 5 thresholds undefined/null → mcpp refuses the conformance check
 *   - observed < threshold → dimension fails
 *   - overall passed = every non-null threshold passes
 */

// ── Core types ────────────────────────────────────────────────────────────────

/**
 * The five conformance dimensions that mcpp ConformanceThresholds tracks.
 * Mirrors the Rust enum variants for Option<f64> fields.
 */
export type ConformanceDimension =
  | 'fitness'
  | 'precision'
  | 'lifecycle'
  | 'cardinality'
  | 'receipt';

/**
 * Threshold specification for each conformance dimension.
 * Mirrors mcpp's ConformanceThresholds where each field is Option<f64>:
 *   - undefined / null → None (dimension not required)
 *   - number (0.0–1.0) → Some(value) (dimension must meet this floor)
 */
export interface ConformanceThresholds {
  fitness?: number;
  precision?: number;
  lifecycle?: number;
  cardinality?: number;
  receipt?: number;
}

/**
 * Mirrors the Rust FitnessResult struct from wasm4pm/src/powl/conformance/token_replay.rs.
 * Both fields are f64 in Rust, number here.
 */
export interface FitnessResult {
  avg_trace_fitness: number;
  avg_trace_precision: number;
}

// ── Evaluation output ─────────────────────────────────────────────────────────

/**
 * Per-dimension evaluation detail.
 */
export interface DimensionResult {
  /** The required floor, or null if the dimension was not specified. */
  threshold: number | null;
  /** The observed value, or null if the signal was not provided (not-applicable). */
  observed: number | null;
  /** True when threshold is null (trivially passes) or observed >= threshold. */
  passed: boolean;
}

/**
 * Full evaluation of a FitnessResult against a ConformanceThresholds spec.
 */
export interface ConformanceEvaluation {
  /** True iff every dimension with a non-null threshold passes. */
  passed: boolean;
  /** Per-dimension breakdown. */
  dimensions: Record<ConformanceDimension, DimensionResult>;
}

// ── Extra signals not carried by FitnessResult ────────────────────────────────

/**
 * Additional observed values for the three dimensions not present in FitnessResult.
 * Pass these from your OCEL / receipt chain signals.
 */
export interface ConformanceExtras {
  lifecycle?: number;
  cardinality?: number;
  receipt?: number;
}

// ── Implementation ────────────────────────────────────────────────────────────

/**
 * Evaluate whether a FitnessResult (and optional extra signals) satisfies
 * the given ConformanceThresholds.
 *
 * Rules:
 *   - fitness   → result.avg_trace_fitness
 *   - precision → result.avg_trace_precision
 *   - lifecycle, cardinality, receipt → from extras (null if not provided)
 *   - threshold null/undefined → dimension passes trivially
 *   - observed null + threshold set → dimension fails (signal not provided)
 *   - observed < threshold → dimension fails
 *   - overall passed = ALL non-null-threshold dimensions pass
 */
export function evaluateConformance(
  result: FitnessResult,
  thresholds: ConformanceThresholds,
  extras?: ConformanceExtras,
): ConformanceEvaluation {
  const observed: Record<ConformanceDimension, number | null> = {
    fitness: result.avg_trace_fitness,
    precision: result.avg_trace_precision,
    lifecycle: extras?.lifecycle ?? null,
    cardinality: extras?.cardinality ?? null,
    receipt: extras?.receipt ?? null,
  };

  const dims = (['fitness', 'precision', 'lifecycle', 'cardinality', 'receipt'] as const).reduce(
    (acc, dim) => {
      const threshold = thresholds[dim] ?? null;
      const obs = observed[dim];

      let passed: boolean;
      if (threshold === null) {
        // Dimension not required — trivially passes.
        passed = true;
      } else if (obs === null) {
        // Threshold set but no observed signal — fails (cannot verify).
        passed = false;
      } else {
        passed = obs >= threshold;
      }

      acc[dim] = { threshold, observed: obs, passed };
      return acc;
    },
    {} as Record<ConformanceDimension, DimensionResult>,
  );

  const allPassed = Object.values(dims).every((d) => d.passed);

  return { passed: allPassed, dimensions: dims };
}

/**
 * Returns true if ALL 5 conformance dimensions are undefined/null.
 *
 * This corresponds to mcpp's "refused" state: a ConformanceThresholds where
 * every Option<f64> field is None, meaning the system declines to specify
 * any conformance floor.
 */
export function isRefused(thresholds: ConformanceThresholds): boolean {
  return (
    (thresholds.fitness ?? null) === null &&
    (thresholds.precision ?? null) === null &&
    (thresholds.lifecycle ?? null) === null &&
    (thresholds.cardinality ?? null) === null &&
    (thresholds.receipt ?? null) === null
  );
}

/**
 * Convert a ConformanceEvaluation into the `conformance` field shape expected
 * by SharedReceiptV1.
 *
 * Returns only the dimensions that have a non-null observed value, since
 * SharedReceiptV1.conformance records actual scores (not thresholds or pass/fail).
 *
 * The caller is responsible for merging this into the SharedReceiptV1 envelope.
 */
export function toSharedConformance(
  evaluation: ConformanceEvaluation,
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [dim, detail] of Object.entries(evaluation.dimensions)) {
    if (detail.observed !== null) {
      result[dim] = detail.observed;
    }
  }
  return result;
}
