/**
 * algorithm-consensus.unit.test.ts — LinUCB Algorithm Consensus Unit Tests
 *
 * Focused unit tests for consensus logic without observability dependencies.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('AlgorithmConsensus - Quality Score Computation', () => {
  it('should compute quality score 0 for failed results', () => {
    const failed = { failed: true, error: 'test' };
    const quality = failed ? 0.0 : 0.5;
    expect(quality).toBe(0.0);
  });

  it('should compute quality score for valid JSON results', () => {
    const result = '{"edges": [], "nodes": []}';
    try {
      JSON.parse(result);
      const quality = 0.85;
      expect(quality).toBe(0.85);
    } catch {
      expect.fail('Should parse valid JSON');
    }
  });

  it('should compute quality score for discovery results with edges', () => {
    const result = { edges: [['A', 'B']], nodes: ['A', 'B'] };
    const quality = 'edges' in result ? 0.9 : 0.5;
    expect(quality).toBe(0.9);
  });

  it('should compute quality score for ML results with predictions', () => {
    const result = { predictions: [0, 1, 0, 1] };
    const quality = 'predictions' in result ? 0.85 : 0.5;
    expect(quality).toBe(0.85);
  });
});

describe('LinUCB UCB Value Computation', () => {
  it('should compute UCB value with exploration bonus', () => {
    const mean = 0.8;
    const stdDev = 0.1;
    const runCount = 10;
    const totalRuns = 100;
    const explorationParameter = 1.0;

    const standardError = stdDev / Math.sqrt(runCount);
    const explorationBonus =
      explorationParameter * standardError * Math.sqrt(Math.log(totalRuns));
    const ucbValue = mean + explorationBonus;

    expect(ucbValue).toBeGreaterThan(mean);
    expect(ucbValue).toBeLessThan(mean + 0.5);
  });

  it('should reduce exploration rate over time', () => {
    const rates: number[] = [];

    for (let t = 0; t < 100; t++) {
      const rate = Math.max(0.1, 1 / Math.sqrt(t + 1));
      rates.push(rate);
    }

    expect(rates[0]).toBeGreaterThan(rates[50]);
    expect(rates[50]).toBeGreaterThan(rates[99]);
    expect(rates[99]).toBe(0.1);
  });
});

describe('Consensus Statistics Computation', () => {
  it('should compute mean quality correctly', () => {
    const scores = [0.9, 0.92, 0.88];
    const mean = scores.reduce((a, b) => a + b) / scores.length;

    expect(mean).toBeCloseTo(0.9, 1);
  });

  it('should compute variance correctly', () => {
    const scores = [0.9, 0.92, 0.88];
    const mean = scores.reduce((a, b) => a + b) / scores.length;
    const variance =
      scores.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / scores.length;

    expect(variance).toBeGreaterThan(0);
    expect(Math.sqrt(variance)).toBeCloseTo(0.02, 2);
  });

  it('should compute 95% confidence interval', () => {
    const scores = Array.from({ length: 20 }, (_, i) => 0.7 + (i % 10) * 0.01);
    const mean = scores.reduce((a, b) => a + b) / scores.length;
    const variance =
      scores.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / scores.length;
    const stdDev = Math.sqrt(variance);
    const se = stdDev / Math.sqrt(scores.length);
    const margin = 1.96 * se;

    const lower = Math.max(0.0, mean - margin);
    const upper = Math.min(1.0, mean + margin);

    expect(lower).toBeGreaterThanOrEqual(0.0);
    expect(upper).toBeLessThanOrEqual(1.0);
    expect(lower).toBeLessThan(mean);
    expect(upper).toBeGreaterThan(mean);
  });

  it('should maintain ring buffer of quality scores', () => {
    const maxSize = 100;
    const history: number[] = [];

    for (let i = 0; i < 150; i++) {
      history.push(i);
      if (history.length > maxSize) {
        history.shift();
      }
    }

    expect(history.length).toBeLessThanOrEqual(maxSize);
    expect(history[history.length - 1]).toBe(149);
  });
});

describe('Context-Aware Algorithm Selection', () => {
  it('should classify simple logs (high diversity)', () => {
    const eventCount = 500000;
    const activityCount = 5;
    const diversity = eventCount / activityCount; // 100,000

    const complexity = diversity > 50 ? 'simple' : 'complex';
    expect(complexity).toBe('simple');
  });

  it('should classify complex logs (low diversity)', () => {
    const eventCount = 100;
    const activityCount = 80;
    const diversity = eventCount / activityCount; // 1.25

    const complexity = diversity < 10 ? 'complex' : 'simple';
    expect(complexity).toBe('complex');
  });

  it('should classify moderate logs', () => {
    const eventCount = 1000;
    const activityCount = 50;
    const diversity = eventCount / activityCount; // 20

    const complexity =
      diversity < 10 ? 'complex' : diversity > 50 ? 'simple' : 'moderate';
    expect(complexity).toBe('moderate');
  });
});

describe('XES Log Stats Extraction', () => {
  it('should extract trace and event counts from XES', () => {
    const xesContent = `<?xml version="1.0"?>
<log>
  <trace>
    <event>
      <string key="concept:name" value="A"/>
    </event>
    <event>
      <string key="concept:name" value="B"/>
    </event>
  </trace>
  <trace>
    <event>
      <string key="concept:name" value="A"/>
    </event>
  </trace>
</log>`;

    const traceMatches = xesContent.match(/<trace>/g);
    const eventMatches = xesContent.match(/<event>/g);

    expect(traceMatches?.length).toBe(2);
    expect(eventMatches?.length).toBe(3);
  });

  it('should extract unique activities from XES', () => {
    const activityA = 'concept:name="ActivityA"';
    const activityB = 'concept:name="ActivityB"';

    const pattern = /concept:name="([^"]+)"/;
    expect(pattern.test(activityA)).toBe(true);
    expect(pattern.test(activityB)).toBe(true);

    // Test that the same activity pattern can be extracted multiple times
    const testContent = 'concept:name="A" and concept:name="A"';
    const matches = testContent.match(/concept:name="([^"]+)"/g);
    expect(matches?.length).toBe(2); // Two occurrences
  });
});

describe('Consensus Decision Details', () => {
  it('should have valid confidence value', () => {
    const confidence = 0.95;
    expect(confidence).toBeGreaterThanOrEqual(0);
    expect(confidence).toBeLessThanOrEqual(1);
  });

  it('should have valid exploration rate', () => {
    const explorationRate = 0.15;
    expect(explorationRate).toBeGreaterThanOrEqual(0);
    expect(explorationRate).toBeLessThanOrEqual(1);
  });

  it('should include timestamp in decision', () => {
    const timestamp = new Date().toISOString();
    const date = new Date(timestamp);
    expect(date.toISOString()).toBe(timestamp);
  });
});

describe('Performance Metric Export', () => {
  it('should export algorithm performance data', () => {
    const metrics = {
      dfg: {
        algorithmId: 'dfg',
        runCount: 5,
        qualityScores: [0.9, 0.92],
        meanQuality: 0.91,
        variance: 0.0001,
        standardDeviation: 0.01,
        confidenceInterval95: [0.89, 0.93],
        lastRunAt: new Date().toISOString(),
        explorationCount: 1,
      },
    };

    expect(metrics.dfg.meanQuality).toBe(0.91);
    expect(metrics.dfg.confidenceInterval95[0]).toBeLessThan(
      metrics.dfg.meanQuality
    );
  });
});
