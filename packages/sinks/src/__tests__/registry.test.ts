/**
 * Sink Registry Tests
 * Tests for sink adapter registration and discovery
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { tmpdir } from 'os';
import { join } from 'path';
import { createSinkRegistry, ExtendedSinkRegistry } from '../registry.js';
import { FileLogSinkAdapter } from '../file-log-sink.js';
import { SinkRegistry } from '@wasm4pm/contracts';

describe('ExtendedSinkRegistry', () => {
  describe('initialization', () => {
    it('should create registry with built-in adapters', () => {
      const tempDir = join(tmpdir(), `wasm4pm-sink-reg-${Date.now()}`);
      const registry = createSinkRegistry({ directory: tempDir });
      expect(registry).toBeDefined();
      expect(registry instanceof ExtendedSinkRegistry).toBe(true);
    });

    it('should register file adapter automatically', () => {
      const tempDir = join(tmpdir(), `wasm4pm-sink-reg-${Date.now()}`);
      const registry = createSinkRegistry({ directory: tempDir });
      const adapter = registry.get('file');
      expect(adapter).toBeDefined();
      expect(adapter?.kind).toBe('file');
    });

    it('should count registered adapters', () => {
      const tempDir = join(tmpdir(), `wasm4pm-sink-reg-${Date.now()}`);
      const registry = createSinkRegistry({ directory: tempDir });
      expect(registry.count()).toBeGreaterThan(0);
    });

    it('should accept configuration during initialization', () => {
      const tempDir = join(tmpdir(), `wasm4pm-sink-reg-${Date.now()}`);
      const registry = createSinkRegistry({
        directory: tempDir,
        onExists: 'overwrite',
      });
      expect(registry).toBeDefined();
    });
  });

  describe('get()', () => {
    it('should retrieve registered adapter by kind', () => {
      const tempDir = join(tmpdir(), `wasm4pm-sink-reg-${Date.now()}`);
      const registry = createSinkRegistry({ directory: tempDir });
      const adapter = registry.get('file');

      expect(adapter).toBeDefined();
      expect(adapter?.kind).toBe('file');
      expect(adapter?.version).toBe('1.0.0');
    });

    it('should return null for unregistered kind', () => {
      const tempDir = join(tmpdir(), `wasm4pm-sink-reg-${Date.now()}`);
      const registry = createSinkRegistry({ directory: tempDir });
      const adapter = registry.get('nonexistent');
      expect(adapter).toBeNull();
    });

    it('should support string lookup', () => {
      const tempDir = join(tmpdir(), `wasm4pm-sink-reg-${Date.now()}`);
      const registry = createSinkRegistry({ directory: tempDir });
      const adapter = registry.get('file' as any);
      expect(adapter).toBeDefined();
    });
  });

  describe('list()', () => {
    it('should list all registered adapters', () => {
      const tempDir = join(tmpdir(), `wasm4pm-sink-reg-${Date.now()}`);
      const registry = createSinkRegistry({ directory: tempDir });
      const adapters = registry.list();

      expect(Array.isArray(adapters)).toBe(true);
      expect(adapters.length).toBeGreaterThan(0);
      expect(adapters.every((a) => a.kind !== undefined)).toBe(true);
    });

    it('should include file adapter in list', () => {
      const tempDir = join(tmpdir(), `wasm4pm-sink-reg-${Date.now()}`);
      const registry = createSinkRegistry({ directory: tempDir });
      const adapters = registry.list();
      const fileAdapter = adapters.find((a) => a.kind === 'file');

      expect(fileAdapter).toBeDefined();
    });
  });

  describe('has()', () => {
    it('should check if adapter kind is registered', () => {
      const tempDir = join(tmpdir(), `wasm4pm-sink-reg-${Date.now()}`);
      const registry = createSinkRegistry({ directory: tempDir });
      expect(registry.has('file')).toBe(true);
      expect(registry.has('nonexistent')).toBe(false);
    });
  });

  describe('register()', () => {
    it('should register new adapters', () => {
      const tempDir = join(tmpdir(), `wasm4pm-sink-reg-${Date.now()}`);
      const registry = new ExtendedSinkRegistry();
      expect(registry.has('file')).toBe(false);

      const adapter = new FileLogSinkAdapter({ directory: tempDir });
      registry.register(adapter);

      expect(registry.has('file')).toBe(true);
      expect(registry.get('file')).toBe(adapter);
    });

    it('should prevent duplicate registration', () => {
      const tempDir = join(tmpdir(), `wasm4pm-sink-reg-${Date.now()}`);
      const registry = new ExtendedSinkRegistry();
      const adapter1 = new FileLogSinkAdapter({ directory: tempDir });
      const adapter2 = new FileLogSinkAdapter({ directory: tempDir });

      registry.register(adapter1);
      expect(() => registry.register(adapter2)).toThrow();
    });

    it('should throw error with versions in message on duplicate', () => {
      const tempDir = join(tmpdir(), `wasm4pm-sink-reg-${Date.now()}`);
      const registry = new ExtendedSinkRegistry();
      const adapter1 = new FileLogSinkAdapter({ directory: tempDir });
      const adapter2 = new FileLogSinkAdapter({ directory: tempDir });

      registry.register(adapter1);
      try {
        registry.register(adapter2);
        expect.fail('Should have thrown');
      } catch (e) {
        const message = (e as any).message;
        expect(message).toContain('file');
        expect(message).toContain('already registered');
      }
    });
  });

  describe('clear()', () => {
    it('should clear all registered adapters', () => {
      const tempDir = join(tmpdir(), `wasm4pm-sink-reg-${Date.now()}`);
      const registry = createSinkRegistry({ directory: tempDir });
      expect(registry.count()).toBeGreaterThan(0);

      registry.clear();
      expect(registry.count()).toBe(0);
    });

    it('should allow re-registration after clear', () => {
      const tempDir = join(tmpdir(), `wasm4pm-sink-reg-${Date.now()}`);
      const registry = createSinkRegistry({ directory: tempDir });
      registry.clear();

      const adapter = new FileLogSinkAdapter({ directory: tempDir });
      registry.register(adapter);

      expect(registry.get('file')).toBe(adapter);
    });
  });

  describe('findByArtifactType()', () => {
    it('should find adapters supporting receipt artifacts', () => {
      const tempDir = join(tmpdir(), `wasm4pm-sink-reg-${Date.now()}`);
      const registry = createSinkRegistry({ directory: tempDir });
      const adapters = registry.findByArtifactType('receipt');

      expect(adapters.length).toBeGreaterThan(0);
      expect(adapters[0].supportsArtifact('receipt')).toBe(true);
    });

    it('should find adapters supporting model artifacts', () => {
      const tempDir = join(tmpdir(), `wasm4pm-sink-reg-${Date.now()}`);
      const registry = createSinkRegistry({ directory: tempDir });
      const adapters = registry.findByArtifactType('model');

      expect(adapters.length).toBeGreaterThan(0);
      expect(adapters[0].supportsArtifact('model')).toBe(true);
    });

    it('should find adapters supporting report artifacts', () => {
      const tempDir = join(tmpdir(), `wasm4pm-sink-reg-${Date.now()}`);
      const registry = createSinkRegistry({ directory: tempDir });
      const adapters = registry.findByArtifactType('report');

      expect(adapters.length).toBeGreaterThan(0);
      expect(adapters[0].supportsArtifact('report')).toBe(true);
    });

    it('should return empty array for unsupported artifact type', () => {
      const tempDir = join(tmpdir(), `wasm4pm-sink-reg-${Date.now()}`);
      const registry = new ExtendedSinkRegistry();
      const adapters = registry.findByArtifactType('report');

      expect(Array.isArray(adapters)).toBe(true);
      expect(adapters.length).toBe(0);
    });
  });

  describe('FileLogSinkAdapter registration', () => {
    it('should have correct kind identifier', () => {
      const tempDir = join(tmpdir(), `wasm4pm-sink-reg-${Date.now()}`);
      const adapter = new FileLogSinkAdapter({ directory: tempDir });
      expect(adapter.kind).toBe('file');
    });

    it('should have version string', () => {
      const tempDir = join(tmpdir(), `wasm4pm-sink-reg-${Date.now()}`);
      const adapter = new FileLogSinkAdapter({ directory: tempDir });
      expect(typeof adapter.version).toBe('string');
      expect(adapter.version).toMatch(/^\d+\.\d+\.\d+$/);
    });

    it('should be discoverable by kind', () => {
      const tempDir = join(tmpdir(), `wasm4pm-sink-reg-${Date.now()}`);
      const registry = createSinkRegistry({ directory: tempDir });
      const adapter = registry.get('file');

      expect(adapter).toBeDefined();
      expect(adapter?.kind).toBe('file');
    });
  });

  describe('adapter properties', () => {
    it('should declare atomicity correctly', () => {
      const tempDir = join(tmpdir(), `wasm4pm-sink-reg-${Date.now()}`);
      const registry = createSinkRegistry({ directory: tempDir });
      const adapter = registry.get('file');

      expect(adapter).toBeDefined();
      if (adapter) {
        expect(adapter.atomicity).toBe('batch');
      }
    });

    it('should declare onExists behavior', () => {
      const tempDir = join(tmpdir(), `wasm4pm-sink-reg-${Date.now()}`);
      const registry = createSinkRegistry({ directory: tempDir });
      const adapter = registry.get('file');

      expect(adapter).toBeDefined();
      if (adapter) {
        expect(['skip', 'overwrite', 'append', 'error']).toContain(adapter.onExists);
      }
    });

    it('should declare failureMode', () => {
      const tempDir = join(tmpdir(), `wasm4pm-sink-reg-${Date.now()}`);
      const registry = createSinkRegistry({ directory: tempDir });
      const adapter = registry.get('file');

      expect(adapter).toBeDefined();
      if (adapter) {
        expect(['fail', 'degrade', 'ignore']).toContain(adapter.failureMode);
      }
    });

    it('should list all supported artifact types', () => {
      const tempDir = join(tmpdir(), `wasm4pm-sink-reg-${Date.now()}`);
      const registry = createSinkRegistry({ directory: tempDir });
      const adapter = registry.get('file');

      expect(adapter).toBeDefined();
      if (adapter) {
        const supported = adapter.supportedArtifacts();
        expect(Array.isArray(supported)).toBe(true);
        expect(supported.length).toBeGreaterThan(0);
      }
    });
  });

  describe('supportsArtifact helper', () => {
    it('should check artifact support via helper function', () => {
      const tempDir = join(tmpdir(), `wasm4pm-sink-reg-${Date.now()}`);
      const registry = createSinkRegistry({ directory: tempDir });
      const adapter = registry.get('file');

      expect(adapter).toBeDefined();
      if (adapter) {
        expect(adapter.supportsArtifact('receipt')).toBe(true);
        expect(adapter.supportsArtifact('model')).toBe(true);
        expect(adapter.supportsArtifact('report')).toBe(true);
      }
    });
  });
});
