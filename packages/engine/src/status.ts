/**
 * status.ts
 * Engine status tracking and reporting
 * Maintains accurate progress, timing, and error information
 */

import {
  EngineState,
  ErrorInfo,
  EngineStatus,
  ExecutionReceipt,
  ExecutionPlan,
} from '@wasm4pm/types';

/**
 * Tracks engine execution progress and status
 */
export class StatusTracker {
  private state: EngineState = 'uninitialized';
  private runId?: string;
  private planId?: string;
  private progress: number = 0;
  private errors: ErrorInfo[] = [];
  private startedAt?: Date;
  private finishedAt?: Date;
  private stepsCompleted: number = 0;
  private totalSteps: number = 0;
  private currentStepId?: string;
  private metadata: Record<string, unknown> = {};

  /**
   * Updates the current state
   */
  setState(state: EngineState): void {
    this.state = state;
  }

  /**
   * Sets the run ID for this execution
   */
  setRunId(runId: string): void {
    this.runId = runId;
  }

  /**
   * Sets the plan being executed
   */
  setPlan(plan: ExecutionPlan): void {
    this.planId = plan.planId;
    this.totalSteps = plan.totalSteps;
    this.stepsCompleted = 0;
    this.updateProgress();
  }

  /**
   * Marks the start time
   */
  start(): void {
    this.startedAt = new Date();
  }

  /**
   * Marks the finish time
   */
  finish(): void {
    this.finishedAt = new Date();
  }

  /**
   * Records a step completion
   */
  recordStepCompletion(stepId: string): void {
    this.currentStepId = stepId;
    this.stepsCompleted++;
    this.updateProgress();
  }

  /**
   * Adds an error to the error list
   */
  addError(error: ErrorInfo): void {
    this.errors.push(error);
    // Keep only the last 100 errors to avoid memory issues
    if (this.errors.length > 100) {
      this.errors = this.errors.slice(-100);
    }
  }

  /**
   * Clears all errors
   */
  clearErrors(): void {
    this.errors = [];
  }

  /**
   * Updates metadata
   */
  setMetadata(key: string, value: unknown): void {
    this.metadata[key] = value;
  }

  /**
   * Gets all metadata
   */
  getMetadata(): Record<string, unknown> {
    return { ...this.metadata };
  }

  /**
   * Updates progress as a percentage (0-100)
   */
  private updateProgress(): void {
    if (this.totalSteps > 0) {
      this.progress = Math.round((this.stepsCompleted / this.totalSteps) * 100);
    } else if (this.state === 'ready' || this.state === 'failed') {
      this.progress = 100;
    }
  }

  /**
   * Gets the current status snapshot
   */
  getStatus(): EngineStatus {
    const estimate = this.calculateTimeEstimate();

    return {
      state: this.state,
      runId: this.runId,
      progress: this.progress,
      estimate,
      errors: [...this.errors],
      metadata: { ...this.metadata },
    };
  }

  /**
   * Gets the execution receipt for a completed run
   */
  getReceipt(): ExecutionReceipt {
    const duration = this.calculateDuration();

    return {
      runId: this.runId || 'unknown',
      planId: this.planId || 'unknown',
      state: this.state,
      startedAt: this.startedAt || new Date(),
      finishedAt: this.finishedAt,
      durationMs: duration,
      progress: this.progress,
      errors: [...this.errors],
      metadata: { ...this.metadata },
    };
  }

  /**
   * Calculates time estimate for completion
   */
  private calculateTimeEstimate(): { elapsed: number; remaining: number } | undefined {
    if (!this.startedAt) {
      return undefined;
    }

    const now = Date.now();
    const elapsed = now - this.startedAt.getTime();

    // No estimate if no progress or already complete
    if (this.progress === 0 || this.progress === 100) {
      return { elapsed, remaining: 0 };
    }

    // Calculate remaining time based on linear progress
    const progressRatio = this.progress / 100;
    const estimatedTotal = elapsed / progressRatio;
    const remaining = Math.max(0, estimatedTotal - elapsed);

    return { elapsed, remaining: Math.round(remaining) };
  }

  /**
   * Calculates total duration in milliseconds
   */
  private calculateDuration(): number | undefined {
    if (!this.startedAt) {
      return undefined;
    }

    const end = this.finishedAt || new Date();
    return end.getTime() - this.startedAt.getTime();
  }

  /**
   * Gets a human-readable status summary
   */
  getSummary(): string {
    const parts = [
      `State: ${this.state}`,
      `Progress: ${this.progress}%`,
      `Errors: ${this.errors.length}`,
    ];

    if (this.runId) {
      parts.unshift(`Run: ${this.runId}`);
    }

    if (this.currentStepId) {
      parts.push(`Current step: ${this.currentStepId}`);
    }

    if (this.startedAt) {
      const duration = this.calculateDuration();
      if (duration) {
        parts.push(`Duration: ${duration}ms`);
      }
    }

    return parts.join(' | ');
  }

  /**
   * Resets tracker to initial state
   */
  reset(): void {
    this.state = 'uninitialized';
    this.runId = undefined;
    this.planId = undefined;
    this.progress = 0;
    this.errors = [];
    this.startedAt = undefined;
    this.finishedAt = undefined;
    this.stepsCompleted = 0;
    this.totalSteps = 0;
    this.currentStepId = undefined;
    this.metadata = {};
  }
}

/**
 * Formats error information for display
 */
export function formatError(error: ErrorInfo): string {
  const parts = [`[${error.code}]`, error.message];

  if (error.severity !== 'error') {
    parts.push(`(${error.severity})`);
  }

  if (error.suggestion) {
    parts.push(`- ${error.suggestion}`);
  }

  return parts.join(' ');
}

/**
 * Formats status for display
 */
export function formatStatus(status: EngineStatus): string {
  const lines = [
    `Engine Status: ${status.state}`,
    `Progress: ${status.progress}%`,
  ];

  if (status.estimate) {
    const elapsedSecs = Math.round(status.estimate.elapsed / 1000);
    const remainingSecs = Math.round(status.estimate.remaining / 1000);
    lines.push(`Elapsed: ${elapsedSecs}s | ETA: ${remainingSecs}s`);
  }

  if (status.errors.length > 0) {
    lines.push(`Errors: ${status.errors.length}`);
    status.errors.slice(0, 3).forEach((err: ErrorInfo) => {
      lines.push(`  - ${formatError(err)}`);
    });
    if (status.errors.length > 3) {
      lines.push(`  ... and ${status.errors.length - 3} more`);
    }
  }

  return lines.join('\n');
}
