/**
 * Builder pattern for constructing Receipt objects
 * Encapsulates hashing and validation logic
 */

import { v4 as uuidv4 } from 'uuid';
import { Receipt, ErrorInfo, ExecutionSummary, AlgorithmInfo, ModelInfo } from './receipt.js';
import { hashData } from './hash.js';

/**
 * Fluent builder for constructing Receipt objects
 * All setters return the builder for method chaining
 */
export class ReceiptBuilder {
  private runId: string = '';
  private configHash: string = '';
  private inputHash: string = '';
  private planHash: string = '';
  private outputHash: string = '';
  private startTime: string = '';
  private endTime: string = '';
  private durationMs: number = 0;
  private status: 'success' | 'partial' | 'failed' = 'success';
  private error?: ErrorInfo;
  private summary: ExecutionSummary = {
    traces_processed: 0,
    objects_processed: 0,
    variants_discovered: 0,
  };
  private algorithm: AlgorithmInfo = {
    name: '',
    version: '',
    parameters: {},
  };
  private model: ModelInfo = {
    nodes: 0,
    edges: 0,
  };

  /**
   * Create a new ReceiptBuilder with optional initial run_id
   * @param runId Optional run ID (defaults to new UUID)
   */
  constructor(runId?: string) {
    this.runId = runId || uuidv4();
  }

  /**
   * Set the run ID (UUID)
   * @param id UUID string
   * @returns This builder for chaining
   */
  setRunId(id: string): this {
    this.runId = id;
    return this;
  }

  /**
   * Set configuration and compute its hash
   * @param config Configuration object
   * @returns This builder for chaining
   */
  setConfig(config: Record<string, any>): this {
    this.configHash = hashData(config);
    return this;
  }

  /**
   * Set input data and compute its hash
   * @param data Input data
   * @returns This builder for chaining
   */
  setInput(data: any): this {
    this.inputHash = hashData(data);
    return this;
  }

  /**
   * Set execution plan and compute its hash
   * @param plan Execution plan object
   * @returns This builder for chaining
   */
  setPlan(plan: Record<string, any>): this {
    this.planHash = hashData(plan);
    return this;
  }

  /**
   * Set output data and compute its hash
   * @param output Output data
   * @returns This builder for chaining
   */
  setOutput(output: any): this {
    this.outputHash = hashData(output);
    return this;
  }

  /**
   * Set execution timeline
   * @param startTime ISO 8601 start time
   * @param endTime ISO 8601 end time
   * @returns This builder for chaining
   */
  setTiming(startTime: string, endTime: string): this {
    this.startTime = startTime;
    this.endTime = endTime;

    // Compute duration if both times are valid ISO 8601
    try {
      const start = new Date(startTime);
      const end = new Date(endTime);
      this.durationMs = Math.max(0, end.getTime() - start.getTime());
    } catch {
      // If dates are invalid, duration stays at 0
    }

    return this;
  }

  /**
   * Set execution duration directly
   * @param ms Duration in milliseconds
   * @returns This builder for chaining
   */
  setDuration(ms: number): this {
    this.durationMs = Math.max(0, ms);
    return this;
  }

  /**
   * Set execution status
   * @param status Execution outcome
   * @returns This builder for chaining
   */
  setStatus(status: 'success' | 'partial' | 'failed'): this {
    this.status = status;
    return this;
  }

  /**
   * Set error information (only for failed/partial status)
   * @param error Error details
   * @returns This builder for chaining
   */
  setError(error: ErrorInfo): this {
    this.error = error;
    return this;
  }

  /**
   * Set execution summary
   * @param summary Processing results
   * @returns This builder for chaining
   */
  setSummary(summary: Partial<ExecutionSummary>): this {
    this.summary = { ...this.summary, ...summary };
    return this;
  }

  /**
   * Set algorithm information
   * @param algorithm Algorithm details
   * @returns This builder for chaining
   */
  setAlgorithm(algorithm: Partial<AlgorithmInfo>): this {
    this.algorithm = { ...this.algorithm, ...algorithm };
    return this;
  }

  /**
   * Set generated model information
   * @param model Model details
   * @returns This builder for chaining
   */
  setModel(model: Partial<ModelInfo>): this {
    this.model = { ...this.model, ...model };
    return this;
  }

  /**
   * Build the final Receipt
   * @returns Constructed Receipt object
   * @throws Error if required fields are missing
   */
  build(): Receipt {
    this.validate();

    const receipt: Receipt = {
      run_id: this.runId,
      schema_version: '1.0',
      config_hash: this.configHash,
      input_hash: this.inputHash,
      plan_hash: this.planHash,
      output_hash: this.outputHash,
      start_time: this.startTime,
      end_time: this.endTime,
      duration_ms: this.durationMs,
      status: this.status,
      summary: this.summary,
      algorithm: this.algorithm,
      model: this.model,
    };

    if (this.error) {
      receipt.error = this.error;
    }

    return receipt;
  }

  /**
   * Validate that all required fields are set
   * @throws Error if any required field is missing
   */
  private validate(): void {
    const required: [string, any][] = [
      ['run_id', this.runId],
      ['config_hash', this.configHash],
      ['input_hash', this.inputHash],
      ['plan_hash', this.planHash],
      ['output_hash', this.outputHash],
      ['start_time', this.startTime],
      ['end_time', this.endTime],
      ['summary', this.summary],
      ['algorithm', this.algorithm],
      ['model', this.model],
    ];

    for (const [field, value] of required) {
      if (!value || (typeof value === 'string' && value.trim() === '')) {
        throw new Error(`Receipt field required: ${field}`);
      }
    }
  }
}
