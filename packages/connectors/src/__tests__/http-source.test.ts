/**
 * HttpSourceAdapter Tests
 * Tests for fetching event logs over HTTP with auth and retry
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HttpSourceAdapter } from '../http-source.js';
import { isOk } from '@wasm4pm/contracts';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('HttpSourceAdapter', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe('initialization', () => {
    it('should create adapter with default config', () => {
      const adapter = new HttpSourceAdapter({ url: 'https://example.com/events' });
      expect(adapter.kind).toBe('http');
      expect(adapter.version).toBe('1.0.0');
    });

    it('should have correct capabilities', () => {
      const adapter = new HttpSourceAdapter({ url: 'https://example.com/events' });
      const caps = adapter.capabilities();
      expect(caps.streaming).toBe(false);
      expect(caps.checkpoint).toBe(true);
      expect(caps.filtering).toBe(false);
    });

    it('should have retry strategy configured', () => {
      const adapter = new HttpSourceAdapter({ url: 'https://example.com/events' });
      expect(adapter.retry).toBeDefined();
      expect(adapter.retry?.maxAttempts).toBe(3);
      expect(adapter.retry?.backoff).toBe('exponential');
    });
  });

  describe('validate()', () => {
    it('should validate a proper URL', async () => {
      const adapter = new HttpSourceAdapter({ url: 'https://example.com/events' });
      const result = await adapter.validate();
      expect(isOk(result)).toBe(true);
    });

    it('should fail on invalid URL', async () => {
      const adapter = new HttpSourceAdapter({ url: 'not-a-url' });
      const result = await adapter.validate();
      expect(isOk(result)).toBe(false);
      if (result.type === 'error') {
        expect(result.error.code).toBe('SOURCE_INVALID');
      }
    });

    it('should validate bearer auth', async () => {
      const adapter = new HttpSourceAdapter({
        url: 'https://example.com/events',
        auth: { type: 'bearer', token: 'valid-token' },
      });
      const result = await adapter.validate();
      expect(isOk(result)).toBe(true);
    });

    it('should fail on empty bearer token', async () => {
      const adapter = new HttpSourceAdapter({
        url: 'https://example.com/events',
        auth: { type: 'bearer', token: '' },
      });
      const result = await adapter.validate();
      expect(isOk(result)).toBe(false);
    });
  });

  describe('fingerprint()', () => {
    it('should generate consistent fingerprints', async () => {
      const adapter = new HttpSourceAdapter({ url: 'https://example.com/events' });
      const fp1 = await adapter.fingerprint({ id: 1 });
      const fp2 = await adapter.fingerprint({ id: 1 });
      expect(fp1).toBe(fp2);
      expect(fp1).toHaveLength(64);
    });

    it('should generate different fingerprints for different URLs', async () => {
      const adapter1 = new HttpSourceAdapter({ url: 'https://example.com/a' });
      const adapter2 = new HttpSourceAdapter({ url: 'https://example.com/b' });
      const fp1 = await adapter1.fingerprint({});
      const fp2 = await adapter2.fingerprint({});
      expect(fp1).not.toBe(fp2);
    });
  });

  describe('open()', () => {
    it('should fetch JSON array and return EventStream', async () => {
      const events = [{ id: 1, activity: 'start' }, { id: 2, activity: 'end' }];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify(events),
      });

      const adapter = new HttpSourceAdapter({ url: 'https://example.com/events' });
      const result = await adapter.open();

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        const stream = result.value;
        const batch = await stream.next();
        expect(isOk(batch)).toBe(true);
        if (isOk(batch)) {
          expect(batch.value.events).toHaveLength(2);
          expect(batch.value.hasMore).toBe(false);
        }
        await stream.close();
      }
    });

    it('should fetch newline-delimited JSON', async () => {
      const content = '{"id":1}\n{"id":2}\n{"id":3}';
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => content,
      });

      const adapter = new HttpSourceAdapter({ url: 'https://example.com/events' });
      const result = await adapter.open();

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        const stream = result.value;
        const batch = await stream.next();
        expect(isOk(batch)).toBe(true);
        if (isOk(batch)) {
          expect(batch.value.events).toHaveLength(3);
        }
        await stream.close();
      }
    });

    it('should fail on 404', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      const adapter = new HttpSourceAdapter({ url: 'https://example.com/missing' });
      const result = await adapter.open();

      expect(isOk(result)).toBe(false);
      if (result.type === 'error') {
        expect(result.error.code).toBe('SOURCE_INVALID');
      }
    });

    it('should retry on 500 errors', async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: false, status: 500, statusText: 'Server Error' })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => '[]',
        });

      const adapter = new HttpSourceAdapter({
        url: 'https://example.com/events',
      });
      // Override retry delay for faster test
      (adapter as any).retry.initialDelayMs = 1;

      const result = await adapter.open();
      expect(isOk(result)).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should include bearer auth header', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => '[]',
      });

      const adapter = new HttpSourceAdapter({
        url: 'https://example.com/events',
        auth: { type: 'bearer', token: 'my-token' },
      });
      await adapter.open();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/events',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer my-token',
          }),
        }),
      );
    });

    it('should include basic auth header', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => '[]',
      });

      const adapter = new HttpSourceAdapter({
        url: 'https://example.com/events',
        auth: { type: 'basic', username: 'user', password: 'pass' },
      });
      await adapter.open();

      const expectedAuth = `Basic ${Buffer.from('user:pass').toString('base64')}`;
      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/events',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: expectedAuth,
          }),
        }),
      );
    });

    it('should send POST body when method is POST', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => '[]',
      });

      const adapter = new HttpSourceAdapter({
        url: 'https://example.com/events',
        method: 'POST',
        body: '{"query":"all"}',
      });
      await adapter.open();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/events',
        expect.objectContaining({
          method: 'POST',
          body: '{"query":"all"}',
        }),
      );
    });
  });

  describe('EventStream operations', () => {
    it('should support checkpoint and seek', async () => {
      const events = Array.from({ length: 150 }, (_, i) => ({ id: i }));
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify(events),
      });

      const adapter = new HttpSourceAdapter({ url: 'https://example.com/events' });
      const result = await adapter.open();
      expect(isOk(result)).toBe(true);

      if (isOk(result)) {
        const stream = result.value;

        // Read first batch (100 events)
        const batch1 = await stream.next();
        expect(isOk(batch1)).toBe(true);
        if (isOk(batch1)) {
          expect(batch1.value.events).toHaveLength(100);
          expect(batch1.value.hasMore).toBe(true);
        }

        // Checkpoint
        const cp = await stream.checkpoint();
        expect(isOk(cp)).toBe(true);

        // Read second batch (50 events)
        const batch2 = await stream.next();
        expect(isOk(batch2)).toBe(true);
        if (isOk(batch2)) {
          expect(batch2.value.events).toHaveLength(50);
          expect(batch2.value.hasMore).toBe(false);
        }

        // Seek back
        if (isOk(cp)) {
          const seekResult = await stream.seek(cp.value);
          expect(isOk(seekResult)).toBe(true);
        }

        await stream.close();
      }
    });

    it('should error after close', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => '[{"id":1}]',
      });

      const adapter = new HttpSourceAdapter({ url: 'https://example.com/events' });
      const result = await adapter.open();
      expect(isOk(result)).toBe(true);

      if (isOk(result)) {
        const stream = result.value;
        await stream.close();

        const nextResult = await stream.next();
        expect(isOk(nextResult)).toBe(false);
      }
    });
  });

  describe('close()', () => {
    it('should close safely', async () => {
      const adapter = new HttpSourceAdapter({ url: 'https://example.com/events' });
      await adapter.close(); // No-op before open
    });

    it('should close after open', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => '[]',
      });

      const adapter = new HttpSourceAdapter({ url: 'https://example.com/events' });
      await adapter.open();
      await adapter.close();
      await adapter.close(); // Multiple closes safe
    });
  });
});
