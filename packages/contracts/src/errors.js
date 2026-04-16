/**
 * Error System - PRD §14
 * Schema version 1.0
 *
 * Provides typed, structured error handling with remediation guidance.
 * TypedError uses numeric codes 0-255 for compact serialization.
 * ErrorCode string aliases remain for human-readable usage.
 */
/**
 * Numeric code mapping (0-255 range) for TypedError
 */
export const TYPED_ERROR_CODES = {
    CONFIG_INVALID: 10,
    CONFIG_MISSING: 11,
    SOURCE_NOT_FOUND: 20,
    SOURCE_INVALID: 21,
    SOURCE_PERMISSION: 22,
    ALGORITHM_FAILED: 30,
    ALGORITHM_NOT_FOUND: 31,
    CONFORMANCE_FAILED: 32,
    SIMULATION_FAILED: 33,
    PREDICTION_FAILED: 34,
    VALIDATION_FAILED: 35,
    IMPORT_FAILED: 36,
    WASM_INIT_FAILED: 40,
    WASM_MEMORY_EXCEEDED: 41,
    SINK_FAILED: 50,
    SINK_PERMISSION: 51,
    OTEL_FAILED: 60,
};
/**
 * Reverse mapping: numeric code → ErrorCode string
 */
export const TYPED_ERROR_NAMES = Object.fromEntries(Object.entries(TYPED_ERROR_CODES).map(([k, v]) => [v, k]));
/**
 * Create a TypedError from an ErrorCode string
 */
export function createTypedError(code, message, context = {}) {
    return {
        schema_version: '1.0',
        code: TYPED_ERROR_CODES[code],
        message,
        remediation: REMEDIATIONS[code],
        context,
    };
}
/**
 * Resolve a TypedError's numeric code back to its ErrorCode string
 */
export function resolveErrorCode(typedError) {
    return TYPED_ERROR_NAMES[typedError.code];
}
/**
 * Type guard for TypedError
 */
export function isTypedError(value) {
    if (!value || typeof value !== 'object')
        return false;
    const e = value;
    return (e.schema_version === '1.0' &&
        typeof e.code === 'number' &&
        e.code >= 0 &&
        e.code <= 255 &&
        typeof e.message === 'string' &&
        typeof e.remediation === 'string' &&
        typeof e.context === 'object' &&
        e.context !== null);
}
/**
 * JSON Schema for TypedError (for external validation)
 */
export const TYPED_ERROR_JSON_SCHEMA = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://wasm4pm.dev/schemas/typed-error/1.0',
    title: 'TypedError',
    description: 'Compact typed error with numeric code (0-255)',
    type: 'object',
    required: ['schema_version', 'code', 'message', 'remediation', 'context'],
    properties: {
        schema_version: { type: 'string', const: '1.0' },
        code: { type: 'integer', minimum: 0, maximum: 255 },
        message: { type: 'string' },
        remediation: { type: 'string' },
        context: { type: 'object' },
    },
    additionalProperties: false,
};
/**
 * Remediation guidance database
 * Maps error codes to actionable fix instructions
 */
const REMEDIATIONS = {
    // Configuration errors
    CONFIG_INVALID: 'Check your pictl.toml syntax. Run: pictl init to generate a valid config.',
    CONFIG_MISSING: 'Configuration file not found. Create pictl.toml in your project root or run: pictl init',
    // Source errors
    SOURCE_NOT_FOUND: 'Verify the source path exists and is readable. Check the path in your config or command-line arguments.',
    SOURCE_INVALID: 'The source file format is not recognized. Ensure it is a valid XES, CSV, or JSON event log.',
    SOURCE_PERMISSION: 'Permission denied reading the source file. Check file permissions: chmod 644 <file>',
    // Algorithm errors
    ALGORITHM_FAILED: 'The algorithm encountered an error during execution. Check the detailed error message and try with different parameters or a smaller dataset.',
    ALGORITHM_NOT_FOUND: 'The requested algorithm is not available. Run: pictl list-algorithms to see available options.',
    CONFORMANCE_FAILED: 'Conformance checking failed. Verify the process model matches the event log structure. Check activity names and case IDs match.',
    SIMULATION_FAILED: 'Process simulation failed. Verify the model is valid and simulation parameters are within acceptable ranges.',
    PREDICTION_FAILED: 'Predictive analysis failed. Ensure sufficient training data and valid feature configuration.',
    VALIDATION_FAILED: 'Model validation failed. Check that the model structure is valid and required attributes are present.',
    IMPORT_FAILED: 'Model import failed. Verify the import file is valid and the format is supported (PNML, BPMN).',
    // WASM runtime errors
    WASM_INIT_FAILED: 'Failed to initialize the WASM module. Ensure Node.js/browser is compatible (Node 16+, modern browser). Try reinstalling the package: npm install @pictl/engine',
    WASM_MEMORY_EXCEEDED: 'Insufficient memory in WASM sandbox. Try processing your data in smaller batches or check available memory limits.',
    // Sink errors
    SINK_FAILED: 'Failed to write output to sink. Check the sink configuration and ensure the destination exists and is writable.',
    SINK_PERMISSION: 'Permission denied writing to the sink destination. Check directory permissions: chmod 755 <dir>',
    // Observability errors (non-fatal)
    OTEL_FAILED: 'OpenTelemetry export failed (non-fatal). Verify your OTEL collector is running and accessible. This does not affect algorithm execution.',
};
/**
 * Exit code mapping (PRD §8)
 * Convention: success=0, config=2xx, input=3xx, algorithm=4xx, runtime=5xx, sink=6xx, otel=7xx
 */
const EXIT_CODES = {
    // Configuration errors (200-299)
    CONFIG_INVALID: 200,
    CONFIG_MISSING: 201,
    // Source/Input errors (300-399)
    SOURCE_NOT_FOUND: 300,
    SOURCE_INVALID: 301,
    SOURCE_PERMISSION: 302,
    // Algorithm errors (400-499)
    ALGORITHM_FAILED: 400,
    ALGORITHM_NOT_FOUND: 401,
    CONFORMANCE_FAILED: 450,
    SIMULATION_FAILED: 455,
    PREDICTION_FAILED: 460,
    VALIDATION_FAILED: 465,
    IMPORT_FAILED: 470,
    // WASM Runtime errors (500-599)
    WASM_INIT_FAILED: 500,
    WASM_MEMORY_EXCEEDED: 501,
    // Sink/Output errors (600-699)
    SINK_FAILED: 600,
    SINK_PERMISSION: 601,
    // Observability errors (700-799, non-fatal)
    OTEL_FAILED: 700,
};
/**
 * Recoverability mapping
 * Non-fatal errors allow retry or workaround; fatal errors require intervention
 */
const RECOVERABLE = {
    // Configuration - not recoverable without user fix
    CONFIG_INVALID: false,
    CONFIG_MISSING: false,
    // Source - not recoverable without fixing source
    SOURCE_NOT_FOUND: false,
    SOURCE_INVALID: false,
    SOURCE_PERMISSION: false,
    // Algorithm - potentially recoverable with retry or parameter adjustment
    ALGORITHM_FAILED: true,
    ALGORITHM_NOT_FOUND: false,
    CONFORMANCE_FAILED: true,
    SIMULATION_FAILED: true,
    PREDICTION_FAILED: true,
    VALIDATION_FAILED: false,
    IMPORT_FAILED: false,
    // WASM - potentially recoverable by retrying or chunking
    WASM_INIT_FAILED: false,
    WASM_MEMORY_EXCEEDED: true,
    // Sink - not recoverable without fixing destination
    SINK_FAILED: false,
    SINK_PERMISSION: false,
    // Observability - always recoverable, non-fatal
    OTEL_FAILED: true,
};
/**
 * Factory function to create structured errors
 * Ensures all errors have required fields and follow consistent format
 *
 * @param code - Standardized error code
 * @param message - Human-readable error message
 * @param context - Optional additional context (stack trace, values, etc.)
 * @returns Fully structured ErrorInfo object
 *
 * @example
 * ```ts
 * const error = createError('CONFIG_MISSING', 'pictl.toml not found in /path/to/project');
 * console.error(formatError(error)); // Human-readable output
 * process.exit(error.exit_code);    // Proper exit code
 * ```
 */
export function createError(code, message, context) {
    return {
        code,
        message,
        context,
        remediation: REMEDIATIONS[code],
        exit_code: EXIT_CODES[code],
        recoverable: RECOVERABLE[code],
    };
}
/**
 * Error formatting utilities
 */
/**
 * ANSI color codes for terminal output
 */
const ANSI = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[36m',
    dim: '\x1b[2m',
    bold: '\x1b[1m',
};
/**
 * Format error for human-readable console output with colors
 * Includes error code, message, context (if present), and remediation
 *
 * @param error - ErrorInfo object to format
 * @param colorize - Whether to include ANSI color codes (disable for JSON/log files)
 * @returns Formatted string suitable for console.error()
 *
 * @example
 * ```ts
 * const error = createError('SOURCE_NOT_FOUND', 'Input file missing');
 * console.error(formatError(error));
 * // Output:
 * // ERROR [SOURCE_NOT_FOUND]: Input file missing
 * // Remediation: Verify the source path exists and is readable...
 * ```
 */
export function formatError(error, colorize = true) {
    const lines = [];
    // Error header
    const header = colorize
        ? `${ANSI.bold}${ANSI.red}ERROR${ANSI.reset} [${error.code}]: ${error.message}`
        : `ERROR [${error.code}]: ${error.message}`;
    lines.push(header);
    // Context (if present)
    if (error.context && Object.keys(error.context).length > 0) {
        lines.push('');
        lines.push(colorize ? `${ANSI.dim}Context:${ANSI.reset}` : 'Context:');
        for (const [key, value] of Object.entries(error.context)) {
            const formatted = typeof value === 'string' ? value : JSON.stringify(value);
            lines.push(colorize ? `  ${ANSI.dim}${key}: ${formatted}${ANSI.reset}` : `  ${key}: ${formatted}`);
        }
    }
    // Remediation
    lines.push('');
    const remediationLabel = colorize ? `${ANSI.blue}Remediation:${ANSI.reset}` : 'Remediation:';
    lines.push(remediationLabel);
    lines.push(`  ${error.remediation}`);
    // Recovery info
    lines.push('');
    const recoveryStatus = error.recoverable
        ? colorize
            ? `${ANSI.yellow}⚠ Recoverable${ANSI.reset} - retry or adjust parameters`
            : '⚠ Recoverable - retry or adjust parameters'
        : colorize
            ? `${ANSI.red}✗ Fatal${ANSI.reset} - manual intervention required`
            : '✗ Fatal - manual intervention required';
    lines.push(recoveryStatus);
    return lines.join('\n');
}
/**
 * Format error for JSON output
 * Includes all ErrorInfo fields plus formatting details
 *
 * @param error - ErrorInfo object to format
 * @returns JSON-serializable object
 *
 * @example
 * ```ts
 * const error = createError('WASM_MEMORY_EXCEEDED', 'Out of memory');
 * console.log(JSON.stringify(formatErrorJSON(error), null, 2));
 * // {
 * //   "code": "WASM_MEMORY_EXCEEDED",
 * //   "message": "Out of memory",
 * //   "remediation": "...",
 * //   "exit_code": 501,
 * //   "recoverable": true
 * // }
 * ```
 */
export function formatErrorJSON(error) {
    return {
        code: error.code,
        message: error.message,
        context: error.context || {},
        remediation: error.remediation,
        exit_code: error.exit_code,
        recoverable: error.recoverable,
    };
}
/**
 * Log error with appropriate level based on severity
 * Handles both console and structured logging (JSON for observability)
 *
 * @param error - ErrorInfo to log
 * @param format - Output format: 'human' (colored), 'plain' (no colors), or 'json'
 *
 * @example
 * ```ts
 * const error = createError('CONFIG_INVALID', 'Invalid syntax in pictl.toml');
 * logError(error, 'human');    // Colored terminal output
 * logError(error, 'json');     // JSON for structured logging
 * ```
 */
export function logError(error, format = 'human') {
    if (format === 'json') {
        console.error(JSON.stringify(formatErrorJSON(error)));
    }
    else if (format === 'human') {
        console.error(formatError(error, true));
    }
    else {
        console.error(formatError(error, false));
    }
}
/**
 * Validate that all error codes have remediation and exit code mappings
 * Use this in tests to ensure completeness
 *
 * @returns Array of validation errors (empty if valid)
 *
 * @example
 * ```ts
 * const issues = validateErrorSystem();
 * if (issues.length > 0) {
 *   console.error('Error system validation failed:', issues);
 * }
 * ```
 */
export function validateErrorSystem() {
    const issues = [];
    const codes = Object.keys(REMEDIATIONS);
    // Check all codes in REMEDIATIONS have exit codes
    for (const code of codes) {
        if (!(code in EXIT_CODES)) {
            issues.push(`Code "${code}" in REMEDIATIONS but missing from EXIT_CODES`);
        }
        if (!(code in RECOVERABLE)) {
            issues.push(`Code "${code}" in REMEDIATIONS but missing from RECOVERABLE`);
        }
    }
    // Check all codes in EXIT_CODES have remediation
    for (const code of Object.keys(EXIT_CODES)) {
        if (!(code in REMEDIATIONS)) {
            issues.push(`Code "${code}" in EXIT_CODES but missing from REMEDIATIONS`);
        }
    }
    // Check all codes in RECOVERABLE have remediation
    for (const code of Object.keys(RECOVERABLE)) {
        if (!(code in REMEDIATIONS)) {
            issues.push(`Code "${code}" in RECOVERABLE but missing from REMEDIATIONS`);
        }
    }
    // Validate exit codes are in correct ranges
    const exitCodeRanges = {
        200: 'CONFIG',
        300: 'SOURCE',
        400: 'ALGORITHM',
        500: 'WASM',
        600: 'SINK',
        700: 'OTEL',
    };
    for (const [code, exitCode] of Object.entries(EXIT_CODES)) {
        const category = Math.floor(exitCode / 100) * 100;
        if (!exitCodeRanges[category]) {
            issues.push(`Code "${code}" has invalid exit code ${exitCode} (not in defined ranges)`);
        }
    }
    return issues;
}
//# sourceMappingURL=errors.js.map