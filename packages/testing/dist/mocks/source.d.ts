/**
 * Mock SourceAdapter for testing without real file/network I/O.
 */
export type SourceAdapterKind = 'file' | 'http' | 'stream' | 'inline' | 'mock';
export interface Capabilities {
    streaming: boolean;
    random_access: boolean;
    watch: boolean;
    formats: string[];
}
export interface Result<T> {
    type: 'ok' | 'err';
    value?: T;
    error?: string;
}
/**
 * SENTINEL_FINGERPRINT is used when no fingerprint is supplied to MockSourceAdapter.
 * It is intentionally not a valid BLAKE3 hex string (wrong length, wrong prefix) so
 * that any receipt that carries this value is immediately visible as a mock artifact
 * rather than a real content hash.  Tests that need a stable but fake fingerprint
 * should pass one explicitly via MockSourceOptions.fingerprint.
 */
export declare const SENTINEL_FINGERPRINT = "mock-source-no-fingerprint-provided";
export interface MockSourceOptions {
    kind?: SourceAdapterKind;
    data?: string;
    fingerprint?: string;
    shouldFailValidate?: boolean;
    shouldFailOpen?: boolean;
    validateDelay?: number;
    openDelay?: number;
    capabilities?: Partial<Capabilities>;
}
export declare class MockSourceAdapter {
    readonly kind: SourceAdapterKind;
    readonly version = "1.0.0-mock";
    readonly auth: undefined;
    private _data;
    private _fingerprint;
    private _shouldFailValidate;
    private _shouldFailOpen;
    private _validateDelay;
    private _openDelay;
    private _capabilities;
    private _opened;
    private _closed;
    /** Track calls for assertion */
    readonly calls: {
        method: string;
        timestamp: number;
        args?: unknown[];
    }[];
    constructor(options?: MockSourceOptions);
    capabilities(): Capabilities;
    fingerprint(): Promise<string>;
    validate(): Promise<Result<void>>;
    open(): Promise<Result<{
        data: string;
    }>>;
    close(): Promise<void>;
    /** Assert that methods were called in expected order */
    assertCallOrder(expectedOrder: string[]): void;
    get isOpened(): boolean;
    get isClosed(): boolean;
    reset(): void;
}
export declare function createMockSource(options?: MockSourceOptions): MockSourceAdapter;
//# sourceMappingURL=source.d.ts.map