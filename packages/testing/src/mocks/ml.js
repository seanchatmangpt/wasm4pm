/**
 * ML mock adapter — deterministic mock results for all 6 ML functions.
 * Use in tests to avoid requiring WASM.
 */
/**
 * Create a mock ML adapter that returns deterministic results.
 * Useful for unit tests and integration tests that don't need real ML.
 */
export function createMockMlAdapter() {
    return {
        async classifyTraces(_features, options) {
            const method = options?.method || 'knn';
            return {
                predictions: [
                    { caseId: 'case-1', predicted: 'normal', confidence: 0.92 },
                    { caseId: 'case-2', predicted: 'anomaly', confidence: 0.78 },
                    { caseId: 'case-3', predicted: 'normal', confidence: 0.85 },
                ],
                method,
                modelInfo: { traceCount: 3, featureCount: 6 },
            };
        },
        async clusterTraces(_features, options) {
            const method = options?.method || 'kmeans';
            const k = options?.k || 3;
            return {
                assignments: [
                    { caseId: 'case-1', cluster: 0 },
                    { caseId: 'case-2', cluster: 1 },
                    { caseId: 'case-3', cluster: 0 },
                ],
                method,
                clusterCount: k,
                noiseCount: 0,
                modelInfo: { inertia: 1.5 },
            };
        },
        async forecastSeries(series, options) {
            const forecastPeriods = options?.forecastPeriods || 5;
            const lastValue = series.length > 0 ? series[series.length - 1] : 0;
            return {
                seriesLength: series.length,
                trend: { direction: 'stable', slope: 0.01, strength: 0.2 },
                forecast: Array.from({ length: forecastPeriods }, () => lastValue + Math.random() * 0.1),
                seasonality: series.length >= 10 ? { period: 5, strength: 0.3 } : undefined,
            };
        },
        async forecastThroughput(series, options) {
            return createMockMlAdapter().forecastSeries(series, options);
        },
        async detectEnhancedAnomalies(distances) {
            const peaks = [];
            const peakValues = [];
            for (let i = 1; i < distances.length - 1; i++) {
                if (distances[i] > distances[i - 1] &&
                    distances[i] > distances[i + 1] &&
                    distances[i] > 0.3) {
                    peaks.push(i);
                    peakValues.push(distances[i]);
                }
            }
            return {
                peakIndices: peaks,
                peakValues,
                residualPeaks: [],
                originalLength: distances.length,
            };
        },
        async regressRemainingTime(_features, options) {
            return {
                method: options?.method || 'linear_regression',
                rSquared: 0.87,
                slope: 2.5,
                intercept: 10.0,
                rmse: 3.2,
                mae: 2.1,
            };
        },
        async reduceFeaturesPCA(_features, options) {
            const nComponents = options?.nComponents || 2;
            return {
                nComponents,
                originalFeatureCount: 6,
                explainedVariance: [0.65, 0.25],
                transformedData: [
                    [1.2, -0.3],
                    [0.8, 0.5],
                    [-0.5, 1.1],
                ],
            };
        },
    };
}
//# sourceMappingURL=ml.js.map