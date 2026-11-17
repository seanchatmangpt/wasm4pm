import { z } from 'zod';
export declare const QualityThresholdProfileSchema: z.ZodObject<{
    fitness_min: z.ZodNumber;
    precision_min: z.ZodNumber;
    generalization_min: z.ZodNumber;
    simplicity_min: z.ZodNumber;
    rationale: z.ZodString;
}, "strip", z.ZodTypeAny, {
    fitness_min: number;
    precision_min: number;
    generalization_min: number;
    simplicity_min: number;
    rationale: string;
}, {
    fitness_min: number;
    precision_min: number;
    generalization_min: number;
    simplicity_min: number;
    rationale: string;
}>;
export type QualityThresholdProfile = z.infer<typeof QualityThresholdProfileSchema>;
export declare const ALGORITHM_QUALITY_THRESHOLDS: Record<string, QualityThresholdProfile>;
export declare const DEFAULT_QUALITY_THRESHOLD: QualityThresholdProfile;
export declare function getQualityThreshold(algorithmId: string): QualityThresholdProfile;
//# sourceMappingURL=quality-thresholds.d.ts.map