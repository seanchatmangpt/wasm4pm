/**
 * watch.ts
 * Watch mode implementation with streaming, checkpointing, and reconnection
 * Provides incremental processing with progress tracking and fault tolerance
 */

import { PictlConfig, ExecutionProfile } from './config.js';
import { ExecutableStep } from './pipeline.js';
import { PictlError, ErrorCode, ErrorRecovery } from './errors.js';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

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
  | { type: 'heartbeat'; timestamp: string; lag_ms: number }
  | { type: 'progress'; processed: number; total: number }
  | { type: 'reconnect'; attempt: number; backoff_ms: number }
  | { type: 'checkpoint'; progress_hash: string }
  | { type: 'error'; error: ErrorInfo; recoverable: boolean }
  | { type: 'complete'; receipt: ExecutionReceipt };

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
  sourcePosition?: number; // For file-based sources
  sourceChecksum?: string; // For content verification
}

/**
 * Watch mode configuration options
 */
export interface WatchConfig {
  heartbeatIntervalMs?: number; // Default: 1000ms
  heartbeatEventThreshold?: number; // Default: 10 events
  checkpointIntervalMs?: number; // Default: 5000ms
  checkpointPath?: string; // Default: .pictl/checkpoint
  maxReconnectAttempts?: number; // Default: 10
  initialBackoffMs?: number; // Default: 100ms
  maxBackoffMs?: number; // Default: 5000ms
  backoffMultiplier?: number; // Default: 2.5
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
 * Source abstraction for streaming data
 */
interface StreamSource {
  type: 'file' | 'stream' | 'socket' | 'memory';
  open(): Promise<void>;
  hasMore(): Promise<boolean>;
  readNext(count: number): Promise<unknown[]>;
  getPosition(): Promise<number>;
  getChecksum(): Promise<string>;
  close(): Promise<void>;
}

/**
 * Memory-based stream source for testing
 */
class MemoryStreamSource implements StreamSource {
  type: 'memory' = 'memory';
  private data: unknown[] = [];
  private position: number = 0;

  constructor(data: unknown[]) {
    this.data = data;
  }

  async open(): Promise<void> {
    this.position = 0;
  }

  async hasMore(): Promise<boolean> {
    return this.position < this.data.length;
  }

  async readNext(count: number): Promise<unknown[]> {
    const result = this.data.slice(this.position, this.position + count);
    this.position += count;
    return result;
  }

  async getPosition(): Promise<number> {
    return this.position;
  }

  async getChecksum(): Promise<string> {
    const content = JSON.stringify(this.data);
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  async close(): Promise<void> {
    // No-op for memory source
  }
}

/**
 * File-based stream source
 */
class FileStreamSource implements StreamSource {
  type: 'file' = 'file';
  private filePath: string;
  private fileContent: string = '';
  private position: number = 0;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  async open(): Promise<void> {
    if (!fs.existsSync(this.filePath)) {
      throw new PictlError(
        `Source file not found: ${this.filePath}`,
        ErrorCode.SOURCE_UNAVAILABLE,
        { nextAction: ErrorRecovery.VALIDATE_INPUT }
      );
    }
    this.fileContent = fs.readFileSync(this.filePath, 'utf-8');
    this.position = 0;
  }

  async hasMore(): Promise<boolean> {
    return this.position < this.fileContent.length;
  }

  async readNext(count: number): Promise<unknown[]> {
    const chunk = this.fileContent.slice(this.position, this.position + count);
    this.position += chunk.length;

    // Parse JSON lines or CSV
    try {
      const lines = chunk.split('\n').filter((line) => line.trim());
      return lines.map((line) => JSON.parse(line));
    } catch (err) {
      throw new PictlError(
        `Failed to parse source file at position ${this.position}`,
        ErrorCode.PARSE_FAILED,
        { nextAction: ErrorRecovery.VALIDATE_INPUT, cause: err as Error }
      );
    }
  }

  async getPosition(): Promise<number> {
    return this.position;
  }

  async getChecksum(): Promise<string> {
    return crypto.createHash('sha256').update(this.fileContent).digest('hex');
  }

  async close(): Promise<void> {
    this.fileContent = '';
  }
}

/**
 * WatchMode class handles streaming execution with checkpointing and reconnection
 */
export class WatchMode {
  private plan: ExecutableStep[];
  private config: PictlConfig;
  private watchConfig: Required<WatchConfig>;
  private source: StreamSource | null = null;
  private isRunning: boolean = false;
  private lastHeartbeat: number = 0;
  private lastCheckpointTime: number = 0;
  private eventsSinceHeartbeat: number = 0;
  private currentCheckpoint: Checkpoint | null = null;

  constructor(plan: ExecutableStep[], config: PictlConfig, watchConfig: WatchConfig = {}) {
    this.plan = plan;
    this.config = config;
    this.watchConfig = {
      heartbeatIntervalMs: watchConfig.heartbeatIntervalMs ?? 1000,
      heartbeatEventThreshold: watchConfig.heartbeatEventThreshold ?? 10,
      checkpointIntervalMs: watchConfig.checkpointIntervalMs ?? 5000,
      checkpointPath: watchConfig.checkpointPath ?? '.pictl/checkpoint',
      maxReconnectAttempts: watchConfig.maxReconnectAttempts ?? 10,
      initialBackoffMs: watchConfig.initialBackoffMs ?? 100,
      maxBackoffMs: watchConfig.maxBackoffMs ?? 5000,
      backoffMultiplier: watchConfig.backoffMultiplier ?? 2.5,
    };
  }

  /**
   * Start watch mode and return an async iterable of events
   */
  async *start(): AsyncIterable<WatchEvent> {
    this.isRunning = true;
    this.lastHeartbeat = Date.now();
    this.lastCheckpointTime = Date.now();

    try {
      // Initialize source
      this.source = this.createSource();
      await this.source.open();

      // Resume from checkpoint if available
      await this.resume();

      // Process events from source
      let processed = 0;
      let total = 100; // Estimated, will be refined

      while ((await this.source.hasMore()) && this.isRunning) {
        const chunk = await this.source.readNext(10);

        if (chunk.length === 0) {
          break;
        }

        processed += chunk.length;
        this.eventsSinceHeartbeat += chunk.length;

        // Emit progress event
        yield {
          type: 'progress',
          processed,
          total,
        };

        // Check for heartbeat
        const now = Date.now();
        if (
          now - this.lastHeartbeat >= this.watchConfig.heartbeatIntervalMs ||
          this.eventsSinceHeartbeat >= this.watchConfig.heartbeatEventThreshold
        ) {
          const lag = now - this.lastHeartbeat;
          yield {
            type: 'heartbeat',
            timestamp: new Date().toISOString(),
            lag_ms: lag,
          };
          this.lastHeartbeat = now;
          this.eventsSinceHeartbeat = 0;
        }

        // Check for checkpoint
        if (now - this.lastCheckpointTime >= this.watchConfig.checkpointIntervalMs) {
          await this.saveCheckpoint({
            processed,
            total,
            currentTraceIndex: processed,
          });

          const hash = this.computeProgressHash({ processed, total, currentTraceIndex: processed });
          yield {
            type: 'checkpoint',
            progress_hash: hash,
          };
          this.lastCheckpointTime = now;
        }
      }

      // Final checkpoint
      await this.saveCheckpoint({
        processed,
        total,
        currentTraceIndex: processed,
      });

      // Emit completion
      const receipt = this.buildReceipt();
      yield {
        type: 'complete',
        receipt,
      };
    } catch (err) {
      const isRecoverable = this.isRecoverableError(err);
      const errorInfo = this.formatError(err);

      yield {
        type: 'error',
        error: errorInfo,
        recoverable: isRecoverable,
      };

      if (!isRecoverable) {
        throw err;
      }
    } finally {
      this.isRunning = false;
      if (this.source) {
        await this.source.close();
      }
    }
  }

  /**
   * Save current progress to checkpoint file
   */
  async saveCheckpoint(progress: {
    processed: number;
    total: number;
    currentTraceIndex: number;
  }): Promise<void> {
    try {
      const checkpointDir = path.dirname(this.watchConfig.checkpointPath);

      // Create directory if needed
      if (!fs.existsSync(checkpointDir)) {
        fs.mkdirSync(checkpointDir, { recursive: true });
      }

      const checkpoint: Checkpoint = {
        timestamp: new Date().toISOString(),
        progress,
        progressHash: this.computeProgressHash(progress),
        sourcePosition: await this.source?.getPosition(),
        sourceChecksum: await this.source?.getChecksum(),
      };

      fs.writeFileSync(this.watchConfig.checkpointPath, JSON.stringify(checkpoint, null, 2));
      this.currentCheckpoint = checkpoint;
    } catch (err) {
      // Non-blocking error for checkpointing
      console.warn('Failed to write checkpoint:', err);
    }
  }

  /**
   * Resume from a checkpoint or start from beginning
   */
  async resume(checkpointData?: Checkpoint): Promise<void> {
    let checkpoint = checkpointData;

    if (!checkpoint && fs.existsSync(this.watchConfig.checkpointPath)) {
      try {
        const data = fs.readFileSync(this.watchConfig.checkpointPath, 'utf-8');
        checkpoint = JSON.parse(data);
      } catch (err) {
        console.warn('Failed to read checkpoint, starting fresh:', err);
      }
    }

    if (checkpoint) {
      // Verify checkpoint integrity
      const hash = this.computeProgressHash(checkpoint.progress);
      if (hash !== checkpoint.progressHash) {
        throw new PictlError('Checkpoint integrity check failed', ErrorCode.STATE_CORRUPTED, {
          nextAction: ErrorRecovery.REINITIALIZE,
        });
      }

      this.currentCheckpoint = checkpoint;
    }
  }

  /**
   * Stop watch mode gracefully
   */
  async stop(): Promise<void> {
    this.isRunning = false;
    if (this.source) {
      await this.source.close();
    }
  }

  /**
   * Create appropriate stream source based on config
   */
  private createSource(): StreamSource {
    const source = this.config.source;

    // Detect source type from content
    if (source.content.startsWith('/') || source.content.startsWith('.')) {
      // File path
      return new FileStreamSource(source.content);
    } else {
      // Inline content or JSON array
      try {
        const data = JSON.parse(source.content);
        if (Array.isArray(data)) {
          return new MemoryStreamSource(data);
        }
        return new MemoryStreamSource([data]);
      } catch {
        // Try treating as JSON lines
        const lines = source.content.split('\n').filter((l) => l.trim());
        const data = lines.map((line) => {
          try {
            return JSON.parse(line);
          } catch {
            return { raw: line };
          }
        });
        return new MemoryStreamSource(data);
      }
    }
  }

  /**
   * Compute hash of progress for integrity checking
   */
  private computeProgressHash(progress: {
    processed: number;
    total: number;
    currentTraceIndex: number;
  }): string {
    const content = JSON.stringify(progress);
    return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
  }

  /**
   * Check if error is recoverable
   */
  private isRecoverableError(err: unknown): boolean {
    if (err instanceof PictlError) {
      return err.nextAction === ErrorRecovery.RETRY;
    }
    return false;
  }

  /**
   * Format error for event emission
   */
  private formatError(err: unknown): ErrorInfo {
    if (err instanceof PictlError) {
      return {
        code: err.code,
        message: err.message,
        recoverable: err.nextAction === ErrorRecovery.RETRY,
        timestamp: new Date().toISOString(),
      };
    }

    const message = err instanceof Error ? err.message : String(err);
    return {
      code: 'UNKNOWN_ERROR',
      message,
      recoverable: false,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Build execution receipt for completion event
   */
  private buildReceipt(): ExecutionReceipt {
    return {
      runId: `run_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      engineVersion: '0.5.4',
      configHash: this.computeConfigHash(),
      profile: this.config.execution.profile,
      pipeline: this.plan.map((step) => step.stepId),
      timing: {
        total_ms: Date.now() - this.lastHeartbeat,
        steps: {},
      },
      outputs: {},
      receipt: {
        startedAt: new Date(this.lastHeartbeat).toISOString(),
        finishedAt: new Date().toISOString(),
        inputDataSize: this.config.source.content.length,
        sourceFormat: this.config.source.format,
      },
    };
  }

  /**
   * Compute deterministic hash of configuration
   */
  private computeConfigHash(): string {
    const content = JSON.stringify(this.config);
    return crypto.createHash('sha256').update(content).digest('hex');
  }
}

/**
 * Helper function to create watch mode with exponential backoff reconnection
 */
export async function* watchWithReconnection(
  plan: ExecutableStep[],
  config: PictlConfig,
  watchConfig: WatchConfig = {}
): AsyncIterable<WatchEvent> {
  const maxAttempts = watchConfig.maxReconnectAttempts ?? 10;
  let attempt = 0;
  let backoff = watchConfig.initialBackoffMs ?? 100;
  const maxBackoff = watchConfig.maxBackoffMs ?? 5000;
  const multiplier = watchConfig.backoffMultiplier ?? 2.5;

  while (attempt < maxAttempts) {
    try {
      const watch = new WatchMode(plan, config, watchConfig);
      for await (const event of watch.start()) {
        yield event;
      }
      return; // Success, exit
    } catch (err) {
      attempt++;
      if (attempt >= maxAttempts) {
        throw err; // Max attempts exceeded, throw final error
      }

      // Emit reconnect event
      yield {
        type: 'reconnect',
        attempt,
        backoff_ms: backoff,
      };

      // Wait before retrying
      await new Promise((resolve) => setTimeout(resolve, backoff));

      // Increase backoff for next attempt
      backoff = Math.min(Math.floor(backoff * multiplier), maxBackoff);
    }
  }
}
