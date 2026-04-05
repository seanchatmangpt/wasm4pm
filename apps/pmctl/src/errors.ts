import { EXIT_CODES, type ExitCode } from './exit-codes.js';

/**
 * Base error class for pmctl with typed exit codes
 */
export class PmctlError extends Error {
  readonly exitCode: ExitCode;

  constructor(message: string, exitCode: ExitCode) {
    super(message);
    this.name = 'PmctlError';
    this.exitCode = exitCode;
  }
}

/** Configuration file missing, invalid, or malformed */
export class ConfigError extends PmctlError {
  constructor(message: string) {
    super(message, EXIT_CODES.config_error);
    this.name = 'ConfigError';
  }
}

/** Source data invalid format, missing files, or parsing error */
export class SourceError extends PmctlError {
  constructor(message: string) {
    super(message, EXIT_CODES.source_error);
    this.name = 'SourceError';
  }
}

/** Algorithm failure, timeout, or resource exhaustion */
export class ExecutionError extends PmctlError {
  constructor(message: string) {
    super(message, EXIT_CODES.execution_error);
    this.name = 'ExecutionError';
  }
}

/** Some operations succeeded, some failed */
export class PartialFailureError extends PmctlError {
  readonly succeeded: string[];
  readonly failed: string[];

  constructor(message: string, succeeded: string[], failed: string[]) {
    super(message, EXIT_CODES.partial_failure);
    this.name = 'PartialFailureError';
    this.succeeded = succeeded;
    this.failed = failed;
  }
}

/** I/O, permission, or system resource issues */
export class SystemError extends PmctlError {
  constructor(message: string) {
    super(message, EXIT_CODES.system_error);
    this.name = 'SystemError';
  }
}

/**
 * Handle a PmctlError by exiting with its typed exit code.
 * For unknown errors, exits with system_error (5).
 */
export function handleError(error: unknown): never {
  if (error instanceof PmctlError) {
    console.error(`[${error.name}] ${error.message}`);
    process.exit(error.exitCode);
  }

  const message = error instanceof Error ? error.message : String(error);
  console.error(`[SystemError] ${message}`);
  process.exit(EXIT_CODES.system_error);
}
