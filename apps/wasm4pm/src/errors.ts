import { EXIT_CODES, type ExitCode } from './exit-codes.js';
import { getRecoveryHint, type RecoveryHint } from './error-recovery.js';

export type { RecoveryHint } from './error-recovery.js';

/**
 * Base error class for wasm4pm with typed exit codes and recovery hints
 */
export class Wasm4pmError extends Error {
  readonly exitCode: ExitCode;
  readonly recovery?: RecoveryHint;

  constructor(message: string, exitCode: ExitCode, recovery?: RecoveryHint) {
    super(message);
    this.name = 'Wasm4pmError';
    this.exitCode = exitCode;
    this.recovery = recovery;
  }
}

/** Configuration file missing, invalid, or malformed */
export class ConfigError extends Wasm4pmError {
  constructor(message: string, recovery?: RecoveryHint) {
    const hint = recovery || getRecoveryHint(message, 'config', '');
    super(message, EXIT_CODES.config_error, hint);
    this.name = 'ConfigError';
  }
}

/** Source data invalid format, missing files, or parsing error */
export class SourceError extends Wasm4pmError {
  constructor(message: string, recovery?: RecoveryHint) {
    const hint = recovery || getRecoveryHint(message, 'source', '');
    super(message, EXIT_CODES.source_error, hint);
    this.name = 'SourceError';
  }
}

/** Algorithm failure, timeout, or resource exhaustion */
export class ExecutionError extends Wasm4pmError {
  constructor(message: string, recovery?: RecoveryHint) {
    const hint = recovery || getRecoveryHint(message, 'execution', '');
    super(message, EXIT_CODES.execution_error, hint);
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
  constructor(message: string, recovery?: RecoveryHint) {
    const hint = recovery || getRecoveryHint(message, 'system', '');
    super(message, EXIT_CODES.system_error, hint);
    this.name = 'SystemError';
  }
}

/**
 * Handle a Wasm4pmError by exiting with its typed exit code.
 * ValidationError from wasm4pm exits with execution_error (3).
 * For unknown errors, exits with system_error (5).
 * Prints recovery hints and diagnostic suggestions when available.
 */
export function handleError(error: unknown): never {
  if (error instanceof Wasm4pmError) {
    console.error(`[${error.name}] ${error.message}`);
    if (error.recovery) {
      printRecoveryHint(error.recovery);
    }
    printDiagnosticHint(error);
    process.exit(error.exitCode);
  }

  // ValidationError from wasm4pm — model failed structural checks
  if (isValidationError(error)) {
    console.error(`[ValidationError] ${(error as Error).message}`);
    const violations = (error as { violations?: Array<{ rule: string; severity: string; message: string }> }).violations ?? [];
    const errors = violations.filter((v) => v.severity === 'error');
    if (errors.length > 0) {
      console.error('\nViolations:');
      errors.forEach((v, i) => console.error(`  ${i + 1}. [${v.rule}] ${v.message}`));
    }
    process.exit(EXIT_CODES.execution_error);
  }

  const message = error instanceof Error ? error.message : String(error);
  console.error(`[SystemError] ${message}`);
  printDiagnosticHint(error);
  process.exit(EXIT_CODES.system_error);
}

function isValidationError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.name === 'ValidationError' &&
    'violations' in error
  );
}

function printRecoveryHint(recovery: RecoveryHint): void {
  console.error('\nRecovery:');
  console.error(`  ${recovery.suggestion}`);

  if (recovery.command) {
    console.error(`\nTry:`);
    console.error(`  ${recovery.command}`);
  }

  if (recovery.alternatives && recovery.alternatives.length > 0) {
    console.error('\nAlternatives:');
    recovery.alternatives.slice(0, 3).forEach((alt) => {
      console.error(`  • ${alt}`);
    });
  }

  if (recovery.envVar) {
    console.error(`\nEnv: ${recovery.envVar}`);
  }
}

function printDiagnosticHint(error: unknown): void {
  try {
    // Dynamic import avoids adding wasm4pm to the startup module graph,
    // preventing circular-dependency and load-order issues in test environments.
    import('wasm4pm').then(({ introspection }) => {
      const diag = introspection.diagnoseError(error);
      if (diag.suggestions.length > 0) {
        console.error('\nDiagnostics:');
        diag.suggestions.slice(0, 3).forEach((s, i) => console.error(`  ${i + 1}. ${s}`));
      }
    }).catch(() => {/* never block the exit path */});
  } catch {
    // never block the exit path
  }
}
