/**
 * checkpointing.ts
 * Checkpoint management for watch mode execution
 * Saves and restores execution state for resumability
 */
import { EngineState } from '@wasm4pm/contracts';
/**
 * A checkpoint capturing execution state at a point in time
 */
export interface Checkpoint {
    id: string;
    runId: string;
    timestamp: Date;
    sequenceNumber: number;
    state: EngineState;
    progress: number;
    metadata?: Record<string, unknown>;
}
/**
 * Manages checkpoints for a given run
 */
export declare class CheckpointManager {
    private runId;
    private checkpoints;
    private sequenceCounter;
    constructor(runId: string);
    /**
     * Create and store a new checkpoint
     */
    create(state: EngineState, progress: number, metadata?: Record<string, unknown>): Checkpoint;
    /**
     * Get the most recent checkpoint
     */
    getLatest(): Checkpoint | undefined;
    /**
     * Get a checkpoint by ID
     */
    getById(id: string): Checkpoint | undefined;
    /**
     * List all checkpoints in order
     */
    list(): Checkpoint[];
    /**
     * Get the number of checkpoints
     */
    count(): number;
    /**
     * Clear all checkpoints
     */
    clear(): void;
}
//# sourceMappingURL=checkpointing.d.ts.map