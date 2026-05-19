/**
 * Error Instrumentation Module
 *
 * Provides utilities for emitting OTEL spans for validation errors, I/O errors,
 * and other exceptional conditions that occur before/after command span wrapper.
 *
 * Closes 5 gaps:
 * G1: Config validation errors lack OTEL spans
 * G2: WASM cleanup/teardown operations missing span context
 * G3: File I/O errors emit status but lack error details
 * G4: Algorithm performance spans missing execution context
 * G5: Early error returns (before command span) have no observability
 */

import { randomBytes } from 'node:crypto';
import type { OtelSpan } from '@wasm4pm/cognition';
import { getGlobalSpanSink } from './sink.js';

type ErrorType =
  | 'CONFIG_NOT_FOUND'
  | 'TOML_PARSE_ERROR'
  | 'INVALID_ALGORITHM'
  | 'FILE_NOT_FOUND'
  | 'PARSE_ERROR'
  | 'PERMISSION_DENIED'
  | 'WASM_NOT_FOUND'
  | 'ENGINE_BOOTSTRAP_TIMEOUT'
  | 'MISSING_REQUIRED_ARG';

/**
 * Emit a validation error span (pre-command, early exit)
 *
 * Use for argument validation, config checks, WASM availability that happen
 * before the main command span wrapper.
 *
 * @param errorType - Type of validation error (CONFIG_NOT_FOUND, MISSING_REQUIRED_ARG, etc.)
 * @param message - Human-readable error message
 * @param details - Optional error context (file path, argument name, etc.)
 */
export function emitValidationErrorSpan(
  errorType: ErrorType,
  message: string,
  details?: Record<string, unknown>
): void {
  try {
    const sink = getGlobalSpanSink();
    const span: OtelSpan = {
      trace_id: randomBytes(16).toString('hex'),
      span_id: randomBytes(8).toString('hex'),
      name: 'wasm4pm.validation',
      kind: 'INTERNAL',
      start_time: Date.now() * 1_000_000,
      end_time: Date.now() * 1_000_000 + 1000, // minimal duration
      status: { code: 'ERROR', message },
      attributes: {
        'service.name': 'wasm4pm',
        validation_phase: 'input_check',
        error_type: errorType,
        ...details,
      },
    };
    sink(span);
  } catch {
    // Never block on OTEL — TPS fail-fast rule
  }
}

/**
 * Emit a WASM availability check span
 *
 * Use before attempting to load/initialize WASM.
 * @param success - Whether WASM is available
 * @param message - Status message
 * @param details - Optional context (path, error message, etc.)
 */
export function emitWasmCheckSpan(
  success: boolean,
  message: string,
  details?: Record<string, unknown>
): void {
  try {
    const sink = getGlobalSpanSink();
    const span: OtelSpan = {
      trace_id: randomBytes(16).toString('hex'),
      span_id: randomBytes(8).toString('hex'),
      name: 'wasm4pm.wasm_check',
      kind: 'INTERNAL',
      start_time: Date.now() * 1_000_000,
      end_time: Date.now() * 1_000_000 + 1000,
      status: success ? { code: 'OK' } : { code: 'ERROR', message },
      attributes: {
        'service.name': 'wasm4pm',
        validation_phase: 'wasm_availability',
        ...details,
      },
    };
    sink(span);
  } catch {
    // Never block on OTEL
  }
}

/**
 * Emit an engine initialization span
 *
 * Use when engine.bootstrap() is called.
 * @param success - Whether bootstrap succeeded
 * @param elapsedMs - Time taken
 * @param message - Status message
 * @param details - Optional context (timeout_ms, state, etc.)
 */
export function emitEngineInitSpan(
  success: boolean,
  elapsedMs: number,
  message: string,
  details?: Record<string, unknown>
): void {
  try {
    const sink = getGlobalSpanSink();
    const span: OtelSpan = {
      trace_id: randomBytes(16).toString('hex'),
      span_id: randomBytes(8).toString('hex'),
      name: 'wasm4pm.engine_init',
      kind: 'INTERNAL',
      start_time: (Date.now() - elapsedMs) * 1_000_000,
      end_time: Date.now() * 1_000_000,
      status: success ? { code: 'OK' } : { code: 'ERROR', message },
      attributes: {
        'service.name': 'wasm4pm',
        validation_phase: 'engine_bootstrap',
        'engine.duration_ms': elapsedMs,
        ...details,
      },
    };
    sink(span);
  } catch {
    // Never block on OTEL
  }
}

/**
 * Emit a file I/O error span with detailed context
 *
 * Use for file read/write/parse operations.
 * @param operation - read, write, parse, delete
 * @param errorType - FILE_NOT_FOUND, PARSE_ERROR, PERMISSION_DENIED
 * @param message - Error message
 * @param filePath - Path to file that had the error
 * @param details - Optional context (line number, byte position, etc.)
 */
export function emitFileIoErrorSpan(
  operation: 'read' | 'write' | 'parse' | 'delete',
  errorType: 'FILE_NOT_FOUND' | 'PARSE_ERROR' | 'PERMISSION_DENIED' | 'IO_ERROR',
  message: string,
  filePath: string,
  details?: Record<string, unknown>
): void {
  try {
    const sink = getGlobalSpanSink();
    const span: OtelSpan = {
      trace_id: randomBytes(16).toString('hex'),
      span_id: randomBytes(8).toString('hex'),
      name: 'wasm4pm.file_io',
      kind: 'INTERNAL',
      start_time: Date.now() * 1_000_000,
      end_time: Date.now() * 1_000_000 + 1000,
      status: { code: 'ERROR', message },
      attributes: {
        'service.name': 'wasm4pm',
        error_type: errorType,
        file_path: filePath,
        io_operation: operation,
        ...details,
      },
    };
    sink(span);
  } catch {
    // Never block on OTEL
  }
}

/**
 * Enhance a WASM operation span with algorithm context
 *
 * Use for discovery/conformance/analysis WASM calls to include
 * algorithm name and quality metrics.
 *
 * @param operationName - e.g., 'discover_dfg', 'discover_genetic_algorithm'
 * @param elapsedMs - Time taken
 * @param attributes - Base attributes (log_handle, activity_key, etc.)
 * @param algorithm - Algorithm name (dfg, genetic_algorithm, etc.)
 * @param qualityMetrics - Optional metrics (fitness_estimate, precision, etc.)
 */
export function emitAlgorithmSpan(
  operationName: string,
  elapsedMs: number,
  attributes: Record<string, unknown>,
  algorithm: string,
  qualityMetrics?: Record<string, unknown>
): void {
  try {
    const sink = getGlobalSpanSink();
    const span: OtelSpan = {
      trace_id: randomBytes(16).toString('hex'),
      span_id: randomBytes(8).toString('hex'),
      name: `wasm.${operationName}`,
      kind: 'INTERNAL',
      start_time: (Date.now() - elapsedMs) * 1_000_000,
      end_time: Date.now() * 1_000_000,
      status: { code: 'OK' },
      attributes: {
        'service.name': 'wasm4pm',
        'wasm.operation': operationName,
        'wasm.duration_ms': elapsedMs,
        algorithm,
        ...attributes,
        ...(qualityMetrics || {}),
      },
    };
    sink(span);
  } catch {
    // Never block on OTEL
  }
}

/**
 * Emit a cleanup operation span with error recovery context
 *
 * Use for WASM cleanup (delete_object, etc.) that may fail but should not
 * propagate the error.
 *
 * @param operationName - e.g., 'delete_object'
 * @param success - Whether operation succeeded
 * @param elapsedMs - Time taken
 * @param handle - Resource handle being cleaned up
 * @param errorMessage - Error message if failed
 * @param recovered - Whether error was recovered
 */
export function emitCleanupSpan(
  operationName: string,
  success: boolean,
  elapsedMs: number,
  handle: string,
  errorMessage?: string,
  recovered: boolean = false
): void {
  try {
    const sink = getGlobalSpanSink();
    const span: OtelSpan = {
      trace_id: randomBytes(16).toString('hex'),
      span_id: randomBytes(8).toString('hex'),
      name: `wasm.${operationName}`,
      kind: 'INTERNAL',
      start_time: (Date.now() - elapsedMs) * 1_000_000,
      end_time: Date.now() * 1_000_000,
      status: success ? { code: 'OK' } : { code: 'ERROR', message: errorMessage },
      attributes: {
        'service.name': 'wasm4pm',
        'wasm.operation': operationName,
        'input.handle': handle,
        'wasm.duration_ms': elapsedMs,
        error_recovered: recovered,
      },
    };
    sink(span);
  } catch {
    // Never block on OTEL
  }
}

/**
 * Emit a config validation error span with detailed context
 *
 * Use for toml/json/schema validation errors.
 * @param configType - toml, json, schema
 * @param errorType - PARSE_ERROR, VALIDATION_ERROR, INVALID_ALGORITHM
 * @param message - Error message
 * @param filePath - Path to config file
 * @param details - Optional context (line number, invalid_field, suggestions, etc.)
 */
export function emitConfigErrorSpan(
  configType: 'toml' | 'json' | 'schema',
  errorType: 'PARSE_ERROR' | 'VALIDATION_ERROR' | 'INVALID_ALGORITHM',
  message: string,
  filePath: string,
  details?: Record<string, unknown>
): void {
  try {
    const sink = getGlobalSpanSink();
    const span: OtelSpan = {
      trace_id: randomBytes(16).toString('hex'),
      span_id: randomBytes(8).toString('hex'),
      name: 'wasm4pm.config_validation',
      kind: 'INTERNAL',
      start_time: Date.now() * 1_000_000,
      end_time: Date.now() * 1_000_000 + 1000,
      status: { code: 'ERROR', message },
      attributes: {
        'service.name': 'wasm4pm',
        config_type: configType,
        error_type: errorType,
        config_path: filePath,
        ...details,
      },
    };
    sink(span);
  } catch {
    // Never block on OTEL
  }
}
