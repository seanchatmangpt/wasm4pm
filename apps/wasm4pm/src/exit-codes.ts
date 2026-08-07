import type { ErrorCodeMap } from '@wasm4pm/noun-verb';

/**
 * Exit codes for wasm4pm (wpm) CLI
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

  /** Conformance failure (fitness below threshold) */
  conformance_fail: 6,
} as const;

export type ExitCode = (typeof EXIT_CODES)[keyof typeof EXIT_CODES];

/**
 * wpm's authoritative mapping from the noun-verb framework's `ErrorCode`
 * vocabulary onto wpm's own 0-6 exit-code contract. This is the single
 * source of truth: it is passed to the CLI as `errorCodeMap` (see `cli.ts`)
 * AND surfaced by `wpm help exit-codes`, so the documented map and the
 * runtime behavior can never drift.
 */
export const ERROR_CODE_MAP: ErrorCodeMap = {
  INVALID_INPUT: EXIT_CODES.source_error,
  COMMAND_NOT_FOUND: EXIT_CODES.config_error,
  VERB_NOT_FOUND: EXIT_CODES.config_error,
  PERMISSION_DENIED: EXIT_CODES.system_error,
  INVARIANT_BREACH: EXIT_CODES.execution_error,
  DEADLINE_EXCEEDED: EXIT_CODES.execution_error,
  GUARD_EXCEEDED: EXIT_CODES.execution_error,
  EXECUTION_ERROR: EXIT_CODES.execution_error,
  INTERNAL_ERROR: EXIT_CODES.system_error,
};

/**
 * Translate contract error codes (200-700) to CLI exit codes (0-6).
 *
 * Contract error code ranges:
 * - 200-299: Configuration errors → CLI exit code 1 (config_error)
 * - 300-399: Source/Input errors → CLI exit code 2 (source_error)
 * - 400-499: Algorithm errors → CLI exit code 3 (execution_error)
 * - 500-599: WASM Runtime errors → CLI exit code 3 (execution_error)
 * - 600-699: Sink/Output errors → CLI exit code 4 (partial_failure)
 * - 700-799: Observability errors → CLI exit code 5 (system_error)
 *
 * Direct exit codes (not translated):
 * - 6: conformance_fail (log-to-model fitness below threshold; 'conformance' command only)
 *
 * @param contractExitCode - Exit code from contracts package (200-799)
 * @returns Corresponding CLI exit code (0-5), or 5 for unknown codes
 */
export function translateContractExitCode(contractExitCode: number): ExitCode {
  // category is always a multiple of 100 (e.g. 250 → 200, 450 → 400)
  const category = Math.floor(contractExitCode / 100) * 100;

  switch (category) {
    case 200: // Configuration errors (200-299)
      return EXIT_CODES.config_error;

    case 300: // Source/Input errors (300-399)
      return EXIT_CODES.source_error;

    case 400: // Algorithm errors (400-499)
    case 500: // WASM Runtime errors (500-599)
      return EXIT_CODES.execution_error;

    case 600: // Sink/Output errors (600-699)
      return EXIT_CODES.partial_failure;

    case 700: // Observability errors (700-799, non-fatal)
      return EXIT_CODES.system_error;

    default:
      // Unknown or out-of-range codes default to system error
      return EXIT_CODES.system_error;
  }
}
