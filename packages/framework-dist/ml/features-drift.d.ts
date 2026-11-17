/**
 * Feature extraction for drift detection (anomaly-based).
 *
 * Extracts windowed EWMA features from concept drift signals to enable
 * ML-based anomaly detection on top of Jaccard-distance drift detection.
 *
 * Pattern: Same as remaining-time + outcome integrations
 */
import { z } from 'zod';
export declare const DriftFeaturesSchema: z.ZodObject<{
    window_index: z.ZodNumber;
    mean_distance: z.ZodNumber;
    max_distance: z.ZodNumber;
    std_distance: z.ZodNumber;
    trend_slope: z.ZodNumber;
    autocorr_lag1: z.ZodNumber;
    peak_count: z.ZodNumber;
    residual_anomaly_score: z.ZodNumber;
    is_anomalous: z.ZodBoolean;
}, "strip", z.ZodTypeAny, {
    window_index: number;
    mean_distance: number;
    max_distance: number;
    std_distance: number;
    trend_slope: number;
    autocorr_lag1: number;
    peak_count: number;
    residual_anomaly_score: number;
    is_anomalous: boolean;
}, {
    window_index: number;
    mean_distance: number;
    max_distance: number;
    std_distance: number;
    trend_slope: number;
    autocorr_lag1: number;
    peak_count: number;
    residual_anomaly_score: number;
    is_anomalous: boolean;
}>;
/**
 * Drift feature definition.
 *
 * Extracts the following features from a drift distance series:
 * - mean_distance: Average Jaccard distance across window
 * - max_distance: Maximum distance in window (spike detector)
 * - std_distance: Standard deviation (volatility indicator)
 * - trend_slope: Linear trend over window (rising/falling)
 * - autocorr_lag1: Autocorrelation lag-1 (persistence)
 * - peak_count: Number of detected peaks
 * - residual_anomaly_score: Anomaly score from residual decomposition
 */
export type DriftFeatures = z.infer<typeof DriftFeaturesSchema>;
/**
 * Extract drift features from a series of Jaccard distances.
 *
 * Applies windowed feature computation: slides a window of size `windowSize`
 * over the input series, computing features for each window position.
 *
 * @param driftDistances - Array of Jaccard distances from detect_drift
 * @param windowSize - Sliding window size (default 10)
 * @param anomalyThreshold - Threshold for flagging windows as anomalous (default 0.7)
 * @returns Array of DriftFeatures, one per window
 */
export declare function extractDriftFeatures(driftDistances: number[], windowSize?: number, anomalyThreshold?: number): Promise<DriftFeatures[]>;
/**
 * Detect anomalous drift windows using extracted features.
 *
 * Returns indices and scores of windows flagged as anomalous.
 *
 * @param features - Array of DriftFeatures
 * @param scoringMethod - How to weight features ('equal', 'weighted')
 * @returns Object with anomalous window indices and scores
 */
export declare function detectAnomalousDriftWindows(features: DriftFeatures[], scoringMethod?: 'equal' | 'weighted'): {
    anomalousIndices: number[];
    scores: number[];
    threshold: number;
};
//# sourceMappingURL=features-drift.d.ts.map