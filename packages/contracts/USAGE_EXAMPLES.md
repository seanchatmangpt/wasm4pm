# Error System Usage Examples

## Quick Start

### Creating and Logging Errors

```ts
import { createError, logError } from '@wasm4pm/contracts';

// Create an error
const error = createError(
  'CONFIG_MISSING',
  'wasm4pm.toml not found in current directory'
);

// Log it with human-readable format (colored)
logError(error, 'human');
// Output:
// ERROR [CONFIG_MISSING]: wasm4pm.toml not found in current directory
// Remediation: Configuration file not found. Create wasm4pm.toml...
// ✗ Fatal - manual intervention required

// Log it as JSON
logError(error, 'json');
// Output:
// {"code":"CONFIG_MISSING","message":"...","remediation":"...","exit_code":201,"recoverable":false}

// Exit with the proper code
process.exit(error.exit_code); // 201
```

## CLI Tool Integration

### Handling Config Errors

```ts
import { createError, logError } from '@wasm4pm/contracts';
import { readFileSync } from 'fs';

async function loadConfig() {
  try {
    const path = 'wasm4pm.toml';
    const content = readFileSync(path, 'utf-8');
    return parseConfig(content);
  } catch (err) {
    // File doesn't exist
    if (err.code === 'ENOENT') {
      const error = createError(
        'CONFIG_MISSING',
        `Config file not found at ${process.cwd()}/wasm4pm.toml`
      );
      logError(error, 'human');
      process.exit(error.exit_code);
    }
    
    // File exists but invalid syntax
    const error = createError(
      'CONFIG_INVALID',
      `Invalid TOML syntax: ${err.message}`,
      { file: 'wasm4pm.toml', line: err.line }
    );
    logError(error, 'human');
    process.exit(error.exit_code);
  }
}
```

### Handling Source/Input Errors

```ts
import { createError, logError } from '@wasm4pm/contracts';
import { statSync } from 'fs';

function validateSourceFile(path: string) {
  try {
    const stats = statSync(path);
  } catch (err) {
    if (err.code === 'ENOENT') {
      // File doesn't exist
      const error = createError(
        'SOURCE_NOT_FOUND',
        `Input file not found: ${path}`,
        {
          searched: [path],
          current_dir: process.cwd(),
          tips: 'Try using an absolute path or check the file name'
        }
      );
      logError(error, 'human');
      return error;
    }
    
    if (err.code === 'EACCES') {
      // Permission denied
      const error = createError(
        'SOURCE_PERMISSION',
        `Permission denied reading file: ${path}`,
        { path, user: process.env.USER }
      );
      logError(error, 'human');
      return error;
    }
  }
  
  return null; // Valid
}

// Usage
const configError = validateSourceFile('/data/log.xes');
if (configError) {
  process.exit(configError.exit_code);
}
```

### Handling Algorithm Errors

```ts
import { createError, logError } from '@wasm4pm/contracts';
import { discoverProcess } from '@wasm4pm/engine';

async function mineProcessModel(logPath: string, algorithm: string) {
  try {
    const result = await discoverProcess(logPath, { algorithm });
    return result;
  } catch (err) {
    if (err.message.includes('not found')) {
      // Algorithm doesn't exist
      const error = createError(
        'ALGORITHM_NOT_FOUND',
        `Algorithm '${algorithm}' not available`,
        {
          requested: algorithm,
          available: ['dfg', 'alpha', 'heuristic', 'inductive']
        }
      );
      logError(error, 'human');
      return error;
    }
    
    if (err.message.includes('diverged') || err.message.includes('loop')) {
      // Algorithm failed to converge
      const error = createError(
        'ALGORITHM_FAILED',
        `Algorithm '${algorithm}' failed to converge`,
        {
          algorithm,
          error: err.message,
          suggestion: 'Try with a smaller dataset or adjust parameters'
        }
      );
      logError(error, 'human');
      return error;
    }
  }
}
```

## Using the Result Type

### Function Returning Results

```ts
import { Result, Ok, Err, error, isError } from '@wasm4pm/contracts';
import { createError } from '@wasm4pm/contracts';

function loadEventLog(path: string): Result<EventLog> {
  // Check if file exists
  if (!fs.existsSync(path)) {
    return error(
      createError(
        'SOURCE_NOT_FOUND',
        `Event log not found at ${path}`
      )
    );
  }
  
  // Check if readable
  try {
    fs.accessSync(path, fs.constants.R_OK);
  } catch {
    return error(
      createError(
        'SOURCE_PERMISSION',
        `Cannot read event log at ${path}`
      )
    );
  }
  
  // Parse file
  try {
    const content = fs.readFileSync(path, 'utf-8');
    const log = parseXES(content);
    return Ok(log);
  } catch (err) {
    return error(
      createError(
        'SOURCE_INVALID',
        `Invalid event log format: ${err.message}`,
        { path, error: err.message }
      )
    );
  }
}

// Usage with pattern matching
const result = loadEventLog('/data/log.xes');

if (result.type === 'ok') {
  console.log('Loaded', result.value.traces.length, 'traces');
} else if (result.type === 'error') {
  console.error(`Error [${result.error.code}]: ${result.error.message}`);
  console.error('How to fix:', result.error.remediation);
  process.exit(result.error.exit_code);
}
```

### Chaining Operations

```ts
import { Result, Ok, map, andThen } from '@wasm4pm/contracts';

function processLog(logPath: string): Result<ProcessModel> {
  return loadEventLog(logPath)
    .pipe(map, (log) => filterByDateRange(log, '2024-01'))
    .pipe(map, (log) => removeDuplicateTraces(log))
    .pipe(andThen, (log) => discoverAlphaModel(log));
}

// Usage
const result = processLog('/data/log.xes');
if (!result.ok) {
  logError(result.error, 'human');
  process.exit(result.error.exit_code);
}
```

### Error Context Extraction

```ts
import { getExitCode, isError } from '@wasm4pm/contracts';

function handleResult<T>(result: Result<T>) {
  if (isError(result)) {
    const exitCode = getExitCode(result);
    console.error(`Failed with exit code: ${exitCode}`);
    
    // Different handling for different error categories
    if (exitCode >= 300 && exitCode < 400) {
      console.error('This is a data/input error - check your input files');
    } else if (exitCode >= 500 && exitCode < 600) {
      console.error('This is a runtime error - check system resources');
    }
  }
}
```

## API Integration

### Express.js Error Handler

```ts
import { createError, formatErrorJSON } from '@wasm4pm/contracts';
import express from 'express';

const app = express();

app.post('/mine', async (req, res) => {
  try {
    const model = await discoverModel(req.body.log);
    res.json({ ok: true, model });
  } catch (err) {
    // Map error to appropriate code
    let errorCode: ErrorCode = 'ALGORITHM_FAILED';
    if (err.message.includes('not found')) {
      errorCode = 'SOURCE_NOT_FOUND';
    } else if (err.message.includes('memory')) {
      errorCode = 'WASM_MEMORY_EXCEEDED';
    }
    
    const error = createError(errorCode, err.message);
    res.status(error.exit_code).json({
      ok: false,
      error: formatErrorJSON(error)
    });
  }
});

// Global error handler
app.use((err: any, req: any, res: any, next: any) => {
  const error = createError(
    'ALGORITHM_FAILED',
    err.message,
    { stack: err.stack }
  );
  res.status(error.exit_code).json({
    ok: false,
    error: formatErrorJSON(error)
  });
});
```

### gRPC Error Mapping

```ts
import { createError, ErrorInfo } from '@wasm4pm/contracts';
import { status } from '@grpc/grpc-js';

function mapToGrpcStatus(errorInfo: ErrorInfo): [status, string] {
  // Map exit codes to gRPC status codes
  const exitCode = errorInfo.exit_code;
  
  if (exitCode >= 200 && exitCode < 300) {
    // Config error -> INVALID_ARGUMENT
    return [status.INVALID_ARGUMENT, errorInfo.message];
  } else if (exitCode >= 300 && exitCode < 400) {
    // Source error -> NOT_FOUND or PERMISSION_DENIED
    return exitCode === 302
      ? [status.PERMISSION_DENIED, errorInfo.message]
      : [status.NOT_FOUND, errorInfo.message];
  } else if (exitCode >= 400 && exitCode < 500) {
    // Algorithm error -> INTERNAL or UNAVAILABLE
    return [status.INTERNAL, errorInfo.message];
  } else if (exitCode >= 500 && exitCode < 600) {
    // WASM error -> RESOURCE_EXHAUSTED or INTERNAL
    return exitCode === 501
      ? [status.RESOURCE_EXHAUSTED, errorInfo.message]
      : [status.INTERNAL, errorInfo.message];
  } else if (exitCode >= 600 && exitCode < 700) {
    // Sink error -> PERMISSION_DENIED or INTERNAL
    return exitCode === 601
      ? [status.PERMISSION_DENIED, errorInfo.message]
      : [status.INTERNAL, errorInfo.message];
  } else {
    // OTEL or unknown -> INTERNAL
    return [status.INTERNAL, errorInfo.message];
  }
}
```

## Logging Integration

### Structured Logging

```ts
import { createError, formatErrorJSON, logError } from '@wasm4pm/contracts';
import pino from 'pino';

const logger = pino();

function handleError(err: Error, context: string) {
  const error = createError('ALGORITHM_FAILED', err.message);
  
  // Log as JSON for aggregation systems
  logError(error, 'json');
  
  // Also log with pino for local debugging
  const errorJson = formatErrorJSON(error);
  logger.error({
    context,
    error_code: errorJson.code,
    exit_code: errorJson.exit_code,
    recoverable: errorJson.recoverable,
    remediation: errorJson.remediation,
    details: errorJson.context
  });
}
```

## Testing

### Mocking Errors in Tests

```ts
import { createError, error } from '@wasm4pm/contracts';
import { describe, it, expect, vi } from 'vitest';

describe('error handling', () => {
  it('should handle source not found', () => {
    const loadConfig = vi.fn().mockReturnValue(
      error(createError('SOURCE_NOT_FOUND', 'Log file missing'))
    );
    
    const result = loadConfig();
    expect(result.type).toBe('error');
    expect(result.error.exit_code).toBe(300);
  });
  
  it('should handle algorithm failure', () => {
    const mineModel = vi.fn().mockReturnValue(
      error(createError(
        'ALGORITHM_FAILED',
        'Did not converge',
        { iterations: 1000 }
      ))
    );
    
    const result = mineModel();
    expect(result.error.recoverable).toBe(true);
    expect(result.error.context.iterations).toBe(1000);
  });
});
```

### Testing Error Formatting

```ts
import { formatError, formatErrorJSON } from '@wasm4pm/contracts';
import { describe, it, expect } from 'vitest';

describe('error formatting', () => {
  it('should format human-readable errors', () => {
    const error = createError('CONFIG_INVALID', 'Bad syntax');
    const output = formatError(error, false);
    
    expect(output).toContain('CONFIG_INVALID');
    expect(output).toContain('Remediation:');
    expect(output).toContain('Fatal');
  });
  
  it('should include context in JSON', () => {
    const error = createError(
      'SOURCE_NOT_FOUND',
      'File missing',
      { path: '/data/log.xes' }
    );
    const json = formatErrorJSON(error);
    
    expect(json.context.path).toBe('/data/log.xes');
  });
});
```

## Docker/Container Logging

### Structured Logging for Observability

```dockerfile
# In Dockerfile, set JSON logging format
ENV LOG_FORMAT=json

# In entrypoint.sh
exec node app.js 2>&1 | jq .
```

```ts
// In app.ts
import { logError } from '@wasm4pm/contracts';

const logFormat = process.env.LOG_FORMAT || 'human';

try {
  // ... process mining ...
} catch (err) {
  const error = createError('ALGORITHM_FAILED', err.message);
  logError(error, logFormat as any);
  process.exit(error.exit_code);
}
```

This allows:
- Local debugging with human-readable errors
- CI/CD with JSON structured logs
- Cloud logging systems (CloudWatch, Stackdriver) to parse and index errors
- Monitoring dashboards to track error rates by code

## Remediation in Action

### Before (Poor)
```
Error: Failed to load config
```

### After (With PRD §14)
```
ERROR [CONFIG_MISSING]: Configuration file not found

Remediation:
  Configuration file not found. Create wasm4pm.toml in your
  project root or run: pmctl init

✗ Fatal - manual intervention required
```

User now knows:
1. What went wrong (CONFIG_MISSING)
2. Why it matters (fatal error)
3. How to fix it (run pmctl init)
4. Exit code for automation (201)
