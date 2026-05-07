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
    it('registers new adapter, prevents duplicates, and includes version info in error', () => {
      const adapter = new MockSourceAdapter();
      registry.register(adapter);
      expect(registry.count()).toBe(1);

      const adapter2 = new MockSourceAdapter();
      expect(() => registry.register(adapter2)).toThrow(/Source adapter kind 'mock' is already registered/);
      expect(() => registry.register(adapter2)).toThrow(/existing=1.0.0/);
    });
  });

  describe('get', () => {
    it('retrieves registered adapter by kind, returns null for unregistered, and accepts string or typed kind', () => {
      const adapter = new MockSourceAdapter();
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

      const adapter1 = new MockSourceAdapter();
      const adapter2 = new MockSourceAdapter();
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

  describe('clear', () => {
    it('removes all registered adapters', () => {
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
  it('reports capabilities, returns deterministic BLAKE3 fingerprint, and validates configuration', async () => {
    const adapter = new MockSourceAdapter();
    const caps = adapter.capabilities();

    expect(caps).toHaveProperty('streaming');
    expect(caps).toHaveProperty('checkpoint');
    expect(caps).toHaveProperty('filtering');
    expect(typeof caps.streaming).toBe('boolean');
    expect(typeof caps.checkpoint).toBe('boolean');
    expect(typeof caps.filtering).toBe('boolean');

    const source = { path: '/test/data.xes' };
    const fp1 = await adapter.fingerprint(source);
    const fp2 = await adapter.fingerprint(source);
    expect(fp1).toBe(fp2);
    expect(fp1).toMatch(/^[a-f0-9]{64}$/);

    const validResult = await adapter.validate();
    expect(validResult.type).toBe('ok');
    expect(validResult).toHaveProperty('value');

    const openResult = await adapter.open();
    expect(openResult.type).toBe('ok');
    if (openResult.type === 'ok') {
      await openResult.value.close();
    }
  });

  describe('EventStream interface', () => {
    it('implements EventStream contract with correct next() structure', async () => {
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
  beforeEach(() => { sourceRegistry.clear(); });
  afterEach(() => { sourceRegistry.clear(); });

  it('provides global sourceRegistry instance', () => {
    const adapter = new MockSourceAdapter();
    sourceRegistry.register(adapter);
    expect(sourceRegistry.get('mock')).toBe(adapter);
  });
});
