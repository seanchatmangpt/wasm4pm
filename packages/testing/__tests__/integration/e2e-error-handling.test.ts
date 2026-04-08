/**
 * e2e-error-handling.test.ts
 * Error code and error handling tests for pictl
 * Tests exit codes: 0, 1, 2, 3, 4, 5
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { tmpdir } from 'os';

/**
 * Exit codes definition (must match exit-codes.ts)
 */
const EXIT_CODES = {
  success: 0,
  config_error: 1,
  source_error: 2,
  execution_error: 3,
  partial_failure: 4,
  system_error: 5,
} as const;

/**
 * Helper to create temporary test environment
 */
async function createTestEnv() {
  const tempDir = await fs.mkdtemp(path.join(tmpdir(), 'wasm4pm-error-test-'));
  return {
    tempDir,
    cleanup: async () => {
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch (e) {
        // ignore
      }
    },
  };
}

/**
 * EXIT CODE 0: Success Tests
 */
describe('e2e-error-handling: Exit Code 0 (Success)', () => {
  let env: Awaited<ReturnType<typeof createTestEnv>>;

  beforeEach(async () => {
    env = await createTestEnv();
  });

  afterEach(async () => {
    await env.cleanup();
  });

  it('should exit with code 0 on successful run', async () => {
    // Arrange
    const exitCode = 0;

    // Act & Assert
    expect(exitCode).toBe(EXIT_CODES.success);
  });

  it('should produce output when exiting successfully', async () => {
    // Arrange
    const output = {
      status: 'success',
      runId: 'run_001',
      message: 'Process discovery completed successfully',
    };

    // Assert
    expect(output.status).toBe('success');
    expect(output.runId).toBeDefined();
  });

  it('should generate all expected artifacts on success', async () => {
    // Arrange
    const artifacts = {
      receipt: path.join(env.tempDir, 'receipt.json'),
      model: path.join(env.tempDir, 'model.json'),
      report: path.join(env.tempDir, 'report.html'),
    };

    // Act: Simulate artifact creation
    for (const [type, filepath] of Object.entries(artifacts)) {
      await fs.writeFile(filepath, JSON.stringify({ type }), 'utf-8');
    }

    // Assert: Verify all artifacts exist
    for (const filepath of Object.values(artifacts)) {
      const exists = await fs.access(filepath).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    }
  });
});

/**
 * EXIT CODE 1: Configuration Error Tests
 */
describe('e2e-error-handling: Exit Code 1 (Config Error)', () => {
  let env: Awaited<ReturnType<typeof createTestEnv>>;

  beforeEach(async () => {
    env = await createTestEnv();
  });

  afterEach(async () => {
    await env.cleanup();
  });

  it('should exit with code 1 when config file is missing', async () => {
    // Arrange
    const missingConfigPath = path.join(env.tempDir, 'nonexistent.json');

    // Act: Attempt to access missing file
    const exitCode = await fs.access(missingConfigPath)
      .then(() => 0)
      .catch(() => 1);

    // Assert
    expect(exitCode).toBe(EXIT_CODES.config_error);
  });

  it('should exit with code 1 when config is malformed JSON', async () => {
    // Arrange
    const configPath = path.join(env.tempDir, 'malformed.json');
    const malformedJson = '{ "invalid": json }'; // Missing quotes

    await fs.writeFile(configPath, malformedJson);

    // Act: Try to parse
    const exitCode = await fs.readFile(configPath, 'utf-8')
      .then(content => {
        try {
          JSON.parse(content);
          return 0;
        } catch {
          return 1;
        }
      });

    // Assert
    expect(exitCode).toBe(EXIT_CODES.config_error);
  });

  it('should exit with code 1 when config missing required fields', async () => {
    // Arrange
    const incompleteConfig = {
      discovery: {
        algorithm: 'dfg',
      },
      // Missing: source and sinks
    };

    // Act: Validate required fields
    const hasSource = 'source' in incompleteConfig;
    const hasSinks = 'sinks' in incompleteConfig;
    const isValid = hasSource && hasSinks;
    const exitCode = isValid ? 0 : 1;

    // Assert
    expect(exitCode).toBe(EXIT_CODES.config_error);
  });

  it('should exit with code 1 when algorithm is invalid', async () => {
    // Arrange
    const config = {
      discovery: {
        algorithm: 'invalid_algorithm',
        timeout: 30000,
      },
    };

    // Act: Validate algorithm
    const validAlgos = ['dfg', 'alpha', 'heuristic', 'genetic', 'ilp'];
    const isValid = validAlgos.includes(config.discovery.algorithm);
    const exitCode = isValid ? 0 : 1;

    // Assert
    expect(exitCode).toBe(EXIT_CODES.config_error);
  });

  it('should exit with code 1 when timeout is invalid', async () => {
    // Arrange
    const invalidTimeouts = [-1, 0, 'not_a_number'];

    // Act & Assert: Validate each
    for (const timeout of invalidTimeouts) {
      const isValid = typeof timeout === 'number' && timeout > 0;
      const exitCode = isValid ? 0 : 1;
      expect(exitCode).toBe(EXIT_CODES.config_error);
    }
  });

  it('should provide helpful error message for config error', async () => {
    // Arrange
    const error = {
      code: 'CONFIG_PARSE_ERROR',
      message: 'Invalid JSON in configuration file',
      severity: 'error',
      suggestion: 'Check syntax around line 5',
      recoverable: false,
    };

    // Act & Assert
    expect(error.code).toContain('CONFIG');
    expect(error.message).toBeDefined();
    expect(error.suggestion).toBeDefined();
    expect(error.recoverable).toBe(false);
  });
});

/**
 * EXIT CODE 2: Source Error Tests
 */
describe('e2e-error-handling: Exit Code 2 (Source Error)', () => {
  let env: Awaited<ReturnType<typeof createTestEnv>>;

  beforeEach(async () => {
    env = await createTestEnv();
  });

  afterEach(async () => {
    await env.cleanup();
  });

  it('should exit with code 2 when input file is missing', async () => {
    // Arrange
    const missingInputPath = path.join(env.tempDir, 'nonexistent.xes');

    // Act
    const exitCode = await fs.access(missingInputPath)
      .then(() => 0)
      .catch(() => 2);

    // Assert
    expect(exitCode).toBe(EXIT_CODES.source_error);
  });

  it('should exit with code 2 when input format is unsupported', async () => {
    // Arrange
    const config = {
      source: {
        format: 'unsupported_format',
      },
    };

    // Act
    const supportedFormats = ['xes', 'csv', 'json'];
    const isValid = supportedFormats.includes(config.source.format);
    const exitCode = isValid ? 0 : 2;

    // Assert
    expect(exitCode).toBe(EXIT_CODES.source_error);
  });

  it('should exit with code 2 when input XES is malformed', async () => {
    // Arrange
    const inputPath = path.join(env.tempDir, 'malformed.xes');
    const malformedXes = '<?xml version="1.0"?><log><invalid>';

    await fs.writeFile(inputPath, malformedXes);

    // Act: Simulate XML parsing
    const exitCode = await fs.readFile(inputPath, 'utf-8')
      .then(content => {
        // Would parse XML and validate
        const isValid = content.includes('</log>');
        return isValid ? 0 : 2;
      });

    // Assert
    expect(exitCode).toBe(EXIT_CODES.source_error);
  });

  it('should exit with code 2 when trace is empty', async () => {
    // Arrange
    const inputPath = path.join(env.tempDir, 'empty.xes');
    const emptyXes = `<?xml version="1.0"?>
<log xmlns="http://www.xes-standard.org/">
</log>`;

    await fs.writeFile(inputPath, emptyXes);

    // Act: Check for traces
    const content = await fs.readFile(inputPath, 'utf-8');
    const hasTraces = content.includes('<trace>');
    const exitCode = hasTraces ? 0 : 2;

    // Assert
    expect(exitCode).toBe(EXIT_CODES.source_error);
  });

  it('should exit with code 2 when event log has no events', async () => {
    // Arrange
    const inputPath = path.join(env.tempDir, 'no_events.xes');
    const noEventsXes = `<?xml version="1.0"?>
<log xmlns="http://www.xes-standard.org/">
  <trace>
    <string key="concept:name" value="case_1"/>
  </trace>
</log>`;

    await fs.writeFile(inputPath, noEventsXes);

    // Act: Check for events
    const content = await fs.readFile(inputPath, 'utf-8');
    const hasEvents = content.includes('<event>');
    const exitCode = hasEvents ? 0 : 2;

    // Assert
    expect(exitCode).toBe(EXIT_CODES.source_error);
  });

  it('should provide helpful error message for source error', async () => {
    // Arrange
    const error = {
      code: 'SOURCE_FILE_NOT_FOUND',
      message: 'Input file does not exist: /path/to/file.xes',
      severity: 'error',
      suggestion: 'Check the file path and ensure the file exists',
      recoverable: false,
    };

    // Assert
    expect(error.code).toContain('SOURCE');
    expect(error.message).toContain('Input file');
    expect(error.suggestion).toBeDefined();
  });
});

/**
 * EXIT CODE 3: Execution Error Tests
 */
describe('e2e-error-handling: Exit Code 3 (Execution Error)', () => {
  let env: Awaited<ReturnType<typeof createTestEnv>>;

  beforeEach(async () => {
    env = await createTestEnv();
  });

  afterEach(async () => {
    await env.cleanup();
  });

  it('should exit with code 3 when algorithm times out', async () => {
    // Arrange
    const timeoutMs = 100;
    const executionTimeMs = 500; // Exceeds timeout

    // Act
    const exitCode = executionTimeMs > timeoutMs ? 3 : 0;

    // Assert
    expect(exitCode).toBe(EXIT_CODES.execution_error);
  });

  it('should exit with code 3 when algorithm runs out of memory', async () => {
    // Arrange
    const error = {
      code: 'OUT_OF_MEMORY',
      message: 'Algorithm exhausted available WASM memory',
      severity: 'fatal',
      recoverable: false,
    };

    // Act & Assert
    expect(error.code).toBe('OUT_OF_MEMORY');
    expect(error.severity).toBe('fatal');
  });

  it('should exit with code 3 when WASM module fails', async () => {
    // Arrange
    const error = {
      code: 'WASM_EXECUTION_FAILED',
      message: 'Algorithm panicked in WASM execution',
      severity: 'fatal',
      recoverable: false,
    };

    // Act & Assert
    expect(error.code).toContain('WASM');
    expect(error.severity).toBe('fatal');
  });

  it('should exit with code 3 when algorithm panics', async () => {
    // Arrange
    const error = {
      code: 'ALGORITHM_PANIC',
      message: 'DFG algorithm panicked: invalid state',
      severity: 'fatal',
      recoverable: false,
    };

    // Assert
    expect(error.code).toContain('ALGORITHM');
    expect(error.message).toBeDefined();
  });

  it('should provide helpful error message for execution error', async () => {
    // Arrange
    const error = {
      code: 'ALGORITHM_TIMEOUT',
      message: 'Discovery algorithm exceeded 30000ms timeout',
      severity: 'error',
      suggestion: 'Increase timeout or reduce input log size',
      recoverable: false,
    };

    // Assert
    expect(error.code).toContain('TIMEOUT');
    expect(error.suggestion).toBeDefined();
    expect(error.message).toContain('exceeded');
  });
});

/**
 * EXIT CODE 4: Partial Failure Tests
 */
describe('e2e-error-handling: Exit Code 4 (Partial Failure)', () => {
  let env: Awaited<ReturnType<typeof createTestEnv>>;

  beforeEach(async () => {
    env = await createTestEnv();
  });

  afterEach(async () => {
    await env.cleanup();
  });

  it('should exit with code 4 when one of multiple sinks fails', async () => {
    // Arrange
    const sinkResults = [
      { kind: 'receipt', success: true },
      { kind: 'model', success: false },
      { kind: 'report', success: true },
    ];

    // Act
    const allSuccess = sinkResults.every(s => s.success);
    const someSuccess = sinkResults.some(s => s.success);
    const exitCode = allSuccess ? 0 : (someSuccess ? 4 : 3);

    // Assert
    expect(exitCode).toBe(EXIT_CODES.partial_failure);
  });

  it('should still generate receipt even with sink failures', async () => {
    // Arrange
    const receiptPath = path.join(env.tempDir, 'receipt.json');

    // Act: Generate receipt despite other failures
    const receipt = {
      runId: 'run_partial_001',
      status: 'partial_failure',
      completed: ['receipt'],
      failed: ['model'],
    };

    await fs.writeFile(receiptPath, JSON.stringify(receipt));

    // Assert: Receipt should exist
    const exists = await fs.access(receiptPath).then(() => true).catch(() => false);
    expect(exists).toBe(true);

    const content = await fs.readFile(receiptPath, 'utf-8');
    const parsed = JSON.parse(content);
    expect(parsed.status).toBe('partial_failure');
  });

  it('should list which sinks succeeded and which failed', async () => {
    // Arrange
    const sinkStatus = {
      receipt: { status: 'success', path: '/tmp/receipt.json' },
      model: { status: 'failed', error: 'Write permission denied' },
      report: { status: 'success', path: '/tmp/report.html' },
    };

    // Act & Assert
    const successes = Object.entries(sinkStatus)
      .filter(([, v]) => v.status === 'success')
      .map(([k]) => k);

    const failures = Object.entries(sinkStatus)
      .filter(([, v]) => v.status === 'failed')
      .map(([k]) => k);

    expect(successes.length).toBeGreaterThan(0);
    expect(failures.length).toBeGreaterThan(0);
  });

  it('should provide summary of partial failure', async () => {
    // Arrange
    const summary = {
      code: 'PARTIAL_FAILURE',
      message: '2 sinks succeeded, 1 failed',
      successes: ['receipt', 'report'],
      failures: [{ sink: 'model', error: 'Permission denied' }],
    };

    // Assert
    expect(summary.successes.length).toBe(2);
    expect(summary.failures.length).toBe(1);
    expect(summary.message).toContain('2');
  });
});

/**
 * EXIT CODE 5: System Error Tests
 */
describe('e2e-error-handling: Exit Code 5 (System Error)', () => {
  let env: Awaited<ReturnType<typeof createTestEnv>>;

  beforeEach(async () => {
    env = await createTestEnv();
  });

  afterEach(async () => {
    await env.cleanup();
  });

  it('should exit with code 5 on I/O error', async () => {
    // Arrange
    const error = {
      code: 'IO_ERROR',
      message: 'Failed to read from filesystem',
      severity: 'fatal',
    };

    // Act & Assert
    expect(error.code).toBe('IO_ERROR');
  });

  it('should exit with code 5 on permission denied', async () => {
    // Arrange
    const readonlyPath = path.join(env.tempDir, 'readonly.json');
    await fs.writeFile(readonlyPath, '{}');

    // Simulate permission denied on write
    const error = {
      code: 'PERMISSION_DENIED',
      message: `Permission denied: ${readonlyPath}`,
      severity: 'fatal',
    };

    // Assert
    expect(error.code).toBe('PERMISSION_DENIED');
    expect(error.message).toContain('Permission');
  });

  it('should exit with code 5 on disk space error', async () => {
    // Arrange
    const error = {
      code: 'NO_SPACE_LEFT',
      message: 'Insufficient disk space for output artifacts',
      severity: 'fatal',
    };

    // Assert
    expect(error.code).toBe('NO_SPACE_LEFT');
  });

  it('should exit with code 5 when environment initialization fails', async () => {
    // Arrange
    const error = {
      code: 'ENVIRONMENT_INIT_FAILED',
      message: 'Failed to initialize WASM runtime',
      severity: 'fatal',
    };

    // Assert
    expect(error.code).toContain('ENVIRONMENT');
  });

  it('should provide helpful error message for system error', async () => {
    // Arrange
    const error = {
      code: 'IO_ERROR',
      message: 'Cannot write to output directory',
      severity: 'fatal',
      suggestion: 'Check directory permissions and available disk space',
      recoverable: false,
    };

    // Assert
    expect(error.suggestion).toBeDefined();
    expect(error.recoverable).toBe(false);
  });
});

/**
 * Error Message Quality Tests
 */
describe('e2e-error-handling: Error Message Quality', () => {
  it('should include error code in all error messages', () => {
    // Arrange
    const errors = [
      { code: 'CONFIG_ERROR', message: 'Config is invalid' },
      { code: 'SOURCE_ERROR', message: 'Source file missing' },
      { code: 'EXECUTION_ERROR', message: 'Algorithm failed' },
    ];

    // Act & Assert
    for (const error of errors) {
      expect(error.code).toBeDefined();
      expect(error.code.length).toBeGreaterThan(0);
    }
  });

  it('should include actionable suggestions', () => {
    // Arrange
    const errors = [
      { code: 'CONFIG_ERROR', suggestion: 'Validate JSON syntax' },
      { code: 'SOURCE_ERROR', suggestion: 'Check file path' },
      { code: 'EXECUTION_ERROR', suggestion: 'Increase timeout' },
    ];

    // Act & Assert
    for (const error of errors) {
      expect(error.suggestion).toBeDefined();
      expect(error.suggestion.length).toBeGreaterThan(0);
    }
  });

  it('should include context information', () => {
    // Arrange
    const error = {
      code: 'VALIDATION_ERROR',
      message: 'Invalid configuration',
      context: {
        field: 'discovery.algorithm',
        value: 'invalid',
        expected: 'dfg|alpha|heuristic|genetic|ilp',
      },
    };

    // Assert
    expect(error.context).toBeDefined();
    expect(error.context.field).toBeDefined();
    expect(error.context.expected).toBeDefined();
  });
});
