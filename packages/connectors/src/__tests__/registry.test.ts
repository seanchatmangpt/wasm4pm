/**
 * Source Registry Tests
 * Tests for adapter registration and discovery
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createSourceRegistry, ExtendedSourceRegistry } from '../registry.js';
import { FileSourceAdapter } from '../file-source.js';
import { SourceRegistry } from '@wasm4pm/contracts';

describe('ExtendedSourceRegistry', () => {
  describe('initialization', () => {
    it('should create registry with built-in adapters', () => {
      const registry = createSourceRegistry();
      expect(registry).toBeDefined();
      expect(registry instanceof ExtendedSourceRegistry).toBe(true);
    });

    it('should register file adapter automatically', () => {
      const registry = createSourceRegistry();
      const adapter = registry.get('file');
      expect(adapter).toBeDefined();
      expect(adapter?.kind).toBe('file');
    });

    it('should count registered adapters', () => {
      const registry = createSourceRegistry();
      expect(registry.count()).toBeGreaterThan(0);
    });
  });

  describe('get()', () => {
    it('should retrieve registered adapter by kind', () => {
      const registry = createSourceRegistry();
      const adapter = registry.get('file');

      expect(adapter).toBeDefined();
      expect(adapter?.kind).toBe('file');
      expect(adapter?.version).toBe('1.0.0');
    });

    it('should return null for unregistered kind', () => {
      const registry = createSourceRegistry();
      const adapter = registry.get('nonexistent');
      expect(adapter).toBeNull();
    });

    it('should support string lookup', () => {
      const registry = createSourceRegistry();
      const adapter = registry.get('file' as any);
      expect(adapter).toBeDefined();
    });
  });

  describe('list()', () => {
    it('should list all registered adapters', () => {
      const registry = createSourceRegistry();
      const adapters = registry.list();

      expect(Array.isArray(adapters)).toBe(true);
      expect(adapters.length).toBeGreaterThan(0);
      expect(adapters.every((a) => a.kind !== undefined)).toBe(true);
    });

    it('should include file adapter in list', () => {
      const registry = createSourceRegistry();
      const adapters = registry.list();
      const fileAdapter = adapters.find((a) => a.kind === 'file');

      expect(fileAdapter).toBeDefined();
    });
  });

  describe('has()', () => {
    it('should check if adapter kind is registered', () => {
      const registry = createSourceRegistry();
      expect(registry.has('file')).toBe(true);
      expect(registry.has('nonexistent')).toBe(false);
    });
  });

  describe('register()', () => {
    it('should register new adapters', () => {
      const registry = new ExtendedSourceRegistry();
      expect(registry.has('file')).toBe(false);

      const adapter = new FileSourceAdapter({ filePath: '/tmp/test.json' });
      registry.register(adapter);

      expect(registry.has('file')).toBe(true);
      expect(registry.get('file')).toBe(adapter);
    });

    it('should prevent duplicate registration', () => {
      const registry = new ExtendedSourceRegistry();
      const adapter1 = new FileSourceAdapter({ filePath: '/tmp/test1.json' });
      const adapter2 = new FileSourceAdapter({ filePath: '/tmp/test2.json' });

      registry.register(adapter1);
      expect(() => registry.register(adapter2)).toThrow();
    });

    it('should throw error with versions in message on duplicate', () => {
      const registry = new ExtendedSourceRegistry();
      const adapter1 = new FileSourceAdapter({ filePath: '/tmp/test1.json' });
      const adapter2 = new FileSourceAdapter({ filePath: '/tmp/test2.json' });

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
      const registry = createSourceRegistry();
      expect(registry.count()).toBeGreaterThan(0);

      registry.clear();
      expect(registry.count()).toBe(0);
    });

    it('should allow re-registration after clear', () => {
      const registry = createSourceRegistry();
      registry.clear();

      const adapter = new FileSourceAdapter({ filePath: '/tmp/test.json' });
      registry.register(adapter);

      expect(registry.get('file')).toBe(adapter);
    });
  });

  describe('FileSourceAdapter registration', () => {
    it('should have correct kind identifier', () => {
      const adapter = new FileSourceAdapter({ filePath: '/tmp/test.json' });
      expect(adapter.kind).toBe('file');
    });

    it('should have version string', () => {
      const adapter = new FileSourceAdapter({ filePath: '/tmp/test.json' });
      expect(typeof adapter.version).toBe('string');
      expect(adapter.version).toMatch(/^\d+\.\d+\.\d+$/);
    });

    it('should be discoverable by kind', () => {
      const registry = createSourceRegistry();
      const adapter = registry.get('file');

      expect(adapter).toBeDefined();
      expect(adapter?.kind).toBe('file');
    });
  });

  describe('adapter capabilities', () => {
    it('should declare capabilities correctly', () => {
      const registry = createSourceRegistry();
      const adapter = registry.get('file');

      expect(adapter).toBeDefined();
      if (adapter) {
        const caps = adapter.capabilities();
        expect(caps.streaming).toBe(true);
        expect(caps.checkpoint).toBe(true);
        expect(typeof caps.filtering).toBe('boolean');
      }
    });
  });
});
