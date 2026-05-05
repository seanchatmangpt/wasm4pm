import { EXIT_CODES, type ExitCode } from './exit-codes.js';

/**
 * Base error class for wasm4pm with typed exit codes
 */
export class Wasm4pmError extends Error {
  readonly exitCode: ExitCode;

  constructor(message: string, exitCode: ExitCode) {
    super(message);
    this.name = 'Wasm4pmError';
    this.exitCode = exitCode;
  }
}

/** Configuration file missing, invalid, or malformed */
export class ConfigError extends Wasm4pmError {
  constructor(message: string) {
    super(message, EXIT_CODES.config_error);
    this.name = 'ConfigError';
  }
}

/** Source data invalid format, missing files, or parsing error */
export class SourceError extends Wasm4pmError {
  constructor(message: string) {
    super(message, EXIT_CODES.source_error);
    this.name = 'SourceError';
  }
}

/** Algorithm failure, timeout, or resource exhaustion */
export class ExecutionError extends Wasm4pmError {
  constructor(message: string) {
    super(message, EXIT_CODES.execution_error);
    this.name = 'ExecutionError';
  }
}

/** Some operations succeeded, some failed */
export class PartialFailureError extends Wasm4pmError {
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
export class SystemError extends Wasm4pmError {
  constructor(message: string) {
    super(message, EXIT_CODES.system_error);
    this.name = 'SystemError';
  }
}

/**
 * Handle a Wasm4pmError by exiting with its typed exit code.
 * For unknown errors, exits with system_error (5).
 * Appends diagnoseError() suggestions when available.
 */
export function handleError(error: unknown): never {
  if (error instanceof Wasm4pmError) {
    console.error(`[${error.name}] ${error.message}`);
    printDiagnosticHint(error);
    process.exit(error.exitCode);
  }

  const message = error instanceof Error ? error.message : String(error);
  console.error(`[SystemError] ${message}`);
  printDiagnosticHint(error);
  process.exit(EXIT_CODES.system_error);
}

function printDiagnosticHint(error: unknown): void {
  try {
    // Dynamic import avoids adding @wasm4pm/kernel to the startup module graph,
    // preventing circular-dependency and load-order issues in test environments.
    import('@wasm4pm/kernel').then(({ introspection }) => {
      const diag = introspection.diagnoseError(error);
      if (diag.suggestions.length > 0) {
        console.error('\nSuggestions:');
        diag.suggestions.slice(0, 3).forEach((s, i) => console.error(`  ${i + 1}. ${s}`));
      }
    }).catch(() => {/* never block the exit path */});
  } catch {
    // never block the exit path
  }
}
