/**
 * Process Model Verifiers
 *
 * Verification utilities for process models (Petri nets, process trees, DFGs).
 * Checks soundness properties, computes quality metrics (fitness, precision, etc.).
 */
export interface PetriNet {
    places: Array<{
        id: string;
        name?: string;
        initialMarking?: number;
        finalMarking?: number;
    }>;
    transitions: Array<{
        id: string;
        name?: string;
        label?: string;
    }>;
    arcs: Array<{
        id: string;
        source: string;
        target: string;
        weight?: number;
    }>;
}
export interface ProcessTreeNode {
    id: string;
    type: 'sequence' | 'parallel' | 'choice' | 'loop' | 'task' | 'silent';
    label?: string;
    children?: ProcessTreeNode[];
}
export interface VerifierDFG {
    nodes: string[];
    edges: Array<{
        source: string;
        target: string;
        count: number;
    }>;
    startActivities: string[];
    endActivities: string[];
}
export interface SoundnessResult {
    sound: boolean;
    deadlockFree: boolean;
    live: boolean;
    bounded: boolean;
    details: string[];
}
export interface QualityMetrics {
    fitness: number;
    precision: number;
    generalization: number;
    simplicity: number;
}
export interface ConformanceResult {
    fit: number;
    traceFitness: number[];
    missingTokens: number;
    remainingTokens: number;
    consumedTokens: number;
    producedTokens: number;
}
/**
 * Verify soundness properties of a Petri net.
 *
 * A Petri net is sound if:
 * 1. Deadlock-free: From the initial marking, every transition can eventually fire
 * 2. Safe/Bounded: No place can contain more than one token
 * 3. Proper completion: From the initial marking, we can always reach the final marking
 */
export declare function verifySoundness(net: PetriNet, initialMarking: string[], finalMarking: string[]): SoundnessResult;
/**
 * Compute quality metrics for a process model against an event log.
 */
export declare function computeQualityMetrics(model: PetriNet | VerifierDFG, eventLog: Array<{
    activities: string[];
}>, options?: {
    type: 'petrinet' | 'dfg';
}): QualityMetrics;
/**
 * Validate DFG structure.
 */
export declare function validateVerifierDFG(dfg: VerifierDFG): {
    valid: boolean;
    errors: string[];
};
/**
 * Format soundness result as human-readable string.
 */
export declare function formatSoundnessResult(result: SoundnessResult): string;
/**
 * Format quality metrics as human-readable string.
 */
export declare function formatQualityMetrics(metrics: QualityMetrics): string;
//# sourceMappingURL=models.d.ts.map