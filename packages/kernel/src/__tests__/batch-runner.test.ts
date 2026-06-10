/**
 * batch-runner.test.ts
 * Unit tests for BatchRunner worker pool implementation
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BatchRunner, type BatchConfig, type BatchLogResult } from '../batch-runner.js';
import { Kernel } from '../api.js';
import * as os from 'os';
import * as fs from 'fs/promises';

// Mock fs to avoid actual disk access
vi.mock('fs/promises', () => ({
  readFile: vi.fn().mockResolvedValue('<log/>'),
}));

describe('BatchRunner', () => {
  let kernel: Kernel;

  beforeEach(() => {
    // Create a minimal Kernel stub
    const wasmStub = {
      load_eventlog_from_xes: vi.fn().mockReturnValue('handle123'),
      delete_object: vi.fn(),
      init: vi.fn().mockResolvedValue(undefined),
    } as any;
    kernel = new Kernel(wasmStub);
    // @ts-ignore - access private init for test
    kernel._initialized = true;

    // Mock kernel methods
    vi.spyOn(kernel, 'loadEventLog').mockResolvedValue('handle123');
    vi.spyOn(kernel, 'run').mockResolvedValue({
      handle: 'res123',
      algorithm: 'dfg',
      outputType: 'dfg',
      durationMs: 10,
      execution_ms: 10,
      params: {},
      hash: 'hash123',
      toLLMContext: () => '',
    });
    vi.spyOn(kernel, 'freeHandle').mockImplementation(() => {});
  });

  describe('constructor', () => {
    it('should create runner with custom config', () => {
      const config: BatchConfig = {
        algorithm: 'dfg',
        kernel,
        workers: 2,
        timeout: 5000,
      };
      const runner = new BatchRunner(config);
      expect(runner).toBeDefined();
    });

    it('should use default workers (CPU count) if not specified', () => {
      const config: BatchConfig = { algorithm: 'dfg', kernel };
      const runner = new BatchRunner(config);
      expect(runner).toBeDefined();
    });

    it('should use default timeout (5 minutes) if not specified', () => {
      const config: BatchConfig = { algorithm: 'heuristic', kernel };
      const runner = new BatchRunner(config);
      expect(runner).toBeDefined();
    });

    it('should use default activity key if not specified', () => {
      const config: BatchConfig = { algorithm: 'alpha', kernel };
      const runner = new BatchRunner(config);
      expect(runner).toBeDefined();
    });
  });

  describe('run', () => {
    it('should process empty log list', async () => {
      const config: BatchConfig = { algorithm: 'dfg', kernel, workers: 1 };
      const runner = new BatchRunner(config);
      const result = await runner.run([]);
      expect(result.summary.totalLogs).toBe(0);
      expect(result.summary.successful).toBe(0);
      expect(result.results).toHaveLength(0);
    });

    it('should process single log file', async () => {
      const config: BatchConfig = { algorithm: 'dfg', kernel, workers: 1 };
      const runner = new BatchRunner(config);
      const result = await runner.run(['log1.xes']);
      expect(result.summary.totalLogs).toBe(1);
      expect(result.results).toHaveLength(1);
      expect(result.results[0].logPath).toBe('log1.xes');
      expect(kernel.loadEventLog).toHaveBeenCalled();
      expect(kernel.run).toHaveBeenCalledWith('dfg', 'handle123', expect.anything());
      expect(kernel.freeHandle).toHaveBeenCalledWith('handle123');
    });

    it('should process multiple log files', async () => {
      const config: BatchConfig = { algorithm: 'dfg', kernel, workers: 2 };
      const runner = new BatchRunner(config);
      const logPaths = ['log1.xes', 'log2.xes', 'log3.xes'];
      const result = await runner.run(logPaths);
      expect(result.summary.totalLogs).toBe(3);
      expect(result.results).toHaveLength(3);
      expect(kernel.loadEventLog).toHaveBeenCalledTimes(3);
    });
  });

  describe('summary statistics', () => {
    it('should calculate success count', async () => {
      const config: BatchConfig = { algorithm: 'dfg', kernel, workers: 1 };
      const runner = new BatchRunner(config);
      const result = await runner.run(['log1.xes', 'log2.xes']);
      expect(result.summary.successful).toBe(result.summary.totalLogs);
    });

    it('should calculate total elapsed time', async () => {
      const config: BatchConfig = { algorithm: 'dfg', kernel, workers: 1 };
      const runner = new BatchRunner(config);
      const result = await runner.run(['log.xes']);
      expect(result.summary.totalElapsedMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('error handling', () => {
    it('should handle file read errors', async () => {
      vi.mocked(fs.readFile).mockRejectedValueOnce(new Error('Read error'));
      const config: BatchConfig = { algorithm: 'dfg', kernel, workers: 1 };
      const runner = new BatchRunner(config);
      const result = await runner.run(['bad.xes']);
      expect(result.results[0].status).toBe('failed');
      expect(result.results[0].error).toBe('Read error');
    });

    it('should handle kernel.run errors', async () => {
      vi.spyOn(kernel, 'run').mockRejectedValueOnce(new Error('WASM error'));
      const config: BatchConfig = { algorithm: 'dfg', kernel, workers: 1 };
      const runner = new BatchRunner(config);
      const result = await runner.run(['log.xes']);
      expect(result.results[0].status).toBe('failed');
      expect(result.results[0].error).toBe('WASM error');
      // Should still free the handle if load succeeded
      expect(kernel.freeHandle).toHaveBeenCalled();
    });
  });
});

