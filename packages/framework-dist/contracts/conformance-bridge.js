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
export const ConformanceThresholdsSchema = z.object({
    fitness: z.number().min(0).max(1).optional(),
    precision: z.number().min(0).max(1).optional(),
    lifecycle: z.number().min(0).max(1).optional(),
    cardinality: z.number().min(0).max(1).optional(),
    receipt: z.number().min(0).max(1).optional(),
});
export const FitnessResultSchema = z.object({
    avg_trace_fitness: z.number(),
    avg_trace_precision: z.number(),
});
// ── Evaluation output ─────────────────────────────────────────────────────────
export const DimensionResultSchema = z.object({
    threshold: z.number().nullable(),
    observed: z.number().nullable(),
    passed: z.boolean(),
});
export const ConformanceEvaluationSchema = z.object({
    passed: z.boolean(),
    dimensions: z.record(ConformanceDimensionSchema, DimensionResultSchema),
});
// ── Extra signals not carried by FitnessResult ────────────────────────────────
export const ConformanceExtrasSchema = z.object({
    lifecycle: z.number().optional(),
    cardinality: z.number().optional(),
    receipt: z.number().optional(),
});
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
export function evaluateConformance(result, thresholds, extras) {
    const observed = {
        fitness: result.avg_trace_fitness,
        precision: result.avg_trace_precision,
        lifecycle: extras?.lifecycle ?? null,
        cardinality: extras?.cardinality ?? null,
        receipt: extras?.receipt ?? null,
    };
    const dims = ['fitness', 'precision', 'lifecycle', 'cardinality', 'receipt'].reduce((acc, dim) => {
        const threshold = thresholds[dim] ?? null;
        const obs = observed[dim];
        let passed;
        if (threshold === null) {
            // Dimension not required — trivially passes.
            passed = true;
        }
        else if (obs === null) {
            // Threshold set but no observed signal — fails (cannot verify).
            passed = false;
        }
        else {
            passed = obs >= threshold;
        }
        acc[dim] = { threshold, observed: obs, passed };
        return acc;
    }, {});
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
export function isRefused(thresholds) {
    return ((thresholds.fitness ?? null) === null &&
        (thresholds.precision ?? null) === null &&
        (thresholds.lifecycle ?? null) === null &&
        (thresholds.cardinality ?? null) === null &&
        (thresholds.receipt ?? null) === null);
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
export function toSharedConformance(evaluation) {
    const result = {};
    for (const [dim, detail] of Object.entries(evaluation.dimensions)) {
        if (detail.observed !== null) {
            result[dim] = detail.observed;
        }
    }
    return result;
}
//# sourceMappingURL=conformance-bridge.js.map