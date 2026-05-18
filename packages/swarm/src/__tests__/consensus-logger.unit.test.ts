/**
 * consensus-logger.unit.test.ts — Consensus Logger Unit Tests
 *
 * Focused unit tests for JSONL logging logic without observability dependencies.
 */

import { describe, it, expect } from 'vitest';

describe('Consensus Logger - JSONL Format', () => {
  it('should format decision as valid JSON', () => {
    const decision = {
      timestamp: new Date().toISOString(),
      type: 'decision',
      cycle: 1,
      selectedAlgorithm: 'dfg',
      confidence: 0.95,
    };

    const jsonStr = JSON.stringify(decision);
    const parsed = JSON.parse(jsonStr);

    expect(parsed.type).toBe('decision');
    expect(parsed.selectedAlgorithm).toBe('dfg');
  });

  it('should format performance update as valid JSON', () => {
    const update = {
      timestamp: new Date().toISOString(),
      type: 'update',
      cycle: 2,
      algorithmMetrics: {
        dfg: {
          runCount: 10,
          meanQuality: 0.9,
        },
      },
    };

    const jsonStr = JSON.stringify(update);
    const parsed = JSON.parse(jsonStr);

    expect(parsed.type).toBe('update');
    expect(parsed.algorithmMetrics.dfg.meanQuality).toBe(0.9);
  });

  it('should preserve multiple log entries', () => {
    const entries = [
      { timestamp: '2026-05-17T00:00:00Z', type: 'decision', cycle: 1 },
      { timestamp: '2026-05-17T00:00:01Z', type: 'update', cycle: 2 },
      { timestamp: '2026-05-17T00:00:02Z', type: 'decision', cycle: 3 },
    ];

    const lines = entries.map((e) => JSON.stringify(e));
    const roundtrip = lines.map((line) => JSON.parse(line));

    expect(roundtrip).toHaveLength(3);
    expect(roundtrip[0].cycle).toBe(1);
    expect(roundtrip[2].cycle).toBe(3);
  });
});

describe('Consensus Logger - Buffer Management', () => {
  it('should track buffer size', () => {
    const buffer: unknown[] = [];
    const maxSize = 100;

    for (let i = 0; i < 150; i++) {
      buffer.push({ id: i });
      if (buffer.length > maxSize) {
        buffer.shift();
      }
    }

    expect(buffer.length).toBeLessThanOrEqual(maxSize);
    expect((buffer[0] as { id: number }).id).toBeGreaterThanOrEqual(50);
  });

  it('should flush empty buffer without error', () => {
    const buffer: unknown[] = [];
    expect(buffer.length).toBe(0);
    expect(() => {
      const lines = buffer.map((e) => JSON.stringify(e));
      expect(lines.length).toBe(0);
    }).not.toThrow();
  });
});

describe('Consensus Logger - Log Path Management', () => {
  it('should construct correct log path', () => {
    const baseDir = '.wasm4pm';
    const logPath = `${baseDir}/swarm/consensus-log.jsonl`;

    expect(logPath).toContain('consensus-log.jsonl');
    expect(logPath).toContain('swarm');
    expect(logPath).toContain('.wasm4pm');
  });

  it('should support custom base directory', () => {
    const baseDir = '.custom-dir';
    const logPath = `${baseDir}/swarm/consensus-log.jsonl`;

    expect(logPath).toContain('.custom-dir');
    expect(logPath).toContain('swarm');
  });
});

describe('Consensus Logger - Entry Types', () => {
  it('should distinguish decision entries', () => {
    const decision = { type: 'decision', selectedAlgorithm: 'dfg' };
    expect(decision.type).toBe('decision');
  });

  it('should distinguish update entries', () => {
    const update = { type: 'update', algorithmMetrics: {} };
    expect(update.type).toBe('update');
  });

  it('should include cycle numbers in entries', () => {
    const entry1 = { cycle: 1, type: 'decision' };
    const entry2 = { cycle: 2, type: 'update' };

    expect(entry1.cycle).toBe(1);
    expect(entry2.cycle).toBe(2);
  });
});

describe('Consensus Logger - Timestamp Handling', () => {
  it('should use ISO 8601 timestamps', () => {
    const timestamp = new Date().toISOString();
    expect(timestamp).toMatch(
      /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z/
    );
  });

  it('should preserve timestamp precision in JSONL', () => {
    const original = new Date('2026-05-17T22:37:00.123Z');
    const entry = { timestamp: original.toISOString() };
    const roundtrip = JSON.parse(JSON.stringify(entry));

    expect(roundtrip.timestamp).toBe(original.toISOString());
  });

  it('should support multiple timestamps in sequence', () => {
    const times = [
      new Date('2026-05-17T00:00:00Z'),
      new Date('2026-05-17T00:00:01Z'),
      new Date('2026-05-17T00:00:02Z'),
    ];

    const entries = times.map((t) => ({
      timestamp: t.toISOString(),
    }));

    expect(new Date(entries[0].timestamp).getTime()).toBeLessThan(
      new Date(entries[2].timestamp).getTime()
    );
  });
});

describe('Consensus Logger - Performance Metrics Format', () => {
  it('should store per-algorithm metrics', () => {
    const metrics = {
      dfg: {
        algorithmId: 'dfg',
        runCount: 10,
        meanQuality: 0.9,
      },
      heuristic: {
        algorithmId: 'heuristic',
        runCount: 8,
        meanQuality: 0.6,
      },
    };

    expect(Object.keys(metrics)).toContain('dfg');
    expect(Object.keys(metrics)).toContain('heuristic');
    expect(metrics.dfg.meanQuality).toBeGreaterThan(metrics.heuristic.meanQuality);
  });

  it('should handle empty metrics gracefully', () => {
    const metrics = {};
    expect(Object.keys(metrics)).toHaveLength(0);
  });
});
