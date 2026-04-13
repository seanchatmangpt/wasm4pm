/**
 * Exit codes for pictl CLI
 * Follows standard Unix/POSIX conventions
 */
export const EXIT_CODES = {
  /** Successful execution */
  success: 0,

  /** Configuration file error (missing, invalid, malformed) */
  config_error: 1,

  /** Source data error (invalid format, missing files, parsing error) */
  source_error: 2,

  /** Execution error (algorithm failure, timeout, resource exhaustion) */
  execution_error: 3,

  /** Partial failure (some operations succeeded, some failed) */
  partial_failure: 4,

  /** System error (I/O, permission, system resource issues) */
  system_error: 5,
} as const;

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
export function translateContractExitCode(contractExitCode: number): ExitCode {
  const category = Math.floor(contractExitCode / 100) * 100;

  switch (category) {
    case 200: // Configuration errors
    case 201:
      return EXIT_CODES.config_error;

    case 300: // Source/Input errors
    case 301:
    case 302:
      return EXIT_CODES.source_error;

    case 400: // Algorithm errors
    case 401:
    case 500: // WASM Runtime errors
    case 501:
      return EXIT_CODES.execution_error;

    case 600: // Sink/Output errors
    case 601:
      return EXIT_CODES.partial_failure;

    case 700: // Observability errors (non-fatal, but treat as system error)
      return EXIT_CODES.system_error;

    default:
      // Unknown error codes default to system error
      return EXIT_CODES.system_error;
  }
}
