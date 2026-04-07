/**
 * watch.ts
 * Watch/streaming execution mode with heartbeat and checkpointing
 * Provides real-time monitoring of long-running executions
 */
import { StatusUpdate, EngineState, ExecutionPlan } from '@wasm4pm/types';
import { CheckpointManager, Checkpoint } from './checkpointing.js';
/**
 * Configuration for watch mode
 */
export interface WatchConfig {
    /** Heartbeat interval in milliseconds (default: 5000) */
    heartbeatIntervalMs?: number;
    /** Enable checkpointing (default: true) */
    checkpointingEnabled?: boolean;
    /** Checkpoint interval in milliseconds (default: 30000) */
    checkpointIntervalMs?: number;
    /** Maximum consecutive heartbeat failures before degradation (default: 3) */
    maxMissedHeartbeats?: number;
}
/**
 * Heartbeat event emitted during watch mode
 */
export interface HeartbeatEvent {
    timestamp: Date;
    sequenceNumber: number;
    state: EngineState;
    progress: number;
    uptimeMs: number;
}
/**
 * Watch session managing a streaming execution
 * Handles heartbeat emission, checkpoint persistence, and health tracking
 */
export declare class WatchSession {
    private runId;
    private plan;
    private config;
    private checkpointManager;
    private heartbeatTimer?;
    private checkpointTimer?;
    private heartbeatSequence;
    private missedHeartbeats;
    private startedAt;
    private lastHeartbeat?;
    private active;
    private onHeartbeat?;
    private onCheckpoint?;
    private currentState;
    private currentProgress;
    constructor(runId: string, plan: ExecutionPlan, config?: WatchConfig);
    /**
     * Start the watch session with heartbeat and optional checkpointing
     */
    start(onHeartbeat?: (event: HeartbeatEvent) => void, onCheckpoint?: (checkpoint: Checkpoint) => void): void;
    /**
     * Stop the watch session and clean up timers
     */
    stop(): void;
    /**
     * Update the current state and progress (resets missed heartbeat counter)
     */
    updateState(state: EngineState, progress: number): void;
    /**
     * Check if the session is still active
     */
    isActive(): boolean;
    /**
     * Check if the session is healthy (heartbeats flowing)
     */
    isHealthy(): boolean;
    /**
     * Get the number of missed heartbeats
     */
    getMissedHeartbeats(): number;
    /**
     * Get the uptime in milliseconds
     */
    getUptimeMs(): number;
    /**
     * Get the last heartbeat timestamp
     */
    getLastHeartbeat(): Date | undefined;
    /**
     * Get the most recent checkpoint
     */
    getLastCheckpoint(): Checkpoint | undefined;
    /**
     * Get all checkpoints
     */
    getCheckpoints(): Checkpoint[];
    /**
     * Get the checkpoint manager for direct access
     */
    getCheckpointManager(): CheckpointManager;
    /**
     * Force an immediate heartbeat emission
     */
    forceHeartbeat(): HeartbeatEvent;
    /**
     * Force an immediate checkpoint save
     */
    forceCheckpoint(): Checkpoint;
    private emitHeartbeat;
    private saveCheckpoint;
}
/**
 * Creates a StatusUpdate from a heartbeat event
 */
export declare function heartbeatToStatusUpdate(heartbeat: HeartbeatEvent): StatusUpdate;
//# sourceMappingURL=watch.d.ts.map