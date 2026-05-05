import { type ExitCode } from './exit-codes.js';
/**
 * Base error class for pictl with typed exit codes
 */
export declare class PictlError extends Error {
    readonly exitCode: ExitCode;
    constructor(message: string, exitCode: ExitCode);
}
/** Configuration file missing, invalid, or malformed */
export declare class ConfigError extends PictlError {
    constructor(message: string);
}
/** Source data invalid format, missing files, or parsing error */
export declare class SourceError extends PictlError {
    constructor(message: string);
}
/** Algorithm failure, timeout, or resource exhaustion */
export declare class ExecutionError extends PictlError {
    constructor(message: string);
}
/** Some operations succeeded, some failed */
export declare class PartialFailureError extends PictlError {
    readonly succeeded: string[];
    readonly failed: string[];
    constructor(message: string, succeeded: string[], failed: string[]);
}
/** I/O, permission, or system resource issues */
export declare class SystemError extends PictlError {
    constructor(message: string);
}
/**
 * Handle a PictlError by exiting with its typed exit code.
 * For unknown errors, exits with system_error (5).
 */
export declare function handleError(error: unknown): never;
//# sourceMappingURL=errors.d.ts.map