/**
 * watch.ts
 * Watch/streaming execution mode with heartbeat and checkpointing
 * Provides real-time monitoring of long-running executions
 */

import { StatusUpdate, EngineState, ExecutionPlan } from '@pictl/contracts';
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

const DEFAULT_WATCH_CONFIG: Required<WatchConfig> = {
  heartbeatIntervalMs: 5000,
  checkpointingEnabled: true,
  checkpointIntervalMs: 30000,
  maxMissedHeartbeats: 3,
};

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
export class WatchSession {
  private config: Required<WatchConfig>;
  private checkpointManager: CheckpointManager;
  private heartbeatTimer?: ReturnType<typeof setInterval>;
  private checkpointTimer?: ReturnType<typeof setInterval>;
  private heartbeatSequence = 0;
  private missedHeartbeats = 0;
  private startedAt: Date;
  private lastHeartbeat?: Date;
  private active = false;
  private onHeartbeat?: (event: HeartbeatEvent) => void;
  private onCheckpoint?: (checkpoint: Checkpoint) => void;
  private currentState: EngineState = 'watching';
  private currentProgress = 0;

  constructor(
    private runId: string,
    private plan: ExecutionPlan,
    config?: WatchConfig
  ) {
    this.config = { ...DEFAULT_WATCH_CONFIG, ...config };
    this.checkpointManager = new CheckpointManager(runId);
    this.startedAt = new Date();
  }

  /**
   * Start the watch session with heartbeat and optional checkpointing
   */
  start(
    onHeartbeat?: (event: HeartbeatEvent) => void,
    onCheckpoint?: (checkpoint: Checkpoint) => void
  ): void {
    if (this.active) return;
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
  stop(): void {
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
  updateState(state: EngineState, progress: number): void {
    this.currentState = state;
    this.currentProgress = progress;
    this.missedHeartbeats = 0;
  }

  /**
   * Check if the session is still active
   */
  isActive(): boolean {
    return this.active;
  }

  /**
   * Check if the session is healthy (heartbeats flowing)
   */
  isHealthy(): boolean {
    return this.missedHeartbeats < this.config.maxMissedHeartbeats;
  }

  /**
   * Get the number of missed heartbeats
   */
  getMissedHeartbeats(): number {
    return this.missedHeartbeats;
  }

  /**
   * Get the uptime in milliseconds
   */
  getUptimeMs(): number {
    return Date.now() - this.startedAt.getTime();
  }

  /**
   * Get the last heartbeat timestamp
   */
  getLastHeartbeat(): Date | undefined {
    return this.lastHeartbeat;
  }

  /**
   * Get the most recent checkpoint
   */
  getLastCheckpoint(): Checkpoint | undefined {
    return this.checkpointManager.getLatest();
  }

  /**
   * Get all checkpoints
   */
  getCheckpoints(): Checkpoint[] {
    return this.checkpointManager.list();
  }

  /**
   * Get the checkpoint manager for direct access
   */
  getCheckpointManager(): CheckpointManager {
    return this.checkpointManager;
  }

  /**
   * Force an immediate heartbeat emission
   */
  forceHeartbeat(): HeartbeatEvent {
    return this.emitHeartbeat();
  }

  /**
   * Force an immediate checkpoint save
   */
  forceCheckpoint(): Checkpoint {
    return this.saveCheckpoint();
  }

  private emitHeartbeat(): HeartbeatEvent {
    this.heartbeatSequence++;
    this.lastHeartbeat = new Date();

    const event: HeartbeatEvent = {
      timestamp: this.lastHeartbeat,
      sequenceNumber: this.heartbeatSequence,
      state: this.currentState,
      progress: this.currentProgress,
      uptimeMs: this.getUptimeMs(),
    };

    try {
      this.onHeartbeat?.(event);
    } catch {
      this.missedHeartbeats++;
    }

    return event;
  }

  private saveCheckpoint(): Checkpoint {
    const checkpoint = this.checkpointManager.create(
      this.currentState,
      this.currentProgress,
      { planId: this.plan.planId }
    );

    try {
      this.onCheckpoint?.(checkpoint);
    } catch {
      // Checkpoint callback failures are non-fatal
    }

    return checkpoint;
  }
}

/**
 * Creates a StatusUpdate from a heartbeat event
 */
export function heartbeatToStatusUpdate(heartbeat: HeartbeatEvent): StatusUpdate {
  return {
    timestamp: heartbeat.timestamp,
    state: heartbeat.state,
    progress: heartbeat.progress,
    message: `Heartbeat #${heartbeat.sequenceNumber} (uptime: ${Math.round(heartbeat.uptimeMs / 1000)}s)`,
  };
}
