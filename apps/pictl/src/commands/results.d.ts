/**
 * Default directory where prediction results are persisted.
 * Relative to cwd at invocation time.
 */
export declare const RESULTS_DIR: string;
export interface SavedResult {
    version: 1;
    savedAt: string;
    task: string;
    input: string;
    activityKey: string;
    result: Record<string, unknown>;
}
/**
 * Persist a prediction result to .wasm4pm/results/<timestamp>-<task>.json.
 * Creates the directory on first use.  Never throws — failures are silently
 * reported so they don't break the main predict command.
 *
 * @returns The absolute path of the written file, or null on failure.
 */
export declare function savePredictionResult(task: string, input: string, activityKey: string, result: Record<string, unknown>): Promise<string | null>;
export declare const results: import("citty").CommandDef<{
    cat: {
        type: "string";
        description: string;
        alias: string;
    };
    last: {
        type: "boolean";
        description: string;
        alias: string;
    };
    limit: {
        type: "string";
        description: string;
        default: string;
    };
    format: {
        type: "string";
        description: string;
        default: string;
    };
    verbose: {
        type: "boolean";
        description: string;
        alias: string;
    };
    quiet: {
        type: "boolean";
        description: string;
        alias: string;
    };
}>;
//# sourceMappingURL=results.d.ts.map