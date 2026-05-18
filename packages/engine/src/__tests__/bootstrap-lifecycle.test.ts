import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { bootstrapEngine, createBootstrapError, type BootstrapKernel, type BootstrapResult } from '../bootstrap';
import { WasmLoadError } from '../wasm-loader';
import { EngineError } from '@wasm4pm/contracts';

describe('Bootstrap Engine — initialization lifecycle', () => {
  let mockKernel: BootstrapKernel;
  let mockWasmLoader: any;

  beforeEach(() => {
    mockKernel = {
      init: vi.fn().mockResolvedValue(undefined),
      isReady: vi.fn().mockReturnValue(true),
    };

    mockWasmLoader = {
      init: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockReturnValue({
        memory: new ArrayBuffer(65536),
      }),
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize WASM module first', async () => {
    const result = await bootstrapEngine(mockKernel, mockWasmLoader);

    expect(mockWasmLoader.init).toHaveBeenCalled();
    expect(mockWasmLoader.init).toHaveBeenCalledBefore(mockKernel.init as any);
  });

  it('should initialize kernel after WASM', async () => {
    const result = await bootstrapEngine(mockKernel, mockWasmLoader);

    expect(mockKernel.init).toHaveBeenCalled();
  });

  it('should verify kernel readiness', async () => {
    const result = await bootstrapEngine(mockKernel, mockWasmLoader);

    expect(mockKernel.isReady).toHaveBeenCalled();
  });

  it('should return WASM module on success', async () => {
    const result = await bootstrapEngine(mockKernel, mockWasmLoader);

    expect(result).toHaveProperty('wasmModule');
    expect(result.wasmModule).toBeDefined();
  });

  it('should measure bootstrap duration', async () => {
    const result = await bootstrapEngine(mockKernel, mockWasmLoader);

    expect(result).toHaveProperty('durationMs');
    expect(typeof result.durationMs).toBe('number');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('should throw when kernel is not ready after init', async () => {
    mockKernel.isReady = vi.fn().mockReturnValue(false);

    await expect(bootstrapEngine(mockKernel, mockWasmLoader)).rejects.toThrow(
      'Kernel initialization failed'
    );
  });

  it('should throw when WASM loader fails', async () => {
    mockWasmLoader.init = vi.fn().mockRejectedValue(new Error('WASM load failed'));

    await expect(bootstrapEngine(mockKernel, mockWasmLoader)).rejects.toThrow();
  });

  it('should throw when kernel init fails', async () => {
    mockKernel.init = vi.fn().mockRejectedValue(new Error('Kernel init failed'));

    await expect(bootstrapEngine(mockKernel, mockWasmLoader)).rejects.toThrow();
  });

  it('should handle WasmLoadError with FILE_NOT_FOUND cause', () => {
    const loadError = new WasmLoadError(
      'FILE_NOT_FOUND',
      'WASM module not found',
      '/path/to/module.wasm'
    );

    const engineError = createBootstrapError(loadError);

    expect(engineError).toBeInstanceOf(EngineError);
    expect(engineError.message).toContain('FILE_NOT_FOUND');
  });

  it('should handle WasmLoadError with CORRUPT_BINARY cause', () => {
    const loadError = new WasmLoadError(
      'CORRUPT_BINARY',
      'WASM binary is corrupted',
      '/path/to/module.wasm'
    );

    const engineError = createBootstrapError(loadError);

    expect(engineError).toBeInstanceOf(EngineError);
    expect(engineError.message).toContain('CORRUPT');
  });

  it('should handle WasmLoadError with MISSING_EXPORTS cause', () => {
    const loadError = new WasmLoadError(
      'MISSING_EXPORTS',
      'Required exports not found in WASM',
      '/path/to/module.wasm'
    );

    const engineError = createBootstrapError(loadError);

    expect(engineError).toBeInstanceOf(EngineError);
    expect(engineError.message).toContain('EXPORT');
  });

  it('should handle generic errors gracefully', () => {
    const genericError = new Error('Unknown bootstrap failure');

    const engineError = createBootstrapError(genericError);

    expect(engineError).toBeInstanceOf(EngineError);
    expect(engineError.message).toBeDefined();
  });

  it('should not exceed typical bootstrap timeout', async () => {
    const result = await bootstrapEngine(mockKernel, mockWasmLoader);

    // Typical bootstrap should complete in reasonable time (< 5 seconds for unit test)
    expect(result.durationMs).toBeLessThan(5000);
  });

  it('should support multiple sequential bootstraps', async () => {
    const result1 = await bootstrapEngine(mockKernel, mockWasmLoader);
    const result2 = await bootstrapEngine(mockKernel, mockWasmLoader);

    expect(result1).toBeDefined();
    expect(result2).toBeDefined();
    expect(mockWasmLoader.init).toHaveBeenCalledTimes(2);
    expect(mockKernel.init).toHaveBeenCalledTimes(2);
  });

  it('should provide structured EngineError with actionable message', () => {
    const loadError = new WasmLoadError(
      'FILE_NOT_FOUND',
      'Cannot locate WASM module',
      '/usr/local/lib/wasm4pm.wasm'
    );

    const engineError = createBootstrapError(loadError);

    expect(engineError).toHaveProperty('code');
    expect(engineError).toHaveProperty('message');
    expect(engineError.message).toBeTruthy();
  });
});
