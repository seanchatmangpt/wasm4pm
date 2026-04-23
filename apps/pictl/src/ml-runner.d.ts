/**
 * ml-runner.ts
 * Shared ML execution logic used by both `pictl ml` and `pictl run`.
 *
 * Extracts the core ML task dispatch from commands/ml.ts so it can be
 * reused without CLI-specific formatting concerns.
 */
export declare const VALID_ML_TASKS: readonly ["classify", "cluster", "forecast", "anomaly", "regress", "pca"];
export type MlTask = (typeof VALID_ML_TASKS)[number];
export interface MlTaskOptions {
    method?: string;
    k?: number | string;
    targetKey?: string;
    forecastPeriods?: number | string;
    nComponents?: number | string;
    eps?: number | string;
    smoothingMethod?: 'sma' | 'ema';
    useExponential?: boolean;
}
/**
 * Execute a single ML task against a loaded WASM event log.
 *
 * @param wasm - WASM module instance (must have extract_case_features and detect_drift)
 * @param task - ML task to execute
 * @param logHandle - Handle from wasm.load_eventlog_from_xes()
 * @param activityKey - Activity attribute key (default: concept:name)
 * @param options - ML-specific options
 * @returns ML result as a plain object
 */
export declare function executeMlTask(wasm: Record<string, any>, task: MlTask, logHandle: string, activityKey: string, options?: MlTaskOptions): Promise<Record<string, unknown>>;
//# sourceMappingURL=ml-runner.d.ts.map