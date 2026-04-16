/**
 * Mock SinkAdapter for testing without real file/network I/O.
 */
export type ArtifactType = 'receipt' | 'model' | 'report' | 'snapshot' | 'log';
export type AtomicityLevel = 'none' | 'record' | 'batch' | 'all';
export type ExistsBehavior = 'overwrite' | 'append' | 'error' | 'skip';
export type FailureMode = 'fail_fast' | 'best_effort' | 'retry';
export interface Result<T> {
    type: 'ok' | 'err';
    value?: T;
    error?: string;
}
export interface MockSinkOptions {
    kind?: string;
    supportedArtifacts?: ArtifactType[];
    atomicity?: AtomicityLevel;
    onExists?: ExistsBehavior;
    failureMode?: FailureMode;
    shouldFailValidate?: boolean;
    shouldFailWrite?: boolean;
    failOnArtifactType?: ArtifactType;
    writeDelay?: number;
}
export interface WrittenArtifact {
    artifact: unknown;
    type: ArtifactType;
    timestamp: number;
    path: string;
}
export declare class MockSinkAdapter {
    readonly kind: string;
    readonly version = "1.0.0-mock";
    readonly atomicity: AtomicityLevel;
    readonly onExists: ExistsBehavior;
    readonly failureMode: FailureMode;
    private _supportedArtifacts;
    private _shouldFailValidate;
    private _shouldFailWrite;
    private _failOnArtifactType?;
    private _writeDelay;
    private _closed;
    /** All artifacts written — inspect for assertions */
    readonly written: WrittenArtifact[];
    /** Track calls for assertion */
    readonly calls: {
        method: string;
        timestamp: number;
        args?: unknown[];
    }[];
    constructor(options?: MockSinkOptions);
    supportedArtifacts(): ArtifactType[];
    supportsArtifact(type: ArtifactType): boolean;
    validate(): Promise<Result<void>>;
    write(artifact: unknown, type: ArtifactType): Promise<Result<string>>;
    close(): Promise<void>;
    get isClosed(): boolean;
    get writeCount(): number;
    getWrittenByType(type: ArtifactType): WrittenArtifact[];
    assertWritten(type: ArtifactType, count?: number): void;
    reset(): void;
}
export declare function createMockSink(options?: MockSinkOptions): MockSinkAdapter;
//# sourceMappingURL=sink.d.ts.map