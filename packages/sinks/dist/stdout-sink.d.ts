/**
 * StdoutSinkAdapter - Write artifacts to stdout / a writable stream
 *
 * Useful for piping output to other tools or viewing results in the terminal.
 * Outputs JSON for structured artifacts, raw text for reports.
 */
import type { Writable } from 'stream';
import { SinkAdapter, ArtifactType, SinkAdapterKind, Result, ExistsBehavior, AtomicityLevel, FailureMode } from '@wasm4pm/contracts';
/**
 * Configuration for StdoutSinkAdapter
 */
export interface StdoutSinkConfig {
    /** Output stream. Defaults to process.stdout. */
    stream?: Writable;
    /** Whether to pretty-print JSON (default: true) */
    pretty?: boolean;
    /** Separator between artifacts (default: newline) */
    separator?: string;
}
/**
 * StdoutSinkAdapter - Writes artifacts to stdout or a writable stream
 *
 * Supports all artifact types. Formats:
 * - Receipts, models, snapshots: JSON
 * - Reports (HTML/Markdown): raw content
 *
 * Atomicity: none (streams are append-only, no rollback)
 */
export declare class StdoutSinkAdapter implements SinkAdapter {
    readonly kind: SinkAdapterKind;
    readonly version = "1.0.0";
    readonly atomicity: AtomicityLevel;
    readonly onExists: ExistsBehavior;
    readonly failureMode: FailureMode;
    private config;
    private artifactCount;
    constructor(config?: StdoutSinkConfig);
    supportedArtifacts(): ArtifactType[];
    supportsArtifact(type: ArtifactType): boolean;
    validate(): Promise<Result<void>>;
    write(artifact: unknown, type: ArtifactType): Promise<Result<string>>;
    close(): Promise<void>;
    private formatArtifact;
    private writeToStream;
}
//# sourceMappingURL=stdout-sink.d.ts.map