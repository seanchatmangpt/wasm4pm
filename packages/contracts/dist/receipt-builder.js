/**
 * Builder pattern for constructing Receipt objects
 * Encapsulates hashing and validation logic
 */
import { v4 as uuidv4 } from 'uuid';
import { hashData } from './hash';
/**
 * Fluent builder for constructing Receipt objects
 * All setters return the builder for method chaining
 */
export class ReceiptBuilder {
    /**
     * Create a new ReceiptBuilder with optional initial run_id
     * @param runId Optional run ID (defaults to new UUID)
     */
    constructor(runId) {
        this.runId = '';
        this.configHash = '';
        this.inputHash = '';
        this.planHash = '';
        this.outputHash = '';
        this.startTime = '';
        this.endTime = '';
        this.durationMs = 0;
        this.status = 'success';
        this.summary = {
            traces_processed: 0,
            objects_processed: 0,
            variants_discovered: 0,
        };
        this.algorithm = {
            name: '',
            version: '',
            parameters: {},
        };
        this.model = {
            nodes: 0,
            edges: 0,
        };
        this.runId = runId || uuidv4();
    }
    /**
     * Set the run ID (UUID)
     * @param id UUID string
     * @returns This builder for chaining
     */
    setRunId(id) {
        this.runId = id;
        return this;
    }
    /**
     * Set configuration and compute its hash
     * @param config Configuration object
     * @returns This builder for chaining
     */
    setConfig(config) {
        this.configHash = hashData(config);
        return this;
    }
    /**
     * Set input data and compute its hash
     * @param data Input data
     * @returns This builder for chaining
     */
    setInput(data) {
        this.inputHash = hashData(data);
        return this;
    }
    /**
     * Set execution plan and compute its hash
     * @param plan Execution plan object
     * @returns This builder for chaining
     */
    setPlan(plan) {
        this.planHash = hashData(plan);
        return this;
    }
    /**
     * Set output data and compute its hash
     * @param output Output data
     * @returns This builder for chaining
     */
    setOutput(output) {
        this.outputHash = hashData(output);
        return this;
    }
    /**
     * Set execution timeline
     * @param startTime ISO 8601 start time
     * @param endTime ISO 8601 end time
     * @returns This builder for chaining
     */
    setTiming(startTime, endTime) {
        this.startTime = startTime;
        this.endTime = endTime;
        // Compute duration if both times are valid ISO 8601
        try {
            const start = new Date(startTime);
            const end = new Date(endTime);
            this.durationMs = Math.max(0, end.getTime() - start.getTime());
        }
        catch {
            // If dates are invalid, duration stays at 0
        }
        return this;
    }
    /**
     * Set execution duration directly
     * @param ms Duration in milliseconds
     * @returns This builder for chaining
     */
    setDuration(ms) {
        this.durationMs = Math.max(0, ms);
        return this;
    }
    /**
     * Set execution status
     * @param status Execution outcome
     * @returns This builder for chaining
     */
    setStatus(status) {
        this.status = status;
        return this;
    }
    /**
     * Set error information (only for failed/partial status)
     * @param error Error details
     * @returns This builder for chaining
     */
    setError(error) {
        this.error = error;
        return this;
    }
    /**
     * Set execution summary
     * @param summary Processing results
     * @returns This builder for chaining
     */
    setSummary(summary) {
        this.summary = { ...this.summary, ...summary };
        return this;
    }
    /**
     * Set algorithm information
     * @param algorithm Algorithm details
     * @returns This builder for chaining
     */
    setAlgorithm(algorithm) {
        this.algorithm = { ...this.algorithm, ...algorithm };
        return this;
    }
    /**
     * Set generated model information
     * @param model Model details
     * @returns This builder for chaining
     */
    setModel(model) {
        this.model = { ...this.model, ...model };
        return this;
    }
    /**
     * Build the final Receipt
     * @returns Constructed Receipt object
     * @throws Error if required fields are missing
     */
    build() {
        this.validate();
        const receipt = {
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
    validate() {
        const required = [
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
//# sourceMappingURL=receipt-builder.js.map