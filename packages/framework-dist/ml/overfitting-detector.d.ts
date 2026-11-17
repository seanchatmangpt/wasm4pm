/**
 * Overfitting detection suite for classifiers.
 *
 * Detects generalization gaps through:
 * 1. Train/test accuracy divergence
 * 2. Feature importance concentration (Gini coefficient)
 * 3. Feature-to-sample ratio (risk of high-dimensional overfitting)
 * 4. Model complexity vs dataset size
 * 5. Weight magnitude concentration (for logistic regression)
 *
 * Each detector returns a severity level (none|warning|critical) and
 * quantitative evidence.
 */
import { z } from 'zod';
import type { ClassificationResult } from './types.js';
export declare const OverfittingIndicatorSchema: z.ZodObject<{
    /** Detector name */
    detector: z.ZodString;
    /** Severity level */
    severity: z.ZodEnum<["none", "warning", "critical"]>;
    /** Numeric evidence (0-1 scale for most detectors) */
    score: z.ZodNumber;
    /** Human-readable explanation */
    message: z.ZodString;
    /** Actionable recommendation */
    recommendation: z.ZodString;
}, "strip", z.ZodTypeAny, {
    message: string;
    score: number;
    detector: string;
    severity: "none" | "warning" | "critical";
    recommendation: string;
}, {
    message: string;
    score: number;
    detector: string;
    severity: "none" | "warning" | "critical";
    recommendation: string;
}>;
export type OverfittingIndicator = z.infer<typeof OverfittingIndicatorSchema>;
export declare const OverfittingAnalysisSchema: z.ZodObject<{
    /** Overall severity (highest from all detectors) */
    overallSeverity: z.ZodEnum<["none", "warning", "critical"]>;
    /** Individual detector results (sorted by severity) */
    indicators: z.ZodArray<z.ZodObject<{
        /** Detector name */
        detector: z.ZodString;
        /** Severity level */
        severity: z.ZodEnum<["none", "warning", "critical"]>;
        /** Numeric evidence (0-1 scale for most detectors) */
        score: z.ZodNumber;
        /** Human-readable explanation */
        message: z.ZodString;
        /** Actionable recommendation */
        recommendation: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        message: string;
        score: number;
        detector: string;
        severity: "none" | "warning" | "critical";
        recommendation: string;
    }, {
        message: string;
        score: number;
        detector: string;
        severity: "none" | "warning" | "critical";
        recommendation: string;
    }>, "many">;
    /** Summary risk level for decision-making (0.0=safe, 1.0=severe) */
    riskLevel: z.ZodNumber;
    /** Total number of concerning indicators */
    concernCount: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    overallSeverity: "none" | "warning" | "critical";
    indicators: {
        message: string;
        score: number;
        detector: string;
        severity: "none" | "warning" | "critical";
        recommendation: string;
    }[];
    riskLevel: number;
    concernCount: number;
}, {
    overallSeverity: "none" | "warning" | "critical";
    indicators: {
        message: string;
        score: number;
        detector: string;
        severity: "none" | "warning" | "critical";
        recommendation: string;
    }[];
    riskLevel: number;
    concernCount: number;
}>;
export type OverfittingAnalysis = z.infer<typeof OverfittingAnalysisSchema>;
/**
 * Comprehensive overfitting analysis of a classification result.
 *
 * Runs all detectors and aggregates findings with severity ranking.
 * Intended for post-training diagnostics and model selection.
 *
 * @example
 * ```typescript
 * const result = await classifyTraces(features, { crossValidate: true });
 * const analysis = analyzeOverfitting(result);
 * if (analysis.overallSeverity === 'critical') {
 *   console.warn('Model shows severe overfitting signs');
 * }
 * ```
 */
export declare function analyzeOverfitting(result: ClassificationResult): OverfittingAnalysis;
/**
 * Quick check: does the model show overfitting signs?
 *
 * Returns true if any detector reports 'critical' or 2+ report 'warning'.
 */
export declare function hasOverfittingConcerns(result: ClassificationResult): boolean;
/**
 * Quick severity check without full analysis.
 */
export declare function getOverfittingSeverity(result: ClassificationResult): 'none' | 'warning' | 'critical';
//# sourceMappingURL=overfitting-detector.d.ts.map