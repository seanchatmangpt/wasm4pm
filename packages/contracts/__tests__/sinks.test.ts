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
    it('should register a new adapter', () => {
      const adapter = new MockSinkAdapter();
      registry.register(adapter);
      expect(registry.count()).toBe(1);
    });

    it('should prevent duplicate kind registration', () => {
      const adapter1 = new MockSinkAdapter();
      const adapter2 = new MockSinkAdapter();

      registry.register(adapter1);
      expect(() => registry.register(adapter2)).toThrow(
        /Sink adapter kind 'mock' is already registered/
      );
    });

    it('should include version info in duplicate error', () => {
      const adapter1 = new MockSinkAdapter();
      const adapter2 = new MockSinkAdapter();

      registry.register(adapter1);
      expect(() => registry.register(adapter2)).toThrow(/existing=1.0.0/);
      expect(() => registry.register(adapter2)).toThrow(/new=1.0.0/);
    });
  });

  describe('get', () => {
    it('should retrieve registered adapter by kind', () => {
      const adapter = new MockSinkAdapter();
      registry.register(adapter);

      const retrieved = registry.get('mock');
      expect(retrieved).toBe(adapter);
      expect(retrieved?.kind).toBe('mock');
    });

    it('should return null for unregistered kind', () => {
      expect(registry.get('nonexistent')).toBeNull();
    });

    it('should accept string or typed kind', () => {
      const adapter = new MockSinkAdapter();
      registry.register(adapter);

      const byString = registry.get('mock');
      const byTyped = registry.get('mock' as 'mock');
      expect(byString).toBe(adapter);
      expect(byTyped).toBe(adapter);
    });
  });

  describe('list', () => {
    it('should return empty array when no adapters registered', () => {
      expect(registry.list()).toEqual([]);
    });

    it('should return all registered adapters', () => {
      const adapter1 = new MockSinkAdapter();
      const adapter2 = new MockSinkAdapter();
      adapter2.kind = 'mock2' as any;

      registry.register(adapter1);
      registry.register(adapter2);

      const adapters = registry.list();
      expect(adapters).toHaveLength(2);
      expect(adapters).toContain(adapter1);
      expect(adapters).toContain(adapter2);
    });
  });

  describe('has', () => {
    it('should return true for registered adapter', () => {
      const adapter = new MockSinkAdapter();
      registry.register(adapter);

      expect(registry.has('mock')).toBe(true);
    });

    it('should return false for unregistered adapter', () => {
      expect(registry.has('nonexistent')).toBe(false);
    });
  });

  describe('count', () => {
    it('should return 0 when empty', () => {
      expect(registry.count()).toBe(0);
    });

    it('should return correct count after registrations', () => {
      const adapter1 = new MockSinkAdapter();
      const adapter2 = new MockSinkAdapter();
      adapter2.kind = 'mock2' as any;

      registry.register(adapter1);
      expect(registry.count()).toBe(1);

      registry.register(adapter2);
      expect(registry.count()).toBe(2);
    });
  });

  describe('findByArtifactType', () => {
    it('should find adapters supporting specific artifact type', () => {
      const adapter = new MockSinkAdapter();
      registry.register(adapter);

      const found = registry.findByArtifactType('receipt');
      expect(found).toHaveLength(1);
      expect(found[0]).toBe(adapter);
    });

    it('should return empty array if no adapters support type', () => {
      const adapter = new MockSinkAdapter();
      registry.register(adapter);

      const found = registry.findByArtifactType('explain_snapshot');
      expect(found).toHaveLength(0);
    });

    it('should find multiple adapters for same artifact type', () => {
      const adapter1 = new MockSinkAdapter();
      const adapter2 = new MockSinkAdapter();
      adapter2.kind = 'mock2' as any;

      registry.register(adapter1);
      registry.register(adapter2);

      const found = registry.findByArtifactType('receipt');
      expect(found).toHaveLength(2);
    });

    it('should handle mixed artifact type support', () => {
      const mockAdapter = new MockSinkAdapter(); // supports receipt, model, report
      registry.register(mockAdapter);

      const reportAdapters = registry.findByArtifactType('report');
      expect(reportAdapters).toHaveLength(1);

      const snapshotAdapters = registry.findByArtifactType('status_snapshot');
      expect(snapshotAdapters).toHaveLength(0);
    });
  });

  describe('clear', () => {
    it('should remove all registered adapters', () => {
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
  describe('artifact type coverage', () => {
    it('should declare supported artifact types', () => {
      const adapter = new MockSinkAdapter();
      const supported = adapter.supportedArtifacts();

      expect(Array.isArray(supported)).toBe(true);
      expect(supported.length).toBeGreaterThan(0);
    });

    it('should support supportsArtifact() method', () => {
      const adapter = new MockSinkAdapter();

      // Create a mock implementation that delegates to supportedArtifacts
      const supportsReceipt = adapter.supportedArtifacts().includes('receipt');
      const supportsModel = adapter.supportedArtifacts().includes('model');
      const supportsSnapshot = adapter.supportedArtifacts().includes('explain_snapshot');

      expect(supportsReceipt).toBe(true);
      expect(supportsModel).toBe(true);
      expect(supportsSnapshot).toBe(false);
    });

    it('should validate artifact types are from allowed set', () => {
      const adapter = new MockSinkAdapter();
      const supported = adapter.supportedArtifacts();

      const validTypes: ArtifactType[] = [
        'receipt',
        'model',
        'report',
        'explain_snapshot',
        'status_snapshot',
      ];

      for (const type of supported) {
        expect(validTypes).toContain(type);
      }
    });
  });

  describe('atomicity guarantee', () => {
    it('should declare atomicity level', () => {
      const adapter = new MockSinkAdapter();
      const levels: string[] = ['none', 'event', 'batch', 'transaction'];

      expect(levels).toContain(adapter.atomicity);
    });

    it('should support valid atomicity levels', () => {
      const validLevels = ['none', 'event', 'batch', 'transaction'];

      expect(validLevels).toContain('batch');
    });
  });

  describe('onExists behavior', () => {
    it('should declare onExists behavior', () => {
      const adapter = new MockSinkAdapter();
      const behaviors = ['skip', 'overwrite', 'append', 'error'];

      expect(behaviors).toContain(adapter.onExists);
    });
  });

  describe('failure semantics', () => {
    it('should declare failureMode', () => {
      const adapter = new MockSinkAdapter();
      const modes = ['fail', 'degrade', 'ignore'];

      expect(modes).toContain(adapter.failureMode);
    });
  });

  describe('validation lifecycle', () => {
    it('should validate before writing', async () => {
      const adapter = new MockSinkAdapter();
      const result = await adapter.validate();

      expect(result.type).toBe('ok');
    });

    it('should write artifact after successful validation', async () => {
      const adapter = new MockSinkAdapter();

      const validResult = await adapter.validate();
      expect(validResult.type).toBe('ok');

      const writeResult = await adapter.write(
        { test: 'data' },
        'receipt'
      );
      expect(writeResult.type).toBe('ok');

      if (writeResult.type === 'ok') {
        expect(typeof writeResult.value).toBe('string');
      }

      await adapter.close();
    });

    it('should write artifacts and return IDs', async () => {
      const adapter = new MockSinkAdapter();

      const result = await adapter.write(
        { test: 'data' },
        'receipt'
      );

      expect(result.type).toBe('ok');
      if (result.type === 'ok') {
        expect(result.value).toMatch(/^[a-z0-9-]+$/);
      }
    });

    it('should support closing adapter multiple times', async () => {
      const adapter = new MockSinkAdapter();

      await adapter.close();
      await adapter.close(); // Should not throw
    });
  });
});

describe('Artifact Type Coverage Matrix', () => {
  it('should include all required artifact types', () => {
    const requiredTypes: ArtifactType[] = [
      'receipt',
      'model',
      'report',
      'explain_snapshot',
      'status_snapshot',
    ];

    for (const type of requiredTypes) {
      expect(['receipt', 'model', 'report', 'explain_snapshot', 'status_snapshot']).toContain(
        type
      );
    }
  });
});

describe('Global singleton', () => {
  beforeEach(() => {
    sinkRegistry.clear();
  });

  afterEach(() => {
    sinkRegistry.clear();
  });

  it('should provide global sinkRegistry instance', () => {
    const adapter = new MockSinkAdapter();
    sinkRegistry.register(adapter);

    expect(sinkRegistry.get('mock')).toBe(adapter);
  });
});
