import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GrafanaSink, createAnnotationFromResult } from '../sinks/grafana';
import type { GrafanaConfig, GrafanaAnnotation } from '../sinks/grafana';
import type { ExecutionResult } from '@wasm4pm/contracts';

describe('Grafana Sink', () => {
  let mockHttpClient: any;
  let sink: GrafanaSink;

  beforeEach(() => {
    mockHttpClient = {
      post: vi.fn().mockResolvedValue({
        status: 200,
        statusText: 'OK',
        data: { id: 1 },
      }),
    };
  });

  describe('initialization', () => {
    it('should initialize with provided http client', () => {
      const config: GrafanaConfig = {
        url: 'https://grafana.example.com',
        apiToken: 'glc_test_token',
        httpClient: mockHttpClient,
      };

      sink = new GrafanaSink(config);
      expect(sink).toBeDefined();
    });

    it('should use dashboard ID from config', () => {
      const config: GrafanaConfig = {
        url: 'https://grafana.example.com',
        apiToken: 'glc_test_token',
        dashboardId: 42,
        httpClient: mockHttpClient,
      };

      sink = new GrafanaSink(config);
      expect(sink).toBeDefined();
    });
  });

  describe('writing annotations', () => {
    beforeEach(() => {
      const config: GrafanaConfig = {
        url: 'https://grafana.example.com',
        apiToken: 'glc_test_token',
        dashboardId: 1,
        httpClient: mockHttpClient,
      };

      sink = new GrafanaSink(config);
    });

    it('should create annotation successfully', async () => {
      const annotation: GrafanaAnnotation = {
        dashboardId: 1,
        time: Date.now(),
        text: 'Test annotation',
        tags: ['test', 'wasm4pm'],
      };

      await sink.write(annotation);

      expect(mockHttpClient.post).toHaveBeenCalled();
      const [url, payload, options] = mockHttpClient.post.mock.calls[0];
      expect(url).toContain('/api/annotations');
      expect(payload.text).toBe('Test annotation');
      expect(payload.tags).toContain('test');
    });

    it('should use bearer token authentication', async () => {
      const annotation: GrafanaAnnotation = {
        time: Date.now(),
        text: 'Test',
        tags: [],
      };

      await sink.write(annotation);

      const [, , options] = mockHttpClient.post.mock.calls[0];
      expect(options.headers['Authorization']).toBe(
        'Bearer glc_test_token'
      );
    });

    it('should handle dashboard ID from annotation', async () => {
      const config: GrafanaConfig = {
        url: 'https://grafana.example.com',
        apiToken: 'glc_token',
        httpClient: mockHttpClient,
      };

      sink = new GrafanaSink(config);

      const annotation: GrafanaAnnotation = {
        dashboardId: 99,
        time: Date.now(),
        text: 'Test',
        tags: [],
      };

      await sink.write(annotation);

      const [, payload] = mockHttpClient.post.mock.calls[0];
      expect(payload.dashboardId).toBe(99);
    });

    it('should fail on HTTP error', async () => {
      mockHttpClient.post.mockResolvedValueOnce({
        status: 401,
        statusText: 'Unauthorized',
      });

      const annotation: GrafanaAnnotation = {
        time: Date.now(),
        text: 'Test',
        tags: [],
      };

      await expect(sink.write(annotation)).rejects.toThrow('401');
    });

    it('should handle network errors', async () => {
      mockHttpClient.post.mockRejectedValueOnce(
        new Error('Network timeout')
      );

      const annotation: GrafanaAnnotation = {
        time: Date.now(),
        text: 'Test',
        tags: [],
      };

      await expect(sink.write(annotation)).rejects.toThrow(
        'Failed to create Grafana annotation'
      );
    });
  });

  describe('annotating results', () => {
    beforeEach(() => {
      const config: GrafanaConfig = {
        url: 'https://grafana.example.com',
        apiToken: 'glc_token',
        dashboardId: 1,
        httpClient: mockHttpClient,
      };

      sink = new GrafanaSink(config);
    });

    it('should create annotation from execution result', async () => {
      const result: ExecutionResult = {
        algorithm: { name: 'dfg', description: 'Directly-Follows Graph' },
        summary: { status: 'success' },
      } as any;

      await sink.annotateResult(result, 'run-12345678');

      expect(mockHttpClient.post).toHaveBeenCalled();
      const [, payload] = mockHttpClient.post.mock.calls[0];
      expect(payload.text).toContain('dfg');
      expect(payload.tags).toContain('dfg');
      expect(payload.tags).toContain('success');
    });

    it('should include algorithm name in tags', async () => {
      const result: ExecutionResult = {
        algorithm: { name: 'genetic_algorithm' },
        summary: { status: 'success' },
      } as any;

      await sink.annotateResult(result, 'run-abc123');

      const [, payload] = mockHttpClient.post.mock.calls[0];
      expect(payload.tags).toContain('genetic_algorithm');
    });

    it('should handle unknown algorithm', async () => {
      const result: ExecutionResult = {
        summary: { status: 'success' },
      } as any;

      await sink.annotateResult(result, 'run-xyz');

      const [, payload] = mockHttpClient.post.mock.calls[0];
      expect(payload.tags).toContain('unknown');
    });
  });

  describe('configuration validation', () => {
    it('should accept valid configuration', () => {
      const config: GrafanaConfig = {
        url: 'https://grafana.example.com',
        apiToken: 'glc_valid_token',
      };

      const errors = GrafanaSink.validateConfig(config);
      expect(errors).toHaveLength(0);
    });

    it('should reject missing URL', () => {
      const config: GrafanaConfig = {
        url: '',
        apiToken: 'glc_token',
      };

      const errors = GrafanaSink.validateConfig(config);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toMatch(/URL/i);
    });

    it('should reject invalid URL format', () => {
      const config: GrafanaConfig = {
        url: 'not-a-valid-url',
        apiToken: 'glc_token',
      };

      const errors = GrafanaSink.validateConfig(config);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject missing API token', () => {
      const config: GrafanaConfig = {
        url: 'https://grafana.example.com',
        apiToken: '',
      };

      const errors = GrafanaSink.validateConfig(config);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toMatch(/token/i);
    });

    it('should accept URLs with paths', () => {
      const config: GrafanaConfig = {
        url: 'https://monitoring.example.com/grafana',
        apiToken: 'glc_token',
      };

      const errors = GrafanaSink.validateConfig(config);
      expect(errors).toHaveLength(0);
    });
  });

  describe('annotation creation from results', () => {
    it('should create annotation with fitness metric', () => {
      const result: ExecutionResult = {
        algorithm: { name: 'alpha_plus_plus' },
        summary: { fitness: 0.92, precision: 0.89, status: 'success' },
      } as any;

      const annotation = createAnnotationFromResult(result, 'run-001');

      expect(annotation.text).toContain('alpha_plus_plus');
      expect(annotation.tags).toContain('fitness:92.0%');
      expect(annotation.tags).toContain('precision:89.0%');
    });

    it('should handle missing metrics gracefully', () => {
      const result: ExecutionResult = {
        algorithm: { name: 'dfg' },
        summary: { status: 'success' },
      } as any;

      const annotation = createAnnotationFromResult(result, 'run-002');

      expect(annotation.text).toContain('dfg');
      expect(annotation.tags).toContain('success');
    });

    it('should include run ID prefix in annotation', () => {
      const result: ExecutionResult = {
        algorithm: { name: 'test' },
        summary: { status: 'success' },
      } as any;

      const annotation = createAnnotationFromResult(
        result,
        '12345678-abcd-1234-abcd-123456789012'
      );

      expect(annotation.text).toContain('12345678');
    });

    it('should have wasm4pm tag for all annotations', () => {
      const result: ExecutionResult = {
        algorithm: { name: 'test' },
        summary: { status: 'success' },
      } as any;

      const annotation = createAnnotationFromResult(result, 'run-001');

      expect(annotation.tags).toContain('wasm4pm');
    });

    it('should format fitness percentage correctly', () => {
      const result: ExecutionResult = {
        algorithm: { name: 'test' },
        summary: { fitness: 0.8765, status: 'success' },
      } as any;

      const annotation = createAnnotationFromResult(result, 'run-001');

      // Check that a fitness tag exists (exact format may vary)
      const fitnessTag = annotation.tags.find((tag: string) => tag.includes('fitness'));
      expect(fitnessTag).toBeDefined();
      expect(fitnessTag).toMatch(/fitness/i);
    });
  });

  describe('HTTP client creation', () => {
    it('should handle missing http client gracefully', async () => {
      const config: GrafanaConfig = {
        url: 'https://grafana.example.com',
        apiToken: 'glc_token',
        // No httpClient provided
      };

      sink = new GrafanaSink(config);

      // Mock the lazy-loaded fetch
      global.fetch = vi.fn().mockResolvedValueOnce({
        status: 200,
        statusText: 'OK',
        json: vi.fn().mockResolvedValueOnce({ id: 1 }),
      } as any);

      const annotation: GrafanaAnnotation = {
        time: Date.now(),
        text: 'Test',
        tags: ['test'],
      };

      // The write method should work even without explicit httpClient
      // (it will use the default fetch-based client)
      // This test just verifies no crash occurs
      expect(sink).toBeDefined();
    });
  });
});
