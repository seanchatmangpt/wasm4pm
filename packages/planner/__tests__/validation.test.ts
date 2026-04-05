/**
 * Tests for plan validation utilities
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { validatePlan, assertPlanValid, type ValidationError } from '../src/validation';
import { plan, type Config, type ExecutionPlan } from '../src/planner';
import { PlanStepType } from '../src/steps';

describe('Plan Validation', () => {
  let testConfig: Config;
  let validPlan: ExecutionPlan;

  beforeEach(() => {
    testConfig = {
      version: '1.0',
      source: { format: 'xes' },
      execution: { profile: 'fast' },
    };
    validPlan = plan(testConfig);
  });

  describe('validatePlan()', () => {
    it('should accept valid plan', () => {
      const errors = validatePlan(validPlan);
      const criticalErrors = errors.filter((e) => e.severity === 'error');

      expect(criticalErrors).toHaveLength(0);
    });

    it('should reject null plan', () => {
      const errors = validatePlan(null as any);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].severity).toBe('error');
    });

    it('should reject non-object plan', () => {
      const errors = validatePlan('plan' as any);

      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject plan with missing ID', () => {
      const badPlan = { ...validPlan, id: undefined };
      const errors = validatePlan(badPlan as any);

      expect(errors.some((e) => e.path.includes('id'))).toBe(true);
    });

    it('should reject plan with missing hash', () => {
      const badPlan = { ...validPlan, hash: undefined };
      const errors = validatePlan(badPlan as any);

      expect(errors.some((e) => e.path.includes('hash'))).toBe(true);
    });

    it('should reject plan with invalid steps array', () => {
      const badPlan = { ...validPlan, steps: 'not an array' };
      const errors = validatePlan(badPlan as any);

      expect(errors.some((e) => e.path.includes('steps'))).toBe(true);
    });

    it('should reject plan with invalid graph', () => {
      const badPlan = { ...validPlan, graph: { nodes: 'invalid', edges: [] } };
      const errors = validatePlan(badPlan as any);

      expect(errors.some((e) => e.path.includes('graph'))).toBe(true);
    });

    it('should check for duplicate step IDs', () => {
      const badPlan = {
        ...validPlan,
        steps: [validPlan.steps[0], validPlan.steps[0]],
      };
      const errors = validatePlan(badPlan);

      expect(errors.some((e) => e.message.includes('Duplicate'))).toBe(true);
    });

    it('should check for undefined step types', () => {
      const badPlan = {
        ...validPlan,
        steps: [{ ...validPlan.steps[0], type: 'invalid_type' }],
      };
      const errors = validatePlan(badPlan);

      expect(errors.some((e) => e.message.includes('Invalid step type'))).toBe(true);
    });

    it('should require bootstrap step', () => {
      const noBootstrap = {
        ...validPlan,
        steps: validPlan.steps.filter((s) => s.type !== PlanStepType.BOOTSTRAP),
      };
      const errors = validatePlan(noBootstrap);

      expect(errors.some((e) => e.message.includes('bootstrap'))).toBe(true);
    });

    it('should require load_source step', () => {
      const noLoad = {
        ...validPlan,
        steps: validPlan.steps.filter((s) => s.type !== PlanStepType.LOAD_SOURCE),
      };
      const errors = validatePlan(noLoad);

      expect(errors.some((e) => e.message.includes('load_source'))).toBe(true);
    });

    it('should require validate_source step', () => {
      const noValidate = {
        ...validPlan,
        steps: validPlan.steps.filter((s) => s.type !== PlanStepType.VALIDATE_SOURCE),
      };
      const errors = validatePlan(noValidate);

      expect(errors.some((e) => e.message.includes('validate_source'))).toBe(true);
    });

    it('should detect invalid dependencies', () => {
      const badPlan = {
        ...validPlan,
        steps: [
          { ...validPlan.steps[0], dependsOn: ['non_existent_step'] },
        ],
      };
      const errors = validatePlan(badPlan);

      expect(errors.some((e) => e.message.includes('Dependency'))).toBe(true);
    });

    it('should detect mismatch between steps and graph nodes', () => {
      const badPlan = {
        ...validPlan,
        graph: { ...validPlan.graph, nodes: ['extra_node'] },
      };
      const errors = validatePlan(badPlan);

      expect(errors.some((e) => e.message.includes('nodes but plan has'))).toBe(true);
    });

    it('should detect missing graph nodes for steps', () => {
      const badPlan = {
        ...validPlan,
        graph: {
          ...validPlan.graph,
          nodes: validPlan.graph.nodes.slice(1),
        },
      };
      const errors = validatePlan(badPlan);

      expect(errors.some((e) => e.message.includes('not found in graph'))).toBe(true);
    });

    it('should validate estimated duration is non-negative', () => {
      const badPlan = {
        ...validPlan,
        steps: [
          { ...validPlan.steps[0], estimatedDurationMs: -100 },
        ],
      };
      const errors = validatePlan(badPlan);

      expect(errors.some((e) => e.message.includes('non-negative'))).toBe(true);
    });

    it('should validate estimated memory is non-negative', () => {
      const badPlan = {
        ...validPlan,
        steps: [
          { ...validPlan.steps[0], estimatedMemoryMB: -50 },
        ],
      };
      const errors = validatePlan(badPlan);

      expect(errors.some((e) => e.message.includes('non-negative'))).toBe(true);
    });

    it('should warn on invalid profile', () => {
      const badPlan = { ...validPlan, profile: 'unknown_profile' };
      const errors = validatePlan(badPlan);

      expect(errors.some((e) => e.path.includes('profile') && e.severity === 'warning')).toBe(
        true
      );
    });

    it('should validate sourceKind', () => {
      const badPlan = { ...validPlan, sourceKind: '' };
      const errors = validatePlan(badPlan);

      expect(errors.some((e) => e.path.includes('sourceKind'))).toBe(true);
    });

    it('should validate sinkKind', () => {
      const badPlan = { ...validPlan, sinkKind: undefined };
      const errors = validatePlan(badPlan as any);

      expect(errors.some((e) => e.path.includes('sinkKind'))).toBe(true);
    });
  });

  describe('assertPlanValid()', () => {
    it('should not throw for valid plan', () => {
      expect(() => assertPlanValid(validPlan)).not.toThrow();
    });

    it('should throw for invalid plan', () => {
      const badPlan = { ...validPlan, id: '' };

      expect(() => assertPlanValid(badPlan as any)).toThrow();
    });

    it('should throw with error message', () => {
      const badPlan = { ...validPlan, profile: 'invalid' };

      try {
        assertPlanValid(badPlan);
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(Error);
      }
    });

    it('should only throw on critical errors, not warnings', () => {
      // A plan with warnings but no errors should not throw
      const plans = [
        plan({ ...testConfig, execution: { profile: 'fast' } }),
        plan({ ...testConfig, execution: { profile: 'balanced' } }),
        plan({ ...testConfig, execution: { profile: 'quality' } }),
      ];

      for (const p of plans) {
        expect(() => assertPlanValid(p)).not.toThrow();
      }
    });
  });

  describe('ValidationError type', () => {
    it('should include path in errors', () => {
      const badPlan = { ...validPlan, id: '' };
      const errors = validatePlan(badPlan as any);

      for (const error of errors) {
        expect(error).toHaveProperty('path');
        expect(typeof error.path).toBe('string');
      }
    });

    it('should include message in errors', () => {
      const badPlan = { ...validPlan, id: '' };
      const errors = validatePlan(badPlan as any);

      for (const error of errors) {
        expect(error).toHaveProperty('message');
        expect(typeof error.message).toBe('string');
      }
    });

    it('should include severity in errors', () => {
      const badPlan = { ...validPlan, id: '' };
      const errors = validatePlan(badPlan as any);

      for (const error of errors) {
        expect(error).toHaveProperty('severity');
        expect(['error', 'warning', 'info']).toContain(error.severity);
      }
    });

    it('should include suggestion when available', () => {
      const badPlan = { ...validPlan, profile: 'unknown_profile' };
      const errors = validatePlan(badPlan);

      const warningError = errors.find((e) => e.severity === 'warning');
      expect(warningError).toBeDefined();
      if (warningError && warningError.suggestion) {
        expect(typeof warningError.suggestion).toBe('string');
      }
    });
  });

  describe('validatePlan() - Edge cases', () => {
    it('should handle plan with no optional steps', () => {
      const errors = validatePlan(validPlan);
      const criticalErrors = errors.filter((e) => e.severity === 'error');

      expect(criticalErrors).toHaveLength(0);
    });

    it('should handle plan with all required steps', () => {
      const allRequired = {
        ...validPlan,
        steps: validPlan.steps.map((s) => ({ ...s, required: true })),
      };

      const errors = validatePlan(allRequired);
      const criticalErrors = errors.filter((e) => e.severity === 'error');

      expect(criticalErrors).toHaveLength(0);
    });

    it('should validate large plans', () => {
      const largePlan = plan({ ...testConfig, execution: { profile: 'research' } });

      const errors = validatePlan(largePlan);
      const criticalErrors = errors.filter((e) => e.severity === 'error');

      expect(criticalErrors).toHaveLength(0);
    });
  });
});
