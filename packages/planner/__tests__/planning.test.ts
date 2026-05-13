/**
 * Tests for enhanced planner features.
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
    it('produces deterministic 64-char hex hashes that differ for different configs', () => {
      const result = plan(fastConfig);
      expect(result.hash).toMatch(/^[0-9a-f]{64}$/);

      expect(plan({ ...fastConfig }).hash).toBe(plan({ ...fastConfig }).hash);

      const fastHash = plan(fastConfig).hash;
      const balancedHash = plan(balancedConfig).hash;
      const qualityHash = plan(qualityConfig).hash;
      expect(fastHash).not.toBe(balancedHash);
      expect(fastHash).not.toBe(qualityHash);
      expect(balancedHash).not.toBe(qualityHash);

      expect(plan(fastConfig).hash).not.toBe(plan({ ...fastConfig, source: { format: 'csv' } }).hash);

      const plan1 = plan(fastConfig);
      const plan2 = plan(fastConfig);
      expect(plan1.id).not.toBe(plan2.id);
      expect(plan1.hash).toBe(plan2.hash);
    });
  });

  describe('PlannerError (TypedError)', () => {
    it('throws PlannerError with ErrorInfo for all invalid configs', () => {
      expect(() => plan(invalidConfigs.nullConfig)).toThrow(PlannerError);
      expect(() => plan(invalidConfigs.badVersion)).toThrow(PlannerError);
      expect(() => plan(invalidConfigs.noSource)).toThrow(PlannerError);
      expect(() => plan(invalidConfigs.noProfile)).toThrow(PlannerError);
      expect(() => plan(invalidConfigs.nullConfig)).toThrow(Error);

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
        expect(plannerErr.info.context).toBeDefined();
        expect(plannerErr.info.context?.version).toBe('2.0');
      }
    });
  });

  describe('toContractsPlan bridge', () => {
    it('converts ExecutionPlan to contracts Plan schema with correct structure and deterministic ordering', () => {
      const executionPlan = plan(fastConfig);
      const contractsPlan = toContractsPlan(executionPlan);

      expect(contractsPlan.schema_version).toBe('1.0');
      expect(contractsPlan.plan_id).toBe(executionPlan.id);
      expect(contractsPlan.nodes).toBeDefined();
      expect(contractsPlan.edges).toBeDefined();
      expect(contractsPlan.metadata.planner).toBe('@wasm4pm/planner');
      expect(contractsPlan.metadata.estimated_duration_ms).toBeGreaterThan(0);

      const balancedPlan = toContractsPlan(plan(balancedConfig));
      const kinds = new Set(balancedPlan.nodes.map((n) => n.kind));
      expect(kinds.has('source')).toBe(true);
      expect(kinds.has('algorithm')).toBe(true);
      expect(kinds.has('sink')).toBe(true);

      const researchPlan = toContractsPlan(plan(researchConfig));
      const ids = researchPlan.nodes.map((n) => n.id);
      expect(ids).toEqual([...ids].sort());

      for (let i = 1; i < balancedPlan.edges.length; i++) {
        const prev = balancedPlan.edges[i - 1];
        const curr = balancedPlan.edges[i];
        const cmp = prev.from.localeCompare(curr.from) || prev.to.localeCompare(curr.to);
        expect(cmp).toBeLessThanOrEqual(0);
      }

      const fullExecPlan = plan(fullConfig);
      const fullContractsPlan = toContractsPlan(fullExecPlan);
      expect(fullContractsPlan.edges.length).toBe(fullExecPlan.graph.edges.length);
    });

    it('explain() == run() structural invariant holds', () => {
      const executionPlan = plan(fastConfig);
      const contractsPlan = toContractsPlan(executionPlan);

      expect(contractsPlan.nodes.filter((n) => n.kind === 'source').length).toBeGreaterThan(0);
      expect(contractsPlan.nodes.filter((n) => n.kind === 'algorithm').length).toBeGreaterThan(0);
      expect(contractsPlan.nodes.filter((n) => n.kind === 'sink').length).toBeGreaterThan(0);
    });
  });

  describe('Source/sink compatibility', () => {
    it('accepts known formats, warns on unknown, errors on empty, includes suggestions', () => {
      expect(validateSourceSinkCompatibility('xes', 'json').filter((e) => e.severity === 'error')).toHaveLength(0);
      expect(validateSourceSinkCompatibility('csv', 'parquet').filter((e) => e.severity === 'error')).toHaveLength(0);

      const unknownSource = validateSourceSinkCompatibility('unknown_format', 'json');
      expect(unknownSource.some((e) => e.path === 'source' && e.severity === 'warning')).toBe(true);

      const unknownSink = validateSourceSinkCompatibility('xes', 'unknown_sink');
      expect(unknownSink.some((e) => e.path === 'sink' && e.severity === 'warning')).toBe(true);

      const emptySource = validateSourceSinkCompatibility('', 'json');
      expect(emptySource.some((e) => e.path === 'source' && e.severity === 'error')).toBe(true);

      const emptySink = validateSourceSinkCompatibility('xes', '');
      expect(emptySink.some((e) => e.path === 'sink' && e.severity === 'error')).toBe(true);

      const withSuggestion = validateSourceSinkCompatibility('xlsx', 'pdf');
      expect(withSuggestion.filter((e) => e.suggestion).length).toBeGreaterThan(0);
    });
  });

  describe('Fixture-based plan validation', () => {
    const configs: [string, Config][] = [
      ['fast', fastConfig], ['balanced', balancedConfig], ['quality', qualityConfig],
      ['research', researchConfig], ['stream', streamConfig], ['full', fullConfig], ['withSink', configWithSink],
    ];

    for (const [name, config] of configs) {
      it(`produces valid plan with topological order and 64-char hash for ${name} config`, () => {
        const result = plan(config);
        const errors = validatePlan(result);
        expect(errors.filter((e) => e.severity === 'error')).toHaveLength(0);

        const sorted = topologicalSort(result.graph);
        expect(sorted.length).toBe(result.steps.length);

        expect(result.hash).toMatch(/^[0-9a-f]{64}$/);
      });
    }
  });

  describe('Plan DAG execution order', () => {
    it('enforces correct step ordering from bootstrap to cleanup', () => {
      const result = plan(fastConfig);
      const sorted = topologicalSort(result.graph);

      expect(sorted.indexOf('bootstrap')).toBeLessThan(sorted.indexOf('init_wasm'));
      expect(sorted.indexOf('init_wasm')).toBeLessThan(sorted.indexOf('load_source'));
      expect(sorted.indexOf('load_source')).toBeLessThan(sorted.indexOf('validate_source'));
      expect(sorted[sorted.length - 1]).toBe('cleanup');

      const balancedResult = plan(balancedConfig);
      const balancedSorted = topologicalSort(balancedResult.graph);
      const validateIdx = balancedSorted.indexOf('validate_source');
      const discoverySteps = balancedResult.steps.filter((s) => s.type.startsWith('discover_'));
      for (const step of discoverySteps) {
        expect(balancedSorted.indexOf(step.id)).toBeGreaterThan(validateIdx);
      }
    });
  });
});
