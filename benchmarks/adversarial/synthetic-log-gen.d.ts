/**
 * Synthetic Log Generator — Ground Truth for Audit Validation
 *
 * Generates XES logs with known properties:
 * - 5000 cases × 100 events = 500K events (small scale for quick testing)
 * - Or 50000 cases × 100 events = 5M events (large scale load test)
 * - Perfect sequential process: A → B → C → D (fitness must = 1.0)
 * - No noise, no rework, deterministic timestamps
 */
export interface SyntheticLogConfig {
    numCases: number;
    eventsPerCase: number;
    activities: string[];
    startTime: Date;
    timeBetweenEvents: number;
    timeBetweenCases: number;
}
export declare const DEFAULT_CONFIG: SyntheticLogConfig;
export interface LogStatistics {
    totalEvents: number;
    totalCases: number;
    activityCount: Map<string, number>;
    expectedFitness: number;
}
/**
 * Generate synthetic XES log with known ground truth.
 * Returns the XES XML as a string (for smaller logs).
 */
export declare function generateSyntheticLog(config: SyntheticLogConfig): string;
/**
 * Write synthetic log to file (streaming for large logs).
 */
export declare function writeSyntheticLog(filePath: string, config?: SyntheticLogConfig): LogStatistics;
/**
 * Generate logs for different scales (quick/normal/stress tests).
 */
export declare function generateScaleSeries(outputDir: string): Map<string, LogStatistics>;
//# sourceMappingURL=synthetic-log-gen.d.ts.map