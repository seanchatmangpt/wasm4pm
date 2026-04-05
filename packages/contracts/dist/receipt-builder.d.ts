/**
 * Builder pattern for constructing Receipt objects
 * Encapsulates hashing and validation logic
 */
import { Receipt, ErrorInfo, ExecutionSummary, AlgorithmInfo, ModelInfo } from './receipt';
/**
 * Fluent builder for constructing Receipt objects
 * All setters return the builder for method chaining
 */
export declare class ReceiptBuilder {
    private runId;
    private configHash;
    private inputHash;
    private planHash;
    private outputHash;
    private startTime;
    private endTime;
    private durationMs;
    private status;
    private error?;
    private summary;
    private algorithm;
    private model;
    /**
     * Create a new ReceiptBuilder with optional initial run_id
     * @param runId Optional run ID (defaults to new UUID)
     */
    constructor(runId?: string);
    /**
     * Set the run ID (UUID)
     * @param id UUID string
     * @returns This builder for chaining
     */
    setRunId(id: string): this;
    /**
     * Set configuration and compute its hash
     * @param config Configuration object
     * @returns This builder for chaining
     */
    setConfig(config: Record<string, any>): this;
    /**
     * Set input data and compute its hash
     * @param data Input data
     * @returns This builder for chaining
     */
    setInput(data: any): this;
    /**
     * Set execution plan and compute its hash
     * @param plan Execution plan object
     * @returns This builder for chaining
     */
    setPlan(plan: Record<string, any>): this;
    /**
     * Set output data and compute its hash
     * @param output Output data
     * @returns This builder for chaining
     */
    setOutput(output: any): this;
    /**
     * Set execution timeline
     * @param startTime ISO 8601 start time
     * @param endTime ISO 8601 end time
     * @returns This builder for chaining
     */
    setTiming(startTime: string, endTime: string): this;
    /**
     * Set execution duration directly
     * @param ms Duration in milliseconds
     * @returns This builder for chaining
     */
    setDuration(ms: number): this;
    /**
     * Set execution status
     * @param status Execution outcome
     * @returns This builder for chaining
     */
    setStatus(status: 'success' | 'partial' | 'failed'): this;
    /**
     * Set error information (only for failed/partial status)
     * @param error Error details
     * @returns This builder for chaining
     */
    setError(error: ErrorInfo): this;
    /**
     * Set execution summary
     * @param summary Processing results
     * @returns This builder for chaining
     */
    setSummary(summary: Partial<ExecutionSummary>): this;
    /**
     * Set algorithm information
     * @param algorithm Algorithm details
     * @returns This builder for chaining
     */
    setAlgorithm(algorithm: Partial<AlgorithmInfo>): this;
    /**
     * Set generated model information
     * @param model Model details
     * @returns This builder for chaining
     */
    setModel(model: Partial<ModelInfo>): this;
    /**
     * Build the final Receipt
     * @returns Constructed Receipt object
     * @throws Error if required fields are missing
     */
    build(): Receipt;
    /**
     * Validate that all required fields are set
     * @throws Error if any required field is missing
     */
    private validate;
}
//# sourceMappingURL=receipt-builder.d.ts.map