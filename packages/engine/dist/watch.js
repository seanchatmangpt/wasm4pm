/**
 * watch.ts
 * Watch/streaming execution mode with heartbeat and checkpointing
 * Provides real-time monitoring of long-running executions
 */
import { CheckpointManager } from './checkpointing.js';
const DEFAULT_WATCH_CONFIG = {
    heartbeatIntervalMs: 5000,
    checkpointingEnabled: true,
    checkpointIntervalMs: 30000,
    maxMissedHeartbeats: 3,
};
/**
 * Watch session managing a streaming execution
 * Handles heartbeat emission, checkpoint persistence, and health tracking
 */
export class WatchSession {
    runId;
    plan;
    config;
    checkpointManager;
    heartbeatTimer;
    checkpointTimer;
    heartbeatSequence = 0;
    missedHeartbeats = 0;
    startedAt;
    lastHeartbeat;
    active = false;
    onHeartbeat;
    onCheckpoint;
    currentState = 'watching';
    currentProgress = 0;
    constructor(runId, plan, config) {
        this.runId = runId;
        this.plan = plan;
        this.config = { ...DEFAULT_WATCH_CONFIG, ...config };
        this.checkpointManager = new CheckpointManager(runId);
        this.startedAt = new Date();
    }
    /**
     * Start the watch session with heartbeat and optional checkpointing
     */
    start(onHeartbeat, onCheckpoint) {
        if (this.active)
            return;
        this.active = true;
        this.onHeartbeat = onHeartbeat;
        this.onCheckpoint = onCheckpoint;
        // Start heartbeat timer
        this.heartbeatTimer = setInterval(() => {
            this.emitHeartbeat();
        }, this.config.heartbeatIntervalMs);
        // Start checkpoint timer if enabled
        if (this.config.checkpointingEnabled) {
            this.checkpointTimer = setInterval(() => {
                this.saveCheckpoint();
            }, this.config.checkpointIntervalMs);
        }
    }
    /**
     * Stop the watch session and clean up timers
     */
    stop() {
        this.active = false;
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = undefined;
        }
        if (this.checkpointTimer) {
            clearInterval(this.checkpointTimer);
            this.checkpointTimer = undefined;
        }
    }
    /**
     * Update the current state and progress (resets missed heartbeat counter)
     */
    updateState(state, progress) {
        this.currentState = state;
        this.currentProgress = progress;
        this.missedHeartbeats = 0;
    }
    /**
     * Check if the session is still active
     */
    isActive() {
        return this.active;
    }
    /**
     * Check if the session is healthy (heartbeats flowing)
     */
    isHealthy() {
        return this.missedHeartbeats < this.config.maxMissedHeartbeats;
    }
    /**
     * Get the number of missed heartbeats
     */
    getMissedHeartbeats() {
        return this.missedHeartbeats;
    }
    /**
     * Get the uptime in milliseconds
     */
    getUptimeMs() {
        return Date.now() - this.startedAt.getTime();
    }
    /**
     * Get the last heartbeat timestamp
     */
    getLastHeartbeat() {
        return this.lastHeartbeat;
    }
    /**
     * Get the most recent checkpoint
     */
    getLastCheckpoint() {
        return this.checkpointManager.getLatest();
    }
    /**
     * Get all checkpoints
     */
    getCheckpoints() {
        return this.checkpointManager.list();
    }
    /**
     * Get the checkpoint manager for direct access
     */
    getCheckpointManager() {
        return this.checkpointManager;
    }
    /**
     * Force an immediate heartbeat emission
     */
    forceHeartbeat() {
        return this.emitHeartbeat();
    }
    /**
     * Force an immediate checkpoint save
     */
    forceCheckpoint() {
        return this.saveCheckpoint();
    }
    emitHeartbeat() {
        this.heartbeatSequence++;
        this.lastHeartbeat = new Date();
        const event = {
            timestamp: this.lastHeartbeat,
            sequenceNumber: this.heartbeatSequence,
            state: this.currentState,
            progress: this.currentProgress,
            uptimeMs: this.getUptimeMs(),
        };
        try {
            this.onHeartbeat?.(event);
        }
        catch {
            this.missedHeartbeats++;
        }
        return event;
    }
    saveCheckpoint() {
        const checkpoint = this.checkpointManager.create(this.currentState, this.currentProgress, { planId: this.plan.planId });
        try {
            this.onCheckpoint?.(checkpoint);
        }
        catch {
            // Checkpoint callback failures are non-fatal
        }
        return checkpoint;
    }
}
/**
 * Creates a StatusUpdate from a heartbeat event
 */
export function heartbeatToStatusUpdate(heartbeat) {
    return {
        timestamp: heartbeat.timestamp,
        state: heartbeat.state,
        progress: heartbeat.progress,
        message: `Heartbeat #${heartbeat.sequenceNumber} (uptime: ${Math.round(heartbeat.uptimeMs / 1000)}s)`,
    };
}
