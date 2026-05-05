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
 * Builder for constructing execution receipts
 * Accumulates timing, outputs, and metadata during pipeline execution
 * Provides a fluent interface for receipt construction
 */
export declare class ReceiptBuilder {
  private config;
  private startTimestamp;
  private stepTimings;
  private outputs;
  private executedSteps;
  private inputDataSize?;
  private outputDataSize?;
  private sourceFormat?;
  constructor(config: Wasm4pmConfig);
  /**
   * Records the start time of execution
   * Must be called once at the beginning of pipeline execution
   */
  start(): this;
  /**
   * Records timing for a single pipeline step
   * Accumulates timing information for the final receipt
   * Steps should be recorded in execution order
   *
   * @param stepId - Unique identifier of the step
   * @param durationMs - Duration of step execution in milliseconds
   */
  recordStep(stepId: string, durationMs: number): this;
  /**
   * Sets the final outputs from pipeline execution
   * Typically called after all steps complete
   * Outputs are keyed by step ID or result name
   *
   * @param outputs - Map of step outputs keyed by step ID
   */
  setOutputs(outputs: Record<string, unknown>): this;
  /**
   * Records the size of input data in bytes
   * Used for performance analysis
   *
   * @param sizeBytes - Size of input data in bytes
   */
  setInputDataSize(sizeBytes: number): this;
  /**
   * Records the size of output data in bytes
   * Used for performance analysis
   *
   * @param sizeBytes - Size of output data in bytes
   */
  setOutputDataSize(sizeBytes: number): this;
  /**
   * Constructs the final execution receipt
   * Must be called after start() and ideally after recordStep() calls and setOutputs()
   *
   * @returns Complete ExecutionReceipt
   * @throws Error if start() was not called
   */
  build(): ExecutionReceipt;
}
/**
 * Generates a unique run identifier
 * Format: "run_<ISO_timestamp>_<random4>"
 * Example: "run_2026-04-04T17:30:45.123Z_a7b2"
 *
 * @returns Unique run ID string
 */
export declare function generateRunId(): string;
/**
 * Computes a deterministic hash of a configuration object
 * Uses sorted JSON stringification for consistency
 * Hash is used for caching and deduplication
 *
 * @param config - Configuration to hash
 * @returns Hex string hash (32 chars, like MD5)
 */
export declare function hashConfig(config: Wasm4pmConfig): string;
/**
 * Formats an ExecutionReceipt for console logging
 * Provides human-readable summary of execution with timing and metadata
 *
 * @param receipt - Receipt to format
 * @returns Formatted string representation suitable for console output
 */
export declare function formatReceipt(receipt: ExecutionReceipt): string;
/**
 * Creates a compressed representation of receipt for storage
 * Useful for logging to files or databases
 *
 * @param receipt - Receipt to compress
 * @returns Compressed JSON string
 */
export declare function compressReceipt(receipt: ExecutionReceipt): string;
/**
 * Parses a compressed receipt from JSON string
 * Restores type information
 *
 * @param json - JSON string representation of receipt
 * @returns Parsed ExecutionReceipt
 */
export declare function parseReceipt(json: string): ExecutionReceipt;
//# sourceMappingURL=receipt.d.ts.map
