/**
 * FileLogSinkAdapter - Write models/reports/receipts to disk
 *
 * Handles:
 * - Receipt: JSON with run metadata
 * - Model: DFG as .dfg.json, PetriNet as .pn.json
 * - Report: HTML/Markdown process reports
 * - Status Snapshots: Point-in-time execution state
 *
 * Atomicity: batch-level (all artifacts in a run written together)
 */
import { SinkAdapter, ArtifactType, SinkAdapterKind, Result, ExistsBehavior, AtomicityLevel, FailureMode } from '@wasm4pm/contracts';
/**
 * Configuration for FileLogSinkAdapter
 */
export interface FileLogSinkConfig {
    directory: string;
    onExists?: ExistsBehavior;
    failureMode?: FailureMode;
}
/**
 * Receipt artifact structure
 */
export interface Receipt {
    run_id: string;
    timestamp: string;
    algorithm: string;
    input_file?: string;
    status: 'success' | 'failed' | 'partial';
    event_count?: number;
    trace_count?: number;
    duration_ms?: number;
    error?: string;
}
/**
 * FileLogSinkAdapter - Write results to local filesystem
 *
 * Supports writing:
 * - Receipts: JSON metadata about run
 * - Models: DFG and PetriNet in JSON format
 * - Reports: HTML and Markdown reports
 * - Snapshots: Execution state snapshots
 *
 * Features:
 * - Atomic batch writes
 * - Configurable exists behavior (skip/overwrite/error)
 * - Automatic directory creation
 */
export declare class FileLogSinkAdapter implements SinkAdapter {
    readonly kind: SinkAdapterKind;
    readonly version = "1.0.0";
    readonly atomicity: AtomicityLevel;
    readonly onExists: ExistsBehavior;
    readonly failureMode: FailureMode;
    private config;
    constructor(config: FileLogSinkConfig);
    /**
     * List supported artifact types
     */
    supportedArtifacts(): ArtifactType[];
    /**
     * Check if sink supports specific artifact type
     */
    supportsArtifact(type: ArtifactType): boolean;
    /**
     * Validate sink configuration and destination
     */
    validate(): Promise<Result<void>>;
    /**
     * Write artifact to sink
     * Returns artifact ID (filename without extension)
     */
    write(artifact: unknown, type: ArtifactType): Promise<Result<string>>;
    /**
     * Close sink and release resources
     */
    close(): Promise<void>;
    /**
     * Get filename for artifact
     */
    private getFilename;
    /**
     * Format artifact for file writing
     */
    private formatArtifact;
    /**
     * Append artifact to existing file (for append mode)
     */
    private appendArtifact;
}
//# sourceMappingURL=file-log-sink.d.ts.map