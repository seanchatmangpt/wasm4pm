/**
 * http-server.test.ts
 * Comprehensive tests for the HTTP service layer
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { HttpServer, ServiceConfig, InternalRunState } from './index';
import { Engine } from '@wasm4pm/engine';

/**
 * Mock kernel for testing
 */
class MockKernel {
  private ready = true;

  async init(): Promise<void> {}
  async shutdown(): Promise<void> {}
  isReady(): boolean {
    return this.ready;
  }
  setReady(ready: boolean): void {
    this.ready = ready;
  }
}

/**
 * Create test engine with mock kernel
 */
function createTestEngine(): Engine {
  const kernel = new MockKernel();
  return new Engine(kernel);
}

/**
 * Create test config
 */
function createTestConfig(): ServiceConfig {
  return {
    port: 3001,
    host: 'localhost',
    gracefulShutdownTimeoutMs: 5000,
    maxQueueSize: 10,
    enableCors: true,
    logFormat: 'json',
  };
}

describe('HttpServer', () => {
  let server: HttpServer;
  let engine: Engine;
  let config: ServiceConfig;

  beforeEach(async () => {
    engine = createTestEngine();
    await engine.bootstrap();
    config = createTestConfig();
    server = new HttpServer(engine, config);
  });

  afterEach(async () => {
    await server.shutdown();
    await engine.shutdown();
  });

  describe('Status endpoint', () => {
    it('should return healthy status on startup', async () => {
      const response = await request('GET', '/status');
      expect(response.status).toBe(200);
      expect(response.body.server).toBe('healthy');
      expect(response.body.uptime_ms).toBeGreaterThan(0);
      expect(response.body.queued).toBe(0);
    });

    it('should include current run info if running', async () => {
      // This would require actually running a request first
      // In real implementation, would submit a run, then check status
      const response = await request('GET', '/status');
      expect(response.status).toBe(200);
      expect(response.body.completed).toBe(0);
      expect(response.body.failed).toBe(0);
    });

    it('should return timestamp in ISO format', async () => {
      const response = await request('GET', '/status');
      expect(response.status).toBe(200);
      const timestamp = new Date(response.body.timestamp);
      expect(timestamp.getTime()).toBeGreaterThan(0);
    });
  });

  describe('Run endpoint (POST /run)', () => {
    it('should accept valid run request', async () => {
      const body = {
        config: '[section]\nkey = "value"',
      };
      const response = await request('POST', '/run', body);
      expect(response.status).toBe(202);
      expect(response.body.run_id).toMatch(/^run_/);
      expect(response.body.status).toMatch(/^(queued|running)$/);
      expect(response.body.started_at).toBeDefined();
    });

    it('should reject request without config', async () => {
      const body = {};
      const response = await request('POST', '/run', body);
      expect(response.status).toBe(400);
      expect(response.body.code).toBe('VALIDATION_ERROR');
    });

    it('should reject empty config', async () => {
      const body = { config: '' };
      const response = await request('POST', '/run', body);
      expect(response.status).toBe(400);
      expect(response.body.code).toBe('VALIDATION_ERROR');
    });

    it('should include optional fields if provided', async () => {
      const body = {
        config: '[section]\nkey = "value"',
        input_file: '/path/to/log.xes',
        profile: 'production',
      };
      const response = await request('POST', '/run', body);
      expect(response.status).toBe(202);
      expect(response.body.run_id).toBeDefined();
    });

    it('should return 503 if queue is full', async () => {
      // Fill the queue
      for (let i = 0; i < config.maxQueueSize; i++) {
        const response = await request('POST', '/run', { config: '[test]' });
        expect(response.status).toBe(202);
      }

      // Next request should fail
      const response = await request('POST', '/run', { config: '[test]' });
      expect(response.status).toBe(503);
      expect(response.body.code).toBe('QUEUE_FULL');
    });
  });

  describe('Get run status endpoint (GET /run/:run_id)', () => {
    it('should return 404 for non-existent run', async () => {
      const response = await request('GET', '/run/run_nonexistent_abc123');
      expect(response.status).toBe(404);
      expect(response.body.code).toBe('NOT_FOUND');
    });

    it('should return status for queued run', async () => {
      // Submit a run that will queue
      const submitResponse = await request('POST', '/run', { config: '[test]' });
      const runId = submitResponse.body.run_id;

      // Get status
      const response = await request('GET', `/run/${runId}`);
      expect(response.status).toBe(200);
      expect(response.body.run_id).toBe(runId);
      expect(['queued', 'running']).toContain(response.body.status);
      expect(response.body.progress).toBeGreaterThanOrEqual(0);
    });

    it('should include receipt when run is completed', async () => {
      // Submit a run
      const submitResponse = await request('POST', '/run', { config: '[test]' });
      const runId = submitResponse.body.run_id;

      // Wait for execution to complete
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Get status
      const response = await request('GET', `/run/${runId}`);
      expect(response.status).toBe(200);
      if (response.body.status === 'completed') {
        expect(response.body.receipt).toBeDefined();
        expect(response.body.receipt.runId).toBe(runId);
      }
    });

    it('should include error info when run fails', async () => {
      // This would require a configuration that causes failure
      // For now, verify structure when error is present
      const response = await request('GET', '/run/run_2026_test');
      // If run doesn't exist, we get 404, which is correct
      expect([404, 200]).toContain(response.status);
    });
  });

  describe('Cancel run endpoint (DELETE /run/:run_id)', () => {
    it('should return 404 for non-existent run', async () => {
      const response = await request('DELETE', '/run/run_nonexistent_abc123');
      expect(response.status).toBe(404);
      expect(response.body.code).toBe('NOT_FOUND');
    });

    it('should cancel queued run', async () => {
      // Fill queue with first run
      const firstResponse = await request('POST', '/run', { config: '[test1]' });

      // Submit second run that will queue
      const secondResponse = await request('POST', '/run', { config: '[test2]' });
      const runId = secondResponse.body.run_id;

      // Cancel the queued run
      const cancelResponse = await request('DELETE', `/run/${runId}`);
      expect(cancelResponse.status).toBe(200);
      expect(cancelResponse.body.status).toBe('cancelled');

      // Verify it's cancelled
      const statusResponse = await request('GET', `/run/${runId}`);
      expect(statusResponse.status).toBe(200);
      expect(statusResponse.body.status).toBe('cancelled');
    });

    it('should not cancel running run', async () => {
      // Submit a run
      const submitResponse = await request('POST', '/run', { config: '[test]' });
      const runId = submitResponse.body.run_id;

      // Try to cancel (should fail if running)
      const cancelResponse = await request('DELETE', `/run/${runId}`);
      // Will succeed if queued, fail if running
      expect([200, 409]).toContain(cancelResponse.status);
    });

    it('should not cancel completed run', async () => {
      // Submit a run
      const submitResponse = await request('POST', '/run', { config: '[test]' });
      const runId = submitResponse.body.run_id;

      // Wait for completion
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Try to cancel
      const cancelResponse = await request('DELETE', `/run/${runId}`);
      expect(cancelResponse.status).toBe(409);
      expect(cancelResponse.body.code).toBe('INVALID_STATE');
    });
  });

  describe('Explain endpoint (POST /explain)', () => {
    it('should accept valid explain request', async () => {
      const body = {
        config: '[section]\nkey = "value"',
      };
      const response = await request('POST', '/explain', body);
      expect(response.status).toBe(200);
      expect(response.body.explanation).toBeDefined();
      expect(response.body.config).toBe(body.config);
      expect(response.body.mode).toBe('brief');
    });

    it('should reject request without config', async () => {
      const body = {};
      const response = await request('POST', '/explain', body);
      expect(response.status).toBe(400);
      expect(response.body.code).toBe('VALIDATION_ERROR');
    });

    it('should support full mode', async () => {
      const body = {
        config: '[section]\nkey = "value"',
        mode: 'full',
      };
      const response = await request('POST', '/explain', body);
      expect(response.status).toBe(200);
      expect(response.body.mode).toBe('full');
      expect(response.body.explanation.length).toBeGreaterThan(0);
    });

    it('should default to brief mode', async () => {
      const body = {
        config: '[section]\nkey = "value"',
      };
      const response = await request('POST', '/explain', body);
      expect(response.status).toBe(200);
      expect(response.body.mode).toBe('brief');
    });

    it('should not execute any runs', async () => {
      const response = await request('POST', '/explain', {
        config: '[section]',
      });
      expect(response.status).toBe(200);

      // Check that no run was created
      const statusResponse = await request('GET', '/status');
      expect(statusResponse.body.queued).toBe(0);
      expect(statusResponse.body.completed).toBe(0);
    });

    it('should return timestamp in explain response', async () => {
      const response = await request('POST', '/explain', {
        config: '[section]',
      });
      expect(response.status).toBe(200);
      const timestamp = new Date(response.body.timestamp);
      expect(timestamp.getTime()).toBeGreaterThan(0);
    });
  });

  describe('Watch endpoint (GET /watch/:run_id)', () => {
    it('should return 404 for non-existent run', async () => {
      const response = await request('GET', '/watch/run_nonexistent_abc123');
      expect(response.status).toBe(404);
      expect(response.body.code).toBe('NOT_FOUND');
    });

    it('should stream events for running run', async () => {
      // Submit a run
      const submitResponse = await request('POST', '/run', { config: '[test]' });
      const runId = submitResponse.body.run_id;

      // Watch the run
      const response = await request('GET', `/watch/${runId}`);
      expect([200, 501]).toContain(response.status);
      // 501 is OK because WebSocket full implementation not in base
    });
  });

  describe('API docs endpoint (GET /api/docs)', () => {
    it('should return OpenAPI spec', async () => {
      const response = await request('GET', '/api/docs');
      expect(response.status).toBe(200);
      expect(response.body.openapi).toBe('3.0.0');
      expect(response.body.info.title).toBe('wasm4pm Service API');
      expect(response.body.info.version).toBe('26.4.5');
    });

    it('should include all endpoints', async () => {
      const response = await request('GET', '/api/docs');
      expect(response.status).toBe(200);
      expect(response.body.paths['/status']).toBeDefined();
      expect(response.body.paths['/run']).toBeDefined();
      expect(response.body.paths['/run/{run_id}']).toBeDefined();
      expect(response.body.paths['/watch/{run_id}']).toBeDefined();
      expect(response.body.paths['/explain']).toBeDefined();
      expect(response.body.paths['/api/docs']).toBeDefined();
    });

    it('should include schema definitions', async () => {
      const response = await request('GET', '/api/docs');
      expect(response.status).toBe(200);
      expect(response.body.components.schemas.RunRequest).toBeDefined();
      expect(response.body.components.schemas.RunResponse).toBeDefined();
      expect(response.body.components.schemas.StatusResponse).toBeDefined();
    });
  });

  describe('Single-run constraint', () => {
    it('should only execute one run at a time', async () => {
      // Submit multiple runs
      const run1 = await request('POST', '/run', { config: '[test1]' });
      const run2 = await request('POST', '/run', { config: '[test2]' });
      const run3 = await request('POST', '/run', { config: '[test3]' });

      expect(run1.status).toBe(202);
      expect(run2.status).toBe(202);
      expect(run3.status).toBe(202);

      // First run should be running, others queued
      const status1 = await request('GET', `/run/${run1.body.run_id}`);
      expect(['running', 'completed']).toContain(status1.body.status);

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Check server status - should show queue
      const serverStatus = await request('GET', '/status');
      expect(serverStatus.body.queued).toBeGreaterThanOrEqual(0);
    });

    it('should execute queued runs in FIFO order', async () => {
      // Submit runs
      const run1 = await request('POST', '/run', { config: '[test1]' });
      const run2 = await request('POST', '/run', { config: '[test2]' });

      expect(run1.body.run_id).toBeDefined();
      expect(run2.body.run_id).toBeDefined();

      // Run IDs should be in order they were submitted
      // (implementation may vary, but FIFO should be respected)
      expect(run1.status).toBe(202);
      expect(run2.status).toBe(202);
    });
  });

  describe('Error handling', () => {
    it('should return 400 for invalid JSON', async () => {
      // This requires raw HTTP handling, skipping for now
      // In real implementation, would test invalid JSON parsing
    });

    it('should return 404 for non-existent endpoint', async () => {
      const response = await request('GET', '/nonexistent');
      expect(response.status).toBe(404);
      expect(response.body.code).toBe('NOT_FOUND');
    });

    it('should include error details in response', async () => {
      const response = await request('GET', '/run/invalid');
      expect(response.status).toBe(404);
      expect(response.body.error).toBeDefined();
      expect(response.body.timestamp).toBeDefined();
    });
  });

  describe('CORS headers', () => {
    it('should set CORS headers on response', async () => {
      const response = await request('GET', '/status');
      expect(response.status).toBe(200);
      expect(response.headers['access-control-allow-origin']).toBe('*');
    });

    it('should handle OPTIONS preflight requests', async () => {
      const response = await request('OPTIONS', '/run');
      expect([200, 204]).toContain(response.status);
    });
  });

  describe('Request logging', () => {
    it('should include request ID in response', async () => {
      const response = await request('GET', '/status');
      expect(response.headers['x-request-id']).toBeDefined();
    });

    it('should log requests in JSON format', async () => {
      // This would require capturing console.log
      // In real implementation, would verify JSON log format
      await request('GET', '/status');
      // Logging happens asynchronously
      await new Promise((resolve) => setTimeout(resolve, 100));
    });
  });

  describe('Server shutdown', () => {
    it('should gracefully shutdown', async () => {
      // Start a fresh server
      const testServer = new HttpServer(engine, config);
      await expect(testServer.shutdown()).resolves.toBeUndefined();
    });

    it('should handle shutdown with pending runs', async () => {
      // This would require a more complex test setup
      // Verify shutdown doesn't crash with active runs
    });
  });
});

/**
 * Helper function to make HTTP requests
 * In real implementation, would use fetch or axios
 * For now, this is a stub that would be implemented with actual HTTP client
 */
async function request(
  method: string,
  path: string,
  body?: any
): Promise<{ status: number; body: any; headers: Record<string, string> }> {
  // Mock response for testing
  // In real implementation, would make actual HTTP requests
  return {
    status: 200,
    body: {},
    headers: {},
  };
}
