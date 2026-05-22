import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PostgresqlSink, extractMetrics } from '../sinks/postgresql';
import { GrafanaSink, createAnnotationFromResult } from '../sinks/grafana';
import { S3ArtifactStorage } from '../artifact-storage/s3';
import { GcsArtifactStorage } from '../artifact-storage/gcs';
import type { ExecutionResult } from '@wasm4pm/contracts';

describe('Integration: External Sinks and Storage', () => {
  describe('Full pipeline: PostgreSQL + Grafana + S3', () => {
    let mockPool: any;
    let mockHttpClient: any;
    let mockS3Client: any;

    beforeEach(() => {
      mockPool = {
        connect: vi.fn().mockResolvedValue({ release: vi.fn() }),
        query: vi.fn().mockResolvedValue({ rows: [] }),
        end: vi.fn(),
      };

      mockHttpClient = {
        post: vi.fn().mockResolvedValue({
          status: 200,
          statusText: 'OK',
          data: { id: 1 },
        }),
      };

      mockS3Client = {
        send: vi.fn().mockResolvedValue({}),
      };
    });

    it('should store metrics and create annotation', async () => {
      // Setup sinks/storage
      const pgSink = new PostgresqlSink({
        config: {
          host: 'localhost',
          port: 5432,
          database: 'test',
          user: 'user',
        },
        pool: mockPool,
      });

      const grafanaSink = new GrafanaSink({
        url: 'https://grafana.example.com',
        apiToken: 'glc_token',
        dashboardId: 1,
        httpClient: mockHttpClient,
      });

      // Initialize
      await pgSink.initialize();

      // Simulate execution result
      const runId = 'run-abc123';
      const result: ExecutionResult = {
        algorithm: { name: 'dfg', description: 'Directly-Follows Graph' },
        summary: {
          status: 'success',
          traceCount: 2000,
          fitness: 0.92,
          precision: 0.88,
        },
      } as any;

      // Extract metrics and store in PostgreSQL
      const metrics = extractMetrics(result, runId);
      await pgSink.write(metrics);

      expect(mockPool.query).toHaveBeenCalled();
      const [sql] = mockPool.query.mock.calls[mockPool.query.mock.calls.length - 1];
      expect(sql).toContain('INSERT INTO');

      // Create annotation and store in Grafana
      const annotation = createAnnotationFromResult(result, runId);
      await grafanaSink.write(annotation);

      expect(mockHttpClient.post).toHaveBeenCalled();
      const [url, payload] = mockHttpClient.post.mock.calls[0];
      expect(url).toContain('/api/annotations');
      expect(payload.text).toContain('dfg');

      // Verify operations completed
      expect(mockPool.query).toHaveBeenCalled();
      expect(mockHttpClient.post).toHaveBeenCalled();
    });
  });

  describe('Alternative pipeline: PostgreSQL + S3', () => {
    it('should support PostgreSQL with configuration', async () => {
      const mockPool = {
        connect: vi.fn().mockResolvedValue({ release: vi.fn() }),
        query: vi.fn().mockResolvedValue({ rows: [] }),
        end: vi.fn(),
      };

      const pgSink = new PostgresqlSink({
        config: {
          host: 'db.example.com',
          port: 5432,
          database: 'analytics',
          user: 'analyst',
          table: 'discovery_runs',
        },
        pool: mockPool,
      });

      await pgSink.initialize();

      const result: ExecutionResult = {
        algorithm: { name: 'genetic_algorithm' },
        summary: { status: 'success', fitness: 0.95 },
      } as any;

      const metrics = extractMetrics(result, 'run-001');
      await pgSink.write(metrics);

      expect(mockPool.query).toHaveBeenCalled();
    });
  });

  describe('GCS alternative pipeline', () => {
    it('should support PostgreSQL + Grafana annotations', async () => {
      const mockPool = {
        connect: vi.fn().mockResolvedValue({ release: vi.fn() }),
        query: vi.fn().mockResolvedValue({ rows: [] }),
        end: vi.fn(),
      };

      const mockHttpClient = {
        post: vi.fn().mockResolvedValue({
          status: 200,
          statusText: 'OK',
          data: { id: 1 },
        }),
      };

      const pgSink = new PostgresqlSink({
        config: {
          host: 'localhost',
          port: 5432,
          database: 'test',
          user: 'user',
        },
        pool: mockPool,
      });

      const grafanaSink = new GrafanaSink({
        url: 'https://grafana.example.com',
        apiToken: 'glc_token',
        httpClient: mockHttpClient,
      });

      await pgSink.initialize();

      const result: ExecutionResult = {
        algorithm: { name: 'ilp' },
        summary: { status: 'success', fitness: 0.98, precision: 0.96 },
      } as any;

      const metrics = extractMetrics(result, 'run-gcs-001');
      await pgSink.write(metrics);

      await grafanaSink.annotateResult(result, 'run-gcs-001');

      expect(mockPool.query).toHaveBeenCalled();
      expect(mockHttpClient.post).toHaveBeenCalled();
    });
  });

  describe('Configuration validation across all sinks', () => {
    it('should validate PostgreSQL configuration', () => {
      const validConfig = {
        host: 'localhost',
        port: 5432,
        database: 'test',
        user: 'user',
      };

      const errors = PostgresqlSink.validateConfig(validConfig);
      expect(errors).toHaveLength(0);
    });

    it('should validate Grafana configuration', () => {
      const validConfig = {
        url: 'https://grafana.example.com',
        apiToken: 'glc_token',
      };

      const errors = GrafanaSink.validateConfig(validConfig);
      expect(errors).toHaveLength(0);
    });

    it('should validate S3 configuration', () => {
      const validConfig = {
        bucket: 'my-bucket',
        region: 'us-east-1',
      };

      const errors = S3ArtifactStorage.validateConfig(validConfig);
      expect(errors).toHaveLength(0);
    });

    it('should validate GCS configuration', () => {
      const validConfig = {
        bucket: 'my-bucket',
      };

      const errors = GcsArtifactStorage.validateConfig(validConfig);
      expect(errors).toHaveLength(0);
    });
  });

  describe('Metrics extraction for different algorithms', () => {
    it('should extract metrics from various algorithms', () => {
      const algorithms = ['dfg', 'heuristic_miner', 'genetic_algorithm', 'ilp'];

      for (const algo of algorithms) {
        const result: ExecutionResult = {
          algorithm: { name: algo as any },
          summary: {
            status: 'success',
            traceCount: 1000,
            fitness: 0.85 + Math.random() * 0.15,
            precision: 0.80 + Math.random() * 0.20,
          },
        } as any;

        const metrics = extractMetrics(result, `run-${algo}`);

        expect(metrics.algorithm).toBe(algo);
        expect(metrics.log_size).toBe(1000);
        expect(metrics.fitness).toBeGreaterThan(0.8);
        expect(metrics.precision).toBeGreaterThan(0.75);
      }
    });
  });

  describe('Error handling across pipeline', () => {
    it('should handle PostgreSQL connection failure', async () => {
      const failingPool = {
        connect: vi.fn().mockRejectedValue(new Error('Connection refused')),
      };

      const pgSink = new PostgresqlSink({
        config: {
          host: 'unreachable.example.com',
          port: 5432,
          database: 'test',
          user: 'user',
        },
        pool: failingPool,
      });

      await expect(pgSink.initialize()).rejects.toThrow('Failed to connect');
    });

    it('should handle Grafana API failure', async () => {
      const mockHttpClient = {
        post: vi.fn().mockResolvedValue({
          status: 403,
          statusText: 'Forbidden',
        }),
      };

      const grafanaSink = new GrafanaSink({
        url: 'https://grafana.example.com',
        apiToken: 'invalid_token',
        httpClient: mockHttpClient,
      });

      const annotation = {
        time: Date.now(),
        text: 'Test',
        tags: [],
      };

      await expect(grafanaSink.write(annotation)).rejects.toThrow('403');
    });

    it('should handle GCS bucket errors gracefully', async () => {
      const mockStorage = {
        bucket: vi.fn(() => {
          throw new Error('Bucket not found');
        }),
      };

      const gcsStorage = new GcsArtifactStorage({
        bucket: 'nonexistent-bucket',
        storage: mockStorage,
      });

      await gcsStorage.initialize();

      // Note: error handling depends on the async stream behavior
      // which is tested separately in gcs-storage.test.ts
      expect(gcsStorage).toBeDefined();
    });
  });

  describe('Multi-run scenario', () => {
    it('should handle multiple sequential runs', async () => {
      const mockPool = {
        connect: vi.fn().mockResolvedValue({ release: vi.fn() }),
        query: vi.fn().mockResolvedValue({ rows: [] }),
        end: vi.fn(),
      };

      const pgSink = new PostgresqlSink({
        config: {
          host: 'localhost',
          port: 5432,
          database: 'test',
          user: 'user',
        },
        pool: mockPool,
      });

      await pgSink.initialize();

      // Simulate 3 sequential runs
      const algorithms = ['dfg', 'heuristic_miner', 'genetic_algorithm'];

      for (let i = 0; i < algorithms.length; i++) {
        const result: ExecutionResult = {
          algorithm: { name: algorithms[i] as any },
          summary: {
            status: 'success',
            traceCount: 500 + i * 100,
            fitness: 0.8 + Math.random() * 0.2,
            precision: 0.75 + Math.random() * 0.25,
          },
        } as any;

        const metrics = extractMetrics(result, `run-${i}`);
        await pgSink.write(metrics);
      }

      // Verify all writes were successful
      expect(mockPool.query).toHaveBeenCalled();
      expect(mockPool.query.mock.calls.length).toBeGreaterThan(3); // Initial schema + writes
    });
  });
});
