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
 * Speed tier: 0-100 (lower = faster)
 * 0-10: instant (<1ms), 10-30: very fast (1-10ms), 30-50: fast (10-100ms)
 * 50-70: moderate (100ms-1s), 70-85: slow (1-10s), 85-100: very slow (10s+)
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
 * Deployment profile: WASM build configuration
 * - browser: Minimal features for web browsers (~500KB)
 * - edge: Advanced algorithms for edge servers (~1.5MB)
 * - fog: Full features except POWL for fog computing (~2.0MB)
 * - iot: Minimal features for IoT devices (~1.0MB)
 * - cloud: Full feature set for cloud servers (~2.78MB)
 */
export type DeploymentProfile = 'browser' | 'edge' | 'fog' | 'iot' | 'cloud';
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
    outputType: 'dfg' | 'petrinet' | 'declare' | 'tree' | 'ml_result';
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
     * Infer deployment profiles from supported execution profiles
     * - fast profile → browser, iot
     * - balanced profile → browser, edge, fog, cloud
     * - quality profile → edge, fog, cloud
     * - stream profile → browser, edge, fog, iot, cloud
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
     * Build deployment profile map from algorithm registrations
     */
    private buildDeploymentProfileMap;
    /**
     * Suggest best algorithm for a profile and log size
     */
    suggestForProfile(profile: ExecutionProfile, logSize: number): AlgorithmMetadata | undefined;
}
/**
 * Get or create the global algorithm registry
 */
export declare function getRegistry(): AlgorithmRegistry;
//# sourceMappingURL=registry.d.ts.map