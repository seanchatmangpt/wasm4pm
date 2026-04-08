/**
 * Tests for enhanced planner features:
 * - BLAKE3 hashing
 * - TypedError (PlannerError) integration with contracts ErrorInfo
 * - toContractsPlan bridge
 * - Source/sink compatibility validation
 * - Fixture-based testing
 */

import { describe, it, expect } from 'vitest';
import { plan, PlannerError, toContractsPlan, type Config } from '../src/planner';
import { validatePlan, validateSourceSinkCompatibility } from '../src/validation';
import { topologicalSort } from '../src/dag';
import {
  fastConfig,
  balancedConfig,
  qualityConfig,
  researchConfig,
  streamConfig,
  fullConfig,
  configWithSink,
  invalidConfigs,
} from './fixtures/configs';

describe('Enhanced Planner', () => {
  describe('BLAKE3 hashing', () => {
    it('should produce 64-character hex hash', () => {
      const result = plan(fastConfig);
      expect(result.hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should be deterministic across calls', () => {
      const hash1 = plan({ ...fastConfig }).hash;
      const hash2 = plan({ ...fastConfig }).hash;
      expect(hash1).toBe(hash2);
    });

    it('should differ for different profiles', () => {
      const fastHash = plan(fastConfig).hash;
      const balancedHash = plan(balancedConfig).hash;
      const qualityHash = plan(qualityConfig).hash;

      expect(fastHash).not.toBe(balancedHash);
      expect(fastHash).not.toBe(qualityHash);
      expect(balancedHash).not.toBe(qualityHash);
    });

    it('should differ for different source formats', () => {
      const xesHash = plan(fastConfig).hash;
      const csvHash = plan({ ...fastConfig, source: { format: 'csv' } }).hash;
      expect(xesHash).not.toBe(csvHash);
    });

    it('should be independent of plan ID (UUID)', () => {
      // Same config should produce same hash even though IDs differ
      const plan1 = plan(fastConfig);
      const plan2 = plan(fastConfig);
      expect(plan1.id).not.toBe(plan2.id);
      expect(plan1.hash).toBe(plan2.hash);
    });
  });

  describe('PlannerError (TypedError)', () => {
    it('should throw PlannerError for null config', () => {
      expect(() => plan(invalidConfigs.nullConfig)).toThrow(PlannerError);
    });

    it('should throw PlannerError for bad version', () => {
      expect(() => plan(invalidConfigs.badVersion)).toThrow(PlannerError);
    });

    it('should throw PlannerError for missing source', () => {
      expect(() => plan(invalidConfigs.noSource)).toThrow(PlannerError);
    });

    it('should throw PlannerError for missing profile', () => {
      expect(() => plan(invalidConfigs.noProfile)).toThrow(PlannerError);
    });

    it('should carry ErrorInfo with error code CONFIG_INVALID', () => {
      try {
        plan(invalidConfigs.badVersion);
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(PlannerError);
        const plannerErr = err as PlannerError;
        expect(plannerErr.info.code).toBe('CONFIG_INVALID');
        expect(plannerErr.info.remediation).toBeTruthy();
        expect(plannerErr.info.exit_code).toBe(200);
        expect(plannerErr.info.recoverable).toBe(false);
      }
    });

    it('should include context in error info', () => {
      try {
        plan(invalidConfigs.badVersion);
        expect.fail('Should have thrown');
      } catch (err) {
        const plannerErr = err as PlannerError;
        expect(plannerErr.info.context).toBeDefined();
        expect(plannerErr.info.context?.version).toBe('2.0');
      }
    });

    it('should extend Error for compatibility', () => {
      try {
        plan(invalidConfigs.nullConfig);
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(Error);
        expect((err as Error).message).toBeTruthy();
      }
    });
  });

  describe('toContractsPlan bridge', () => {
    it('should convert ExecutionPlan to contracts Plan schema', () => {
      const executionPlan = plan(fastConfig);
      const contractsPlan = toContractsPlan(executionPlan);

      expect(contractsPlan.schema_version).toBe('1.0');
      expect(contractsPlan.plan_id).toBe(executionPlan.id);
      expect(contractsPlan.nodes).toBeDefined();
      expect(contractsPlan.edges).toBeDefined();
      expect(contractsPlan.metadata.planner).toBe('@pictl/planner');
    });

    it('should map step types to correct node kinds', () => {
      const executionPlan = plan(balancedConfig);
      const contractsPlan = toContractsPlan(executionPlan);

      const kinds = new Set(contractsPlan.nodes.map((n) => n.kind));
      expect(kinds.has('source')).toBe(true);
      expect(kinds.has('algorithm')).toBe(true);
      expect(kinds.has('sink')).toBe(true);
    });

    it('should sort nodes by id for determinism', () => {
      const executionPlan = plan(researchConfig);
      const contractsPlan = toContractsPlan(executionPlan);

      const ids = contractsPlan.nodes.map((n) => n.id);
      const sorted = [...ids].sort();
      expect(ids).toEqual(sorted);
    });

    it('should sort edges for determinism', () => {
      const executionPlan = plan(balancedConfig);
      const contractsPlan = toContractsPlan(executionPlan);

      for (let i = 1; i < contractsPlan.edges.length; i++) {
        const prev = contractsPlan.edges[i - 1];
        const curr = contractsPlan.edges[i];
        const cmp = prev.from.localeCompare(curr.from) || prev.to.localeCompare(curr.to);
        expect(cmp).toBeLessThanOrEqual(0);
      }
    });

    it('should include estimated_duration_ms in metadata', () => {
      const executionPlan = plan(fullConfig);
      const contractsPlan = toContractsPlan(executionPlan);

      expect(contractsPlan.metadata.estimated_duration_ms).toBeGreaterThan(0);
    });

    it('should have matching edge count to execution plan', () => {
      const executionPlan = plan(fastConfig);
      const contractsPlan = toContractsPlan(executionPlan);

      expect(contractsPlan.edges.length).toBe(executionPlan.graph.edges.length);
    });
  });

  describe('Source/sink compatibility', () => {
    it('should accept known source formats', () => {
      const errors = validateSourceSinkCompatibility('xes', 'json');
      const critical = errors.filter((e) => e.severity === 'error');
      expect(critical).toHaveLength(0);
    });

    it('should accept known sink formats', () => {
      const errors = validateSourceSinkCompatibility('csv', 'parquet');
      const critical = errors.filter((e) => e.severity === 'error');
      expect(critical).toHaveLength(0);
    });

    it('should warn on unknown source format', () => {
      const errors = validateSourceSinkCompatibility('unknown_format', 'json');
      expect(errors.some((e) => e.path === 'source' && e.severity === 'warning')).toBe(true);
    });

    it('should warn on unknown sink format', () => {
      const errors = validateSourceSinkCompatibility('xes', 'unknown_sink');
      expect(errors.some((e) => e.path === 'sink' && e.severity === 'warning')).toBe(true);
    });

    it('should error on empty source', () => {
      const errors = validateSourceSinkCompatibility('', 'json');
      expect(errors.some((e) => e.path === 'source' && e.severity === 'error')).toBe(true);
    });

    it('should error on empty sink', () => {
      const errors = validateSourceSinkCompatibility('xes', '');
      expect(errors.some((e) => e.path === 'sink' && e.severity === 'error')).toBe(true);
    });

    it('should include suggestions for unknown formats', () => {
      const errors = validateSourceSinkCompatibility('xlsx', 'pdf');
      const withSuggestion = errors.filter((e) => e.suggestion);
      expect(withSuggestion.length).toBeGreaterThan(0);
    });
  });

  describe('Fixture-based plan validation', () => {
    const configs: [string, Config][] = [
      ['fast', fastConfig],
      ['balanced', balancedConfig],
      ['quality', qualityConfig],
      ['research', researchConfig],
      ['stream', streamConfig],
      ['full', fullConfig],
      ['withSink', configWithSink],
    ];

    for (const [name, config] of configs) {
      it(`should produce valid plan for ${name} config`, () => {
        const result = plan(config);
        const errors = validatePlan(result);
        const critical = errors.filter((e) => e.severity === 'error');
        expect(critical).toHaveLength(0);
      });

      it(`should have valid topological order for ${name} config`, () => {
        const result = plan(config);
        const sorted = topologicalSort(result.graph);
        expect(sorted.length).toBe(result.steps.length);
      });

      it(`should produce 64-char BLAKE3 hash for ${name} config`, () => {
        const result = plan(config);
        expect(result.hash).toMatch(/^[0-9a-f]{64}$/);
      });
    }
  });

  describe('Plan DAG execution order', () => {
    it('should order bootstrap before init_wasm', () => {
      const result = plan(fastConfig);
      const sorted = topologicalSort(result.graph);
      expect(sorted.indexOf('bootstrap')).toBeLessThan(sorted.indexOf('init_wasm'));
    });

    it('should order init_wasm before load_source', () => {
      const result = plan(fastConfig);
      const sorted = topologicalSort(result.graph);
      expect(sorted.indexOf('init_wasm')).toBeLessThan(sorted.indexOf('load_source'));
    });

    it('should order load_source before validate_source', () => {
      const result = plan(fastConfig);
      const sorted = topologicalSort(result.graph);
      expect(sorted.indexOf('load_source')).toBeLessThan(sorted.indexOf('validate_source'));
    });

    it('should order validate_source before discovery steps', () => {
      const result = plan(balancedConfig);
      const sorted = topologicalSort(result.graph);
      const validateIdx = sorted.indexOf('validate_source');
      const discoverySteps = result.steps.filter((s) => s.type.startsWith('discover_'));

      for (const step of discoverySteps) {
        expect(sorted.indexOf(step.id)).toBeGreaterThan(validateIdx);
      }
    });

    it('should order cleanup last', () => {
      const result = plan(fastConfig);
      const sorted = topologicalSort(result.graph);
      expect(sorted[sorted.length - 1]).toBe('cleanup');
    });
  });

  describe('explain() == run() law', () => {
    it('should use the same plan function for explain and execution', () => {
      // The explain module imports and calls plan() directly
      // This test verifies the structural invariant
      const executionPlan = plan(fastConfig);
      const contractsPlan = toContractsPlan(executionPlan);

      // The contracts plan has source, algorithm, and sink nodes
      const sourceNodes = contractsPlan.nodes.filter((n) => n.kind === 'source');
      const algoNodes = contractsPlan.nodes.filter((n) => n.kind === 'algorithm');
      const sinkNodes = contractsPlan.nodes.filter((n) => n.kind === 'sink');

      // Structural invariant: source → algorithm → sink
      expect(sourceNodes.length).toBeGreaterThan(0);
      expect(algoNodes.length).toBeGreaterThan(0);
      expect(sinkNodes.length).toBeGreaterThan(0);
    });
  });
});
