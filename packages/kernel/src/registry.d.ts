/**
 * registry.ts
 * Algorithm registry for wasm4pm process mining algorithms
 * Maintains metadata, profiles, and execution configuration for all 15+ discovery algorithms
 */
/**
 * Complexity class for O(n) analysis
 */
export type ComplexityClass = 'O(n)' | 'O(n log n)' | 'O(n²)' | 'O(n³)' | 'O(n * d²)' | 'Exponential' | 'NP-Hard';
/**
 * Log characteristics for algorithm suitability matching
 */
export interface LogCharacteristics {
    /** Algorithm performs well on high-variance logs with many trace variants */
    highVarianceOptimal?: boolean;
    /** Algorithm performs well on logs with many distinct activities */
    highActivityOptimal?: boolean;
    /** Noise resistance score (0-100, higher is better) */
    noiseResistance?: number;
    /** Algorithm includes built-in rework detection */
    reworkDetector?: boolean;
}
/**
 * Log statistics for algorithm selection
 */
export interface LogStats {
    /** Total number of events in the log */
    eventCount: number;
    /** Number of distinct traces */
    traceCount: number;
    /** Number of distinct activities */
    activityCount: number;
    /** Number of unique trace variants */
    variantCount: number;
    /** Estimated noise level (0-1, higher = more noise) */
    estimatedNoiseLevel?: number;
}
/**
 * Speed tier: ordinal rank where lower = faster (1 = fastest, 80 = slowest registered).
 * Range spans [1 (simd_streaming_dfg) … 80 (ilp)] across the browser profile.
 * Do NOT change to a formula-derived value — ordering contracts are tested as Rank 2 domain invariants.
 */
export type SpeedTier = number;
/**
 * Quality tier: 0-100 (higher = better model quality)
 * 0-30: basic (DFG, skeleton), 30-50: good (heuristic), 50-70: high (genetic, ILP)
 * 70-85: very high (multi-pass), 85-100: optimal (ILP with full search)
 */
export type QualityTier = number;
/**
 * Execution profile: which algorithms are recommended
 */
export type ExecutionProfile = 'fast' | 'balanced' | 'quality' | 'stream';
/**
 * Deployment profile: WASM build configuration.
 *
 * Profile hierarchy (smallest binary → largest):
 *   mobile (~500KB) ⊆ iot (~1MB) ⊆ edge (~1.5MB) ⊆ fog (~2MB) ⊆ browser (~2.7MB)
 *
 * - mobile: Minimal features for mobile devices (~500KB)
 * - iot: Minimal features for IoT devices (~1.0MB)
 * - edge: Advanced algorithms for edge servers (~1.5MB)
 * - fog: Full features except POWL for fog computing (~2.0MB)
 * - browser: Full feature set, all algorithms (~2.7MB, DEFAULT wasm-pack target)
 *
 * Note: 'browser' is the FULL-FEATURED profile — not a size-constrained target.
 * The name comes from the wasm-pack --target bundler option, not a capability limit.
 */
export type DeploymentProfile = 'mobile' | 'iot' | 'edge' | 'fog' | 'browser';
/**
 * Algorithm metadata
 */
export interface AlgorithmMetadata {
    /** Unique algorithm identifier */
    id: string;
    /** Display name */
    name: string;
    /** Long description */
    description: string;
    /** Output type: 'dfg', 'petrinet', 'declare', etc. */
    outputType: 'dfg' | 'petrinet' | 'declare' | 'tree' | 'ml_result' | 'analytics';
    /** Complexity class */
    complexity: ComplexityClass;
    /** Speed tier (0-100, lower is faster) */
    speedTier: SpeedTier;
    /** Quality tier (0-100, higher is better) */
    qualityTier: QualityTier;
    /** Parameters this algorithm accepts */
    parameters: AlgorithmParameter[];
    /** Which execution profiles include this algorithm */
    supportedProfiles: ExecutionProfile[];
    /** Which deployment profiles include this algorithm */
    deploymentProfiles: DeploymentProfile[];
    /** Estimated duration per 100 events in milliseconds */
    estimatedDurationMs: number;
    /** Estimated memory usage in MB for typical 10k event log */
    estimatedMemoryMB: number;
    /** Whether this algorithm can handle noise/incomplete data well */
    robustToNoise: boolean;
    /** Whether this algorithm scales well to large logs (100k+ events) */
    scalesWell: boolean;
    /** References or academic papers */
    references?: string[];
    /** Log characteristics this algorithm is optimized for */
    logCharacteristics?: LogCharacteristics;
}
/**
 * Algorithm parameter definition
 */
export interface AlgorithmParameter {
    name: string;
    type: 'number' | 'string' | 'boolean' | 'select';
    description: string;
    required: boolean;
    default?: unknown;
    min?: number;
    max?: number;
    options?: unknown[];
}
/**
 * Algorithm registry - manages all known algorithms
 */
export declare class AlgorithmRegistry {
    private algorithms;
    private profileMap;
    private deploymentProfileMap;
    constructor();
    /**
     * Register all wasm4pm algorithms
     */
    private registerAllAlgorithms;
    /**
     * Register a single algorithm (with manual deployment profiles)
     */
    register(metadata: AlgorithmMetadata): void;
    /**
     * Register algorithm with auto-calculated deployment profiles
     */
    registerWithInferredProfiles(metadata: Omit<AlgorithmMetadata, 'deploymentProfiles'>): void;
    /**
     * Infer deployment profiles from supported execution profiles.
     *
     * Profile hierarchy (smallest → largest binary):
     *   mobile (~500KB) ⊆ iot (~1MB) ⊆ edge (~1.5MB) ⊆ fog (~2MB) ⊆ browser (~2.7MB)
     *
     * - fast profile   → mobile, iot, browser       (basic DFG runs everywhere)
     * - balanced profile → edge, fog, browser        (heuristic/alpha require edge+)
     * - quality profile  → fog, browser              (genetic/ILP require fog+)
     * - stream profile   → mobile, iot, edge, fog, browser (streaming is universal)
     *
     * Result: 'browser' always has the superset — it is the full-featured build.
     */
    private inferDeploymentProfiles;
    /**
     * Get algorithm by ID
     */
    get(algorithmId: string): AlgorithmMetadata | undefined;
    /**
     * List all algorithms
     */
    list(): AlgorithmMetadata[];
    /**
     * Get algorithms for a profile
     */
    getForProfile(profile: ExecutionProfile): AlgorithmMetadata[];
    /**
     * Build profile map from algorithm registrations
     */
    private buildProfileMap;
    /**
     * Get algorithms for a deployment profile
     */
    getForDeploymentProfile(profile: DeploymentProfile): AlgorithmMetadata[];
    /**
     * Get algorithms that handle the given input format.
     *
     * 'ocel' returns all algorithms whose IDs start with 'ocel_' — these require
     * an OCEL handle (loaded via load_ocel_from_json) rather than a flat XES handle.
     * They are only available in fog and browser deployment profiles (feature-ocel).
     *
     * 'xes' returns all algorithms that operate on conventional XES event log handles.
     *
     * This method is the canonical way for the CLI and planner to filter algorithms
     * by input format, enabling the PM lifecycle loop to guide practitioners to the
     * right algorithm for their log type.
     */
    getForInputFormat(inputFormat: 'ocel' | 'xes'): AlgorithmMetadata[];
    /**
     * Build deployment profile map from algorithm registrations
     */
    private buildDeploymentProfileMap;
    /**
     * Suggest best algorithm for a profile and log size
     */
    suggestForProfile(profile: ExecutionProfile, logSize: number): AlgorithmMetadata | undefined;
    /**
     * Recommend the best discovery algorithm for a given log size and execution profile.
     *
     * Implements the Van der Aalst quality/speed tradeoff:
     *   - fast   → dfg always (linear time, suits any log size)
     *   - quality → genetic_algorithm when feasible, heuristic_miner as speed guard for large logs
     *   - balanced → size-aware heuristic: inductive for small/simple logs, heuristic for medium,
     *               dfg when the log is too large to afford O(n²) algorithms
     *
     * Returns a registered algorithm ID that callers can pass directly to `run()`.
     */
    getBestAlgorithmForLogSize(logSize: {
        traces: number;
        activities: number;
        profile: 'fast' | 'balanced' | 'quality';
    }): string;
    /**
     * Suggest algorithms suitable for specific log characteristics.
     *
     * Filters registered algorithms by matching their logCharacteristics against
     * the observed log statistics. Returns algorithms ranked by suitability score.
     *
     * @param logStats Log statistics (event count, trace count, activities, variants, noise level)
     * @param profile Execution profile to filter by (optional)
     * @returns Array of algorithm IDs sorted by suitability (best first), or empty if no matches
     *
     * Example:
     *   const stats = { eventCount: 10000, traceCount: 100, activityCount: 50, variantCount: 45 };
     *   const suggestions = registry.suggestByLogCharacteristics(stats, 'quality');
     *   // Returns: ['genetic_algorithm', 'heuristic_miner', ...] (algorithms optimized for high variance)
     */
    suggestByLogCharacteristics(logStats: LogStats, profile?: ExecutionProfile): string[];
}
/**
 * JSON Schema representation of an algorithm parameter
 */
interface JsonSchemaProperty {
    type: string | string[];
    description: string;
    default?: unknown;
    enum?: unknown[];
    minimum?: number;
    maximum?: number;
}
/**
 * Full JSON Schema for a single algorithm
 */
interface AlgorithmJsonSchema {
    $schema: string;
    title: string;
    description: string;
    type: 'object';
    properties: Record<string, JsonSchemaProperty>;
    required: string[];
    additionalProperties: boolean;
}
/**
 * Convert algorithm metadata to JSON Schema format.
 *
 * Maps AlgorithmParameter types to JSON Schema types:
 *   - 'number' → 'number'
 *   - 'string' → 'string'
 *   - 'boolean' → 'boolean'
 *   - 'select' → 'string' with enum
 *
 * Includes range constraints (min/max) and default values.
 */
export declare function algorithmToJsonSchema(metadata: AlgorithmMetadata): AlgorithmJsonSchema;
/**
 * Export entire registry to JSON Schema format (one schema per algorithm)
 *
 * Returns an object where each key is an algorithm ID and the value is its JSON Schema.
 * Suitable for external tools to introspect available algorithms and their parameters.
 */
export declare function registryToJsonSchema(): Record<string, AlgorithmJsonSchema>;
/**
 * Get or create the global algorithm registry
 */
export declare function getRegistry(): AlgorithmRegistry;
export {};
//# sourceMappingURL=registry.d.ts.map