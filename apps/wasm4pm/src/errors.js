import { EXIT_CODES } from './exit-codes.js';
/**
 * Base error class for wasm4pm with typed exit codes
 */
export class PictlError extends Error {
    constructor(message, exitCode) {
        super(message);
        this.name = 'PictlError';
        this.exitCode = exitCode;
    }
}
/** Configuration file missing, invalid, or malformed */
export class ConfigError extends PictlError {
    constructor(message) {
        super(message, EXIT_CODES.config_error);
        this.name = 'ConfigError';
    }
}
/** Source data invalid format, missing files, or parsing error */
export class SourceError extends PictlError {
    constructor(message) {
        super(message, EXIT_CODES.source_error);
        this.name = 'SourceError';
    }
}
/** Algorithm failure, timeout, or resource exhaustion */
export class ExecutionError extends PictlError {
    constructor(message) {
        super(message, EXIT_CODES.execution_error);
        this.name = 'ExecutionError';
    }
}
/** Some operations succeeded, some failed */
export class PartialFailureError extends PictlError {
    constructor(message, succeeded, failed) {
        super(message, EXIT_CODES.partial_failure);
        this.name = 'PartialFailureError';
        this.succeeded = succeeded;
        this.failed = failed;
    }
}
/** I/O, permission, or system resource issues */
export class SystemError extends PictlError {
    constructor(message) {
        super(message, EXIT_CODES.system_error);
        this.name = 'SystemError';
    }
}
/**
 * Handle a PictlError by exiting with its typed exit code.
 * For unknown errors, exits with system_error (5).
 */
export function handleError(error) {
    if (error instanceof PictlError) {
        console.error(`[${error.name}] ${error.message}`);
        process.exit(error.exitCode);
    }
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[SystemError] ${message}`);
    process.exit(EXIT_CODES.system_error);
}
//# sourceMappingURL=errors.js.map