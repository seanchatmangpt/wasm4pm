/**
 * perf-baseline.ts
 * Performance baseline measurement framework for all wasm4pm algorithms
 *
 * Measures:
 * - Latency (ms) for algorithm execution
 * - Peak memory (MB) during execution
 * - Throughput (events/sec) calculated from latency
 *
 * Test data: 3 sizes (small: 100 events, medium: 1k events, large: 10k events)
 * Runs each algorithm 3 times and reports mean ± std dev
 */

import { performance } from 'perf_hooks';

export interface TestEventLog {
  /** Number of events */
  eventCount: number;
  /** Number of traces (cases) */
  traceCount: number;
  /** Number of unique activities */
  activityCount: number;
  /** JSON content (XES-like) */
  content: string;
}

export interface MemorySnapshot {
  heapUsed: number; // bytes
  heapTotal: number; // bytes
  rss: number; // resident set size
  external: number; // external memory
}

export interface Measurement {
  /** Algorithm identifier */
  algorithm: string;
  /** Test data size: 'small', 'medium', 'large' */
  dataSize: 'small' | 'medium' | 'large';
  /** Event count in test data */
  eventCount: number;
  /** Mean latency (ms) across runs */
  latencyMs: {
    mean: number;
    stdDev: number;
    min: number;
    max: number;
    runs: number;
  };
  /** Peak memory (MB) across runs */
  memoryMB: {
    mean: number;
    stdDev: number;
    min: number;
    max: number;
  };
  /** Throughput (events/sec) */
  throughputEventsPerSec: {
    mean: number;
    stdDev: number;
  };
  /** Timestamp when measurement was taken */
  timestamp: string;
  /** Success rate (0-1) */
  successRate: number;
  /** Error messages if any failures */
  errors?: string[];
}

export interface BenchmarkResult {
  algorithm: string;
  dataSize: 'small' | 'medium' | 'large';
  measurements: Measurement[];
}

/**
 * Generate deterministic test event logs of varying sizes
 */
export function generateTestEventLogs(): { small: TestEventLog; medium: TestEventLog; large: TestEventLog } {
  const generateLog = (eventCount: number, traceCount: number, activityCount: number): TestEventLog => {
    const activities = Array.from({ length: activityCount }, (_, i) => `Activity_${i + 1}`);
    const events: any[] = [];
    let eventId = 0;

    for (let traceIdx = 0; traceIdx < traceCount; traceIdx++) {
      const traceLength = Math.max(1, Math.floor(eventCount / traceCount) + (traceIdx % 2 === 0 ? 1 : 0));

      for (let eventIdx = 0; eventIdx < traceLength && events.length < eventCount; eventIdx++) {
        const activity = activities[eventIdx % activities.length];
        const timestamp = new Date(2020, 0, 1 + Math.floor(events.length / 100), 10 + (eventIdx % 14));

        events.push({
          'concept:name': activity,
          'org:resource': `Resource_${(traceIdx % 5) + 1}`,
          'time:timestamp': timestamp.toISOString(),
          'case:concept:name': `Case_${traceIdx + 1}`,
          'case:creator': 'Generator',
        });
      }
    }

    // Trim to exact event count
    events.splice(eventCount);

    const content = JSON.stringify({
      log: events.map((e, idx) => ({
        '@attributes': e,
        trace: { '@attributes': { 'concept:name': e['case:concept:name'] } },
      })),
    });

    return {
      eventCount,
      traceCount,
      activityCount,
      content,
    };
  };

  return {
    small: generateLog(100, 10, 5),
    medium: generateLog(1000, 100, 20),
    large: generateLog(10000, 1000, 50),
  };
}

/**
 * Get current memory snapshot
 */
export function getMemorySnapshot(): MemorySnapshot {
  const memUsage = process.memoryUsage();
  return {
    heapUsed: memUsage.heapUsed,
    heapTotal: memUsage.heapTotal,
    rss: memUsage.rss,
    external: memUsage.external || 0,
  };
}

/**
 * Measure algorithm performance
 */
export async function measureAlgorithm(
  algorithmFn: (data: TestEventLog) => Promise<any>,
  testData: TestEventLog,
  algorithmName: string,
  iterations: number = 3
): Promise<Measurement> {
  const latencies: number[] = [];
  const memoryMeasurements: number[] = [];
  const errors: string[] = [];
  let successCount = 0;

  // Force garbage collection before measurements
  if (global.gc) {
    global.gc();
  }

  for (let i = 0; i < iterations; i++) {
    try {
      const memBefore = getMemorySnapshot();
      const startTime = performance.now();

      // Run algorithm
      await algorithmFn(testData);

      const endTime = performance.now();
      const memAfter = getMemorySnapshot();

      const latency = endTime - startTime;
      const peakMemoryMB = (memAfter.heapUsed - memBefore.heapUsed) / 1024 / 1024;

      latencies.push(latency);
      memoryMeasurements.push(Math.max(0, peakMemoryMB));
      successCount++;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      errors.push(`Run ${i + 1}: ${errorMsg}`);
    }

    // Small delay between iterations
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  // Calculate statistics
  const calculateStats = (values: number[]) => {
    if (values.length === 0) return { mean: 0, stdDev: 0, min: 0, max: 0 };

    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);

    return {
      mean,
      stdDev,
      min: Math.min(...values),
      max: Math.max(...values),
    };
  };

  const latencyStats = calculateStats(latencies);
  const memoryStats = calculateStats(memoryMeasurements);
  const throughput = testData.eventCount / (latencyStats.mean / 1000); // events per second

  return {
    algorithm: algorithmName,
    dataSize: testData.eventCount === 100 ? 'small' : testData.eventCount === 1000 ? 'medium' : 'large',
    eventCount: testData.eventCount,
    latencyMs: {
      ...latencyStats,
      runs: latencies.length,
    },
    memoryMB: memoryStats,
    throughputEventsPerSec: {
      mean: throughput,
      stdDev: (throughput * memoryStats.stdDev) / Math.max(1, memoryStats.mean), // rough approximation
    },
    timestamp: new Date().toISOString(),
    successRate: successCount / iterations,
    ...(errors.length > 0 && { errors }),
  };
}

/**
 * Format measurement for display
 */
export function formatMeasurement(m: Measurement): string {
  return `${m.algorithm} (${m.dataSize}):
    Latency: ${m.latencyMs.mean.toFixed(1)}ms ± ${m.latencyMs.stdDev.toFixed(1)}ms (${m.latencyMs.min.toFixed(1)}-${m.latencyMs.max.toFixed(1)})
    Memory: ${m.memoryMB.mean.toFixed(2)}MB ± ${m.memoryMB.stdDev.toFixed(2)}MB
    Throughput: ${m.throughputEventsPerSec.mean.toFixed(0)} events/sec
    Success Rate: ${(m.successRate * 100).toFixed(0)}%`;
}

/**
 * Generate a performance summary table
 */
export function generateSummaryTable(measurements: Measurement[]): string {
  // Group by algorithm
  const byAlgo = new Map<string, Measurement[]>();
  for (const m of measurements) {
    if (!byAlgo.has(m.algorithm)) {
      byAlgo.set(m.algorithm, []);
    }
    byAlgo.get(m.algorithm)!.push(m);
  }

  let table = '| Algorithm | Data Size | Latency (ms) | Memory (MB) | Throughput (events/sec) | Success |\n';
  table += '|-----------|-----------|--------------|------------|------------------------|----------|\n';

  const entries = Array.from(byAlgo.entries());
  for (let i = 0; i < entries.length; i++) {
    const [algo, ms] = entries[i];
    const sorted = ms.sort((a, b) => a.eventCount - b.eventCount);
    for (let j = 0; j < sorted.length; j++) {
      const m = sorted[j];
      const latency = `${m.latencyMs.mean.toFixed(1)}±${m.latencyMs.stdDev.toFixed(1)}`;
      const memory = `${m.memoryMB.mean.toFixed(2)}±${m.memoryMB.stdDev.toFixed(2)}`;
      const throughput = m.throughputEventsPerSec.mean.toFixed(0);
      const success = `${(m.successRate * 100).toFixed(0)}%`;

      table += `| ${algo} | ${m.dataSize} | ${latency} | ${memory} | ${throughput} | ${success} |\n`;
    }
  }

  return table;
}

/**
 * Color-code latency performance for display
 */
export function colorCodeLatency(latencyMs: number, dataSize: 'small' | 'medium' | 'large'): string {
  if (dataSize === 'small') {
    if (latencyMs < 100) return '🟢 fast';
    if (latencyMs < 1000) return '🟡 medium';
    if (latencyMs < 5000) return '🔴 slow';
    return '🔴 very slow';
  } else if (dataSize === 'medium') {
    if (latencyMs < 500) return '🟢 fast';
    if (latencyMs < 5000) return '🟡 medium';
    if (latencyMs < 15000) return '🔴 slow';
    return '🔴 very slow';
  } else {
    // large
    if (latencyMs < 2000) return '🟢 fast';
    if (latencyMs < 20000) return '🟡 medium';
    if (latencyMs < 60000) return '🔴 slow';
    return '🔴 very slow';
  }
}
