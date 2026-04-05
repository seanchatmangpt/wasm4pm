/**
 * HttpSinkAdapter Tests
 * Tests for posting artifacts to HTTP endpoints
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HttpSinkAdapter } from '../http-sink.js';
import { isOk } from '@wasm4pm/contracts';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('HttpSinkAdapter', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe('initialization', () => {
    it('should create adapter with default config', () => {
      const adapter = new HttpSinkAdapter({ url: 'https://example.com/artifacts' });
      expect(adapter.kind).toBe('http');
      expect(adapter.version).toBe('1.0.0');
    });

    it('should have correct properties', () => {
      const adapter = new HttpSinkAdapter({ url: 'https://example.com/artifacts' });
      expect(adapter.atomicity).toBe('event');
      expect(adapter.onExists).toBe('overwrite');
      expect(adapter.failureMode).toBe('fail');
    });

    it('should support all artifact types', () => {
      const adapter = new HttpSinkAdapter({ url: 'https://example.com/artifacts' });
      expect(adapter.supportsArtifact('receipt')).toBe(true);
      expect(adapter.supportsArtifact('model')).toBe(true);
      expect(adapter.supportsArtifact('report')).toBe(true);
      expect(adapter.supportsArtifact('explain_snapshot')).toBe(true);
      expect(adapter.supportsArtifact('status_snapshot')).toBe(true);
    });
  });

  describe('validate()', () => {
    it('should validate a proper URL', async () => {
      const adapter = new HttpSinkAdapter({ url: 'https://example.com/artifacts' });
      const result = await adapter.validate();
      expect(isOk(result)).toBe(true);
    });

    it('should fail on invalid URL', async () => {
      const adapter = new HttpSinkAdapter({ url: 'not-a-url' });
      const result = await adapter.validate();
      expect(isOk(result)).toBe(false);
      if (result.type === 'error') {
        expect(result.error.code).toBe('SINK_FAILED');
      }
    });

    it('should fail when bearer token is missing', async () => {
      const adapter = new HttpSinkAdapter({
        url: 'https://example.com/artifacts',
        auth: { type: 'bearer' },
      });
      const result = await adapter.validate();
      expect(isOk(result)).toBe(false);
    });

    it('should validate with bearer auth', async () => {
      const adapter = new HttpSinkAdapter({
        url: 'https://example.com/artifacts',
        auth: { type: 'bearer', token: 'my-token' },
      });
      const result = await adapter.validate();
      expect(isOk(result)).toBe(true);
    });
  });

  describe('write()', () => {
    it('should POST artifact as JSON', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: 'artifact-123' }),
      });

      const adapter = new HttpSinkAdapter({ url: 'https://example.com/artifacts' });
      const receipt = { run_id: 'run-001', algorithm: 'dfg', status: 'success' };

      const result = await adapter.write(receipt, 'receipt');
      expect(isOk(result)).toBe(true);

      if (isOk(result)) {
        expect(result.value).toBe('artifact-123');
      }

      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/artifacts',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        }),
      );

      // Verify body format
      const call = mockFetch.mock.calls[0];
      const body = JSON.parse(call[1].body);
      expect(body.type).toBe('receipt');
      expect(body.artifact.run_id).toBe('run-001');
    });

    it('should use PUT method when configured', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({}),
      });

      const adapter = new HttpSinkAdapter({
        url: 'https://example.com/artifacts',
        method: 'PUT',
      });
      await adapter.write({ name: 'model' }, 'model');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ method: 'PUT' }),
      );
    });

    it('should include auth headers', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({}),
      });

      const adapter = new HttpSinkAdapter({
        url: 'https://example.com/artifacts',
        auth: { type: 'bearer', token: 'secret' },
      });
      await adapter.write({}, 'receipt');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer secret',
          }),
        }),
      );
    });

    it('should include basic auth header', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({}),
      });

      const adapter = new HttpSinkAdapter({
        url: 'https://example.com/artifacts',
        auth: { type: 'basic', username: 'user', password: 'pass' },
      });
      await adapter.write({}, 'receipt');

      const expected = `Basic ${Buffer.from('user:pass').toString('base64')}`;
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: expected,
          }),
        }),
      );
    });

    it('should fail on HTTP error (failureMode: fail)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const adapter = new HttpSinkAdapter({
        url: 'https://example.com/artifacts',
        failureMode: 'fail',
      });
      const result = await adapter.write({}, 'receipt');

      expect(isOk(result)).toBe(false);
      if (result.type === 'error') {
        expect(result.error.code).toBe('SINK_FAILED');
      }
    });

    it('should degrade on HTTP error (failureMode: degrade)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Server Error',
      });

      const adapter = new HttpSinkAdapter({
        url: 'https://example.com/artifacts',
        failureMode: 'degrade',
      });
      const result = await adapter.write({}, 'receipt');

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toContain('degraded');
      }
    });

    it('should ignore HTTP error (failureMode: ignore)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Server Error',
      });

      const adapter = new HttpSinkAdapter({
        url: 'https://example.com/artifacts',
        failureMode: 'ignore',
      });
      const result = await adapter.write({}, 'receipt');

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toContain('ignored');
      }
    });

    it('should handle network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network unavailable'));

      const adapter = new HttpSinkAdapter({
        url: 'https://example.com/artifacts',
        failureMode: 'fail',
      });
      const result = await adapter.write({}, 'receipt');

      expect(isOk(result)).toBe(false);
      if (result.type === 'error') {
        expect(result.error.code).toBe('SINK_FAILED');
      }
    });

    it('should handle non-JSON response body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => {
          throw new Error('not JSON');
        },
      });

      const adapter = new HttpSinkAdapter({ url: 'https://example.com/artifacts' });
      const result = await adapter.write({ id: 1 }, 'receipt');

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toContain('http-receipt');
      }
    });
  });

  describe('write() - all artifact types', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({}),
      });
    });

    it('should write model', async () => {
      const adapter = new HttpSinkAdapter({ url: 'https://example.com/artifacts' });
      const result = await adapter.write({ name: 'model', nodes: [] }, 'model');
      expect(isOk(result)).toBe(true);
    });

    it('should write report', async () => {
      const adapter = new HttpSinkAdapter({ url: 'https://example.com/artifacts' });
      const result = await adapter.write(
        { name: 'report', format: 'html', content: '<html/>' },
        'report',
      );
      expect(isOk(result)).toBe(true);
    });

    it('should write explain_snapshot', async () => {
      const adapter = new HttpSinkAdapter({ url: 'https://example.com/artifacts' });
      const result = await adapter.write(
        { timestamp: '2024-01-01', explanation: 'test' },
        'explain_snapshot',
      );
      expect(isOk(result)).toBe(true);
    });

    it('should write status_snapshot', async () => {
      const adapter = new HttpSinkAdapter({ url: 'https://example.com/artifacts' });
      const result = await adapter.write(
        { timestamp: '2024-01-01', state: 'running' },
        'status_snapshot',
      );
      expect(isOk(result)).toBe(true);
    });
  });

  describe('close()', () => {
    it('should close safely', async () => {
      const adapter = new HttpSinkAdapter({ url: 'https://example.com/artifacts' });
      await adapter.close();
      await adapter.close(); // Multiple closes safe
    });
  });
});
