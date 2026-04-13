/**
 * Agent 2: Algorithm Discovery — RED Test
 *
 * Mandate: Run all 15 process discovery algorithms, compare results
 * Ground Truth: van der Aalst — discover real structure from event logs
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AlgorithmDiscovery } from '../harness/algorithm-discovery';
import type { OcelEventLog } from '../harness/ocel-harvester';

describe('Agent 2: Algorithm Discovery', () => {
  let discovery: AlgorithmDiscovery;

  beforeEach(() => {
    discovery = new AlgorithmDiscovery();
  });

  describe('Discover with All Algorithms', () => {
    it('runs all 15 algorithms on same event log', async () => {
      const ocel: OcelEventLog = {
        version: '2.0',
        events: [
          { id: '1', activity: 'pm:discovery', timestamp: '2026-04-12T10:00:00Z', objects: ['inv-1'], attributes: {} },
          { id: '2', activity: 'pm:conformance', timestamp: '2026-04-12T10:00:01Z', objects: ['inv-1'], attributes: {} },
          { id: '3', activity: 'pm:analysis', timestamp: '2026-04-12T10:00:02Z', objects: ['inv-1'], attributes: {} },
        ],
        objects: [{ id: 'inv-1', type: 'tool_invocation', state: 'completed', attributes: {} }],
        metadata: {
          source: 'test',
          harvestedAt: new Date().toISOString(),
          spanCount: 3,
        },
      };

      const results = await discovery.discoverWithAllAlgorithms(ocel);

      expect(results.algorithms).toHaveLength(15);
      expect(results.algorithms.map((a) => a.name)).toEqual([
        'dfg',
        'process_skeleton',
        'alpha_plus_plus',
        'heuristic_miner',
        'inductive_miner',
        'hill_climbing',
        'declare',
        'simulated_annealing',
        'a_star',
        'aco',
        'pso',
        'genetic_algorithm',
        'optimized_dfg',
        'ilp',
        'powl',
      ]);
    });

    it('produces comparable quality metrics across algorithms', async () => {
      const ocel: OcelEventLog = {
        version: '2.0',
        events: [
          { id: '1', activity: 'a', timestamp: '2026-04-12T10:00:00Z', objects: ['t1'], attributes: {} },
          { id: '2', activity: 'b', timestamp: '2026-04-12T10:00:01Z', objects: ['t1'], attributes: {} },
          { id: '3', activity: 'c', timestamp: '2026-04-12T10:00:02Z', objects: ['t1'], attributes: {} },
          { id: '4', activity: 'a', timestamp: '2026-04-12T10:00:03Z', objects: ['t2'], attributes: {} },
          { id: '5', activity: 'c', timestamp: '2026-04-12T10:00:04Z', objects: ['t2'], attributes: {} },
        ],
        objects: [
          { id: 't1', type: 'tool_invocation', state: 'completed', attributes: {} },
          { id: 't2', type: 'tool_invocation', state: 'completed', attributes: {} },
        ],
        metadata: {
          source: 'test',
          harvestedAt: new Date().toISOString(),
          spanCount: 5,
        },
      };

      const results = await discovery.discoverWithAllAlgorithms(ocel);

      // All algorithms should produce fitness scores in [0, 1]
      results.algorithms.forEach((algo) => {
        expect(algo.fitness).toBeGreaterThanOrEqual(0);
        expect(algo.fitness).toBeLessThanOrEqual(1);
        expect(algo.precision).toBeGreaterThanOrEqual(0);
        expect(algo.precision).toBeLessThanOrEqual(1);
      });
    });

    it('ranks algorithms by quality metrics', async () => {
      const ocel: OcelEventLog = {
        version: '2.0',
        events: [
          { id: '1', activity: 'a', timestamp: '2026-04-12T10:00:00Z', objects: ['t1'], attributes: {} },
          { id: '2', activity: 'b', timestamp: '2026-04-12T10:00:01Z', objects: ['t1'], attributes: {} },
        ],
        objects: [{ id: 't1', type: 'tool_invocation', state: 'completed', attributes: {} }],
        metadata: {
          source: 'test',
          harvestedAt: new Date().toISOString(),
          spanCount: 2,
        },
      };

      const results = await discovery.discoverWithAllAlgorithms(ocel);

      // Results should be ranked by fitness (descending)
      for (let i = 0; i < results.algorithms.length - 1; i++) {
        expect(results.algorithms[i].fitness).toBeGreaterThanOrEqual(results.algorithms[i + 1].fitness);
      }

      // Top algorithm should have fitness >= 0.5
      expect(results.algorithms[0].fitness).toBeGreaterThanOrEqual(0.5);
    });
  });

  describe('Algorithm Comparison', () => {
    it('identifies fastest algorithm', async () => {
      const ocel: OcelEventLog = {
        version: '2.0',
        events: [
          { id: '1', activity: 'a', timestamp: '2026-04-12T10:00:00Z', objects: ['t1'], attributes: {} },
          { id: '2', activity: 'b', timestamp: '2026-04-12T10:00:01Z', objects: ['t1'], attributes: {} },
        ],
        objects: [{ id: 't1', type: 'tool_invocation', state: 'completed', attributes: {} }],
        metadata: {
          source: 'test',
          harvestedAt: new Date().toISOString(),
          spanCount: 2,
        },
      };

      const results = await discovery.discoverWithAllAlgorithms(ocel);

      expect(results.fastest).toBeDefined();
      expect(results.fastest?.name).toBeDefined();
      expect(results.fastest?.executionTimeMs).toBeGreaterThan(0);
    });

    it('identifies highest quality algorithm', async () => {
      const ocel: OcelEventLog = {
        version: '2.0',
        events: [
          { id: '1', activity: 'a', timestamp: '2026-04-12T10:00:00Z', objects: ['t1'], attributes: {} },
          { id: '2', activity: 'b', timestamp: '2026-04-12T10:00:01Z', objects: ['t1'], attributes: {} },
        ],
        objects: [{ id: 't1', type: 'tool_invocation', state: 'completed', attributes: {} }],
        metadata: {
          source: 'test',
          harvestedAt: new Date().toISOString(),
          spanCount: 2,
        },
      };

      const results = await discovery.discoverWithAllAlgorithms(ocel);

      expect(results.highestQuality).toBeDefined();
      expect(results.highestQuality?.fitness).toBe(results.algorithms[0].fitness);
    });
  });
});
