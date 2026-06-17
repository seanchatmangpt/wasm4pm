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

import { z } from 'zod';

// ── Zod schemas (source of truth for runtime validation) ──────────────────────

export const ConformanceDimensionSchema = z.enum([
  'fitness',
  'precision',
  'lifecycle',
  'cardinality',
  'receipt',
]);

/**
 * The five conformance dimensions that mcpp ConformanceThresholds tracks.
 * Mirrors the Rust enum variants for Option<f64> fields.
 */
export type ConformanceDimension = z.infer<typeof ConformanceDimensionSchema>;

export const ConformanceThresholdsSchema = z.object({
  fitness: z.number().min(0).max(1).optional(),
  precision: z.number().min(0).max(1).optional(),
  lifecycle: z.number().min(0).max(1).optional(),
  cardinality: z.number().min(0).max(1).optional(),
  receipt: z.number().min(0).max(1).optional(),
});

/**
 * Threshold specification for each conformance dimension.
 * Mirrors mcpp's ConformanceThresholds where each field is Option<f64>:
 *   - undefined / null → None (dimension not required)
 *   - number (0.0–1.0) → Some(value) (dimension must meet this floor)
 */
export type ConformanceThresholds = z.infer<typeof ConformanceThresholdsSchema>;

export const FitnessResultSchema = z.object({
  avg_trace_fitness: z.number(),
  avg_trace_precision: z.number(),
});

/**
 * Mirrors the Rust FitnessResult struct from wasm4pm/src/powl/conformance/token_replay.rs.
 * Both fields are f64 in Rust, number here.
 */
export type FitnessResult = z.infer<typeof FitnessResultSchema>;

// ── Evaluation output ─────────────────────────────────────────────────────────

export const DimensionResultSchema = z.object({
  threshold: z.number().nullable(),
  observed: z.number().nullable(),
  passed: z.boolean(),
});

/**
 * Per-dimension evaluation detail.
 */
export type DimensionResult = z.infer<typeof DimensionResultSchema>;

export const ConformanceEvaluationSchema = z.object({
  passed: z.boolean(),
  dimensions: z.record(ConformanceDimensionSchema, DimensionResultSchema),
});

/**
 * Full evaluation of a FitnessResult against a ConformanceThresholds spec.
 */
export type ConformanceEvaluation = z.infer<typeof ConformanceEvaluationSchema>;

// ── Extra signals not carried by FitnessResult ────────────────────────────────

export const ConformanceExtrasSchema = z.object({
  lifecycle: z.number().optional(),
  cardinality: z.number().optional(),
  receipt: z.number().optional(),
});

/**
 * Additional observed values for the three dimensions not present in FitnessResult.
 * Pass these from your OCEL / receipt chain signals.
 */
export type ConformanceExtras = z.infer<typeof ConformanceExtrasSchema>;

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
