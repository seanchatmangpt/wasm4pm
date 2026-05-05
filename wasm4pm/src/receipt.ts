/**
 * receipt.ts
 * Execution receipt builder and types
 * Tracks execution metadata, timing, and outputs for audit trail and debugging
 */

import { Wasm4pmConfig, ExecutionProfile } from './config.js';

/**
 * Complete execution receipt containing all metadata about a pipeline run
 * Serves as audit trail and debugging information for compliance and debugging
 */
export interface ExecutionReceipt {
  // Identification
  runId: string; // Unique run identifier: "run_<ISO_timestamp>_<random4>"
  engineVersion: string; // Version of wasm4pm engine (0.5.4)
  configHash: string; // Deterministic hash of configuration (32-char hex)

  // Execution context
  profile: ExecutionProfile; // Execution profile that was used
  pipeline: string[]; // List of step IDs that executed (in order)

  // Timing information
  timing: {
    total_ms: number; // Total execution time in milliseconds
    steps: Record<string, number>; // Per-step timing keyed by step ID
  };

  // Results
  outputs: Record<string, unknown>; // Final outputs keyed by step ID or result name

  // Receipt metadata
  receipt: {
    startedAt: string; // ISO 8601 timestamp when execution started
    finishedAt: string; // ISO 8601 timestamp when execution finished
    inputDataSize?: number; // Size of input data in bytes
    outputDataSize?: number; // Size of output data in bytes
    sourceFormat?: string; // Input source format (xes, csv, json, etc)
  };
}

/**
 * Builder for constructing execution receipts
 * Accumulates timing, outputs, and metadata during pipeline execution
 * Provides a fluent interface for receipt construction
 */
export class ReceiptBuilder {
  private config: Wasm4pmConfig;
  private startTimestamp: Date | null = null;
  private stepTimings: Map<string, number> = new Map();
  private outputs: Map<string, unknown> = new Map();
  private executedSteps: string[] = [];
  private inputDataSize?: number;
  private outputDataSize?: number;
  private sourceFormat?: string;

  constructor(config: Wasm4pmConfig) {
    this.config = config;
    this.sourceFormat = config.source.format;
  }

  /**
   * Records the start time of execution
   * Must be called once at the beginning of pipeline execution
   */
  start(): this {
    this.startTimestamp = new Date();
    return this;
  }

  /**
   * Records timing for a single pipeline step
   * Accumulates timing information for the final receipt
   * Steps should be recorded in execution order
   *
   * @param stepId - Unique identifier of the step
   * @param durationMs - Duration of step execution in milliseconds
   */
  recordStep(stepId: string, durationMs: number): this {
    this.stepTimings.set(stepId, durationMs);
    if (!this.executedSteps.includes(stepId)) {
      this.executedSteps.push(stepId);
    }
    return this;
  }

  /**
   * Sets the final outputs from pipeline execution
   * Typically called after all steps complete
   * Outputs are keyed by step ID or result name
   *
   * @param outputs - Map of step outputs keyed by step ID
   */
  setOutputs(outputs: Record<string, unknown>): this {
    this.outputs = new Map(Object.entries(outputs));
    return this;
  }

  /**
   * Records the size of input data in bytes
   * Used for performance analysis
   *
   * @param sizeBytes - Size of input data in bytes
   */
  setInputDataSize(sizeBytes: number): this {
    this.inputDataSize = sizeBytes;
    return this;
  }

  /**
   * Records the size of output data in bytes
   * Used for performance analysis
   *
   * @param sizeBytes - Size of output data in bytes
   */
  setOutputDataSize(sizeBytes: number): this {
    this.outputDataSize = sizeBytes;
    return this;
  }

  /**
   * Constructs the final execution receipt
   * Must be called after start() and ideally after recordStep() calls and setOutputs()
   *
   * @returns Complete ExecutionReceipt
   * @throws Error if start() was not called
   */
  build(): ExecutionReceipt {
    if (!this.startTimestamp) {
      throw new Error('ReceiptBuilder.start() must be called before build()');
    }

    const finishTimestamp = new Date();
    const totalMs = finishTimestamp.getTime() - this.startTimestamp.getTime();

    return {
      runId: generateRunId(),
      engineVersion: '0.5.4',
      configHash: hashConfig(this.config),
      profile: this.config.execution.profile,
      pipeline: this.executedSteps,
      timing: {
        total_ms: totalMs,
        steps: Object.fromEntries(this.stepTimings),
      },
      outputs: Object.fromEntries(this.outputs),
      receipt: {
        startedAt: this.startTimestamp.toISOString(),
        finishedAt: finishTimestamp.toISOString(),
        inputDataSize: this.inputDataSize,
        outputDataSize: this.outputDataSize,
        sourceFormat: this.sourceFormat,
      },
    };
  }
}

/**
 * Generates a unique run identifier
 * Format: "run_<ISO_timestamp>_<random4>"
 * Example: "run_2026-04-04T17:30:45.123Z_a7b2"
 *
 * @returns Unique run ID string
 */
export function generateRunId(): string {
  const timestamp = new Date().toISOString();
  const random = Math.random().toString(16).substring(2, 6);
  return `run_${timestamp}_${random}`;
}

/**
 * Computes a deterministic hash of a configuration object
 * Uses sorted JSON stringification for consistency
 * Hash is used for caching and deduplication
 *
 * @param config - Configuration to hash
 * @returns Hex string hash (32 chars, like MD5)
 */
export function hashConfig(config: Wasm4pmConfig): string {
  // Create a deterministic representation by sorting keys
  const sortedConfig = sortObjectKeys(config);
  const jsonStr = JSON.stringify(sortedConfig);

  // Simple hash function (simulating MD5-like output)
  // In production, would use crypto.subtle.digest('SHA-256', ...)
  return simpleHash(jsonStr);
}

/**
 * Recursively sorts all keys in an object to ensure deterministic JSON representation
 * Handles nested objects and arrays
 */
function sortObjectKeys(obj: any): any {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => sortObjectKeys(item));
  }

  const sorted: Record<string, any> = {};
  const keys = Object.keys(obj).sort();

  for (const key of keys) {
    sorted[key] = sortObjectKeys(obj[key]);
  }

  return sorted;
}

/**
 * Simple hash function for deterministic string hashing
 * Produces a 32-character hex string similar to MD5/SHA output
 * NOT cryptographically secure - for content addressing only
 *
 * @param str - String to hash
 * @returns 32-character hex string
 */
function simpleHash(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) + hash + str.charCodeAt(i);
    hash = hash & hash; // Convert to 32-bit integer
  }

  // Convert to hex and pad to 32 chars
  let hex = (hash >>> 0).toString(16);
  while (hex.length < 32) {
    hex = '0' + hex;
  }
  return hex.substring(0, 32);
}

/**
 * Formats an ExecutionReceipt for console logging
 * Provides human-readable summary of execution with timing and metadata
 *
 * @param receipt - Receipt to format
 * @returns Formatted string representation suitable for console output
 */
export function formatReceipt(receipt: ExecutionReceipt): string {
  const lines: string[] = [];

  lines.push('=== Execution Receipt ===');
  lines.push(`Run ID: ${receipt.runId}`);
  lines.push(`Engine: v${receipt.engineVersion}`);
  lines.push(`Config Hash: ${receipt.configHash}`);
  lines.push(`Profile: ${receipt.profile}`);
  lines.push('');

  lines.push('Pipeline Execution:');
  for (const step of receipt.pipeline) {
    const timing = receipt.timing.steps[step];
    const timingStr = timing !== undefined ? `${timing}ms` : 'N/A';
    lines.push(`  - ${step}: ${timingStr}`);
  }
  lines.push('');

  lines.push('Timing:');
  lines.push(`  Total: ${receipt.timing.total_ms}ms`);
  if (receipt.pipeline.length > 0) {
    const avgStepTime = receipt.timing.total_ms / receipt.pipeline.length;
    lines.push(`  Average per step: ${Math.round(avgStepTime)}ms`);
  }
  lines.push('');

  lines.push('Metadata:');
  if (receipt.receipt.sourceFormat) {
    lines.push(`  Source Format: ${receipt.receipt.sourceFormat}`);
  }
  if (receipt.receipt.inputDataSize !== undefined) {
    lines.push(`  Input Size: ${formatBytes(receipt.receipt.inputDataSize)}`);
  }
  if (receipt.receipt.outputDataSize !== undefined) {
    lines.push(`  Output Size: ${formatBytes(receipt.receipt.outputDataSize)}`);
  }
  lines.push('');

  lines.push('Timestamps:');
  lines.push(`  Started: ${receipt.receipt.startedAt}`);
  lines.push(`  Finished: ${receipt.receipt.finishedAt}`);

  return lines.join('\n');
}

/**
 * Formats a byte count as a human-readable string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return (bytes / Math.pow(k, i)).toFixed(2) + ' ' + sizes[i];
}

/**
 * Creates a compressed representation of receipt for storage
 * Useful for logging to files or databases
 *
 * @param receipt - Receipt to compress
 * @returns Compressed JSON string
 */
export function compressReceipt(receipt: ExecutionReceipt): string {
  // Omit outputs if they're too large (>1MB when stringified)
  const outputsStr = JSON.stringify(receipt.outputs);
  if (outputsStr.length > 1_000_000) {
    const compressed = {
      ...receipt,
      outputs: {
        _note: 'Outputs omitted (too large)',
        size_bytes: outputsStr.length,
      },
    };
    return JSON.stringify(compressed);
  }

  return JSON.stringify(receipt);
}

/**
 * Parses a compressed receipt from JSON string
 * Restores type information
 *
 * @param json - JSON string representation of receipt
 * @returns Parsed ExecutionReceipt
 */
export function parseReceipt(json: string): ExecutionReceipt {
  return JSON.parse(json) as ExecutionReceipt;
}
