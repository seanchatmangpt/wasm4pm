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
    it('accepts valid plan and rejects all structural issues', () => {
      expect(validatePlan(validPlan).filter((e) => e.severity === 'error')).toHaveLength(0);

      const nullErrors = validatePlan(null as any);
      expect(nullErrors.length).toBeGreaterThan(0);
      expect(nullErrors[0].severity).toBe('error');

      expect(validatePlan('plan' as any).length).toBeGreaterThan(0);

      const noId = { ...validPlan, id: undefined };
      expect(validatePlan(noId as any).some((e) => e.path.includes('id'))).toBe(true);

      const noHash = { ...validPlan, hash: undefined };
      expect(validatePlan(noHash as any).some((e) => e.path.includes('hash'))).toBe(true);

      const badSteps = { ...validPlan, steps: 'not an array' };
      expect(validatePlan(badSteps as any).some((e) => e.path.includes('steps'))).toBe(true);

      const badGraph = { ...validPlan, graph: { nodes: 'invalid', edges: [] } };
      expect(validatePlan(badGraph as any).some((e) => e.path.includes('graph'))).toBe(true);

      const dupSteps = { ...validPlan, steps: [validPlan.steps[0], validPlan.steps[0]] };
      expect(validatePlan(dupSteps).some((e) => e.message.includes('Duplicate'))).toBe(true);

      const badType = { ...validPlan, steps: [{ ...validPlan.steps[0], type: 'invalid_type' }] };
      expect(validatePlan(badType).some((e) => e.message.includes('Invalid step type'))).toBe(true);

      const noBootstrap = { ...validPlan, steps: validPlan.steps.filter((s) => s.type !== PlanStepType.BOOTSTRAP) };
      expect(validatePlan(noBootstrap).some((e) => e.message.includes('bootstrap'))).toBe(true);

      const noLoad = { ...validPlan, steps: validPlan.steps.filter((s) => s.type !== PlanStepType.LOAD_SOURCE) };
      expect(validatePlan(noLoad).some((e) => e.message.includes('load_source'))).toBe(true);

      const noValidate = { ...validPlan, steps: validPlan.steps.filter((s) => s.type !== PlanStepType.VALIDATE_SOURCE) };
      expect(validatePlan(noValidate).some((e) => e.message.includes('validate_source'))).toBe(true);

      const badDeps = { ...validPlan, steps: [{ ...validPlan.steps[0], dependsOn: ['non_existent_step'] }] };
      expect(validatePlan(badDeps).some((e) => e.message.includes('Dependency'))).toBe(true);

      const extraNode = { ...validPlan, graph: { ...validPlan.graph, nodes: ['extra_node'] } };
      expect(validatePlan(extraNode).some((e) => e.message.includes('nodes but plan has'))).toBe(true);

      const missingNode = { ...validPlan, graph: { ...validPlan.graph, nodes: validPlan.graph.nodes.slice(1) } };
      expect(validatePlan(missingNode).some((e) => e.message.includes('not found in graph'))).toBe(true);

      const negDuration = { ...validPlan, steps: [{ ...validPlan.steps[0], estimatedDurationMs: -100 }] };
      expect(validatePlan(negDuration).some((e) => e.message.includes('non-negative'))).toBe(true);

      const negMemory = { ...validPlan, steps: [{ ...validPlan.steps[0], estimatedMemoryMB: -50 }] };
      expect(validatePlan(negMemory).some((e) => e.message.includes('non-negative'))).toBe(true);

      const badProfile = { ...validPlan, profile: 'unknown_profile' };
      expect(validatePlan(badProfile).some((e) => e.path.includes('profile') && e.severity === 'warning')).toBe(true);

      const emptySourceKind = { ...validPlan, sourceKind: '' };
      expect(validatePlan(emptySourceKind).some((e) => e.path.includes('sourceKind'))).toBe(true);

      const noSinkKind = { ...validPlan, sinkKind: undefined };
      expect(validatePlan(noSinkKind as any).some((e) => e.path.includes('sinkKind'))).toBe(true);
    });
  });

  describe('assertPlanValid()', () => {
    it('does not throw for valid plan, throws for invalid plan with error message, only on critical errors', () => {
      expect(() => assertPlanValid(validPlan)).not.toThrow();

      expect(() => assertPlanValid({ ...validPlan, id: '' } as any)).toThrow();

      try {
        assertPlanValid({ ...validPlan, profile: 'invalid' });
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(Error);
      }

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
    it('includes path, message, severity, and optional suggestion in all errors', () => {
      const badPlan = { ...validPlan, id: '' };
      const errors = validatePlan(badPlan as any);

      for (const error of errors) {
        expect(error).toHaveProperty('path');
        expect(typeof error.path).toBe('string');
        expect(error).toHaveProperty('message');
        expect(typeof error.message).toBe('string');
        expect(error).toHaveProperty('severity');
        expect(['error', 'warning', 'info']).toContain(error.severity);
      }

      const profileErrors = validatePlan({ ...validPlan, profile: 'unknown_profile' });
      const warningError = profileErrors.find((e) => e.severity === 'warning');
      expect(warningError).toBeDefined();
      if (warningError && warningError.suggestion) {
        expect(typeof warningError.suggestion).toBe('string');
      }
    });
  });

  describe('validatePlan() - Edge cases', () => {
    it('handles valid plans with no optional steps, all required steps, and large plans', () => {
      expect(validatePlan(validPlan).filter((e) => e.severity === 'error')).toHaveLength(0);

      const allRequired = {
        ...validPlan,
        steps: validPlan.steps.map((s) => ({ ...s, required: true })),
      };
      expect(validatePlan(allRequired).filter((e) => e.severity === 'error')).toHaveLength(0);

      const largePlan = plan({ ...testConfig, execution: { profile: 'research' } });
      expect(validatePlan(largePlan).filter((e) => e.severity === 'error')).toHaveLength(0);
    });
  });
});
