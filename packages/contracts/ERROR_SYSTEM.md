# Error System - PRD §14

## Overview

The error system provides **typed, structured error handling** with **mandatory remediation guidance** for every failure case. This implements PRD §14 requirements for clear, actionable error messages.

## Features

- **Typed Error Codes**: 12 standardized error codes covering all failure modes
- **Structured ErrorDetails**: Each error includes code, message, context, remediation, exit code, and recoverability flag
- **Remediation Database**: Every error code maps to specific "how to fix this" guidance
- **Exit Code Conventions**: Organized by error category (2xx=config, 3xx=source, 4xx=algo, 5xx=wasm, 6xx=sink, 7xx=otel)
- **Multiple Output Formats**: Human-readable with colors, plain text, and JSON for structured logging
- **Result Type Integration**: Discriminated union supporting both string errors and structured ErrorDetails
- **Validation System**: Ensures all errors are fully configured with no missing mappings

## Error Codes

### Configuration Errors (2xx)

| Code | Exit Code | Recoverable | Message |
|------|-----------|-------------|---------|
| `CONFIG_INVALID` | 200 | No | Invalid syntax in configuration file |
| `CONFIG_MISSING` | 201 | No | Configuration file not found |

**Example:**
```ts
const error = createError('CONFIG_MISSING', 'wasm4pm.toml not found in current directory');
// Remediation: "Configuration file not found. Create wasm4pm.toml..."
// Exit code: 201
```

### Source/Input Errors (3xx)

| Code | Exit Code | Recoverable | Message |
|------|-----------|-------------|---------|
| `SOURCE_NOT_FOUND` | 300 | No | Source file does not exist |
| `SOURCE_INVALID` | 301 | No | Source format not recognized |
| `SOURCE_PERMISSION` | 302 | No | No read permission on source |

**Example:**
```ts
const error = createError(
  'SOURCE_NOT_FOUND',
  'Input log file not found at /data/log.xes',
  { path: '/data/log.xes', searched: ['/data', '/var/data'] }
);
// Includes context for debugging
// Remediation: "Verify the source path exists and is readable..."
// Exit code: 300
```

### Algorithm Errors (4xx)

| Code | Exit Code | Recoverable | Message |
|------|-----------|-------------|---------|
| `ALGORITHM_FAILED` | 400 | Yes | Algorithm execution error |
| `ALGORITHM_NOT_FOUND` | 401 | No | Algorithm not available |

**Example:**
```ts
const error = createError(
  'ALGORITHM_FAILED',
  'Alpha+ algorithm diverged on complex loop',
  { algorithm: 'alpha_plus', iterations: 5000 }
);
// Recoverable - user can retry with different parameters
// Exit code: 400
```

### WASM Runtime Errors (5xx)

| Code | Exit Code | Recoverable | Message |
|------|-----------|-------------|---------|
| `WASM_INIT_FAILED` | 500 | No | WASM module failed to load |
| `WASM_MEMORY_EXCEEDED` | 501 | Yes | Exceeded WASM memory sandbox |

**Example:**
```ts
const error = createError(
  'WASM_MEMORY_EXCEEDED',
  'Process mining event log exceeds 256MB WASM memory',
  { used: 268435456, limit: 268435456 }
);
// Recoverable - process in smaller batches
// Exit code: 501
```

### Sink/Output Errors (6xx)

| Code | Exit Code | Recoverable | Message |
|------|-----------|-------------|---------|
| `SINK_FAILED` | 600 | No | Failed to write output |
| `SINK_PERMISSION` | 601 | No | No write permission to sink |

**Example:**
```ts
const error = createError(
  'SINK_FAILED',
  'Failed to write Petri net to S3 bucket',
  { bucket: 'results-prod', region: 'us-west-2' }
);
// Exit code: 600
```

### Observability Errors (7xx, non-fatal)

| Code | Exit Code | Recoverable | Message |
|------|-----------|-------------|---------|
| `OTEL_FAILED` | 700 | Yes | OpenTelemetry export failed |

**Example:**
```ts
const error = createError(
  'OTEL_FAILED',
  'OpenTelemetry collector unreachable at localhost:4317'
);
// Non-fatal - does NOT block algorithm execution
// Exit code: 700
```

## Usage

### Creating Errors

```ts
import { createError } from '@wasm4pm/contracts';

// Simple error
const error1 = createError('CONFIG_MISSING', 'Config file not found');

// Error with context
const error2 = createError(
  'SOURCE_NOT_FOUND',
  'Log file not found',
  { path: '/data/log.xes', size: null }
);

// Access properties
console.log(error1.code);        // 'CONFIG_MISSING'
console.log(error1.exit_code);   // 201
console.log(error1.recoverable); // false
console.log(error1.remediation); // "Configuration file not found..."
```

### Formatting Output

```ts
import { formatError, formatErrorJSON, logError } from '@wasm4pm/contracts';

const error = createError('SOURCE_INVALID', 'Invalid XES format');

// Human-readable with ANSI colors
console.error(formatError(error, true));
// ERROR [SOURCE_INVALID]: Invalid XES format
// Remediation: The source file format is not recognized...
// ✗ Fatal - manual intervention required

// Plain text (no colors)
const plainText = formatError(error, false);

// JSON for structured logging
const json = formatErrorJSON(error);
// { code, message, context, remediation, exit_code, recoverable }

// Convenience function with format selection
logError(error, 'human');  // Colored
logError(error, 'plain');  // No colors
logError(error, 'json');   // JSON output
```

### Result Type Integration

```ts
import { Result, error, Ok, Err, isError } from '@wasm4pm/contracts';
import { createError } from '@wasm4pm/contracts';

// Create error result
function loadConfig(): Result<Config> {
  const configError = createError('CONFIG_MISSING', 'wasm4pm.toml not found');
  return error(configError);
}

// Pattern matching
const result = loadConfig();
if (result.type === 'ok') {
  console.log('Config:', result.value);
} else if (result.type === 'error') {
  console.error('Error code:', result.error.code);
  console.error('Exit code:', result.error.exit_code);
  console.error('How to fix:', result.error.remediation);
} else if (result.type === 'err') {
  console.error('Legacy error:', result.error);
}

// Type guards
if (isError(result)) {
  process.exit(result.error.exit_code);
}
```

### Exit Code Usage

```ts
import { createError, logError } from '@wasm4pm/contracts';

function main() {
  try {
    const error = createError('SOURCE_NOT_FOUND', 'Input file missing');
    logError(error, 'human');
    process.exit(error.exit_code); // 300 in this case
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
```

## Error Properties

Each ErrorDetails object contains:

```ts
interface ErrorInfo {
  /** Standardized error code */
  code: ErrorCode;

  /** Human-readable error message */
  message: string;

  /** Additional context about the error (stack, values, paths) */
  context?: Record<string, any>;

  /** How to fix this error - always actionable */
  remediation: string;

  /** Process exit code per PRD §8 */
  exit_code: number;

  /** Whether the error allows retry/workaround */
  recoverable: boolean;
}
```

## Exit Code Ranges (PRD §8)

Errors are organized in ranges for easy identification:

- **0**: Success
- **200-299**: Configuration errors (invalid or missing config)
- **300-399**: Source/input errors (file not found, invalid format, permissions)
- **400-499**: Algorithm errors (computation failed, not found)
- **500-599**: WASM runtime errors (initialization, memory)
- **600-699**: Sink/output errors (write failed, permissions)
- **700-799**: Observability errors (OpenTelemetry, non-fatal)

## Validation

Ensure the error system is fully configured:

```ts
import { validateErrorSystem } from '@wasm4pm/contracts';

const issues = validateErrorSystem();
if (issues.length > 0) {
  console.error('Error system validation failed:');
  issues.forEach(issue => console.error('  -', issue));
  process.exit(1);
}
```

Validation checks:
- All error codes have remediation text
- All error codes have exit codes in defined ranges
- All error codes have recoverability flags
- No incomplete mappings

## Design Principles

### 1. Mandatory Remediation (PRD §14)
Every error **must** include a clear "how to fix this" message. Users should never see an error without knowing how to resolve it.

```ts
// ✓ Good
createError('CONFIG_MISSING', 'wasm4pm.toml not found');
// Includes: "Create wasm4pm.toml in your project root or run: pmctl init"

// ✗ Wrong - would need remediation
createError('UNKNOWN_ERROR', 'Something went wrong');
```

### 2. Contextual Information
Include relevant context to help users debug:

```ts
createError('SOURCE_NOT_FOUND', 'Log file not found', {
  searched_paths: ['/data', '/var/data', '/home'],
  looking_for: 'log.xes'
});
```

### 3. Recoverability Guidance
Flag whether users should retry or require manual intervention:

```ts
// Recoverable - user can retry with smaller dataset
const memory = createError('WASM_MEMORY_EXCEEDED', 'Out of memory');
memory.recoverable; // true

// Fatal - user must fix configuration
const missing = createError('CONFIG_MISSING', 'Config file not found');
missing.recoverable; // false
```

### 4. Consistent Exit Codes
Use standard exit codes for system integration:

```ts
// Scripts and CI/CD can check specific error categories
if (process.exitCode >= 300 && process.exitCode < 400) {
  // Source/input error - might be user data issue
}
if (process.exitCode >= 500 && process.exitCode < 600) {
  // Runtime error - might be resource issue
}
```

## Testing

The error system includes comprehensive tests:

```bash
npm test -- errors.test.ts    # Test error system
npm test -- result.test.ts    # Test Result type integration
```

Tests verify:
- All error codes exist and are properly configured
- Exit codes are in correct ranges
- Remediations are clear and actionable
- JSON serialization works
- Human output is readable (with/without colors)
- Type guards work correctly
- Validation system catches incomplete configurations

## Integration Guide

### In CLI Tools
```ts
import { createError, logError } from '@wasm4pm/contracts';

async function main() {
  try {
    const config = loadConfig();
  } catch (err) {
    const error = createError(
      'CONFIG_INVALID',
      `Invalid configuration: ${err.message}`,
      { details: err }
    );
    logError(error, process.env.LOG_FORMAT || 'human');
    process.exit(error.exit_code);
  }
}
```

### In API Responses
```ts
import { formatErrorJSON } from '@wasm4pm/contracts';

app.get('/mine', async (req, res) => {
  try {
    const result = await mineProcess(req.body);
    res.json({ ok: true, data: result });
  } catch (err) {
    const error = createError('ALGORITHM_FAILED', err.message);
    res.status(error.exit_code).json({
      ok: false,
      error: formatErrorJSON(error)
    });
  }
});
```

### In Logging Systems
```ts
import { formatErrorJSON, logError } from '@wasm4pm/contracts';

// Structured logging
logError(error, 'json'); // Outputs JSON to stderr

// Custom logging system
const errorJson = formatErrorJSON(error);
logger.error('Process mining failed', {
  code: errorJson.code,
  exit_code: errorJson.exit_code,
  context: errorJson.context,
  remediation: errorJson.remediation
});
```

## Files

- **src/errors.ts** - Error types, factory, formatting, validation
- **src/result.ts** - Result discriminated union with ErrorDetails support
- **src/__tests__/errors.test.ts** - Comprehensive error system tests
- **src/__tests__/result.test.ts** - Result type integration tests

## Related

- **PRD §8**: Exit code conventions
- **PRD §14**: Error system with remediation
- **Receipt System**: Records errors in execution receipts
- **Observability**: OTEL integration (non-fatal errors)
