/**
 * ML mock adapter — deterministic mock results for all 6 ML functions.
 * Use in tests to avoid requiring WASM.
 */
export interface MockMlAdapter {
  classifyTraces(features: any, options?: any): Promise<any>;
  clusterTraces(features: any, options?: any): Promise<any>;
  forecastSeries(series: number[], options?: any): Promise<any>;
  forecastThroughput(series: number[], options?: any): Promise<any>;
  detectEnhancedAnomalies(distances: number[], options?: any): Promise<any>;
  regressRemainingTime(features: any, options?: any): Promise<any>;
  reduceFeaturesPCA(features: any, options?: any): Promise<any>;
}
/**
 * Create a mock ML adapter that returns deterministic results.
 * Useful for unit tests and integration tests that don't need real ML.
 */
export declare function createMockMlAdapter(): MockMlAdapter;
//# sourceMappingURL=ml.d.ts.map
