/**
 * checkpointing.ts
 * Checkpoint management for watch mode execution
 * Saves and restores execution state for resumability
 */

import { EngineState } from '@wasm4pm/types';

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
export class CheckpointManager {
  private checkpoints: Checkpoint[] = [];
  private sequenceCounter = 0;

  constructor(private runId: string) {}

  /**
   * Create and store a new checkpoint
   */
  create(
    state: EngineState,
    progress: number,
    metadata?: Record<string, unknown>
  ): Checkpoint {
    this.sequenceCounter++;

    const checkpoint: Checkpoint = {
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
  getLatest(): Checkpoint | undefined {
    return this.checkpoints.length > 0
      ? this.checkpoints[this.checkpoints.length - 1]
      : undefined;
  }

  /**
   * Get a checkpoint by ID
   */
  getById(id: string): Checkpoint | undefined {
    return this.checkpoints.find((cp) => cp.id === id);
  }

  /**
   * List all checkpoints in order
   */
  list(): Checkpoint[] {
    return [...this.checkpoints];
  }

  /**
   * Get the number of checkpoints
   */
  count(): number {
    return this.checkpoints.length;
  }

  /**
   * Clear all checkpoints
   */
  clear(): void {
    this.checkpoints = [];
    this.sequenceCounter = 0;
  }
}
