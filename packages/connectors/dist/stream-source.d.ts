/**
 * StreamSourceAdapter - Read event logs from ReadableStreams or stdin
 *
 * Supports reading newline-delimited JSON from any Node.js Readable stream
 * or process.stdin for piped input.
 */
import type { Readable } from 'stream';
import { SourceAdapter, Capabilities, EventStream, Result, SourceAdapterKind } from '@wasm4pm/contracts';
/**
 * Configuration for StreamSourceAdapter
 */
export interface StreamSourceConfig {
    /** A Node.js Readable stream to consume. Defaults to process.stdin if omitted. */
    stream?: Readable;
    /** Label used in fingerprinting when no stream identity is available */
    label?: string;
}
/**
 * StreamSourceAdapter - Reads event logs from Readable streams
 *
 * Use cases:
 * - `echo '{"a":1}' | pmctl run` (stdin pipe)
 * - Programmatic stream injection in tests or libraries
 *
 * Features:
 * - Reads until stream ends, then serves batches
 * - SHA256 fingerprinting via content hash
 * - Checkpoint / seek support
 */
export declare class StreamSourceAdapter implements SourceAdapter {
    readonly kind: SourceAdapterKind;
    readonly version = "1.0.0";
    private config;
    private stream?;
    private bufferedContent?;
    constructor(config?: StreamSourceConfig);
    capabilities(): Capabilities;
    validate(): Promise<Result<void>>;
    fingerprint(source: unknown): Promise<string>;
    open(): Promise<Result<EventStream>>;
    close(): Promise<void>;
    /**
     * Read entire stream into a string
     */
    private readAll;
}
//# sourceMappingURL=stream-source.d.ts.map