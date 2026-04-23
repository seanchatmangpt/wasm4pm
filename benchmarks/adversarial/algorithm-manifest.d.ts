/**
 * Algorithm Manifest — Ground Truth
 *
 * Maps 41 registered algorithm IDs to their WASM implementations
 * Built from cross-referencing @pictl/contracts registry with actual #[wasm_bindgen] exports
 *
 * Source truth: wasm4pm/src/*.rs files with #[wasm_bindgen] decorators
 */
export type OutputType = 'dfg' | 'petrinet' | 'declare' | 'tree' | 'analytics' | 'ocel' | 'powl';
export interface AlgorithmMetadata {
    id: string;
    wasmFn: string;
    outputType: OutputType;
    fitnessCapable: boolean;
    expectedLatencyBudgetMs: number;
    description: string;
    tier?: 0 | 1 | 2 | 3;
}
export declare const ALGORITHM_MANIFEST: AlgorithmMetadata[];
/**
 * Quick lookup by ID
 */
export declare function getAlgorithm(id: string): AlgorithmMetadata | undefined;
/**
 * Filter fitness-capable algorithms (Petri nets only)
 */
export declare function getFitnessCapableAlgorithms(): AlgorithmMetadata[];
/**
 * Filter algorithms that are exported (skipping MISSING/NOT_EXPORTED)
 */
export declare function getExportedAlgorithms(): AlgorithmMetadata[];
/**
 * Summary statistics
 */
export declare function getManifestStats(): {
    total: number;
    exported: number;
    missing: number;
    fitnessCapable: number;
};
//# sourceMappingURL=algorithm-manifest.d.ts.map