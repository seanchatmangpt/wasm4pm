import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  SourceRegistry,
  sourceRegistry,
  type SourceAdapter,
  type EventStream,
  type Capabilities,
} from '../src/index.js';
import { ok, err } from '../src/result.js';

/**
 * Mock source adapter for testing
 */
class MockSourceAdapter implements SourceAdapter {
  readonly kind = 'mock';
  readonly version = '1.0.0';

  capabilities(): Capabilities {
    return {
      streaming: true,
      checkpoint: true,
      filtering: false,
    };
  }

  async fingerprint(_source: unknown): Promise<string> {
    return 'a'.repeat(64); // BLAKE3 hash format
  }

  async validate() {
    return ok(undefined);
  }

  async open() {
    const stream: EventStream = {
      next: async () => ok({ events: [], hasMore: false }),
      checkpoint: async () => ok(''),
      seek: async () => ok(undefined),
      close: async () => {},
    };
    return ok(stream);
  }

  async close() {
    // noop
  }
}

describe('SourceRegistry', () => {
  let registry: SourceRegistry;

  beforeEach(() => {
    registry = new SourceRegistry();
  });

  afterEach(() => {
    registry.clear();
  });

  describe('register', () => {
    it('should register a new adapter', () => {
      const adapter = new MockSourceAdapter();
      registry.register(adapter);
      expect(registry.count()).toBe(1);
    });

    it('should prevent duplicate kind registration', () => {
      const adapter1 = new MockSourceAdapter();
      const adapter2 = new MockSourceAdapter();

      registry.register(adapter1);
      expect(() => registry.register(adapter2)).toThrow(
        /Source adapter kind 'mock' is already registered/
      );
    });

    it('should include version info in duplicate error', () => {
      const adapter1 = new MockSourceAdapter();
      const adapter2 = new MockSourceAdapter();

      registry.register(adapter1);
      expect(() => registry.register(adapter2)).toThrow(/existing=1.0.0/);
      expect(() => registry.register(adapter2)).toThrow(/new=1.0.0/);
    });
  });

  describe('get', () => {
    it('should retrieve registered adapter by kind', () => {
      const adapter = new MockSourceAdapter();
      registry.register(adapter);

      const retrieved = registry.get('mock');
      expect(retrieved).toBe(adapter);
      expect(retrieved?.kind).toBe('mock');
    });

    it('should return null for unregistered kind', () => {
      expect(registry.get('nonexistent')).toBeNull();
    });

    it('should accept string or typed kind', () => {
      const adapter = new MockSourceAdapter();
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
      const adapter1 = new MockSourceAdapter();
      const adapter2 = new MockSourceAdapter();
      adapter2.kind = 'mock2' as any; // Change kind for uniqueness

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
      const adapter = new MockSourceAdapter();
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
      const adapter1 = new MockSourceAdapter();
      const adapter2 = new MockSourceAdapter();
      adapter2.kind = 'mock2' as any;

      registry.register(adapter1);
      expect(registry.count()).toBe(1);

      registry.register(adapter2);
      expect(registry.count()).toBe(2);
    });
  });

  describe('clear', () => {
    it('should remove all registered adapters', () => {
      const adapter = new MockSourceAdapter();
      registry.register(adapter);
      expect(registry.count()).toBe(1);

      registry.clear();
      expect(registry.count()).toBe(0);
      expect(registry.get('mock')).toBeNull();
    });
  });
});

describe('SourceAdapter Contract', () => {
  describe('capabilities validation', () => {
    it('should report capabilities correctly', () => {
      const adapter = new MockSourceAdapter();
      const caps = adapter.capabilities();

      expect(caps).toHaveProperty('streaming');
      expect(caps).toHaveProperty('checkpoint');
      expect(caps).toHaveProperty('filtering');
      expect(typeof caps.streaming).toBe('boolean');
      expect(typeof caps.checkpoint).toBe('boolean');
      expect(typeof caps.filtering).toBe('boolean');
    });
  });

  describe('fingerprint', () => {
    it('should return deterministic fingerprint', async () => {
      const adapter = new MockSourceAdapter();
      const source = { path: '/test/data.xes' };

      const fp1 = await adapter.fingerprint(source);
      const fp2 = await adapter.fingerprint(source);

      expect(fp1).toBe(fp2);
    });

    it('should return BLAKE3 format (64-char hex)', async () => {
      const adapter = new MockSourceAdapter();
      const fp = await adapter.fingerprint({});

      expect(fp).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('validation lifecycle', () => {
    it('should validate configuration', async () => {
      const adapter = new MockSourceAdapter();
      const result = await adapter.validate();

      expect(result.type).toBe('ok');
      expect(result).toHaveProperty('value');
    });

    it('should open after successful validation', async () => {
      const adapter = new MockSourceAdapter();

      const validResult = await adapter.validate();
      expect(validResult.type).toBe('ok');

      const openResult = await adapter.open();
      expect(openResult.type).toBe('ok');

      if (openResult.type === 'ok') {
        await openResult.value.close();
      }
    });
  });

  describe('EventStream interface', () => {
    it('should implement EventStream contract', async () => {
      const adapter = new MockSourceAdapter();
      const openResult = await adapter.open();

      expect(openResult.type).toBe('ok');
      if (openResult.type !== 'ok') return;

      const stream = openResult.value;

      expect(stream).toHaveProperty('next');
      expect(stream).toHaveProperty('checkpoint');
      expect(stream).toHaveProperty('seek');
      expect(stream).toHaveProperty('close');

      expect(typeof stream.next).toBe('function');
      expect(typeof stream.checkpoint).toBe('function');
      expect(typeof stream.seek).toBe('function');
      expect(typeof stream.close).toBe('function');

      await stream.close();
    });

    it('should return correct next() structure', async () => {
      const adapter = new MockSourceAdapter();
      const openResult = await adapter.open();

      if (openResult.type !== 'ok') return;

      const stream = openResult.value;
      const nextResult = await stream.next();

      expect(nextResult.type).toBe('ok');
      if (nextResult.type === 'ok') {
        expect(nextResult.value).toHaveProperty('events');
        expect(nextResult.value).toHaveProperty('hasMore');
        expect(Array.isArray(nextResult.value.events)).toBe(true);
        expect(typeof nextResult.value.hasMore).toBe('boolean');
      }

      await stream.close();
    });
  });
});

describe('Global singleton', () => {
  beforeEach(() => {
    sourceRegistry.clear();
  });

  afterEach(() => {
    sourceRegistry.clear();
  });

  it('should provide global sourceRegistry instance', () => {
    const adapter = new MockSourceAdapter();
    sourceRegistry.register(adapter);

    expect(sourceRegistry.get('mock')).toBe(adapter);
  });
});
