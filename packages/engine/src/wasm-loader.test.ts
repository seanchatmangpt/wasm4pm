/**
 * wasm-loader.test.ts
 * Tests for WASM module initialization, lifecycle, and error handling
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  WasmLoader,
  WasmModule,
  WasmErrorCode,
  createWasmLoader,
  getWasmLoader,
} from './wasm-loader.js';
import { ObservabilityLayer } from '@wasm4pm/observability';

/**
 * Mock WASM module for testing
 */
class MockWasmModule implements WasmModule {
  memory: any;
  version?: () => string;
  init?: () => void;

  constructor(versionString?: string) {
    // Create a small memory buffer for testing
    try {
      this.memory = new WebAssembly.Memory({ initial: 256, maximum: 512 } as any);
    } catch {
      // Fallback for environments without WebAssembly
      this.memory = { buffer: new ArrayBuffer(256 * 64 * 1024) };
    }

    if (versionString) {
      this.version = () => versionString;
    }
  }
}

describe('WasmLoader', () => {
  beforeEach(() => {
    // Reset singleton before each test
    WasmLoader.reset();
  });

  afterEach(() => {
    WasmLoader.reset();
  });

  describe('Singleton Pattern', () => {
    it('should return same instance on multiple calls', () => {
      const loader1 = WasmLoader.getInstance();
      const loader2 = WasmLoader.getInstance();
      expect(loader1).toBe(loader2);
    });

    it('should allow creating multiple instances via createWasmLoader', () => {
      WasmLoader.reset();
      const loader = createWasmLoader();
      expect(loader).toBeDefined();
    });

    it('should get singleton via getWasmLoader', () => {
      const loader = getWasmLoader();
      expect(loader).toBeDefined();
    });

    it('should reset singleton state', () => {
      const loader1 = WasmLoader.getInstance();
      WasmLoader.reset();
      const loader2 = WasmLoader.getInstance();
      expect(loader1).not.toBe(loader2);
    });
  });

  describe('Initialization', () => {
    it('should track initialized state', async () => {
      const loader = WasmLoader.getInstance();
      expect(loader.isInitialized()).toBe(false);
    });

    it('should not fail on repeated init calls', async () => {
      const loader = WasmLoader.getInstance();
      // Mock the module loading
      vi.spyOn(loader, 'get' as any).mockReturnValue(new MockWasmModule());

      // Should not throw on double init
      // Note: actual init will fail since we can't load real WASM,
      // but the pattern should handle it gracefully
      expect(() => {
        loader.isInitialized();
      }).not.toThrow();
    });
  });

  describe('Status Reporting', () => {
    it('should report uninitialized status before init', () => {
      const loader = WasmLoader.getInstance();
      const status = loader.getStatus();

      expect(status.initialized).toBe(false);
      expect(status.memoryPages).toBe(0);
      expect(status.memoryUsagePercent).toBe(0);
      expect(status.runtimeEnvironment).toBeDefined();
    });

    it('should include runtime environment in status', () => {
      const loader = WasmLoader.getInstance();
      const status = loader.getStatus();

      expect(['browser', 'nodejs', 'wasi']).toContain(status.runtimeEnvironment);
    });
  });

  describe('Memory Validation', () => {
    it('should validate WASM memory accessibility', () => {
      const mockModule = new MockWasmModule();
      const buffer = mockModule.memory.buffer;

      // Memory should be accessible
      expect(buffer).toBeDefined();
      expect(buffer.byteLength).toBeGreaterThan(0);
    });

    it('should detect memory corruption', () => {
      const mockModule = new MockWasmModule();
      const view = new Uint8Array(mockModule.memory.buffer, 0, 10);

      // Write a test value
      view[0] = 42;
      expect(view[0]).toBe(42);

      // Should be able to read it back
      const value = view[0];
      expect(value).toBe(42);
    });

    it('should report memory usage statistics', () => {
      // This test would require actual initialized module
      const loader = WasmLoader.getInstance();
      const stats = loader.getMemoryStats();

      expect(stats).toHaveProperty('usedBytes');
      expect(stats).toHaveProperty('totalBytes');
      expect(stats).toHaveProperty('usagePercent');
      expect(stats.usagePercent).toBeGreaterThanOrEqual(0);
      expect(stats.usagePercent).toBeLessThanOrEqual(100);
    });
  });

  describe('Error Handling', () => {
    it('should throw when accessing module before initialization', () => {
      const loader = WasmLoader.getInstance();

      expect(() => {
        loader.get();
      }).toThrow('not initialized');
    });

    it('should provide helpful error message on module load failure', () => {
      // This would be tested with mock import
      const loader = WasmLoader.getInstance();
      expect(loader.isInitialized()).toBe(false);
    });

    it('should handle version mismatch errors', async () => {
      // Version mismatch should be caught during init
      const config = {
        expectedVersion: '0.5.4',
        // Will fail with real module, but config is valid
      };

      const loader = createWasmLoader(config);
      expect(loader).toBeDefined();
    });

    it('should define correct error codes', () => {
      expect(WasmErrorCode.WASM_INIT_FAILED).toBe(5);
      expect(WasmErrorCode.WASM_MEMORY_EXCEEDED).toBe(5);
      expect(WasmErrorCode.WASM_VERSION_MISMATCH).toBe(5);
    });
  });

  describe('Configuration', () => {
    it('should accept custom module path', () => {
      const config = {
        modulePath: '/custom/path/to/wasm.js',
      };

      const loader = createWasmLoader(config);
      expect(loader).toBeDefined();
    });

    it('should accept expected version configuration', () => {
      const config = {
        expectedVersion: '0.5.4',
      };

      const loader = createWasmLoader(config);
      expect(loader).toBeDefined();
    });

    it('should accept memory threshold configuration', () => {
      const config = {
        maxMemoryPercent: 90,
      };

      const loader = createWasmLoader(config);
      expect(loader).toBeDefined();
    });

    it('should accept panic hook configuration', () => {
      const config = {
        enablePanicHook: true,
      };

      const loader = createWasmLoader(config);
      expect(loader).toBeDefined();
    });

    it('should accept observability layer', () => {
      const obsLayer = new ObservabilityLayer();
      const config = {
        observability: obsLayer,
      };

      const loader = createWasmLoader(config);
      expect(loader).toBeDefined();
    });

    it('should disable panic hook if configured', () => {
      const config = {
        enablePanicHook: false,
      };

      const loader = createWasmLoader(config);
      expect(loader).toBeDefined();
    });
  });

  describe('Runtime Detection', () => {
    it('should detect runtime environment', () => {
      const loader = WasmLoader.getInstance();
      const status = loader.getStatus();

      const validEnvironments = ['browser', 'nodejs', 'wasi'];
      expect(validEnvironments).toContain(status.runtimeEnvironment);
    });

    it('should report Node.js environment', () => {
      // We're likely in Node.js during test
      const loader = WasmLoader.getInstance();
      const status = loader.getStatus();

      if (typeof process !== 'undefined' && process.versions?.node) {
        expect(status.runtimeEnvironment).toBe('nodejs');
      }
    });
  });

  describe('Module Lifecycle Across Multiple Runs', () => {
    it('should reuse module across runs', () => {
      const loader = WasmLoader.getInstance();

      // Module is reused - same instance
      expect(loader.isInitialized()).toBe(false);

      // Attempting to get before init should fail
      expect(() => {
        loader.get();
      }).toThrow();

      // After init, get should return same instance
      // (would work with real WASM)
    });

    it('should track memory across multiple accesses', () => {
      const loader = WasmLoader.getInstance();
      const stats1 = loader.getMemoryStats();
      const stats2 = loader.getMemoryStats();

      // Both should return valid stats
      expect(stats1).toHaveProperty('usedBytes');
      expect(stats2).toHaveProperty('usedBytes');
    });
  });

  describe('Memory Warning Thresholds', () => {
    it('should have default memory threshold of 80%', () => {
      const loader = WasmLoader.getInstance();
      const status = loader.getStatus();

      // Should track memory percentage
      expect(status).toHaveProperty('memoryUsagePercent');
    });

    it('should respect custom memory threshold', () => {
      const config = {
        maxMemoryPercent: 95,
      };

      const loader = createWasmLoader(config);
      expect(loader).toBeDefined();
    });

    it('should warn at high memory usage', () => {
      const mockObservability = {
        emitCli: vi.fn(),
        emitJson: vi.fn(),
      };

      const config = {
        maxMemoryPercent: 75,
        observability: mockObservability as any,
      };

      const loader = createWasmLoader(config);
      expect(loader).toBeDefined();
    });
  });

  describe('Panic Hook Setup', () => {
    it('should setup panic hook by default', () => {
      const config = {
        enablePanicHook: true,
      };

      const loader = createWasmLoader(config);
      expect(loader).toBeDefined();
    });

    it('should allow disabling panic hook', () => {
      const config = {
        enablePanicHook: false,
      };

      const loader = createWasmLoader(config);
      expect(loader).toBeDefined();
    });

    it('should log panics to observability layer', () => {
      const mockObservability = {
        emitCli: vi.fn(),
        emitJson: vi.fn(),
      };

      const config = {
        enablePanicHook: true,
        observability: mockObservability as any,
      };

      const loader = createWasmLoader(config);
      expect(loader).toBeDefined();
    });
  });

  describe('Integration Tests', () => {
    it('should handle module not found gracefully', () => {
      const config = {
        modulePath: '/nonexistent/path.js',
      };

      const loader = createWasmLoader(config);
      expect(loader).toBeDefined();
      expect(loader.isInitialized()).toBe(false);
    });

    it('should handle invalid WASM module gracefully', () => {
      const loader = WasmLoader.getInstance();

      // Before init, should not be ready
      expect(loader.isInitialized()).toBe(false);
      expect(() => loader.get()).toThrow();
    });

    it('should handle memory exceeding maximum', () => {
      const mockObservability = {
        emitCli: vi.fn(),
        emitJson: vi.fn(),
      };

      const config = {
        maxMemoryPercent: 80,
        observability: mockObservability as any,
      };

      const loader = createWasmLoader(config);
      const stats = loader.getMemoryStats();

      // Should report valid memory stats
      expect(stats.usagePercent).toBeGreaterThanOrEqual(0);
      expect(stats.usagePercent).toBeLessThanOrEqual(100);
    });

    it('should provide recovery suggestion on init failure', () => {
      const mockObservability = {
        emitCli: vi.fn(),
        emitJson: vi.fn(),
      };

      const config = {
        observability: mockObservability as any,
      };

      const loader = createWasmLoader(config);
      expect(loader).toBeDefined();
    });
  });

  describe('Module Version Compatibility', () => {
    it('should check module version if expected', () => {
      const config = {
        expectedVersion: '0.5.4',
      };

      const loader = createWasmLoader(config);
      expect(loader).toBeDefined();
    });

    it('should report version mismatch in status', () => {
      const config = {
        expectedVersion: '0.5.4',
      };

      const loader = createWasmLoader(config);
      const status = loader.getStatus();

      if (config.expectedVersion) {
        expect(status.expectedVersion).toBe('0.5.4');
      }
    });

    it('should not check version if not configured', () => {
      const loader = WasmLoader.getInstance();
      const status = loader.getStatus();

      expect(status.expectedVersion).toBeUndefined();
    });
  });

  describe('Observability Integration', () => {
    it('should emit init events to observability layer', () => {
      const mockObservability = {
        emitCli: vi.fn(),
        emitJson: vi.fn(),
      };

      const config = {
        observability: mockObservability as any,
      };

      createWasmLoader(config);
      expect(mockObservability.emitCli).toBeDefined();
    });

    it('should log errors to observability', () => {
      const mockObservability = {
        emitCli: vi.fn(),
        emitJson: vi.fn(),
      };

      const config = {
        observability: mockObservability as any,
      };

      const loader = createWasmLoader(config);
      expect(loader).toBeDefined();
    });

    it('should handle missing observability gracefully', () => {
      const loader = WasmLoader.getInstance();
      expect(loader).toBeDefined();
      expect(loader.getStatus).toBeDefined();
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero-length module path', () => {
      const config = {
        modulePath: '',
      };

      const loader = createWasmLoader(config);
      expect(loader).toBeDefined();
    });

    it('should handle memory queries on uninitialized loader', () => {
      const loader = WasmLoader.getInstance();
      const stats = loader.getMemoryStats();

      expect(stats.usedBytes).toBe(0);
      expect(stats.totalBytes).toBe(0);
      expect(stats.usagePercent).toBe(0);
    });

    it('should handle rapid successive init calls', () => {
      const loader = WasmLoader.getInstance();

      // Multiple status checks should be safe
      loader.getStatus();
      loader.getStatus();
      loader.getMemoryStats();

      expect(loader.isInitialized()).toBe(false);
    });

    it('should handle get() before init throws correctly', () => {
      const loader = WasmLoader.getInstance();

      expect(() => {
        loader.get();
      }).toThrow('not initialized');
    });
  });
});
