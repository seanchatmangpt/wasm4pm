/**
 * wasm-loader.test.ts
 * Tests for WASM module initialization, lifecycle, and error handling
 *
 * Chicago TDD: tests observable behavior (singleton identity, state transitions,
 * error messages, memory stats), not internal implementation.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  WasmLoader,
  WasmModule,
  WasmErrorCode,
  createWasmLoader,
  getWasmLoader,
} from './wasm-loader.js';

/**
 * Minimal WASM module for testing — real interface, not mocks of internals
 */
class TestWasmModule implements WasmModule {
  memory: { buffer: ArrayBuffer; maximum?: number };
  version?: () => string;
  init?: () => void;
  [key: string]: unknown;

  constructor(versionString?: string) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const WasmMemoryConstructor = (globalThis as any).WebAssembly?.Memory as
        | (new (opts: { initial: number; maximum: number }) => { buffer: ArrayBuffer; maximum?: number })
        | undefined;
      if (WasmMemoryConstructor) {
        this.memory = new WasmMemoryConstructor({ initial: 256, maximum: 512 });
      } else {
        this.memory = { buffer: new ArrayBuffer(256 * 64 * 1024) };
      }
    } catch {
      this.memory = { buffer: new ArrayBuffer(256 * 64 * 1024) };
    }
    if (versionString) {
      this.version = () => versionString;
    }
  }
}

describe('WasmLoader', () => {
  beforeEach(() => {
    WasmLoader.reset();
  });

  afterEach(() => {
    WasmLoader.reset();
  });

  describe('Singleton Pattern', () => {
    it('returns same instance on multiple calls', () => {
      const loader1 = WasmLoader.getInstance();
      const loader2 = WasmLoader.getInstance();
      expect(loader1).toBe(loader2);
    });

    it('creates new instance after reset', () => {
      const loader1 = WasmLoader.getInstance();
      WasmLoader.reset();
      const loader2 = WasmLoader.getInstance();
      expect(loader1).not.toBe(loader2);
    });

    it('createWasmLoader returns singleton', () => {
      const a = createWasmLoader();
      const b = getWasmLoader();
      expect(a).toBe(b);
    });
  });

  describe('State Transitions', () => {
    it('starts uninitialized', () => {
      expect(WasmLoader.getInstance().isInitialized()).toBe(false);
    });

    it('get() throws before init with descriptive message', () => {
      expect(() => WasmLoader.getInstance().get()).toThrow('not initialized');
    });

    it('softReset clears initialized flag but keeps instance', () => {
      const loader = WasmLoader.getInstance();
      loader.softReset();
      expect(loader.isInitialized()).toBe(false);
      // Still same singleton
      expect(loader).toBe(WasmLoader.getInstance());
    });
  });

  describe('Status Reporting', () => {
    it('uninitialized loader reports false + zero memory', () => {
      const status = WasmLoader.getInstance().getStatus();
      expect(status.initialized).toBe(false);
      expect(status.memoryPages).toBe(0);
      expect(status.memoryUsagePercent).toBe(0);
    });

    it('status includes a valid runtime environment', () => {
      const status = WasmLoader.getInstance().getStatus();
      expect(['browser', 'nodejs', 'wasi']).toContain(status.runtimeEnvironment);
    });

    it('status reports expectedVersion when configured', () => {
      const loader = createWasmLoader({ expectedVersion: '0.5.4' });
      expect(loader.getStatus().expectedVersion).toBe('0.5.4');
    });

    it('status omits expectedVersion when not configured', () => {
      expect(WasmLoader.getInstance().getStatus().expectedVersion).toBeUndefined();
    });
  });

  describe('Memory Stats', () => {
    it('uninitialized loader reports zero bytes', () => {
      const stats = WasmLoader.getInstance().getMemoryStats();
      expect(stats.usedBytes).toBe(0);
      expect(stats.totalBytes).toBe(0);
      expect(stats.usagePercent).toBe(0);
    });

    it('memory stats usagePercent stays in [0, 100]', () => {
      const stats = WasmLoader.getInstance().getMemoryStats();
      expect(stats.usagePercent).toBeGreaterThanOrEqual(0);
      expect(stats.usagePercent).toBeLessThanOrEqual(100);
    });

    it('real WASM memory is readable and writable', () => {
      const mod = new TestWasmModule();
      const view = new Uint8Array(mod.memory.buffer, 0, 10);
      view[0] = 42;
      expect(view[0]).toBe(42);
    });
  });

  describe('Error Codes', () => {
    it('all WASM error codes map to system error (5)', () => {
      expect(WasmErrorCode.WASM_INIT_FAILED).toBe(5);
      expect(WasmErrorCode.WASM_MEMORY_EXCEEDED).toBe(5);
      expect(WasmErrorCode.WASM_VERSION_MISMATCH).toBe(5);
    });
  });

  describe('Runtime Detection', () => {
    it('detects Node.js in test environment', () => {
      if (typeof process !== 'undefined' && process.versions?.node) {
        expect(WasmLoader.getInstance().getStatus().runtimeEnvironment).toBe('nodejs');
      }
    });
  });

  describe('Concurrent Access Safety', () => {
    it('rapid successive status queries are safe', () => {
      const loader = WasmLoader.getInstance();
      for (let i = 0; i < 10; i++) {
        loader.getStatus();
        loader.getMemoryStats();
      }
      expect(loader.isInitialized()).toBe(false);
    });
  });
});
