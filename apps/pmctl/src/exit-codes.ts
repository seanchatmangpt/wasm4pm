/**
 * Exit codes for pmctl CLI
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
