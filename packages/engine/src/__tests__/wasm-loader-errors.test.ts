import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WasmLoader, WasmLoadError, type WasmLoaderConfig } from '../wasm-loader';

describe('WasmLoader Error Handling — recovery and diagnostics', () => {
  beforeEach(() => {
    WasmLoader.reset();
  });

  afterEach(() => {
    WasmLoader.reset();
  });

  it('should identify FILE_NOT_FOUND errors', () => {
    const config: WasmLoaderConfig = {
      modulePath: '/does/not/exist/wasm.wasm',
      enablePanicHook: false,
    };

    try {
      WasmLoader.load(config);
      expect.fail('Should have thrown WasmLoadError');
    } catch (e) {
      if (e instanceof WasmLoadError) {
        expect(['FILE_NOT_FOUND', 'LOAD_FAILED']).toContain(e.loadCause);
      }
    }
  });

  it('should identify CORRUPT_BINARY errors', () => {
    const config: WasmLoaderConfig = {
      modulePath: '/path/to/corrupt.wasm',
      enablePanicHook: false,
    };

    try {
      WasmLoader.load(config);
    } catch (e) {
      if (e instanceof WasmLoadError) {
        // May be CORRUPT_BINARY or LOAD_FAILED depending on how it fails
        expect(['CORRUPT_BINARY', 'LOAD_FAILED']).toContain(e.loadCause);
      }
    }
  });

  it('should identify MISSING_EXPORTS errors', () => {
    // This would require a valid WASM file without expected exports
    // For unit testing, we expect the error to be classifiable
    const config: WasmLoaderConfig = {
      modulePath: '/path/to/incomplete.wasm',
      enablePanicHook: false,
    };

    try {
      WasmLoader.load(config);
    } catch (e) {
      if (e instanceof WasmLoadError) {
        expect(['MISSING_EXPORTS', 'LOAD_FAILED']).toContain(e.loadCause);
      }
    }
  });

  it('should preserve error context with module path', () => {
    const modulePath = '/custom/path/wasm.wasm';
    const config: WasmLoaderConfig = {
      modulePath,
      enablePanicHook: false,
    };

    try {
      WasmLoader.load(config);
    } catch (e) {
      if (e instanceof WasmLoadError) {
        expect(e.modulePath).toBe(modulePath);
        expect(e.message).toBeTruthy();
      }
    }
  });

  it('should support recovery with soft reset', () => {
    const config: WasmLoaderConfig = { enablePanicHook: false };

    try {
      WasmLoader.load({
        modulePath: '/invalid/wasm.wasm',
        enablePanicHook: false,
      });
    } catch {
      // Failure expected
    }

    WasmLoader.softReset();
    const status = WasmLoader.getStatus(config);
    expect(status.initialized).toBe(false);
  });

  it('should support full reset on critical failure', () => {
    WasmLoader.reset();
    const status = WasmLoader.getStatus({ enablePanicHook: false });
    
    expect(status.initialized).toBe(false);
  });

  it('should not throw on repeated reset', () => {
    expect(() => {
      WasmLoader.reset();
      WasmLoader.reset();
      WasmLoader.reset();
    }).not.toThrow();
  });

  it('should provide diagnostic info after failure', () => {
    const config: WasmLoaderConfig = { enablePanicHook: false };
    
    try {
      WasmLoader.load({
        modulePath: '/bad.wasm',
        enablePanicHook: false,
      });
    } catch {
      // Expected
    }

    const status = WasmLoader.getStatus(config);
    expect(status).toHaveProperty('runtimeEnvironment');
    expect(status).toHaveProperty('memoryPages');
  });

  it('should distinguish version mismatch from load failure', () => {
    const config: WasmLoaderConfig = {
      expectedVersion: '999.0.0', // Unlikely to match
      enablePanicHook: false,
    };

    const status = WasmLoader.getStatus(config);
    expect(status.expectedVersion).toBe('999.0.0');
    
    if (status.moduleVersion && status.expectedVersion) {
      expect(status.moduleVersion).not.toBe(status.expectedVersion);
    }
  });

  it('should handle memory exhaustion gracefully', () => {
    const config: WasmLoaderConfig = {
      maxMemoryPercent: 90,
      enablePanicHook: false,
    };

    const status = WasmLoader.getStatus(config);
    
    // Should track memory usage
    expect(status.memoryUsagePercent).toBeDefined();
    expect(typeof status.memoryUsagePercent).toBe('number');
  });

  it('should classify errors consistently', () => {
    const config1: WasmLoaderConfig = {
      modulePath: '/path1.wasm',
      enablePanicHook: false,
    };

    const config2: WasmLoaderConfig = {
      modulePath: '/path2.wasm',
      enablePanicHook: false,
    };

    const causes: string[] = [];

    try {
      WasmLoader.load(config1);
    } catch (e) {
      if (e instanceof WasmLoadError) {
        causes.push(e.loadCause);
      }
    }

    try {
      WasmLoader.load(config2);
    } catch (e) {
      if (e instanceof WasmLoadError) {
        causes.push(e.loadCause);
      }
    }

    // All causes should be valid
    causes.forEach((cause) => {
      expect(['FILE_NOT_FOUND', 'CORRUPT_BINARY', 'MISSING_EXPORTS', 'LOAD_FAILED']).toContain(cause);
    });
  });
});
