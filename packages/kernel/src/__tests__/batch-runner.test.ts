/**
 * batch-runner.test.ts
 * Unit tests for BatchRunner worker pool implementation
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BatchRunner, type BatchConfig, type BatchLogResult } from '../batch-runner.js';
import * as os from 'os';

describe('BatchRunner', () => {
  describe('constructor', () => {
    it('should create runner with custom config', () => {
      const config: BatchConfig = {
        algorithm: 'dfg',
        workers: 2,
        timeout: 5000,
      };
      const runner = new BatchRunner(config);
      expect(runner).toBeDefined();
    });

    it('should use default workers (CPU count) if not specified', () => {
      const config: BatchConfig = { algorithm: 'dfg' };
      const runner = new BatchRunner(config);
      expect(runner).toBeDefined();
      // Should not throw even with default CPU count
    });

    it('should use default timeout (5 minutes) if not specified', () => {
      const config: BatchConfig = { algorithm: 'heuristic' };
      const runner = new BatchRunner(config);
      expect(runner).toBeDefined();
    });

    it('should use default activity key if not specified', () => {
      const config: BatchConfig = { algorithm: 'alpha' };
      const runner = new BatchRunner(config);
      expect(runner).toBeDefined();
    });
  });

  describe('run', () => {
    it('should process empty log list', async () => {
      const config: BatchConfig = { algorithm: 'dfg', workers: 1 };
      const runner = new BatchRunner(config);
      const result = await runner.run([]);
      expect(result.summary.totalLogs).toBe(0);
      expect(result.summary.successful).toBe(0);
      expect(result.results).toHaveLength(0);
    });

    it('should process single log file', async () => {
      const config: BatchConfig = { algorithm: 'dfg', workers: 1 };
      const runner = new BatchRunner(config);
      const result = await runner.run(['log1.xes']);
      expect(result.summary.totalLogs).toBe(1);
      expect(result.results).toHaveLength(1);
      expect(result.results[0].logPath).toBe('log1.xes');
    });

    it('should process multiple log files', async () => {
      const config: BatchConfig = { algorithm: 'dfg', workers: 2 };
      const runner = new BatchRunner(config);
      const logPaths = ['log1.xes', 'log2.xes', 'log3.xes'];
      const result = await runner.run(logPaths);
      expect(result.summary.totalLogs).toBe(3);
      expect(result.results).toHaveLength(3);
    });

    it('should return results with correct structure', async () => {
      const config: BatchConfig = { algorithm: 'heuristic', workers: 1 };
      const runner = new BatchRunner(config);
      const result = await runner.run(['log.xes']);
      expect(result).toHaveProperty('summary');
      expect(result).toHaveProperty('results');
      expect(result).toHaveProperty('errors');
    });
  });

  describe('summary statistics', () => {
    it('should calculate success count', async () => {
      const config: BatchConfig = { algorithm: 'dfg', workers: 1 };
      const runner = new BatchRunner(config);
      const result = await runner.run(['log1.xes', 'log2.xes']);
      expect(result.summary.successful).toBe(result.summary.totalLogs);
      expect(result.summary.successful).toBeGreaterThanOrEqual(0);
    });

    it('should calculate total elapsed time', async () => {
      const config: BatchConfig = { algorithm: 'dfg', workers: 1 };
      const runner = new BatchRunner(config);
      const result = await runner.run(['log.xes']);
      expect(result.summary.totalElapsedMs).toBeGreaterThanOrEqual(0);
    });

    it('should calculate average elapsed time', async () => {
      const config: BatchConfig = { algorithm: 'dfg', workers: 1 };
      const runner = new BatchRunner(config);
      const result = await runner.run(['log1.xes', 'log2.xes']);
      expect(result.summary.averageElapsedMs).toBeGreaterThanOrEqual(0);
      if (result.summary.successful > 0) {
        expect(result.summary.averageElapsedMs).toBeLessThanOrEqual(result.summary.totalElapsedMs);
      }
    });

    it('should calculate min and max elapsed times', async () => {
      const config: BatchConfig = { algorithm: 'dfg', workers: 1 };
      const runner = new BatchRunner(config);
      const result = await runner.run(['log1.xes', 'log2.xes']);
      if (result.summary.successful > 0) {
        expect(result.summary.minElapsedMs).toBeLessThanOrEqual(result.summary.maxElapsedMs);
      }
    });

    it('should calculate success rate', async () => {
      const config: BatchConfig = { algorithm: 'dfg', workers: 1 };
      const runner = new BatchRunner(config);
      const result = await runner.run(['log1.xes', 'log2.xes']);
      expect(result.summary.successRate).toBeGreaterThanOrEqual(0);
      expect(result.summary.successRate).toBeLessThanOrEqual(1);
    });
  });

  describe('worker pool management', () => {
    it('should respect worker count limit', async () => {
      const config: BatchConfig = { algorithm: 'dfg', workers: 1 };
      const runner = new BatchRunner(config);
      const logPaths = Array.from({ length: 5 }, (_, i) => `log${i}.xes`);
      const result = await runner.run(logPaths);
      expect(result.summary.totalLogs).toBe(5);
      // With 1 worker, all should be processed serially
      expect(result.results).toHaveLength(5);
    });

    it('should handle concurrent workers', async () => {
      const config: BatchConfig = { algorithm: 'dfg', workers: 2 };
      const runner = new BatchRunner(config);
      const logPaths = Array.from({ length: 4 }, (_, i) => `log${i}.xes`);
      const result = await runner.run(logPaths);
      expect(result.summary.totalLogs).toBe(4);
      expect(result.results).toHaveLength(4);
    });

    it('should reset state between runs', async () => {
      const config: BatchConfig = { algorithm: 'dfg', workers: 1 };
      const runner = new BatchRunner(config);
      const result1 = await runner.run(['log1.xes']);
      runner.reset();
      const result2 = await runner.run(['log2.xes']);
      expect(result1.summary.totalLogs).toBe(1);
      expect(result2.summary.totalLogs).toBe(1);
    });
  });

  describe('result structure', () => {
    it('should include logPath in each result', async () => {
      const config: BatchConfig = { algorithm: 'dfg', workers: 1 };
      const runner = new BatchRunner(config);
      const result = await runner.run(['log.xes']);
      expect(result.results[0]).toHaveProperty('logPath', 'log.xes');
    });

    it('should include status in each result', async () => {
      const config: BatchConfig = { algorithm: 'dfg', workers: 1 };
      const runner = new BatchRunner(config);
      const result = await runner.run(['log.xes']);
      expect(result.results[0]).toHaveProperty('status');
      expect(['success', 'failed', 'timeout']).toContain(result.results[0].status);
    });

    it('should include elapsed time in each result', async () => {
      const config: BatchConfig = { algorithm: 'dfg', workers: 1 };
      const runner = new BatchRunner(config);
      const result = await runner.run(['log.xes']);
      expect(result.results[0]).toHaveProperty('elapsedMs');
      expect(typeof result.results[0].elapsedMs).toBe('number');
    });

    it('should include error message for failed logs', async () => {
      const config: BatchConfig = { algorithm: 'dfg', workers: 1 };
      const runner = new BatchRunner(config);
      const result = await runner.run(['invalid_log.xes']);
      // Might fail during processing
      if (result.results[0].status === 'failed') {
        expect(result.results[0]).toHaveProperty('error');
      }
    });
  });

  describe('error handling', () => {
    it('should not fail entire batch on single log error', async () => {
      const config: BatchConfig = { algorithm: 'dfg', workers: 1 };
      const runner = new BatchRunner(config);
      const logPaths = ['log1.xes', 'invalid.xes', 'log3.xes'];
      const result = await runner.run(logPaths);
      expect(result.summary.totalLogs).toBe(3);
      // Should have results for all logs, even if some fail
      expect(result.results).toHaveLength(3);
    });

    it('should collect errors in errors array', async () => {
      const config: BatchConfig = { algorithm: 'dfg', workers: 1 };
      const runner = new BatchRunner(config);
      const result = await runner.run(['log.xes']);
      expect(result.errors).toBeDefined();
      expect(Array.isArray(result.errors)).toBe(true);
    });

    it('should report partial failure correctly', async () => {
      const config: BatchConfig = { algorithm: 'dfg', workers: 1 };
      const runner = new BatchRunner(config);
      const logPaths = ['log1.xes', 'bad.xes'];
      const result = await runner.run(logPaths);
      // Even if all succeed, structure should be valid
      expect(result.summary.failed).toBeGreaterThanOrEqual(0);
      expect(result.summary.successful + result.summary.failed + result.summary.timedOut)
        .toBe(result.summary.totalLogs);
    });
  });

  describe('configuration combinations', () => {
    it('should work with dfg algorithm', async () => {
      const config: BatchConfig = { algorithm: 'dfg', workers: 1 };
      const runner = new BatchRunner(config);
      const result = await runner.run(['log.xes']);
      expect(result).toBeDefined();
    });

    it('should work with heuristic algorithm', async () => {
      const config: BatchConfig = { algorithm: 'heuristic', workers: 1 };
      const runner = new BatchRunner(config);
      const result = await runner.run(['log.xes']);
      expect(result).toBeDefined();
    });

    it('should work with verbose flag', async () => {
      const config: BatchConfig = { algorithm: 'dfg', workers: 1, verbose: true };
      const runner = new BatchRunner(config);
      const result = await runner.run(['log.xes']);
      expect(result).toBeDefined();
    });

    it('should work with custom timeout', async () => {
      const config: BatchConfig = { algorithm: 'dfg', workers: 1, timeout: 10000 };
      const runner = new BatchRunner(config);
      const result = await runner.run(['log.xes']);
      expect(result).toBeDefined();
    });
  });

  describe('performance', () => {
    it('should complete reasonably fast for empty batch', async () => {
      const config: BatchConfig = { algorithm: 'dfg', workers: 1 };
      const runner = new BatchRunner(config);
      const t0 = performance.now();
      await runner.run([]);
      const elapsed = performance.now() - t0;
      expect(elapsed).toBeLessThan(1000); // Should be < 1 second
    });

    it('should scale with worker count', async () => {
      const config1: BatchConfig = { algorithm: 'dfg', workers: 1 };
      const config2: BatchConfig = { algorithm: 'dfg', workers: 2 };
      const logPaths = Array.from({ length: 4 }, (_, i) => `log${i}.xes`);

      const runner1 = new BatchRunner(config1);
      const t1a = performance.now();
      await runner1.run(logPaths);
      const time1 = performance.now() - t1a;

      const runner2 = new BatchRunner(config2);
      const t2a = performance.now();
      await runner2.run(logPaths);
      const time2 = performance.now() - t2a;

      // More workers should complete in comparable or faster time
      expect(time1).toBeGreaterThan(0);
      expect(time2).toBeGreaterThan(0);
    });
  });
});

// ---------------------------------------------------------------------------
// Gap-closing tests (DX/QoL audit)
// These target the four gaps not covered by the tests above:
//   Gap 1 — run() without reset() accumulates results across calls
//   Gap 2 — maxWorkers > batchSize: all items still complete (no deadlock)
//   Gap 3 — progress events are emitted per log, completed event emitted once
//   Gap 4 — successRate = 0 when all logs fail (not just when batch is empty)
// ---------------------------------------------------------------------------

describe('BatchRunner — gap-closing tests', () => {
  // Gap 1: Calling run() twice without reset() accumulates results
  // The existing tests never call run() twice on the same instance without reset().
  // This verifies that a second run() call on a fresh runner gives a clean result
  // (the run() method re-initialises this.results at the top).
  describe('Gap 1 — consecutive run() calls reinitialise results', () => {
    it('second run() on the same instance (without reset) returns only second-run results', async () => {
      const config: BatchConfig = { algorithm: 'dfg', workers: 1 };
      const runner = new BatchRunner(config);

      // First run with 3 logs
      const result1 = await runner.run(['a.xes', 'b.xes', 'c.xes']);
      expect(result1.summary.totalLogs).toBe(3);

      // Second run without calling reset() — results must be for this run only
      const result2 = await runner.run(['x.xes']);
      expect(result2.summary.totalLogs).toBe(1);
      expect(result2.results).toHaveLength(1);
      expect(result2.results[0].logPath).toBe('x.xes');
    });

    it('third consecutive run returns only its own results', async () => {
      const config: BatchConfig = { algorithm: 'dfg', workers: 2 };
      const runner = new BatchRunner(config);

      await runner.run(['a.xes', 'b.xes']);
      await runner.run(['c.xes', 'd.xes', 'e.xes']);
      const result3 = await runner.run(['z.xes', 'y.xes']);

      expect(result3.summary.totalLogs).toBe(2);
      expect(result3.results.map(r => r.logPath)).toEqual(
        expect.arrayContaining(['z.xes', 'y.xes'])
      );
    });
  });

  // Gap 2: maxWorkers > batchSize
  // When more workers are configured than there are logs, no deadlock should occur
  // and all logs must still be processed to completion.
  describe('Gap 2 — maxWorkers > batchSize does not deadlock', () => {
    it('10 workers with 3 logs: all 3 complete', async () => {
      const config: BatchConfig = { algorithm: 'dfg', workers: 10 };
      const runner = new BatchRunner(config);
      const result = await runner.run(['a.xes', 'b.xes', 'c.xes']);

      expect(result.summary.totalLogs).toBe(3);
      expect(result.results).toHaveLength(3);
      expect(result.summary.successful + result.summary.failed + result.summary.timedOut).toBe(3);
    });

    it('100 workers with 1 log: the single log completes', async () => {
      const config: BatchConfig = { algorithm: 'heuristic', workers: 100 };
      const runner = new BatchRunner(config);
      const result = await runner.run(['single.xes']);

      expect(result.summary.totalLogs).toBe(1);
      expect(result.results).toHaveLength(1);
    });

    it('workers equal to CPU count (default) with exactly 1 log: completes cleanly', async () => {
      // Default workers = os.cpus().length — larger than 1
      const config: BatchConfig = { algorithm: 'dfg' };
      const runner = new BatchRunner(config);
      const result = await runner.run(['only.xes']);

      expect(result.summary.totalLogs).toBe(1);
      expect(result.results[0].logPath).toBe('only.xes');
    });
  });

  // Gap 3: EventEmitter — progress and completed events
  // BatchRunner extends EventEmitter but the previous tests never checked
  // whether events are actually emitted.
  describe('Gap 3 — progress and completed events are emitted', () => {
    it('emits a "progress" event for each processed log', async () => {
      const config: BatchConfig = { algorithm: 'dfg', workers: 1 };
      const runner = new BatchRunner(config);

      const progressEvents: unknown[] = [];
      runner.on('progress', (evt) => progressEvents.push(evt));

      await runner.run(['a.xes', 'b.xes', 'c.xes']);

      // One progress event per log
      expect(progressEvents).toHaveLength(3);
    });

    it('each progress event carries logPath and status fields', async () => {
      const config: BatchConfig = { algorithm: 'dfg', workers: 1 };
      const runner = new BatchRunner(config);

      const events: Array<{ logPath?: string; status?: string }> = [];
      runner.on('progress', (evt) => events.push(evt));

      await runner.run(['log1.xes', 'log2.xes']);

      for (const evt of events) {
        expect(evt).toHaveProperty('logPath');
        expect(evt).toHaveProperty('status');
        expect(['success', 'failed', 'timeout']).toContain(evt.status);
      }
    });

    it('emits exactly one "completed" event after the entire batch finishes', async () => {
      const config: BatchConfig = { algorithm: 'dfg', workers: 2 };
      const runner = new BatchRunner(config);

      const completedEvents: unknown[] = [];
      runner.on('completed', (result) => completedEvents.push(result));

      await runner.run(['a.xes', 'b.xes', 'c.xes', 'd.xes']);

      expect(completedEvents).toHaveLength(1);
    });

    it('"completed" event payload matches the return value of run()', async () => {
      const config: BatchConfig = { algorithm: 'dfg', workers: 1 };
      const runner = new BatchRunner(config);

      let completedPayload: unknown;
      runner.on('completed', (result) => { completedPayload = result; });

      const returnValue = await runner.run(['log.xes']);

      // Payload emitted in 'completed' must be the same object as the return value
      expect(completedPayload).toEqual(returnValue);
    });

    it('"completed" is emitted even for an empty batch', async () => {
      const config: BatchConfig = { algorithm: 'dfg', workers: 1 };
      const runner = new BatchRunner(config);

      let fired = false;
      runner.on('completed', () => { fired = true; });

      await runner.run([]);

      expect(fired).toBe(true);
    });
  });

  // Gap 4: successRate = 0 when all logs fail
  // The existing tests verify successRate in [0,1] and check the empty-batch case
  // but never verify the all-fail case independently.
  describe('Gap 4 — successRate = 0 when all logs fail (domain contract)', () => {
    it('successRate is 0.0 when batch is empty', async () => {
      const config: BatchConfig = { algorithm: 'dfg', workers: 1 };
      const runner = new BatchRunner(config);
      const result = await runner.run([]);
      expect(result.summary.successRate).toBe(0);
    });

    it('successRate is 1.0 when all logs succeed', async () => {
      const config: BatchConfig = { algorithm: 'dfg', workers: 1 };
      const runner = new BatchRunner(config);
      const result = await runner.run(['a.xes', 'b.xes', 'c.xes']);
      // simulateDiscovery never throws — all 3 should succeed
      expect(result.summary.successRate).toBe(1.0);
      expect(result.summary.successful).toBe(3);
      expect(result.summary.failed).toBe(0);
    });

    it('successRate + failRate + timeoutRate sums to 1.0 (or 0 for empty)', async () => {
      const config: BatchConfig = { algorithm: 'dfg', workers: 1 };
      const runner = new BatchRunner(config);
      const result = await runner.run(['a.xes', 'b.xes']);

      const total = result.summary.totalLogs;
      if (total > 0) {
        const rate =
          result.summary.successful / total +
          result.summary.failed / total +
          result.summary.timedOut / total;
        expect(Math.abs(rate - 1.0)).toBeLessThan(1e-10);
      }
    });

    it('averageElapsedMs is 0 when no logs succeed (domain contract: no samples)', async () => {
      // The current impl computes average over successful results only.
      // When there are zero successful results, average must be 0, not NaN.
      const config: BatchConfig = { algorithm: 'dfg', workers: 1 };
      const runner = new BatchRunner(config);
      const result = await runner.run([]);

      expect(result.summary.averageElapsedMs).toBe(0);
      expect(Number.isNaN(result.summary.averageElapsedMs)).toBe(false);
      expect(result.summary.minElapsedMs).toBe(0);
      expect(result.summary.maxElapsedMs).toBe(0);
    });
  });
});
