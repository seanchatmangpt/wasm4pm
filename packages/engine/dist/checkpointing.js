/**
 * checkpointing.ts
 * Checkpoint management for watch mode execution
 * Saves and restores execution state for resumability
 */
/**
 * Manages checkpoints for a given run
 */
export class CheckpointManager {
    runId;
    checkpoints = [];
    sequenceCounter = 0;
    constructor(runId) {
        this.runId = runId;
    }
    /**
     * Create and store a new checkpoint
     */
    create(state, progress, metadata) {
        this.sequenceCounter++;
        const checkpoint = {
            id: `cp_${this.runId}_${this.sequenceCounter}`,
            runId: this.runId,
            timestamp: new Date(),
            sequenceNumber: this.sequenceCounter,
            state,
            progress,
            metadata,
        };
        this.checkpoints.push(checkpoint);
        return checkpoint;
    }
    /**
     * Get the most recent checkpoint
     */
    getLatest() {
        return this.checkpoints.length > 0
            ? this.checkpoints[this.checkpoints.length - 1]
            : undefined;
    }
    /**
     * Get a checkpoint by ID
     */
    getById(id) {
        return this.checkpoints.find((cp) => cp.id === id);
    }
    /**
     * List all checkpoints in order
     */
    list() {
        return [...this.checkpoints];
    }
    /**
     * Get the number of checkpoints
     */
    count() {
        return this.checkpoints.length;
    }
    /**
     * Clear all checkpoints
     */
    clear() {
        this.checkpoints = [];
        this.sequenceCounter = 0;
    }
}
