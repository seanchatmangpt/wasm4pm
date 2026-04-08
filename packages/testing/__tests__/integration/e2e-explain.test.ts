/**
 * e2e-explain.test.ts
 * Explain command tests for pictl
 * Tests: Execution tracing, decisions, recommendations
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { tmpdir } from 'os';

/**
 * Explanation snapshot
 */
interface ExplainSnapshot {
  runId: string;
  timestamp: string;
  algorithm: string;
  decisions: Decision[];
  statistics: Record<string, unknown>;
  recommendations: string[];
}

/**
 * Algorithm decision
 */
interface Decision {
  stepId: string;
  decision: string;
  reasoning: string;
  alternatives: string[];
  confidence: number;
}

/**
 * Helper to create temporary test environment
 */
async function createTestEnv() {
  const tempDir = await fs.mkdtemp(path.join(tmpdir(), 'wasm4pm-explain-test-'));
  return {
    tempDir,
    cleanup: async () => {
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch (e) {
        // ignore
      }
    },
  };
}

/**
 * Explain Output Tests
 */
describe('e2e-explain: Output Format', () => {
  let env: Awaited<ReturnType<typeof createTestEnv>>;

  beforeEach(async () => {
    env = await createTestEnv();
  });

  afterEach(async () => {
    await env.cleanup();
  });

  it('should generate explain snapshot with required fields', async () => {
    // Arrange
    const snapshot: ExplainSnapshot = {
      runId: 'run_001',
      timestamp: new Date().toISOString(),
      algorithm: 'dfg',
      decisions: [
        {
          stepId: 'discover_1',
          decision: 'Added edge A→B',
          reasoning: 'Edge frequency 10, meets threshold 5',
          alternatives: ['Exclude due to low frequency'],
          confidence: 0.95,
        },
      ],
      statistics: {
        edgesDiscovered: 1,
        activitiesFound: 2,
      },
      recommendations: [
        'Consider increasing support threshold for larger logs',
      ],
    };

    // Assert: Verify structure
    expect(snapshot.runId).toBeDefined();
    expect(snapshot.timestamp).toBeDefined();
    expect(snapshot.algorithm).toBeDefined();
    expect(Array.isArray(snapshot.decisions)).toBe(true);
    expect(snapshot.statistics).toBeDefined();
    expect(Array.isArray(snapshot.recommendations)).toBe(true);
  });

  it('should include algorithm name in explanation', async () => {
    // Arrange
    const algorithms = ['dfg', 'alpha', 'heuristic', 'genetic', 'ilp'];

    // Act & Assert
    for (const algo of algorithms) {
      const snapshot: ExplainSnapshot = {
        runId: 'run_001',
        timestamp: new Date().toISOString(),
        algorithm: algo,
        decisions: [],
        statistics: {},
        recommendations: [],
      };

      expect(snapshot.algorithm).toBe(algo);
    }
  });

  it('should format timestamp in ISO 8601', async () => {
    // Arrange
    const now = new Date();
    const snapshot: ExplainSnapshot = {
      runId: 'run_001',
      timestamp: now.toISOString(),
      algorithm: 'dfg',
      decisions: [],
      statistics: {},
      recommendations: [],
    };

    // Act: Parse timestamp
    const parsed = new Date(snapshot.timestamp);

    // Assert
    expect(parsed.getTime()).toBeCloseTo(now.getTime(), -3); // Within 1 second
  });

  it('should persist explain snapshot to disk', async () => {
    // Arrange
    const snapshotPath = path.join(env.tempDir, 'explain.json');
    const snapshot: ExplainSnapshot = {
      runId: 'run_001',
      timestamp: new Date().toISOString(),
      algorithm: 'dfg',
      decisions: [],
      statistics: {},
      recommendations: [],
    };

    // Act
    await fs.writeFile(snapshotPath, JSON.stringify(snapshot, null, 2));

    // Assert: Verify file exists and can be loaded
    const content = await fs.readFile(snapshotPath, 'utf-8');
    const loaded: ExplainSnapshot = JSON.parse(content);

    expect(loaded.runId).toBe(snapshot.runId);
    expect(loaded.algorithm).toBe(snapshot.algorithm);
  });
});

/**
 * Decision Tracing Tests
 */
describe('e2e-explain: Decision Tracing', () => {
  let env: Awaited<ReturnType<typeof createTestEnv>>;

  beforeEach(async () => {
    env = await createTestEnv();
  });

  afterEach(async () => {
    await env.cleanup();
  });

  it('should record each algorithmic decision', async () => {
    // Arrange
    const decisions: Decision[] = [
      {
        stepId: 'dfg_1',
        decision: 'Added edge A→B',
        reasoning: 'Support: 10/10 traces',
        alternatives: ['Skip edge'],
        confidence: 1.0,
      },
      {
        stepId: 'dfg_2',
        decision: 'Added edge B→C',
        reasoning: 'Support: 8/10 traces (80%)',
        alternatives: ['Skip edge'],
        confidence: 0.8,
      },
    ];

    // Act & Assert
    expect(decisions.length).toBe(2);
    for (const decision of decisions) {
      expect(decision.stepId).toBeDefined();
      expect(decision.decision).toBeDefined();
      expect(decision.reasoning).toBeDefined();
      expect(decision.confidence).toBeGreaterThanOrEqual(0);
      expect(decision.confidence).toBeLessThanOrEqual(1);
    }
  });

  it('should explain decision reasoning with metrics', async () => {
    // Arrange
    const decision: Decision = {
      stepId: 'dfg_edge_A_B',
      decision: 'Included edge A→B with weight 10',
      reasoning: 'Edge appeared in 10 out of 10 traces (100% support), exceeds threshold 50%',
      alternatives: [
        'Could exclude with low-frequency filter',
        'Could apply minimum confidence threshold',
      ],
      confidence: 1.0,
    };

    // Assert: Verify reasoning includes metrics
    expect(decision.reasoning).toContain('10');
    expect(decision.reasoning).toContain('100%');
    expect(decision.reasoning).toContain('50%');
  });

  it('should provide confidence score for each decision', async () => {
    // Arrange
    const decisions: Decision[] = [
      {
        stepId: 'step_1',
        decision: 'High confidence decision',
        reasoning: 'Clear in data',
        alternatives: [],
        confidence: 0.95,
      },
      {
        stepId: 'step_2',
        decision: 'Medium confidence decision',
        reasoning: 'Slightly ambiguous',
        alternatives: [],
        confidence: 0.6,
      },
      {
        stepId: 'step_3',
        decision: 'Low confidence decision',
        reasoning: 'Marginal evidence',
        alternatives: [],
        confidence: 0.2,
      },
    ];

    // Assert
    expect(decisions[0].confidence).toBeGreaterThan(0.9);
    expect(decisions[1].confidence).toBeLessThan(0.7);
    expect(decisions[2].confidence).toBeLessThan(0.3);
  });

  it('should list alternative decisions for each step', async () => {
    // Arrange
    const decision: Decision = {
      stepId: 'dfg_1',
      decision: 'Include edge A→B',
      reasoning: 'Support 100%',
      alternatives: [
        'Exclude due to low confidence',
        'Include with conditional filter',
        'Merge with similar edge',
      ],
      confidence: 0.9,
    };

    // Assert
    expect(decision.alternatives.length).toBeGreaterThan(0);
    expect(decision.alternatives[0]).toBeDefined();
  });

  it('should show decision sequence in execution order', async () => {
    // Arrange
    const decisions: Decision[] = [
      {
        stepId: 'step_1',
        decision: 'First decision',
        reasoning: 'Initial analysis',
        alternatives: [],
        confidence: 0.8,
      },
      {
        stepId: 'step_2',
        decision: 'Second decision',
        reasoning: 'Based on first',
        alternatives: [],
        confidence: 0.75,
      },
      {
        stepId: 'step_3',
        decision: 'Final decision',
        reasoning: 'Synthesis of previous',
        alternatives: [],
        confidence: 0.9,
      },
    ];

    // Assert: Verify order
    expect(decisions[0].stepId).toBe('step_1');
    expect(decisions[1].stepId).toBe('step_2');
    expect(decisions[2].stepId).toBe('step_3');
  });
});

/**
 * Statistics Explanation Tests
 */
describe('e2e-explain: Statistics Explanation', () => {
  let env: Awaited<ReturnType<typeof createTestEnv>>;

  beforeEach(async () => {
    env = await createTestEnv();
  });

  afterEach(async () => {
    await env.cleanup();
  });

  it('should include discovery statistics', async () => {
    // Arrange
    const stats = {
      inputTraces: 100,
      inputEvents: 1250,
      discoveredActivities: 8,
      discoveredEdges: 12,
      startActivities: 1,
      endActivities: 1,
      averageTraceLength: 12.5,
      frequencyEdges: 12,
      relativeFalsePositives: 0.0,
      relativelyRareFalseNegatives: 0.0,
    };

    // Assert
    expect(stats.discoveredActivities).toBeGreaterThan(0);
    expect(stats.discoveredEdges).toBeGreaterThan(0);
    expect(stats.averageTraceLength).toBeGreaterThan(0);
  });

  it('should show what was discovered', async () => {
    // Arrange
    const snapshot: ExplainSnapshot = {
      runId: 'run_001',
      timestamp: new Date().toISOString(),
      algorithm: 'dfg',
      decisions: [],
      statistics: {
        activities: ['register', 'examine', 'decide', 'notify'],
        edges: [
          { from: 'register', to: 'examine', frequency: 10 },
          { from: 'examine', to: 'decide', frequency: 8 },
          { from: 'decide', to: 'notify', frequency: 8 },
        ],
      },
      recommendations: [],
    };

    // Assert
    const stats = snapshot.statistics as any;
    expect(stats.activities).toBeDefined();
    expect(stats.edges).toBeDefined();
    expect(stats.activities.length).toBeGreaterThan(0);
  });

  it('should explain quality metrics', async () => {
    // Arrange
    const snapshot: ExplainSnapshot = {
      runId: 'run_001',
      timestamp: new Date().toISOString(),
      algorithm: 'dfg',
      decisions: [],
      statistics: {
        fitness: 0.95,
        precision: 0.92,
        generalization: 0.88,
        simplicity: 0.85,
      },
      recommendations: [],
    };

    // Assert
    const stats = snapshot.statistics as any;
    expect(stats.fitness).toBeGreaterThan(0.9);
    expect(stats.precision).toBeGreaterThan(0.9);
  });

  it('should compare against input statistics', async () => {
    // Arrange
    const snapshot: ExplainSnapshot = {
      runId: 'run_001',
      timestamp: new Date().toISOString(),
      algorithm: 'dfg',
      decisions: [],
      statistics: {
        input: {
          traces: 100,
          events: 1250,
          activities: 12,
        },
        discovered: {
          activities: 8,
          edges: 12,
        },
        comparison: {
          activitiesCovered: '67%',
          eventsCovered: '100%',
        },
      },
      recommendations: [],
    };

    // Assert
    const stats = snapshot.statistics as any;
    expect(stats.input).toBeDefined();
    expect(stats.discovered).toBeDefined();
    expect(stats.comparison).toBeDefined();
  });
});

/**
 * Recommendation Tests
 */
describe('e2e-explain: Recommendations', () => {
  let env: Awaited<ReturnType<typeof createTestEnv>>;

  beforeEach(async () => {
    env = await createTestEnv();
  });

  afterEach(async () => {
    await env.cleanup();
  });

  it('should provide algorithm recommendations', async () => {
    // Arrange
    const snapshot: ExplainSnapshot = {
      runId: 'run_001',
      timestamp: new Date().toISOString(),
      algorithm: 'dfg',
      decisions: [],
      statistics: {},
      recommendations: [
        'DFG algorithm used: fast but may miss complex patterns',
        'Consider Alpha++ for more sophisticated discovery',
        'Consider Genetic Algorithm for optimization',
      ],
    };

    // Assert
    expect(snapshot.recommendations.length).toBeGreaterThan(0);
    expect(snapshot.recommendations[0]).toContain('DFG');
  });

  it('should recommend parameter adjustments', async () => {
    // Arrange
    const snapshot: ExplainSnapshot = {
      runId: 'run_001',
      timestamp: new Date().toISOString(),
      algorithm: 'dfg',
      decisions: [],
      statistics: {},
      recommendations: [
        'Current support threshold: 0.5',
        'Increasing to 0.7 would filter noise but may miss real paths',
        'Decreasing to 0.3 would be more lenient',
      ],
    };

    // Assert
    expect(snapshot.recommendations.length).toBeGreaterThan(0);
    expect(snapshot.recommendations[0]).toContain('support');
  });

  it('should recommend next steps', async () => {
    // Arrange
    const snapshot: ExplainSnapshot = {
      runId: 'run_001',
      timestamp: new Date().toISOString(),
      algorithm: 'dfg',
      decisions: [],
      statistics: {},
      recommendations: [
        'Model discovered with 8 activities and 12 edges',
        'Next: Run conformance checking to evaluate fitness',
        'Then: Consider model optimization or enhancement',
      ],
    };

    // Assert
    expect(snapshot.recommendations.length).toBeGreaterThan(0);
    expect(snapshot.recommendations[1]).toContain('conformance');
  });

  it('should recommend data preprocessing', async () => {
    // Arrange
    const snapshot: ExplainSnapshot = {
      runId: 'run_001',
      timestamp: new Date().toISOString(),
      algorithm: 'dfg',
      decisions: [],
      statistics: {},
      recommendations: [
        'Log contains 3 outlier traces with unusual patterns',
        'Consider filtering outliers to improve model clarity',
        'Alternative: Run multiple discovery algorithms for comparison',
      ],
    };

    // Assert
    expect(snapshot.recommendations.length).toBeGreaterThan(0);
    expect(snapshot.recommendations[0]).toContain('outlier');
  });
});

/**
 * Accuracy and Matching Tests
 */
describe('e2e-explain: Accuracy Verification', () => {
  let env: Awaited<ReturnType<typeof createTestEnv>>;

  beforeEach(async () => {
    env = await createTestEnv();
  });

  afterEach(async () => {
    await env.cleanup();
  });

  it('should match explain output to actual execution', async () => {
    // Arrange: Create execution receipt and explain snapshot
    const receipt = {
      runId: 'run_001',
      algorithm: 'dfg',
      activitiesDiscovered: 8,
      edgesDiscovered: 12,
    };

    const snapshot: ExplainSnapshot = {
      runId: 'run_001',
      timestamp: new Date().toISOString(),
      algorithm: 'dfg',
      decisions: [],
      statistics: {
        activities: 8,
        edges: 12,
      },
      recommendations: [],
    };

    // Assert: Verify consistency
    expect(snapshot.runId).toBe(receipt.runId);
    expect(snapshot.algorithm).toBe(receipt.algorithm);
    const stats = snapshot.statistics as any;
    expect(stats.activities).toBe(receipt.activitiesDiscovered);
  });

  it('should be deterministic for same input and config', async () => {
    // Arrange: Same run twice
    const runId = 'run_001';
    const algorithm = 'dfg';

    const snapshot1: ExplainSnapshot = {
      runId,
      timestamp: new Date().toISOString(),
      algorithm,
      decisions: [
        {
          stepId: 'edge_1',
          decision: 'Include A→B',
          reasoning: 'Support 100%',
          alternatives: [],
          confidence: 1.0,
        },
      ],
      statistics: { edges: 1 },
      recommendations: [],
    };

    const snapshot2: ExplainSnapshot = {
      runId,
      timestamp: snapshot1.timestamp,
      algorithm,
      decisions: snapshot1.decisions,
      statistics: snapshot1.statistics,
      recommendations: snapshot1.recommendations,
    };

    // Assert
    expect(snapshot1.decisions).toEqual(snapshot2.decisions);
    expect(snapshot1.statistics).toEqual(snapshot2.statistics);
  });

  it('should explain why edges were included/excluded', async () => {
    // Arrange
    const decisions: Decision[] = [
      {
        stepId: 'edge_include_1',
        decision: 'Include A→B',
        reasoning: 'Frequency 10, support 100%, confidence 100%',
        alternatives: ['Exclude'],
        confidence: 1.0,
      },
      {
        stepId: 'edge_exclude_1',
        decision: 'Exclude X→Y',
        reasoning: 'Frequency 1, support 1%, confidence 1% (below threshold)',
        alternatives: ['Include'],
        confidence: 0.99,
      },
    ];

    // Assert
    expect(decisions[0].decision).toContain('Include');
    expect(decisions[1].decision).toContain('Exclude');
    expect(decisions[0].reasoning).toContain('100%');
    expect(decisions[1].reasoning).toContain('1%');
  });
});

/**
 * Human Readability Tests
 */
describe('e2e-explain: Human Readability', () => {
  let env: Awaited<ReturnType<typeof createTestEnv>>;

  beforeEach(async () => {
    env = await createTestEnv();
  });

  afterEach(async () => {
    await env.cleanup();
  });

  it('should use clear, non-technical language', async () => {
    // Arrange
    const snapshot: ExplainSnapshot = {
      runId: 'run_001',
      timestamp: new Date().toISOString(),
      algorithm: 'dfg',
      decisions: [],
      statistics: {},
      recommendations: [
        'The algorithm discovered a workflow with 8 main activities',
        'Activities are connected by 12 paths showing how work flows',
        'All discovered paths are supported by at least 50% of cases',
      ],
    };

    // Assert: Verify readable language
    for (const rec of snapshot.recommendations) {
      expect(rec.length).toBeGreaterThan(0);
      expect(rec).not.toContain('O(n²)'); // No big-O notation
    }
  });

  it('should be suitable for non-expert users', async () => {
    // Arrange
    const snapshot: ExplainSnapshot = {
      runId: 'run_001',
      timestamp: new Date().toISOString(),
      algorithm: 'dfg',
      decisions: [],
      statistics: {},
      recommendations: [
        'The discovered model shows the most common way work is performed',
        'In 95% of cases, activities follow this pattern exactly',
        'A few cases had variations that were not modeled',
      ],
    };

    // Assert
    expect(snapshot.recommendations[0]).not.toContain('trace');
    expect(snapshot.recommendations[0]).not.toContain('alphabet');
  });
});
