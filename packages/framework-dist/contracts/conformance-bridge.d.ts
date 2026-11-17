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
export declare const ConformanceDimensionSchema: z.ZodEnum<["fitness", "precision", "lifecycle", "cardinality", "receipt"]>;
/**
 * The five conformance dimensions that mcpp ConformanceThresholds tracks.
 * Mirrors the Rust enum variants for Option<f64> fields.
 */
export type ConformanceDimension = z.infer<typeof ConformanceDimensionSchema>;
export declare const ConformanceThresholdsSchema: z.ZodObject<{
    fitness: z.ZodOptional<z.ZodNumber>;
    precision: z.ZodOptional<z.ZodNumber>;
    lifecycle: z.ZodOptional<z.ZodNumber>;
    cardinality: z.ZodOptional<z.ZodNumber>;
    receipt: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    fitness?: number | undefined;
    precision?: number | undefined;
    lifecycle?: number | undefined;
    cardinality?: number | undefined;
    receipt?: number | undefined;
}, {
    fitness?: number | undefined;
    precision?: number | undefined;
    lifecycle?: number | undefined;
    cardinality?: number | undefined;
    receipt?: number | undefined;
}>;
/**
 * Threshold specification for each conformance dimension.
 * Mirrors mcpp's ConformanceThresholds where each field is Option<f64>:
 *   - undefined / null → None (dimension not required)
 *   - number (0.0–1.0) → Some(value) (dimension must meet this floor)
 */
export type ConformanceThresholds = z.infer<typeof ConformanceThresholdsSchema>;
export declare const FitnessResultSchema: z.ZodObject<{
    avg_trace_fitness: z.ZodNumber;
    avg_trace_precision: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    avg_trace_fitness: number;
    avg_trace_precision: number;
}, {
    avg_trace_fitness: number;
    avg_trace_precision: number;
}>;
/**
 * Mirrors the Rust FitnessResult struct from wasm4pm/src/powl/conformance/token_replay.rs.
 * Both fields are f64 in Rust, number here.
 */
export type FitnessResult = z.infer<typeof FitnessResultSchema>;
export declare const DimensionResultSchema: z.ZodObject<{
    threshold: z.ZodNullable<z.ZodNumber>;
    observed: z.ZodNullable<z.ZodNumber>;
    passed: z.ZodBoolean;
}, "strip", z.ZodTypeAny, {
    threshold: number | null;
    observed: number | null;
    passed: boolean;
}, {
    threshold: number | null;
    observed: number | null;
    passed: boolean;
}>;
/**
 * Per-dimension evaluation detail.
 */
export type DimensionResult = z.infer<typeof DimensionResultSchema>;
export declare const ConformanceEvaluationSchema: z.ZodObject<{
    passed: z.ZodBoolean;
    dimensions: z.ZodRecord<z.ZodEnum<["fitness", "precision", "lifecycle", "cardinality", "receipt"]>, z.ZodObject<{
        threshold: z.ZodNullable<z.ZodNumber>;
        observed: z.ZodNullable<z.ZodNumber>;
        passed: z.ZodBoolean;
    }, "strip", z.ZodTypeAny, {
        threshold: number | null;
        observed: number | null;
        passed: boolean;
    }, {
        threshold: number | null;
        observed: number | null;
        passed: boolean;
    }>>;
}, "strip", z.ZodTypeAny, {
    passed: boolean;
    dimensions: Partial<Record<"fitness" | "precision" | "lifecycle" | "cardinality" | "receipt", {
        threshold: number | null;
        observed: number | null;
        passed: boolean;
    }>>;
}, {
    passed: boolean;
    dimensions: Partial<Record<"fitness" | "precision" | "lifecycle" | "cardinality" | "receipt", {
        threshold: number | null;
        observed: number | null;
        passed: boolean;
    }>>;
}>;
/**
 * Full evaluation of a FitnessResult against a ConformanceThresholds spec.
 */
export type ConformanceEvaluation = z.infer<typeof ConformanceEvaluationSchema>;
export declare const ConformanceExtrasSchema: z.ZodObject<{
    lifecycle: z.ZodOptional<z.ZodNumber>;
    cardinality: z.ZodOptional<z.ZodNumber>;
    receipt: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    lifecycle?: number | undefined;
    cardinality?: number | undefined;
    receipt?: number | undefined;
}, {
    lifecycle?: number | undefined;
    cardinality?: number | undefined;
    receipt?: number | undefined;
}>;
/**
 * Additional observed values for the three dimensions not present in FitnessResult.
 * Pass these from your OCEL / receipt chain signals.
 */
export type ConformanceExtras = z.infer<typeof ConformanceExtrasSchema>;
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
export declare function evaluateConformance(result: FitnessResult, thresholds: ConformanceThresholds, extras?: ConformanceExtras): ConformanceEvaluation;
/**
 * Returns true if ALL 5 conformance dimensions are undefined/null.
 *
 * This corresponds to mcpp's "refused" state: a ConformanceThresholds where
 * every Option<f64> field is None, meaning the system declines to specify
 * any conformance floor.
 */
export declare function isRefused(thresholds: ConformanceThresholds): boolean;
/**
 * Convert a ConformanceEvaluation into the `conformance` field shape expected
 * by SharedReceiptV1.
 *
 * Returns only the dimensions that have a non-null observed value, since
 * SharedReceiptV1.conformance records actual scores (not thresholds or pass/fail).
 *
 * The caller is responsible for merging this into the SharedReceiptV1 envelope.
 */
export declare function toSharedConformance(evaluation: ConformanceEvaluation): Record<string, number>;
//# sourceMappingURL=conformance-bridge.d.ts.map