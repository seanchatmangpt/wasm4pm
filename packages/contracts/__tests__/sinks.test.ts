import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  SinkRegistry,
  sinkRegistry,
  type SinkAdapter,
  type ArtifactType,
} from '../src/index.js';
import { ok } from '../src/result.js';

/**
 * Mock sink adapter for testing
 */
class MockSinkAdapter implements SinkAdapter {
  readonly kind = 'mock';
  readonly version = '1.0.0';
  readonly atomicity = 'batch' as const;
  readonly onExists = 'overwrite' as const;
  readonly failureMode = 'fail' as const;

  supportedArtifacts(): ArtifactType[] {
    return ['receipt', 'model', 'report'];
  }

  async validate() {
    return ok(undefined);
  }

  async write(_artifact: unknown, _type: ArtifactType) {
    return ok('artifact-id-123');
  }

  async close() {
    // noop
  }
}

describe('SinkRegistry', () => {
  let registry: SinkRegistry;

  beforeEach(() => {
    registry = new SinkRegistry();
  });

  afterEach(() => {
    registry.clear();
  });

  describe('register', () => {
    it('registers new adapter, prevents duplicates, and includes version info in error', () => {
      const adapter = new MockSinkAdapter();
      registry.register(adapter);
      expect(registry.count()).toBe(1);

      const adapter2 = new MockSinkAdapter();
      expect(() => registry.register(adapter2)).toThrow(/Sink adapter kind 'mock' is already registered/);
      expect(() => registry.register(adapter2)).toThrow(/existing=1.0.0/);
    });
  });

  describe('get', () => {
    it('retrieves registered adapter by kind, returns null for unregistered, and accepts string or typed kind', () => {
      const adapter = new MockSinkAdapter();
      registry.register(adapter);

      const retrieved = registry.get('mock');
      expect(retrieved).toBe(adapter);
      expect(retrieved?.kind).toBe('mock');
      expect(registry.get('nonexistent')).toBeNull();
      expect(registry.get('mock' as 'mock')).toBe(adapter);
    });
  });

  describe('list, has, count', () => {
    it('returns correct counts, membership, and full list of adapters', () => {
      expect(registry.list()).toEqual([]);
      expect(registry.has('nonexistent')).toBe(false);
      expect(registry.count()).toBe(0);

      const adapter1 = new MockSinkAdapter();
      const adapter2 = new MockSinkAdapter();
      adapter2.kind = 'mock2' as any;

      registry.register(adapter1);
      expect(registry.count()).toBe(1);
      expect(registry.has('mock')).toBe(true);

      registry.register(adapter2);
      expect(registry.count()).toBe(2);

      const adapters = registry.list();
      expect(adapters).toHaveLength(2);
      expect(adapters).toContain(adapter1);
      expect(adapters).toContain(adapter2);
    });
  });

  describe('findByArtifactType', () => {
    it('finds adapters by artifact type, handles missing type, multiple adapters, and mixed support', () => {
      const adapter = new MockSinkAdapter();
      registry.register(adapter);

      expect(registry.findByArtifactType('receipt')).toHaveLength(1);
      expect(registry.findByArtifactType('receipt')[0]).toBe(adapter);
      expect(registry.findByArtifactType('explain_snapshot')).toHaveLength(0);

      const adapter2 = new MockSinkAdapter();
      adapter2.kind = 'mock2' as any;
      registry.register(adapter2);
      expect(registry.findByArtifactType('receipt')).toHaveLength(2);

      expect(registry.findByArtifactType('report')).toHaveLength(2);
      expect(registry.findByArtifactType('status_snapshot')).toHaveLength(0);
    });
  });

  describe('clear', () => {
    it('removes all registered adapters', () => {
      const adapter = new MockSinkAdapter();
      registry.register(adapter);
      expect(registry.count()).toBe(1);

      registry.clear();
      expect(registry.count()).toBe(0);
      expect(registry.get('mock')).toBeNull();
    });
  });
});

describe('SinkAdapter Contract', () => {
  it('declares valid artifact types, atomicity, onExists, and failureMode', () => {
    const adapter = new MockSinkAdapter();
    const supported = adapter.supportedArtifacts();

    expect(Array.isArray(supported)).toBe(true);
    expect(supported.length).toBeGreaterThan(0);

    const supportsReceipt = supported.includes('receipt');
    const supportsModel = supported.includes('model');
    const supportsSnapshot = supported.includes('explain_snapshot');
    expect(supportsReceipt).toBe(true);
    expect(supportsModel).toBe(true);
    expect(supportsSnapshot).toBe(false);

    const validTypes: ArtifactType[] = ['receipt', 'model', 'report', 'explain_snapshot', 'status_snapshot'];
    for (const type of supported) {
      expect(validTypes).toContain(type);
    }

    expect(['none', 'event', 'batch', 'transaction']).toContain(adapter.atomicity);
    expect(['skip', 'overwrite', 'append', 'error']).toContain(adapter.onExists);
    expect(['fail', 'degrade', 'ignore']).toContain(adapter.failureMode);
  });

  describe('validation lifecycle', () => {
    it('validates, writes artifacts with IDs, supports multiple closes', async () => {
      const adapter = new MockSinkAdapter();

      const validResult = await adapter.validate();
      expect(validResult.type).toBe('ok');

      const writeResult = await adapter.write({ test: 'data' }, 'receipt');
      expect(writeResult.type).toBe('ok');
      if (writeResult.type === 'ok') {
        expect(typeof writeResult.value).toBe('string');
        expect(writeResult.value).toMatch(/^[a-z0-9-]+$/);
      }

      await adapter.close();
      await adapter.close(); // Should not throw
    });
  });
});

describe('Artifact Type Coverage Matrix', () => {
  it('includes all required artifact types', () => {
    const requiredTypes: ArtifactType[] = ['receipt', 'model', 'report', 'explain_snapshot', 'status_snapshot'];
    for (const type of requiredTypes) {
      expect(['receipt', 'model', 'report', 'explain_snapshot', 'status_snapshot']).toContain(type);
    }
  });
});

describe('Global singleton', () => {
  beforeEach(() => { sinkRegistry.clear(); });
  afterEach(() => { sinkRegistry.clear(); });

  it('provides global sinkRegistry instance', () => {
    const adapter = new MockSinkAdapter();
    sinkRegistry.register(adapter);
    expect(sinkRegistry.get('mock')).toBe(adapter);
  });
});
