/**
 * Exit codes for pictl CLI
 * Follows standard Unix/POSIX conventions
 */
export declare const EXIT_CODES: {
    /** Successful execution */
    readonly success: 0;
    /** Configuration file error (missing, invalid, malformed) */
    readonly config_error: 1;
    /** Source data error (invalid format, missing files, parsing error) */
    readonly source_error: 2;
    /** Execution error (algorithm failure, timeout, resource exhaustion) */
    readonly execution_error: 3;
    /** Partial failure (some operations succeeded, some failed) */
    readonly partial_failure: 4;
    /** System error (I/O, permission, system resource issues) */
    readonly system_error: 5;
};
export type ExitCode = (typeof EXIT_CODES)[keyof typeof EXIT_CODES];
/**
 * Translate contract error codes (200-700) to CLI exit codes (0-5).
 *
 * Contract error code ranges:
 * - 200-299: Configuration errors → CLI exit code 1 (config_error)
 * - 300-399: Source/Input errors → CLI exit code 2 (source_error)
 * - 400-499: Algorithm errors → CLI exit code 3 (execution_error)
 * - 500-599: WASM Runtime errors → CLI exit code 3 (execution_error)
 * - 600-699: Sink/Output errors → CLI exit code 4 (partial_failure)
 * - 700-799: Observability errors → CLI exit code 5 (system_error)
 *
 * @param contractExitCode - Exit code from contracts package (200-799)
 * @returns Corresponding CLI exit code (0-5), or 5 for unknown codes
 */
export declare function translateContractExitCode(contractExitCode: number): ExitCode;
//# sourceMappingURL=exit-codes.d.ts.map