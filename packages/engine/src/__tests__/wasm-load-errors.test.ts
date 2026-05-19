/**
 * wasm-load-errors.test.ts
 * Unit tests for WasmLoadError classification and createBootstrapError() mapping.
 *
 * These tests verify:
 *   1. WasmLoadError carries cause, message, and optional modulePath
 *   2. createBootstrapError() maps each WasmLoadError cause to the right error code
 *   3. createBootstrapError() preserves the actionable message as the suggestion
 *   4. Generic errors still produce BOOTSTRAP_FAILED with recoverable=true
 */

import { describe, it, expect } from 'vitest';
import { WasmLoadError } from '../wasm-loader.js';
import { createBootstrapError } from '../bootstrap.js';

describe('WasmLoadError', () => {
  it('carries cause and message', () => {
    const err = new WasmLoadError(
      'FILE_NOT_FOUND',
      'WASM binary not found at: /some/path/wasm4pm.js',
      '/some/path/wasm4pm.js'
    );
    expect(err.loadCause).toBe('FILE_NOT_FOUND');
    expect(err.message).toContain('WASM binary not found');
    expect(err.modulePath).toBe('/some/path/wasm4pm.js');
    expect(err.name).toBe('WasmLoadError');
  });

  it('is an instance of Error', () => {
    const err = new WasmLoadError('LOAD_FAILED', 'something went wrong');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(WasmLoadError);
  });

  it('modulePath is optional', () => {
    const err = new WasmLoadError('MISSING_EXPORTS', 'no load_eventlog_from_xes');
    expect(err.modulePath).toBeUndefined();
  });
});

describe('createBootstrapError — WasmLoadError classification', () => {
  it('FILE_NOT_FOUND → WASM_FILE_NOT_FOUND, recoverable', () => {
    const err = new WasmLoadError(
      'FILE_NOT_FOUND',
      'Run npm run build to compile',
      '/pkg/wasm4pm.js'
    );
    const result = createBootstrapError(err);
    expect(result.code).toBe('WASM_FILE_NOT_FOUND');
    expect(result.recoverable).toBe(true);
    expect(result.suggestion).toContain('npm run build');
  });

  it('CORRUPT_BINARY → WASM_CORRUPT_BINARY, not recoverable (needs rebuild)', () => {
    const err = new WasmLoadError(
      'CORRUPT_BINARY',
      'Delete pkg/ and re-run npm run build',
      '/pkg/wasm4pm.js'
    );
    const result = createBootstrapError(err);
    expect(result.code).toBe('WASM_CORRUPT_BINARY');
    expect(result.recoverable).toBe(false);
  });

  it('MISSING_EXPORTS → WASM_MISSING_EXPORTS, recoverable', () => {
    const err = new WasmLoadError('MISSING_EXPORTS', 'missing load_eventlog_from_xes');
    const result = createBootstrapError(err);
    expect(result.code).toBe('WASM_MISSING_EXPORTS');
    expect(result.recoverable).toBe(true);
  });

  it('LOAD_FAILED → WASM_LOAD_FAILED, recoverable', () => {
    const err = new WasmLoadError('LOAD_FAILED', 'unknown load error');
    const result = createBootstrapError(err);
    expect(result.code).toBe('WASM_LOAD_FAILED');
    expect(result.recoverable).toBe(true);
  });

  it('preserves the WasmLoadError message as suggestion', () => {
    const actionableMsg = 'Run "npm run build" in the wasm4pm/ directory';
    const err = new WasmLoadError('FILE_NOT_FOUND', actionableMsg);
    const result = createBootstrapError(err);
    expect(result.suggestion).toBe(actionableMsg);
    expect(result.message).toBe(actionableMsg);
  });
});

describe('createBootstrapError — generic errors', () => {
  it('generic Error produces BOOTSTRAP_FAILED, recoverable', () => {
    const result = createBootstrapError(new Error('network timeout'));
    expect(result.code).toBe('BOOTSTRAP_FAILED');
    expect(result.recoverable).toBe(true);
    expect(result.severity).toBe('fatal');
    expect(result.message).toBe('network timeout');
  });

  it('string error produces BOOTSTRAP_FAILED', () => {
    const result = createBootstrapError('something bad');
    expect(result.code).toBe('BOOTSTRAP_FAILED');
    expect(result.message).toBe('something bad');
  });

  it('null/undefined produces BOOTSTRAP_FAILED with generic message', () => {
    const result = createBootstrapError(null);
    expect(result.code).toBe('BOOTSTRAP_FAILED');
    expect(typeof result.message).toBe('string');
    expect(result.message.length).toBeGreaterThan(0);
  });
});
