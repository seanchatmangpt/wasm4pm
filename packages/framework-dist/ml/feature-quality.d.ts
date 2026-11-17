/**
 * Feature Quality Assessment Module
 *
 * Evaluates numeric feature matrices for:
 * - Zero-variance columns (waste dimensions)
 * - Multicollinearity (correlated features corrupt regression)
 * - Insufficient samples
 *
 * Returns quality score (0-1) + actionable warnings.
 */
import { z } from 'zod';
export declare const QualityReportSchema: z.ZodObject<{
    qualityScore: z.ZodNumber;
    zeroVarianceColumns: z.ZodNumber;
    correlatedPairs: z.ZodArray<z.ZodObject<{
        col1: z.ZodNumber;
        col2: z.ZodNumber;
        correlation: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        correlation: number;
        col1: number;
        col2: number;
    }, {
        correlation: number;
        col1: number;
        col2: number;
    }>, "many">;
    warnings: z.ZodArray<z.ZodString, "many">;
    recommendations: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    qualityScore: number;
    zeroVarianceColumns: number;
    correlatedPairs: {
        correlation: number;
        col1: number;
        col2: number;
    }[];
    warnings: string[];
    recommendations: string[];
}, {
    qualityScore: number;
    zeroVarianceColumns: number;
    correlatedPairs: {
        correlation: number;
        col1: number;
        col2: number;
    }[];
    warnings: string[];
    recommendations: string[];
}>;
export type QualityReport = z.infer<typeof QualityReportSchema>;
/**
 * Assess feature quality for a numeric feature matrix.
 *
 * Quality scoring (0-1):
 * - Start at 1.0
 * - If >20% columns are zero-variance: -0.4
 * - If max correlation > 0.95: -0.2 per pair (capped at -0.3)
 * - If <10 samples: -0.1
 *
 * @param features - Numeric feature matrix (rows = samples, cols = features)
 * @returns QualityReport with score, warnings, and recommendations
 */
export declare function assessFeatureQuality(features: number[][]): QualityReport;
//# sourceMappingURL=feature-quality.d.ts.map