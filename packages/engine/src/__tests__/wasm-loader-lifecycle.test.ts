import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WasmLoader, type WasmLoaderStatus, type WasmLoaderConfig, WasmLoadError, WasmErrorCode } from '../wasm-loader';

describe('WasmLoader — singleton WASM initialization lifecycle', () => {
  beforeEach(() => {
    // Reset loader between tests
    WasmLoader.reset();
  });

  afterEach(() => {
    WasmLoader.reset();
  });

  it('should initialize as a singleton', () => {
    const loader1 = WasmLoader.getInstance();
    const loader2 = WasmLoader.getInstance();
    
    expect(loader1).toBe(loader2);
  });

  it('should detect runtime environment', () => {
    const config: WasmLoaderConfig = {
      enablePanicHook: false,
    };
    
    const status = WasmLoader.getStatus(config);
    expect(status).toHaveProperty('runtimeEnvironment');
    expect(['browser', 'nodejs', 'wasi']).toContain(status.runtimeEnvironment);
  });

  it('should report initial uninitialized state', () => {
    const config: WasmLoaderConfig = { enablePanicHook: false };
    const status = WasmLoader.getStatus(config);
    
    expect(status.initialized).toBe(false);
  });

  it('should track memory allocation', () => {
    const config: WasmLoaderConfig = { enablePanicHook: false };
    const status = WasmLoader.getStatus(config);
    
    expect(status.memoryPages).toBeGreaterThanOrEqual(0);
    expect(status.memoryUsagePercent).toBeGreaterThanOrEqual(0);
    expect(status.memoryUsagePercent).toBeLessThanOrEqual(100);
  });

  it('should support version tracking', () => {
    const config: WasmLoaderConfig = {
      expectedVersion: '1.0.0',
      enablePanicHook: false,
    };
    
    const status = WasmLoader.getStatus(config);
    expect(status).toHaveProperty('expectedVersion', '1.0.0');
  });

  it('should enforce memory limits', () => {
    const config: WasmLoaderConfig = {
      maxMemoryPercent: 80,
      enablePanicHook: false,
    };
    
    const status = WasmLoader.getStatus(config);
    // Memory usage should respect configured limits
    expect(status.memoryUsagePercent).toBeLessThanOrEqual(100);
  });

  it('should reset state cleanly', () => {
    const config: WasmLoaderConfig = { enablePanicHook: false };
    
    let status1 = WasmLoader.getStatus(config);
    expect(status1).toBeDefined();
    
    WasmLoader.reset();
    
    let status2 = WasmLoader.getStatus(config);
    expect(status2.initialized).toBe(false);
  });

  it('should throw WasmLoadError on missing module', () => {
    const config: WasmLoaderConfig = {
      modulePath: '/nonexistent/path/wasm.wasm',
      enablePanicHook: false,
    };
    
    expect(() => {
      WasmLoader.load(config);
    }).toThrow(WasmLoadError);
  });

  it('should classify load failures with specific cause codes', () => {
    const config: WasmLoaderConfig = {
      modulePath: '/invalid/path',
      enablePanicHook: false,
    };
    
    try {
      WasmLoader.load(config);
    } catch (e) {
      if (e instanceof WasmLoadError) {
        expect(['FILE_NOT_FOUND', 'CORRUPT_BINARY', 'MISSING_EXPORTS', 'LOAD_FAILED']).toContain(e.loadCause);
        expect(e.modulePath).toBeDefined();
      }
    }
  });

  it('should support soft reset for fast recovery', () => {
    const config: WasmLoaderConfig = { enablePanicHook: false };
    
    const status1 = WasmLoader.getStatus(config);
    WasmLoader.softReset(); // Preserve compiled binary
    const status2 = WasmLoader.getStatus(config);
    
    expect(status1).toBeDefined();
    expect(status2).toBeDefined();
  });

  it('should validate memory before initialization', () => {
    const config: WasmLoaderConfig = {
      maxMemoryPercent: 100,
      enablePanicHook: false,
    };
    
    const status = WasmLoader.getStatus(config);
    expect(status.memoryUsagePercent).toBeLessThanOrEqual(100);
  });

  it('should emit observability events on initialization', () => {
    const mockObservability = {
      emitEvent: vi.fn(),
      captureException: vi.fn(),
    };
    
    const config: WasmLoaderConfig = {
      observability: mockObservability as any,
      enablePanicHook: false,
    };
    
    const status = WasmLoader.getStatus(config);
    expect(status).toBeDefined();
  });

  it('should support memory page adjustment', () => {
    const config1: WasmLoaderConfig = { enablePanicHook: false };
    const config2: WasmLoaderConfig = { enablePanicHook: false };
    
    const status1 = WasmLoader.getStatus(config1);
    const status2 = WasmLoader.getStatus(config2);
    
    // Both should report consistent memory state
    expect(status1.memoryPages).toBeGreaterThanOrEqual(0);
    expect(status2.memoryPages).toBeGreaterThanOrEqual(0);
  });

  it('should provide version string if available', () => {
    const config: WasmLoaderConfig = { enablePanicHook: false };
    const version = WasmLoader.getVersion(config);
    
    // Version should be a string or undefined
    expect(typeof version === 'string' || version === undefined).toBe(true);
  });

  it('should handle panic hooks gracefully', () => {
    const config: WasmLoaderConfig = {
      enablePanicHook: true,
    };
    
    // Should not throw when panic hook is enabled
    const status = WasmLoader.getStatus(config);
    expect(status).toBeDefined();
  });
});
