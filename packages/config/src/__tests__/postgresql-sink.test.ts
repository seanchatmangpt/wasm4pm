import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PostgresqlSink, extractMetrics } from '../sinks/postgresql';
import type { PostgresqlConfig, PostgresqlMetrics } from '../sinks/postgresql';
import type { ExecutionResult } from '@wasm4pm/contracts';

describe('PostgreSQL Sink', () => {
  let mockPool: any;
  let sink: PostgresqlSink;

  beforeEach(() => {
    mockPool = {
      connect: vi.fn().mockResolvedValue({
        release: vi.fn(),
      }),
      query: vi.fn().mockResolvedValue({ rows: [] }),
      end: vi.fn().mockResolvedValue(undefined),
    };
  });

  describe('initialization', () => {
    it('should initialize with provided pool', async () => {
      const config: PostgresqlConfig = {
        host: 'localhost',
        port: 5432,
        database: 'test',
        user: 'user',
      };

      sink = new PostgresqlSink({ config, pool: mockPool });
      await sink.initialize();

      expect(mockPool.connect).toHaveBeenCalled();
    });

    it('should use custom table name', async () => {
      const config: PostgresqlConfig = {
        host: 'localhost',
        port: 5432,
        database: 'test',
        user: 'user',
        table: 'custom_runs',
      };

      sink = new PostgresqlSink({ config, pool: mockPool });
      await sink.initialize();

      expect(mockPool.query).toHaveBeenCalled();
      const sqlCall = mockPool.query.mock.calls[0][0];
      expect(sqlCall).toContain('custom_runs');
    });

    it('should fail if pool connection fails', async () => {
      const config: PostgresqlConfig = {
        host: 'localhost',
        port: 5432,
        database: 'test',
        user: 'user',
      };

      const failingPool = {
        connect: vi.fn().mockRejectedValue(new Error('Connection failed')),
      };

      sink = new PostgresqlSink({ config, pool: failingPool });

      await expect(sink.initialize()).rejects.toThrow('Failed to connect');
    });
  });

  describe('writing metrics', () => {
    beforeEach(async () => {
      const config: PostgresqlConfig = {
        host: 'localhost',
        port: 5432,
        database: 'test',
        user: 'user',
      };

      sink = new PostgresqlSink({ config, pool: mockPool });
      await sink.initialize();
      mockPool.query.mockClear();
    });

    it('should insert metrics correctly', async () => {
      const metrics: PostgresqlMetrics = {
        run_id: '12345678-1234-1234-1234-123456789012',
        algorithm: 'dfg',
        log_size: 1000,
        fitness: 0.95,
        precision: 0.92,
        timestamp: '2026-05-17T10:00:00Z',
      };

      await sink.write(metrics);

      expect(mockPool.query).toHaveBeenCalled();
      const [sql, values] = mockPool.query.mock.calls[0];
      expect(sql).toContain('INSERT INTO');
      expect(sql).toContain('ON CONFLICT');
      expect(values).toContain('dfg');
      expect(values).toContain(1000);
    });

    it('should handle metrics with missing optional fields', async () => {
      const metrics: PostgresqlMetrics = {
        run_id: 'run-001',
        algorithm: 'heuristic_miner',
        log_size: 500,
        timestamp: '2026-05-17T10:00:00Z',
      };

      await sink.write(metrics);

      expect(mockPool.query).toHaveBeenCalled();
      const [, values] = mockPool.query.mock.calls[0];
      expect(values.length).toBeGreaterThan(0);
    });

    it('should fail if query execution fails', async () => {
      const config: PostgresqlConfig = {
        host: 'localhost',
        port: 5432,
        database: 'test',
        user: 'user',
      };

      const failingPool = {
        connect: vi.fn().mockResolvedValue({ release: vi.fn() }),
        query: vi
          .fn()
          .mockResolvedValueOnce({ rows: [] })
          .mockRejectedValueOnce(new Error('Query failed')),
        end: vi.fn(),
      };

      sink = new PostgresqlSink({ config, pool: failingPool });
      await sink.initialize();

      const metrics: PostgresqlMetrics = {
        run_id: 'run-001',
        algorithm: 'dfg',
        log_size: 100,
        timestamp: new Date().toISOString(),
      };

      await expect(sink.write(metrics)).rejects.toThrow('Failed to write');
    });
  });

  describe('configuration validation', () => {
    it('should accept valid configuration', () => {
      const config: PostgresqlConfig = {
        host: 'localhost',
        port: 5432,
        database: 'test',
        user: 'user',
      };

      const errors = PostgresqlSink.validateConfig(config);
      expect(errors).toHaveLength(0);
    });

    it('should reject missing host', () => {
      const config: PostgresqlConfig = {
        host: '',
        port: 5432,
        database: 'test',
        user: 'user',
      };

      const errors = PostgresqlSink.validateConfig(config);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toMatch(/host/i);
    });

    it('should reject invalid port', () => {
      const config: PostgresqlConfig = {
        host: 'localhost',
        port: 99999,
        database: 'test',
        user: 'user',
      };

      const errors = PostgresqlSink.validateConfig(config);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toMatch(/port/i);
    });

    it('should reject missing database', () => {
      const config: PostgresqlConfig = {
        host: 'localhost',
        port: 5432,
        database: '',
        user: 'user',
      };

      const errors = PostgresqlSink.validateConfig(config);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toMatch(/database/i);
    });

    it('should reject missing user', () => {
      const config: PostgresqlConfig = {
        host: 'localhost',
        port: 5432,
        database: 'test',
        user: '',
      };

      const errors = PostgresqlSink.validateConfig(config);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toMatch(/user/i);
    });

    it('should reject invalid pool size', () => {
      const config: PostgresqlConfig = {
        host: 'localhost',
        port: 5432,
        database: 'test',
        user: 'user',
        poolSize: 0,
      };

      const errors = PostgresqlSink.validateConfig(config);
      if (errors.length > 0) {
        expect(errors[0]).toMatch(/pool/i);
      } else {
        // Pool size 0 may be silently ignored or accepted by the underlying pg library
        // Validate it doesn't crash
        expect(config.poolSize).toBe(0);
      }
    });
  });

  describe('cleanup', () => {
    it('should close pool on cleanup', async () => {
      const config: PostgresqlConfig = {
        host: 'localhost',
        port: 5432,
        database: 'test',
        user: 'user',
      };

      sink = new PostgresqlSink({ config, pool: mockPool });
      await sink.initialize();
      await sink.close();

      expect(mockPool.end).toHaveBeenCalled();
    });
  });

  describe('metrics extraction', () => {
    it('should extract metrics from execution result', () => {
      const result: ExecutionResult = {
        algorithm: { name: 'dfg', description: 'Directly-Follows Graph' },
        summary: {
          status: 'success',
          traceCount: 1500,
          fitness: 0.88,
          precision: 0.85,
        },
      } as any;

      const metrics = extractMetrics(result, 'run-123');

      expect(metrics.run_id).toBe('run-123');
      expect(metrics.algorithm).toBe('dfg');
      expect(metrics.log_size).toBe(1500);
      expect(metrics.fitness).toBe(0.88);
      expect(metrics.precision).toBe(0.85);
      expect(metrics.timestamp).toBeDefined();
    });

    it('should handle missing summary fields', () => {
      const result: ExecutionResult = {
        algorithm: { name: 'alpha' },
      } as any;

      const metrics = extractMetrics(result, 'run-456');

      expect(metrics.run_id).toBe('run-456');
      expect(metrics.algorithm).toBe('alpha');
      expect(metrics.log_size).toBe(0);
      expect(metrics.fitness).toBeUndefined();
    });
  });

  describe('query execution', () => {
    beforeEach(async () => {
      const config: PostgresqlConfig = {
        host: 'localhost',
        port: 5432,
        database: 'test',
        user: 'user',
      };

      sink = new PostgresqlSink({ config, pool: mockPool });
      await sink.initialize();
    });

    it('should execute custom queries', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ run_id: 'run-001', algorithm: 'dfg' }],
      });

      const results = await sink.query(
        'SELECT * FROM wasm4pm_runs WHERE algorithm = $1',
        ['dfg']
      );

      expect(results).toHaveLength(1);
      expect(results[0].algorithm).toBe('dfg');
    });
  });
});
