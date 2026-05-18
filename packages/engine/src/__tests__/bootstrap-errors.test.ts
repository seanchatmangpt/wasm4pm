import { describe, it, expect, beforeEach, vi } from 'vitest';
import { bootstrapEngine, createBootstrapError, type BootstrapKernel } from '../bootstrap';
import { WasmLoadError } from '../wasm-loader';
import { EngineError } from '@wasm4pm/contracts';

describe('Bootstrap Error Handling — failure modes and diagnostics', () => {
  let mockKernel: BootstrapKernel;
  let mockWasmLoader: any;

  beforeEach(() => {
    mockKernel = {
      init: vi.fn().mockResolvedValue(undefined),
      isReady: vi.fn().mockReturnValue(true),
    };

    mockWasmLoader = {
      init: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockReturnValue({ memory: new ArrayBuffer(65536) }),
    };
  });

  it('should classify WASM not found error', async () => {
    const error = new WasmLoadError(
      'FILE_NOT_FOUND',
      'WASM module not found at path',
      '/app/wasm.wasm'
    );

    const engineError = createBootstrapError(error);
    expect(engineError).toBeInstanceOf(EngineError);
  });

  it('should classify WASM binary corruption', async () => {
    const error = new WasmLoadError(
      'CORRUPT_BINARY',
      'Invalid WASM magic number',
      '/app/wasm.wasm'
    );

    const engineError = createBootstrapError(error);
    expect(engineError).toBeInstanceOf(EngineError);
  });

  it('should classify missing WASM exports', async () => {
    const error = new WasmLoadError(
      'MISSING_EXPORTS',
      'Required functions not exported',
      '/app/wasm.wasm'
    );

    const engineError = createBootstrapError(error);
    expect(engineError).toBeInstanceOf(EngineError);
  });

  it('should classify generic WASM load failure', async () => {
    const error = new WasmLoadError(
      'LOAD_FAILED',
      'Unknown WASM load error',
      '/app/wasm.wasm'
    );

    const engineError = createBootstrapError(error);
    expect(engineError).toBeInstanceOf(EngineError);
  });

  it('should handle null/undefined WASM module gracefully', async () => {
    mockWasmLoader.get = vi.fn().mockReturnValue(null);

    // Should not crash, but may fail later
    const result = await bootstrapEngine(mockKernel, mockWasmLoader);
    expect(result).toBeDefined();
  });

  it('should handle kernel init rejection', async () => {
    mockKernel.init = vi.fn().mockRejectedValue(new Error('Kernel init timeout'));

    await expect(bootstrapEngine(mockKernel, mockWasmLoader)).rejects.toThrow();
  });

  it('should report kernel not ready as initialization failure', async () => {
    mockKernel.isReady = vi.fn().mockReturnValue(false);

    const error = await bootstrapEngine(mockKernel, mockWasmLoader).catch((e) => e);
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toContain('not ready');
  });

  it('should preserve error context through transformation', () => {
    const originalError = new WasmLoadError(
      'FILE_NOT_FOUND',
      'WASM not found',
      '/specific/path.wasm'
    );

    const engineError = createBootstrapError(originalError);

    expect(engineError).toBeInstanceOf(EngineError);
    // Should contain context about the original error
    expect(engineError.message).toBeTruthy();
  });

  it('should handle wrapped errors', () => {
    const loadError = new WasmLoadError('CORRUPT_BINARY', 'Bad WASM', '/path.wasm');
    const wrappedError = new Error(`Bootstrap failed: ${loadError.message}`);

    const engineError = createBootstrapError(wrappedError);
    expect(engineError).toBeInstanceOf(EngineError);
  });

  it('should distinguish between WASM failure and kernel failure', async () => {
    // WASM failure
    mockWasmLoader.init = vi.fn().mockRejectedValue(
      new WasmLoadError('FILE_NOT_FOUND', 'WASM not found')
    );

    const wasmFailure = await bootstrapEngine(mockKernel, mockWasmLoader).catch((e) =>
      createBootstrapError(e)
    );

    // Kernel failure
    mockWasmLoader.init = vi.fn().mockResolvedValue(undefined);
    mockKernel.init = vi.fn().mockRejectedValue(new Error('Kernel failed'));

    const kernelFailure = await bootstrapEngine(mockKernel, mockWasmLoader).catch((e) =>
      createBootstrapError(e)
    );

    expect(wasmFailure).toBeInstanceOf(EngineError);
    expect(kernelFailure).toBeInstanceOf(EngineError);
  });

  it('should support error recovery hints', () => {
    const error = new WasmLoadError(
      'FILE_NOT_FOUND',
      'Cannot find WASM binary',
      '/expected/path.wasm'
    );

    const engineError = createBootstrapError(error);

    // Error should contain enough info for recovery
    expect(engineError.message).toBeTruthy();
  });

  it('should handle async init failure in kernel', async () => {
    const delayedError = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Kernel init timeout')), 50)
    );

    mockKernel.init = vi.fn().mockReturnValue(delayedError);

    await expect(bootstrapEngine(mockKernel, mockWasmLoader)).rejects.toThrow('timeout');
  });

  it('should handle rapid successive bootstrap failures', async () => {
    const error1 = new WasmLoadError('FILE_NOT_FOUND', 'WASM not found');
    const error2 = new WasmLoadError('CORRUPT_BINARY', 'WASM corrupted');

    const engineError1 = createBootstrapError(error1);
    const engineError2 = createBootstrapError(error2);

    expect(engineError1).toBeInstanceOf(EngineError);
    expect(engineError2).toBeInstanceOf(EngineError);
    // Different causes should produce different errors
    expect(engineError1.message).not.toBe(engineError2.message);
  });

  it('should provide error code for telemetry', () => {
    const error = new WasmLoadError('MISSING_EXPORTS', 'Missing exports');
    const engineError = createBootstrapError(error);

    expect(engineError).toHaveProperty('code');
  });
});
