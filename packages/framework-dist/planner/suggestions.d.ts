/**
 * Algorithm recommendation engine for wasm4pm.
 *
 * Produces an ordered list of AlgorithmRecommendation entries based on
 * observed log characteristics and the user's stated goal.
 *
 * Oracle: registry speed/quality scores are the authoritative source of truth.
 * No hard-coded numeric thresholds are used in scoring; all comparisons derive
 * from the registry values so that a change to registry metadata automatically
 * propagates here.
 */
import { z } from 'zod';
export declare const LogStatsSchema: z.ZodObject<{
    traceCount: z.ZodNumber;
    eventCount: z.ZodNumber;
    variantCount: z.ZodNumber;
    /** Number of distinct activity names, if known. */
    activityCount: z.ZodOptional<z.ZodNumber>;
    /** Whether org:resource attribute is present (enables social network mining). */
    hasResources: z.ZodOptional<z.ZodBoolean>;
    /** Whether time:timestamp attribute is present (enables temporal analysis). */
    hasTimestamps: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    traceCount: number;
    eventCount: number;
    variantCount: number;
    activityCount?: number | undefined;
    hasResources?: boolean | undefined;
    hasTimestamps?: boolean | undefined;
}, {
    traceCount: number;
    eventCount: number;
    variantCount: number;
    activityCount?: number | undefined;
    hasResources?: boolean | undefined;
    hasTimestamps?: boolean | undefined;
}>;
export type LogStats = z.infer<typeof LogStatsSchema>;
export type SuggestionGoal = 'fast' | 'balanced' | 'quality' | 'conformance' | 'streaming' | 'find bottlenecks' | 'check compliance' | 'predict outcomes';
/** Normalised string form — maps free-text goals to canonical values. */
export declare function normaliseGoal(raw: string): SuggestionGoal;
export declare const VALID_GOALS: SuggestionGoal[];
export declare const AlgorithmRecommendationSchema: z.ZodObject<{
    algorithm: z.ZodString;
    quality: z.ZodNumber;
    speed: z.ZodNumber;
    /** Composite score in [0, 1]. */
    score: z.ZodNumber;
    reason: z.ZodString;
    /** Expected fitness estimate as a fraction (0–1). */
    expectedFitness: z.ZodOptional<z.ZodNumber>;
    /** Expected precision estimate as a fraction (0–1). */
    expectedPrecision: z.ZodOptional<z.ZodNumber>;
    estimatedTimeMs: z.ZodOptional<z.ZodNumber>;
    /** Detailed explain lines (only populated when explainMode=true). */
    explainLines: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    algorithm: string;
    quality: number;
    reason: string;
    speed: number;
    score: number;
    expectedFitness?: number | undefined;
    expectedPrecision?: number | undefined;
    estimatedTimeMs?: number | undefined;
    explainLines?: string[] | undefined;
}, {
    algorithm: string;
    quality: number;
    reason: string;
    speed: number;
    score: number;
    expectedFitness?: number | undefined;
    expectedPrecision?: number | undefined;
    estimatedTimeMs?: number | undefined;
    explainLines?: string[] | undefined;
}>;
export type AlgorithmRecommendation = z.infer<typeof AlgorithmRecommendationSchema>;
/** Analysis commands recommended as follow-ups for a given goal + log profile. */
export declare const AnalysisRecommendationSchema: z.ZodObject<{
    command: z.ZodString;
    reason: z.ZodString;
    example: z.ZodString;
}, "strip", z.ZodTypeAny, {
    reason: string;
    command: string;
    example: string;
}, {
    reason: string;
    command: string;
    example: string;
}>;
export type AnalysisRecommendation = z.infer<typeof AnalysisRecommendationSchema>;
export declare const SuggestionResultSchema: z.ZodObject<{
    goal: z.ZodEnum<["fast", "balanced", "quality", "conformance", "streaming", "find bottlenecks", "check compliance", "predict outcomes"]>;
    logStats: z.ZodObject<{
        traceCount: z.ZodNumber;
        eventCount: z.ZodNumber;
        variantCount: z.ZodNumber;
        /** Number of distinct activity names, if known. */
        activityCount: z.ZodOptional<z.ZodNumber>;
        /** Whether org:resource attribute is present (enables social network mining). */
        hasResources: z.ZodOptional<z.ZodBoolean>;
        /** Whether time:timestamp attribute is present (enables temporal analysis). */
        hasTimestamps: z.ZodOptional<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        traceCount: number;
        eventCount: number;
        variantCount: number;
        activityCount?: number | undefined;
        hasResources?: boolean | undefined;
        hasTimestamps?: boolean | undefined;
    }, {
        traceCount: number;
        eventCount: number;
        variantCount: number;
        activityCount?: number | undefined;
        hasResources?: boolean | undefined;
        hasTimestamps?: boolean | undefined;
    }>;
    recommendations: z.ZodArray<z.ZodObject<{
        algorithm: z.ZodString;
        quality: z.ZodNumber;
        speed: z.ZodNumber;
        /** Composite score in [0, 1]. */
        score: z.ZodNumber;
        reason: z.ZodString;
        /** Expected fitness estimate as a fraction (0–1). */
        expectedFitness: z.ZodOptional<z.ZodNumber>;
        /** Expected precision estimate as a fraction (0–1). */
        expectedPrecision: z.ZodOptional<z.ZodNumber>;
        estimatedTimeMs: z.ZodOptional<z.ZodNumber>;
        /** Detailed explain lines (only populated when explainMode=true). */
        explainLines: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        algorithm: string;
        quality: number;
        reason: string;
        speed: number;
        score: number;
        expectedFitness?: number | undefined;
        expectedPrecision?: number | undefined;
        estimatedTimeMs?: number | undefined;
        explainLines?: string[] | undefined;
    }, {
        algorithm: string;
        quality: number;
        reason: string;
        speed: number;
        score: number;
        expectedFitness?: number | undefined;
        expectedPrecision?: number | undefined;
        estimatedTimeMs?: number | undefined;
        explainLines?: string[] | undefined;
    }>, "many">;
    analysisRecommendations: z.ZodArray<z.ZodObject<{
        command: z.ZodString;
        reason: z.ZodString;
        example: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        reason: string;
        command: string;
        example: string;
    }, {
        reason: string;
        command: string;
        example: string;
    }>, "many">;
    topPick: z.ZodNullable<z.ZodString>;
    runCommand: z.ZodNullable<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    goal: "balanced" | "quality" | "fast" | "conformance" | "streaming" | "find bottlenecks" | "check compliance" | "predict outcomes";
    logStats: {
        traceCount: number;
        eventCount: number;
        variantCount: number;
        activityCount?: number | undefined;
        hasResources?: boolean | undefined;
        hasTimestamps?: boolean | undefined;
    };
    recommendations: {
        algorithm: string;
        quality: number;
        reason: string;
        speed: number;
        score: number;
        expectedFitness?: number | undefined;
        expectedPrecision?: number | undefined;
        estimatedTimeMs?: number | undefined;
        explainLines?: string[] | undefined;
    }[];
    analysisRecommendations: {
        reason: string;
        command: string;
        example: string;
    }[];
    topPick: string | null;
    runCommand: string | null;
}, {
    goal: "balanced" | "quality" | "fast" | "conformance" | "streaming" | "find bottlenecks" | "check compliance" | "predict outcomes";
    logStats: {
        traceCount: number;
        eventCount: number;
        variantCount: number;
        activityCount?: number | undefined;
        hasResources?: boolean | undefined;
        hasTimestamps?: boolean | undefined;
    };
    recommendations: {
        algorithm: string;
        quality: number;
        reason: string;
        speed: number;
        score: number;
        expectedFitness?: number | undefined;
        expectedPrecision?: number | undefined;
        estimatedTimeMs?: number | undefined;
        explainLines?: string[] | undefined;
    }[];
    analysisRecommendations: {
        reason: string;
        command: string;
        example: string;
    }[];
    topPick: string | null;
    runCommand: string | null;
}>;
export type SuggestionResult = z.infer<typeof SuggestionResultSchema>;
/**
 * Recommend analysis commands based on goal and log profile.
 * These are follow-up commands the user should run after discovery.
 */
export declare function getAnalysisRecommendations(stats: LogStats, goal: SuggestionGoal): AnalysisRecommendation[];
/**
 * Return top `n` algorithm recommendations ordered by composite score.
 *
 * @param logStats   Basic statistics derived from the event log.
 * @param goal       The user's stated analysis goal.
 * @param n          Number of recommendations to return (default: 3).
 * @param explainMode  If true, populate explainLines on each recommendation.
 */
export declare function getSuggestions(logStats: LogStats, goal: SuggestionGoal, n?: number, explainMode?: boolean): AlgorithmRecommendation[];
//# sourceMappingURL=suggestions.d.ts.map