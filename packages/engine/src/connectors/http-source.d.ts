/**
 * HttpSourceAdapter - Fetch event logs from HTTP/HTTPS endpoints
 *
 * Supports JSON and XES responses. Implements retry with exponential
 * backoff for transient network failures.
 */
import { SourceAdapter, Capabilities, EventStream, Result, SourceAdapterKind, RetryStrategy, AuthConfig, AuthType } from '@wasm4pm/contracts';
/**
 * Configuration for HttpSourceAdapter
 */
export interface HttpSourceConfig {
    url: string;
    method?: 'GET' | 'POST';
    headers?: Record<string, string>;
    body?: string;
    timeoutMs?: number;
    auth?: {
        type: AuthType;
        token?: string;
        username?: string;
        password?: string;
    };
}
/**
 * HttpSourceAdapter - Fetches event logs from HTTP endpoints
 *
 * Features:
 * - GET/POST support
 * - Bearer and Basic authentication
 * - Configurable timeout
 * - Retry with exponential backoff
 * - SHA256 fingerprinting for idempotency
 */
export declare class HttpSourceAdapter implements SourceAdapter {
    readonly kind: SourceAdapterKind;
    readonly version = "1.0.0";
    readonly retry: RetryStrategy;
    readonly auth?: AuthConfig;
    private config;
    private stream?;
    constructor(config: HttpSourceConfig);
    capabilities(): Capabilities;
    validate(): Promise<Result<void>>;
    fingerprint(source: unknown): Promise<string>;
    open(): Promise<Result<EventStream>>;
    close(): Promise<void>;
}
//# sourceMappingURL=http-source.d.ts.map