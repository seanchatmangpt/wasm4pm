/**
 * status.ts
 * Engine status tracking and reporting
 * Maintains accurate progress, timing, and error information
 */
import { EngineState, EngineError, EngineStatus, ExecutionReceipt, ExecutionPlan } from '@pictl/contracts';
/**
 * Tracks engine execution progress and status
 */
export declare class StatusTracker {
    private state;
    private runId?;
    private planId?;
    private progress;
    private errors;
    private startedAt?;
    private finishedAt?;
    private stepsCompleted;
    private totalSteps;
    private currentStepId?;
    private metadata;
    /**
     * Updates the current state
     */
    setState(state: EngineState): void;
    /**
     * Sets the run ID for this execution
     */
    setRunId(runId: string): void;
    /**
     * Sets the plan being executed
     */
    setPlan(plan: ExecutionPlan): void;
    /**
     * Marks the start time
     */
    start(): void;
    /**
     * Marks the finish time
     */
    finish(): void;
    /**
     * Records a step completion
     */
    recordStepCompletion(stepId: string): void;
    /**
     * Adds an error to the error list
     */
    addError(error: EngineError): void;
    /**
     * Clears all errors
     */
    clearErrors(): void;
    /**
     * Updates metadata
     */
    setMetadata(key: string, value: unknown): void;
    /**
     * Gets all metadata
     */
    getMetadata(): Record<string, unknown>;
    /**
     * Updates progress as a percentage (0-100)
     */
    private updateProgress;
    /**
     * Gets the current status snapshot
     */
    getStatus(): EngineStatus;
    /**
     * Gets the execution receipt for a completed run
     */
    getReceipt(): ExecutionReceipt;
    /**
     * Calculates time estimate for completion
     */
    private calculateTimeEstimate;
    /**
     * Calculates total duration in milliseconds
     */
    private calculateDuration;
    /**
     * Gets a human-readable status summary
     */
    getSummary(): string;
    /**
     * Resets tracker to initial state
     */
    reset(): void;
}
/**
 * Formats error information for display
 */
export declare function formatError(error: EngineError): string;
/**
 * Formats status for display
 */
export declare function formatStatus(status: EngineStatus): string;
//# sourceMappingURL=status.d.ts.map