/**
 * batch-runner.ts
 * Worker pool for batch processing of multiple event logs in parallel
 * Manages lifecycle, concurrency control, and result aggregation
 */

import { EventEmitter } from 'events';
import * as os from 'os';
import * as fs from 'fs/promises';
import { Kernel } from './api.js';

/**
 * Result from processing a single log through batch runner
 */
export interface BatchLogResult {
  logPath: string;
  status: 'success' | 'failed' | 'timeout';
  elapsedMs: number;
  error?: string;
  result?: Record<string, unknown>;
}

/**
 * Configuration for batch processing
 */
export interface BatchConfig {
  algorithm: string;
  kernel: Kernel; // Mandate a Kernel instance for "correct" implementation
  workers?: number;
  timeout?: number;
  activityKey?: string;
  verbose?: boolean;
}

/**
 * Aggregated statistics from batch run
 */
export interface BatchSummary {
  totalLogs: number;
  successful: number;
  failed: number;
  timedOut: number;
  totalElapsedMs: number;
  averageElapsedMs: number;
  minElapsedMs: number;
  maxElapsedMs: number;
  successRate: number;
}

/**
 * Final result from batch processing
 */
export interface BatchResult {
  summary: BatchSummary;
  results: BatchLogResult[];
  errors: { logPath: string; error: string }[];
}

/**
 * Work item in the queue
 */
interface WorkItem {
  logPath: string;
  resolve: (result: BatchLogResult) => void;
  reject: (error: Error) => void;
}

/**
 * BatchRunner manages parallel processing of multiple logs
 * Uses a worker pool with configurable concurrency
 */
export class BatchRunner extends EventEmitter {
  private workers: number;
  private timeout: number;
  private queue: WorkItem[] = [];
  private activeWorkers: number = 0;
  private results: BatchLogResult[] = [];
  private algorithm: string;
  private activityKey: string;
  private verbose: boolean;
  private kernel: Kernel;

  constructor(config: BatchConfig) {
    super();
    this.algorithm = config.algorithm;
    this.kernel = config.kernel;
    this.workers = config.workers ?? os.cpus().length;
    this.timeout = config.timeout ?? 300000; // 5 minutes default
    this.activityKey = config.activityKey ?? 'concept:name';
    this.verbose = config.verbose ?? false;
  }

  /**
   * Run batch processing on multiple logs
   * Returns results with per-log status and aggregated summary
   */
  async run(logPaths: string[]): Promise<BatchResult> {
    this.results = [];
    const promises: Promise<BatchLogResult>[] = [];

    // Queue all work items
    for (const logPath of logPaths) {
      const promise = new Promise<BatchLogResult>((resolve, reject) => {
        this.queue.push({ logPath, resolve, reject });
        this.processQueue();
      });
      promises.push(promise);
    }

    // Wait for all items to complete
    const settledResults = await Promise.allSettled(promises);

    // Flatten results from PromiseSettledResult
    for (let i = 0; i < settledResults.length; i++) {
      const result = settledResults[i];
      if (result.status === 'fulfilled') {
        this.results.push(result.value);
      } else {
        // Handle promise rejection
        const logPath = logPaths[i] || 'unknown';
        this.results.push({
          logPath,
          status: 'failed',
          elapsedMs: 0,
          error: result.reason instanceof Error ? result.reason.message : String(result.reason),
        });
      }
    }

    const batchResult = this.createBatchResult();
    this.emit('completed', batchResult);
    return batchResult;
  }

  /**
   * Process queued items with worker pool concurrency control
   */
  private processQueue(): void {
    if (this.queue.length === 0 || this.activeWorkers >= this.workers) {
      return;
    }

    this.activeWorkers++;
    const item = this.queue.shift();

    if (!item) {
      this.activeWorkers--;
      return;
    }

    this.processLog(item)
      .then((result) => {
        item.resolve(result);
      })
      .catch((error) => {
        item.reject(error);
      })
      .finally(() => {
        this.activeWorkers--;
        this.processQueue();
      });
  }

  /**
   * Process a single log file with full lifecycle management:
   * 1. Read file from disk
   * 2. Load log into WASM via loadEventLog
   * 3. Run algorithm via kernel.run
   * 4. Free WASM handle via kernel.freeHandle
   */
  private async processLog(item: WorkItem): Promise<BatchLogResult> {
    const t0 = performance.now();
    let logHandle: string | undefined;

    try {
      // 1. Read file from disk
      // Note: We use utf-8 for XES XML files.
      const content = await fs.readFile(item.logPath, 'utf-8');

      // 2. Load log into WASM
      logHandle = await this.kernel.loadEventLog(content);

      // 3. Run algorithm
      const res = await this.kernel.run(this.algorithm, logHandle, {
        activity_key: this.activityKey
      });

      const elapsedMs = performance.now() - t0;
      const logResult: BatchLogResult = {
        logPath: item.logPath,
        status: 'success',
        elapsedMs,
        result: {
          handle: res.handle,
          hash: res.hash,
          duration_ms: res.durationMs,
          algorithm: res.algorithm,
          outputType: res.outputType
        },
      };

      this.emit('progress', {
        logPath: item.logPath,
        status: 'success',
        elapsedMs,
        completed: this.results.length + 1,
      });

      return logResult;
    } catch (error) {
      const elapsedMs = performance.now() - t0;
      const logResult: BatchLogResult = {
        logPath: item.logPath,
        status: 'failed',
        elapsedMs,
        error: error instanceof Error ? error.message : String(error),
      };

      this.emit('progress', {
        logPath: item.logPath,
        status: 'failed',
        elapsedMs,
        completed: this.results.length + 1,
        error: logResult.error,
      });

      return logResult;
    } finally {
      // 4. Guaranteed cleanup
      if (logHandle) {
        try {
          this.kernel.freeHandle(logHandle);
        } catch {
          // Best-effort cleanup
        }
      }
    }
  }

  /**
   * Create final result object with summary statistics
   */
  private createBatchResult(): BatchResult {
    const successful = this.results.filter((r) => r.status === 'success').length;
    const failed = this.results.filter((r) => r.status === 'failed').length;
    const timedOut = this.results.filter((r) => r.status === 'timeout').length;

    const successfulResults = this.results.filter((r) => r.status === 'success');
    const elapsedTimes = successfulResults.map((r) => r.elapsedMs);

    const summary: BatchSummary = {
      totalLogs: this.results.length,
      successful,
      failed,
      timedOut,
      totalElapsedMs: elapsedTimes.reduce((a, b) => a + b, 0),
      averageElapsedMs: elapsedTimes.length > 0 ? elapsedTimes.reduce((a, b) => a + b, 0) / elapsedTimes.length : 0,
      minElapsedMs: elapsedTimes.length > 0 ? Math.min(...elapsedTimes) : 0,
      maxElapsedMs: elapsedTimes.length > 0 ? Math.max(...elapsedTimes) : 0,
      successRate: this.results.length > 0 ? successful / this.results.length : 0,
    };

    const errors = this.results
      .filter((r) => r.status !== 'success' && r.error)
      .map((r) => ({ logPath: r.logPath, error: r.error || '' }));

    return {
      summary,
      results: this.results,
      errors,
    };
  }

  /**
   * Reset the runner for reuse
   */
  reset(): void {
    this.queue = [];
    this.activeWorkers = 0;
    this.results = [];
  }
}
