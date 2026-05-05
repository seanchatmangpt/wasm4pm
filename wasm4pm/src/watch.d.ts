/**
 * watch.ts
 * Watch mode implementation with streaming, checkpointing, and reconnection
 * Provides incremental processing with progress tracking and fault tolerance
 */
import { Wasm4pmConfig, ExecutionProfile } from './config.js';
import { ExecutableStep } from './pipeline.js';
/**
 * Information about an error in watch mode
 */
export interface ErrorInfo {
  code: string;
  message: string;
  recoverable: boolean;
  timestamp: string;
}
/**
 * Events emitted by watch mode
 */
export type WatchEvent =
  | {
      type: 'heartbeat';
      timestamp: string;
      lag_ms: number;
    }
  | {
      type: 'progress';
      processed: number;
      total: number;
    }
  | {
      type: 'reconnect';
      attempt: number;
      backoff_ms: number;
    }
  | {
      type: 'checkpoint';
      progress_hash: string;
    }
  | {
      type: 'error';
      error: ErrorInfo;
      recoverable: boolean;
    }
  | {
      type: 'complete';
      receipt: ExecutionReceipt;
    };
/**
 * Checkpoint saved state for resuming processing
 */
export interface Checkpoint {
  timestamp: string;
  progress: {
    processed: number;
    total: number;
    currentTraceIndex: number;
  };
  progressHash: string;
  sourcePosition?: number;
  sourceChecksum?: string;
}
/**
 * Watch mode configuration options
 */
export interface WatchConfig {
  heartbeatIntervalMs?: number;
  heartbeatEventThreshold?: number;
  checkpointIntervalMs?: number;
  checkpointPath?: string;
  maxReconnectAttempts?: number;
  initialBackoffMs?: number;
  maxBackoffMs?: number;
  backoffMultiplier?: number;
}
/**
 * Execution receipt for completed runs
 */
export interface ExecutionReceipt {
  runId: string;
  engineVersion: string;
  configHash: string;
  profile: ExecutionProfile;
  pipeline: string[];
  timing: {
    total_ms: number;
    steps: Record<string, number>;
  };
  outputs: Record<string, unknown>;
  receipt: {
    startedAt: string;
    finishedAt: string;
    inputDataSize?: number;
    outputDataSize?: number;
    sourceFormat?: string;
  };
}
/**
 * WatchMode class handles streaming execution with checkpointing and reconnection
 */
export declare class WatchMode {
  private plan;
  private config;
  private watchConfig;
  private source;
  private isRunning;
  private lastHeartbeat;
  private lastCheckpointTime;
  private eventsSinceHeartbeat;
  private currentCheckpoint;
  constructor(plan: ExecutableStep[], config: Wasm4pmConfig, watchConfig?: WatchConfig);
  /**
   * Start watch mode and return an async iterable of events
   */
  start(): AsyncIterable<WatchEvent>;
  /**
   * Save current progress to checkpoint file
   */
  saveCheckpoint(progress: {
    processed: number;
    total: number;
    currentTraceIndex: number;
  }): Promise<void>;
  /**
   * Resume from a checkpoint or start from beginning
   */
  resume(checkpointData?: Checkpoint): Promise<void>;
  /**
   * Stop watch mode gracefully
   */
  stop(): Promise<void>;
  /**
   * Create appropriate stream source based on config
   */
  private createSource;
  /**
   * Compute hash of progress for integrity checking
   */
  private computeProgressHash;
  /**
   * Check if error is recoverable
   */
  private isRecoverableError;
  /**
   * Format error for event emission
   */
  private formatError;
  /**
   * Build execution receipt for completion event
   */
  private buildReceipt;
  /**
   * Compute deterministic hash of configuration
   */
  private computeConfigHash;
}
/**
 * Helper function to create watch mode with exponential backoff reconnection
 */
export declare function watchWithReconnection(
  plan: ExecutableStep[],
  config: Wasm4pmConfig,
  watchConfig?: WatchConfig
): AsyncIterable<WatchEvent>;
//# sourceMappingURL=watch.d.ts.map
