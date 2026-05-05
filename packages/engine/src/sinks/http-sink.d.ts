/**
 * HttpSinkAdapter - POST artifacts to an HTTP endpoint
 *
 * Sends JSON-serialized artifacts via HTTP POST with configurable
 * authentication and retry logic.
 */
import { SinkAdapter, ArtifactType, SinkAdapterKind, Result, ExistsBehavior, AtomicityLevel, FailureMode } from '@wasm4pm/contracts';
/**
 * Configuration for HttpSinkAdapter
 */
export interface HttpSinkConfig {
    url: string;
    method?: 'POST' | 'PUT';
    headers?: Record<string, string>;
    timeoutMs?: number;
    auth?: {
        type: 'none' | 'bearer' | 'basic';
        token?: string;
        username?: string;
        password?: string;
    };
    onExists?: ExistsBehavior;
    failureMode?: FailureMode;
}
/**
 * HttpSinkAdapter - Sends artifacts to a remote HTTP endpoint
 *
 * Each write() sends a single POST/PUT request with JSON body:
 * ```json
 * { "type": "<artifact-type>", "artifact": <artifact-data> }
 * ```
 *
 * Atomicity: event-level (each write is one HTTP request)
 */
export declare class HttpSinkAdapter implements SinkAdapter {
    readonly kind: SinkAdapterKind;
    readonly version = "1.0.0";
    readonly atomicity: AtomicityLevel;
    readonly onExists: ExistsBehavior;
    readonly failureMode: FailureMode;
    private config;
    constructor(config: HttpSinkConfig);
    supportedArtifacts(): ArtifactType[];
    supportsArtifact(type: ArtifactType): boolean;
    validate(): Promise<Result<void>>;
    write(artifact: unknown, type: ArtifactType): Promise<Result<string>>;
    close(): Promise<void>;
}
//# sourceMappingURL=http-sink.d.ts.map