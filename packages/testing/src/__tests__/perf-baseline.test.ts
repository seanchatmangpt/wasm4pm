/**
 * perf-baseline.test.ts
 * Performance baseline tests for representative wasm4pm algorithms
 *
 * Covers:
 * - Discovery algorithms (dfg, heuristic, genetic, ilp)
 * - Analysis algorithms (conformance, statistics)
 * - ML algorithms (cluster, anomaly)
 * - Streaming algorithms (streaming_dfg)
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  generateTestEventLogs,
  measureAlgorithm,
  formatMeasurement,
  generateSummaryTable,
  colorCodeLatency,
  type TestEventLog,
  type Measurement,
} from '../perf-baseline';

describe('Performance Baseline', () => {
  let testLogs: { small: TestEventLog; medium: TestEventLog; large: TestEventLog };

  beforeAll(() => {
    testLogs = generateTestEventLogs();
  });

  describe('Test Data Generation', () => {
    it('generates small log with 100 events', () => {
      expect(testLogs.small.eventCount).toBe(100);
      expect(testLogs.small.traceCount).toBe(10);
      expect(testLogs.small.activityCount).toBe(5);
    });

    it('generates medium log with 1000 events', () => {
      expect(testLogs.medium.eventCount).toBe(1000);
      expect(testLogs.medium.traceCount).toBe(100);
      expect(testLogs.medium.activityCount).toBe(20);
    });

    it('generates large log with 10000 events', () => {
      expect(testLogs.large.eventCount).toBe(10000);
      expect(testLogs.large.traceCount).toBe(1000);
      expect(testLogs.large.activityCount).toBe(50);
    });

    it('generates valid JSON content', () => {
      const parsed = JSON.parse(testLogs.small.content);
      expect(parsed.log).toBeDefined();
      expect(Array.isArray(parsed.log)).toBe(true);
      expect(parsed.log.length).toBe(100);
    });
  });

  describe('Mock Algorithm Benchmarks', () => {
    // Mock algorithm that simulates CPU-bound work
    const mockDFGAlgorithm = async (data: TestEventLog): Promise<any> => {
      return new Promise((resolve) => {
        // Simulate work proportional to event count
        const workMs = Math.log(data.eventCount + 1) * 10;
        const startTime = Date.now();
        while (Date.now() - startTime < workMs) {
          // CPU-bound loop
          let sum = 0;
          for (let i = 0; i < 1000000; i++) {
            sum += Math.sqrt(i);
          }
        }
        resolve({ nodes: [], edges: [] });
      });
    };

    // Mock algorithm that is medium speed
    const mockHeuristicMiner = async (data: TestEventLog): Promise<any> => {
      return new Promise((resolve) => {
        const workMs = Math.log(data.eventCount + 1) * 50;
        const startTime = Date.now();
        while (Date.now() - startTime < workMs) {
          let sum = 0;
          for (let i = 0; i < 1000000; i++) {
            sum += Math.sqrt(i);
          }
        }
        resolve({ nodes: [], edges: [] });
      });
    };

    // Mock algorithm that uses memory
    const mockMemoryIntensive = async (data: TestEventLog): Promise<any> => {
      // Allocate memory proportional to event count
      const arrays = Array.from({ length: Math.ceil(data.eventCount / 100) }, () =>
        new Float64Array(10000)
      );
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve(arrays[0]);
        }, 10);
      });
    };

    it('measures DFG-like algorithm performance on small log', async () => {
      const measurement = await measureAlgorithm(mockDFGAlgorithm, testLogs.small, 'dfg', 3);

      expect(measurement.algorithm).toBe('dfg');
      expect(measurement.dataSize).toBe('small');
      expect(measurement.eventCount).toBe(100);
      expect(measurement.latencyMs.mean).toBeGreaterThan(0);
      expect(measurement.latencyMs.stdDev).toBeGreaterThanOrEqual(0);
      expect(measurement.memoryMB.mean).toBeGreaterThanOrEqual(0);
      expect(measurement.throughputEventsPerSec.mean).toBeGreaterThan(0);
      expect(measurement.successRate).toBe(1.0);
    });

    it('measures heuristic miner-like algorithm', async () => {
      const measurement = await measureAlgorithm(mockHeuristicMiner, testLogs.medium, 'heuristic_miner', 2);

      expect(measurement.algorithm).toBe('heuristic_miner');
      expect(measurement.dataSize).toBe('medium');
      expect(measurement.latencyMs.runs).toBe(2);
      expect(measurement.successRate).toBe(1.0);
    });

    it('measures memory-intensive algorithm', async () => {
      const measurement = await measureAlgorithm(mockMemoryIntensive, testLogs.small, 'memory_test', 2);

      expect(measurement.algorithm).toBe('memory_test');
      expect(measurement.memoryMB.mean).toBeGreaterThan(0);
    });
  });

  describe('Measurement Formatting', () => {
    let exampleMeasurement: Measurement;

    beforeAll(() => {
      exampleMeasurement = {
        algorithm: 'dfg',
        dataSize: 'small',
        eventCount: 100,
        latencyMs: { mean: 45.5, stdDev: 5.2, min: 40, max: 51, runs: 3 },
        memoryMB: { mean: 12.5, stdDev: 2.1, min: 10, max: 15 },
        throughputEventsPerSec: { mean: 2197, stdDev: 250 },
        timestamp: new Date().toISOString(),
        successRate: 1.0,
      };
    });

    it('formats measurement as string', () => {
      const formatted = formatMeasurement(exampleMeasurement);

      expect(formatted).toContain('dfg (small)');
      expect(formatted).toContain('45.5ms');
      expect(formatted).toContain('12.5MB');
      expect(formatted).toContain('2197 events/sec');
      expect(formatted).toContain('100%');
    });

    it('color-codes latency for small logs', () => {
      expect(colorCodeLatency(50, 'small')).toContain('🟢');
      expect(colorCodeLatency(500, 'small')).toContain('🟡');
      expect(colorCodeLatency(2000, 'small')).toContain('🔴');
    });

    it('color-codes latency for medium logs', () => {
      expect(colorCodeLatency(300, 'medium')).toContain('🟢');
      expect(colorCodeLatency(2000, 'medium')).toContain('🟡');
      expect(colorCodeLatency(10000, 'medium')).toContain('🔴');
    });

    it('color-codes latency for large logs', () => {
      expect(colorCodeLatency(1000, 'large')).toContain('🟢');
      expect(colorCodeLatency(10000, 'large')).toContain('🟡');
      expect(colorCodeLatency(30000, 'large')).toContain('🔴');
    });
  });

  describe('Summary Table Generation', () => {
    it('generates markdown table from measurements', () => {
      const measurements: Measurement[] = [
        {
          algorithm: 'dfg',
          dataSize: 'small',
          eventCount: 100,
          latencyMs: { mean: 45.5, stdDev: 5.2, min: 40, max: 51, runs: 3 },
          memoryMB: { mean: 12.5, stdDev: 2.1, min: 10, max: 15 },
          throughputEventsPerSec: { mean: 2197, stdDev: 250 },
          timestamp: new Date().toISOString(),
          successRate: 1.0,
        },
        {
          algorithm: 'heuristic_miner',
          dataSize: 'medium',
          eventCount: 1000,
          latencyMs: { mean: 250.0, stdDev: 25.0, min: 225, max: 275, runs: 3 },
          memoryMB: { mean: 45.2, stdDev: 5.0, min: 40, max: 50 },
          throughputEventsPerSec: { mean: 4000, stdDev: 400 },
          timestamp: new Date().toISOString(),
          successRate: 1.0,
        },
      ];

      const table = generateSummaryTable(measurements);

      expect(table).toContain('| Algorithm');
      expect(table).toContain('dfg');
      expect(table).toContain('heuristic_miner');
      expect(table).toContain('small');
      expect(table).toContain('medium');
      expect(table).toContain('45.5±5.2');
      expect(table).toContain('250.0±25.0');
    });
  });
});
