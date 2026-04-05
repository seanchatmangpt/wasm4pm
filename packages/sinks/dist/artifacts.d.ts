/**
 * Artifact Type Definitions
 *
 * Concrete TypeScript interfaces for each artifact type that sinks handle.
 * These provide typed alternatives to the `unknown` artifact parameter in SinkAdapter.write().
 */
/**
 * Receipt artifact — proof of execution
 */
export interface ReceiptArtifact {
    run_id: string;
    timestamp: string;
    algorithm: string;
    input_file?: string;
    status: 'success' | 'failed' | 'partial';
    event_count?: number;
    trace_count?: number;
    duration_ms?: number;
    error?: string;
    schema_version?: string;
    hashes?: {
        config?: string;
        input?: string;
        plan?: string;
    };
}
/**
 * Model artifact — discovered process model
 */
export interface ModelArtifact {
    name: string;
    type?: 'dfg' | 'petri_net' | 'declare' | 'tree';
    petriNet?: boolean;
    nodes?: Array<{
        id: string;
        label?: string;
    }>;
    edges?: Array<{
        source: string;
        target: string;
        weight?: number;
    }>;
    places?: Array<{
        id: string;
        tokens?: number;
    }>;
    transitions?: Array<{
        id: string;
        label?: string;
    }>;
    metadata?: Record<string, unknown>;
}
/**
 * Report artifact — HTML or Markdown analysis output
 */
export interface ReportArtifact {
    name: string;
    format: 'html' | 'markdown' | 'json';
    content: string;
    metadata?: Record<string, unknown>;
}
/**
 * Explain snapshot — captures plan reasoning at a point in time
 */
export interface ExplainSnapshotArtifact {
    timestamp: string;
    step?: number;
    explanation: string;
    state?: Record<string, unknown>;
}
/**
 * Status snapshot — captures execution state at a point in time
 */
export interface StatusSnapshotArtifact {
    timestamp: string;
    state: string;
    progress?: number;
    message?: string;
    errors?: Array<{
        code: string;
        message: string;
    }>;
}
/**
 * Union of all typed artifacts
 */
export type TypedArtifact = ReceiptArtifact | ModelArtifact | ReportArtifact | ExplainSnapshotArtifact | StatusSnapshotArtifact;
/**
 * Map from ArtifactType to its typed interface
 */
export interface ArtifactTypeMap {
    receipt: ReceiptArtifact;
    model: ModelArtifact;
    report: ReportArtifact;
    explain_snapshot: ExplainSnapshotArtifact;
    status_snapshot: StatusSnapshotArtifact;
}
/**
 * Type guard: check if artifact matches expected receipt shape
 */
export declare function isReceiptArtifact(artifact: unknown): artifact is ReceiptArtifact;
/**
 * Type guard: check if artifact matches expected model shape
 */
export declare function isModelArtifact(artifact: unknown): artifact is ModelArtifact;
/**
 * Type guard: check if artifact matches expected report shape
 */
export declare function isReportArtifact(artifact: unknown): artifact is ReportArtifact;
//# sourceMappingURL=artifacts.d.ts.map