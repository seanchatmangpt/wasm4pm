import type { AlgorithmId } from './algorithm-ids.js';
import { ALGORITHM_IDS } from './algorithm-ids.js';
export { ALGORITHM_IDS };
/**
 * Maps algorithm registry ID to WASM export function name.
 * Generated from pi:wasmExport in ggen/ontology/algorithms.ttl.
 */
export declare const WASM_FUNCTION_NAMES: Record<AlgorithmId, string>;
/**
 * Maps algorithm registry ID to process model output type.
 * Generated from pi:outputType in ggen/ontology/algorithms.ttl.
 */
export declare const ALGORITHM_OUTPUT_TYPES: Record<AlgorithmId, string>;
/**
 * Maps algorithm registry ID to functional category.
 * Generated from pi:category in ggen/ontology/algorithms.ttl.
 */
export declare const ALGORITHM_CATEGORIES: Record<AlgorithmId, string>;
export declare function levenshteinDistance(a: string, b: string): number;
export declare function findClosestMatch(name: string, candidates: string[], maxDistance?: number): string | null;
/**
 * Resolve a user-provided algorithm name to a canonical registry ID.
 * Resolution order: exact match → CLI alias → normalized token match.
 */
export declare const ALGORITHM_DEFAULT_PARAMS: Partial<Record<AlgorithmId, readonly unknown[]>>;
export declare function resolveAlgorithmId(input: string, registryIds?: readonly string[]): AlgorithmId | undefined;
//# sourceMappingURL=algorithm-registry.d.ts.map