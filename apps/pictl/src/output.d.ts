/**
 * Output formatter for human-readable and JSON modes
 */
export interface OutputOptions {
    format?: 'human' | 'json';
    verbose?: boolean;
    quiet?: boolean;
}
/**
 * Human-readable formatter using consola
 */
export declare class HumanFormatter {
    private verbose;
    private quiet;
    constructor(options?: OutputOptions);
    success(message: string): void;
    info(message: string): void;
    warn(message: string): void;
    error(message: string): void;
    debug(message: string): void;
    box(message: string): void;
    log(message: string, data?: Record<string, unknown>): void;
}
/**
 * JSON formatter for machine-readable output
 */
export declare class JSONFormatter {
    private quiet;
    constructor(options?: OutputOptions);
    output(data: Record<string, unknown>): void;
    success(message: string, data?: unknown): void;
    error(message: string, error?: unknown): void;
    warn(message: string, data?: unknown): void;
}
/**
 * Streaming output handler for watch mode
 */
export declare class StreamingOutput {
    private format;
    private humanFormatter;
    private jsonFormatter;
    constructor(options?: OutputOptions);
    startStream(): void;
    emitEvent(eventType: string, data: Record<string, unknown>): void;
    endStream(): void;
}
/**
 * Get formatter instance based on format option
 */
export declare function getFormatter(options?: OutputOptions): HumanFormatter | JSONFormatter;
//# sourceMappingURL=output.d.ts.map