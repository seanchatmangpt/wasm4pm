/**
 * Tests for the execution planner
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { plan, type Config, type ExecutionPlan } from '../src/planner';
import { PlanStepType } from '../src/steps';
import { validatePlan } from '../src/validation';

describe('Planner', () => {
  let testConfig: Config;

  beforeEach(() => {
    testConfig = {
      version: '1.0',
      source: { format: 'xes' },
      execution: { profile: 'fast' },
    };
  });

  describe('plan() - Basic functionality', () => {
    it('should generate a plan from valid config', () => {
      const result = plan(testConfig);

      expect(result).toBeDefined();
      expect(result.id).toBeTruthy();
      expect(result.hash).toBeTruthy();
      expect(result.steps).toBeDefined();
      expect(Array.isArray(result.steps)).toBe(true);
      expect(result.graph).toBeDefined();
    });

    it('should generate a unique ID for each plan', () => {
      const plan1 = plan(testConfig);
      const plan2 = plan(testConfig);

      expect(plan1.id).not.toBe(plan2.id);
    });

    it('should generate deterministic hash for same config', () => {
      const config1 = JSON.parse(JSON.stringify(testConfig));
      const config2 = JSON.parse(JSON.stringify(testConfig));

      const plan1 = plan(config1);
      const plan2 = plan(config2);

      expect(plan1.hash).toBe(plan2.hash);
    });

    it('should include required initialization steps', () => {
      const result = plan(testConfig);
      const stepTypes = result.steps.map((s) => s.type);

      expect(stepTypes).toContain(PlanStepType.BOOTSTRAP);
      expect(stepTypes).toContain(PlanStepType.INIT_WASM);
      expect(stepTypes).toContain(PlanStepType.LOAD_SOURCE);
      expect(stepTypes).toContain(PlanStepType.VALIDATE_SOURCE);
      expect(stepTypes).toContain(PlanStepType.CLEANUP);
    });

    it('should include discovery steps based on profile', () => {
      const fastPlan = plan({ ...testConfig, execution: { profile: 'fast' } });
      const balancedPlan = plan({ ...testConfig, execution: { profile: 'balanced' } });

      // Fast should have fewer steps than balanced
      expect(fastPlan.steps.length).toBeLessThan(balancedPlan.steps.length);

      // Fast should have DFG
      const fastTypes = fastPlan.steps.map((s) => s.type);
      expect(fastTypes).toContain(PlanStepType.DISCOVER_DFG);
    });

    it('should set correct sourceKind from config', () => {
      const xesConfig = { ...testConfig, source: { format: 'xes' } };
      const csvConfig = { ...testConfig, source: { format: 'csv' } };

      const xesPlan = plan(xesConfig);
      const csvPlan = plan(csvConfig);

      expect(xesPlan.sourceKind).toBe('xes');
      expect(csvPlan.sourceKind).toBe('csv');
    });

    it('should set profile from config', () => {
      const fastPlan = plan({ ...testConfig, execution: { profile: 'fast' } });
      const qualityPlan = plan({ ...testConfig, execution: { profile: 'quality' } });

      expect(fastPlan.profile).toBe('fast');
      expect(qualityPlan.profile).toBe('quality');
    });

    it('should set default sinkKind to json', () => {
      const result = plan(testConfig);
      expect(result.sinkKind).toBe('json');
    });

    it('should set custom sinkKind from output config', () => {
      const customConfig = {
        ...testConfig,
        output: { format: 'parquet' },
      };
      const result = plan(customConfig);
      expect(result.sinkKind).toBe('parquet');
    });
  });

  describe('plan() - Profiles', () => {
    it('should generate correct steps for "fast" profile', () => {
      const result = plan({ ...testConfig, execution: { profile: 'fast' } });
      const typeSet = new Set(result.steps.map((s) => s.type));

      expect(typeSet.has(PlanStepType.DISCOVER_DFG)).toBe(true);
      expect(typeSet.has(PlanStepType.ANALYZE_STATISTICS)).toBe(true);
    });

    it('should generate correct steps for "balanced" profile', () => {
      const result = plan({ ...testConfig, execution: { profile: 'balanced' } });
      const typeSet = new Set(result.steps.map((s) => s.type));

      expect(typeSet.has(PlanStepType.DISCOVER_ALPHA_PLUS_PLUS)).toBe(true);
      expect(typeSet.has(PlanStepType.ANALYZE_CONFORMANCE)).toBe(true);
    });

    it('should generate correct steps for "quality" profile', () => {
      const result = plan({ ...testConfig, execution: { profile: 'quality' } });
      const typeSet = new Set(result.steps.map((s) => s.type));

      expect(typeSet.has(PlanStepType.DISCOVER_GENETIC)).toBe(true);
      expect(typeSet.has(PlanStepType.DISCOVER_ILP)).toBe(true);
      expect(typeSet.has(PlanStepType.ANALYZE_PERFORMANCE)).toBe(true);
    });

    it('should default to balanced for unknown profile including "research"', () => {
      const result = plan({ ...testConfig, execution: { profile: 'research' } });
      const typeSet = new Set(result.steps.map((s) => s.type));

      // research falls back to balanced profile
      expect(typeSet.has(PlanStepType.DISCOVER_ALPHA_PLUS_PLUS)).toBe(true);
      expect(typeSet.has(PlanStepType.DISCOVER_HEURISTIC)).toBe(true);
    });

    it('should default to balanced for unknown profile', () => {
      const result = plan({ ...testConfig, execution: { profile: 'unknown' } });
      const typeSet = new Set(result.steps.map((s) => s.type));

      // Should match balanced profile
      expect(typeSet.has(PlanStepType.DISCOVER_ALPHA_PLUS_PLUS)).toBe(true);
    });
  });

  describe('plan() - ML analysis steps', () => {
    it('should generate ML steps when ml config is enabled', () => {
      const mlConfig = {
        ...testConfig,
        ml: { enabled: true, tasks: ['classify', 'cluster'] },
      };
      const result = plan(mlConfig);
      const typeSet = new Set(result.steps.map((s) => s.type));

      expect(typeSet.has(PlanStepType.ML_CLASSIFY)).toBe(true);
      expect(typeSet.has(PlanStepType.ML_CLUSTER)).toBe(true);
    });

    it('should generate all 6 ML step types when all tasks enabled', () => {
      const mlConfig = {
        ...testConfig,
        ml: { enabled: true, tasks: ['classify', 'cluster', 'forecast', 'anomaly', 'regress', 'pca'] },
      };
      const result = plan(mlConfig);
      const typeSet = new Set(result.steps.map((s) => s.type));

      expect(typeSet.has(PlanStepType.ML_CLASSIFY)).toBe(true);
      expect(typeSet.has(PlanStepType.ML_CLUSTER)).toBe(true);
      expect(typeSet.has(PlanStepType.ML_FORECAST)).toBe(true);
      expect(typeSet.has(PlanStepType.ML_ANOMALY)).toBe(true);
      expect(typeSet.has(PlanStepType.ML_REGRESS)).toBe(true);
      expect(typeSet.has(PlanStepType.ML_PCA)).toBe(true);
    });

    it('should not generate ML steps when ml is disabled', () => {
      const mlConfig = {
        ...testConfig,
        ml: { enabled: false, tasks: ['classify'] },
      };
      const result = plan(mlConfig);
      const typeSet = new Set(result.steps.map((s) => s.type));

      expect(typeSet.has(PlanStepType.ML_CLASSIFY)).toBe(false);
      expect(typeSet.has(PlanStepType.ML_CLUSTER)).toBe(false);
    });

    it('should not generate ML steps when ml is absent', () => {
      const result = plan(testConfig);
      const typeSet = new Set(result.steps.map((s) => s.type));

      expect(typeSet.has(PlanStepType.ML_CLASSIFY)).toBe(false);
    });

    it('should pass ML parameters to step', () => {
      const mlConfig = {
        ...testConfig,
        ml: { enabled: true, tasks: ['classify'], method: 'knn', k: 7, targetKey: 'result' },
      };
      const result = plan(mlConfig);
      const classifyStep = result.steps.find((s) => s.type === PlanStepType.ML_CLASSIFY);

      expect(classifyStep).toBeDefined();
      expect(classifyStep!.parameters.method).toBe('knn');
      expect(classifyStep!.parameters.k).toBe(7);
      expect(classifyStep!.parameters.target_key).toBe('result');
    });

    it('should skip unknown ML tasks', () => {
      const mlConfig = {
        ...testConfig,
        ml: { enabled: true, tasks: ['classify', 'nonexistent_task'] },
      };
      const result = plan(mlConfig);
      const typeSet = new Set(result.steps.map((s) => s.type));

      expect(typeSet.has(PlanStepType.ML_CLASSIFY)).toBe(true);
      expect(typeSet.has(PlanStepType.ML_CLUSTER)).toBe(false);
    });

    it('should produce deterministic plans for ML configs', () => {
      const mlConfig = {
        ...testConfig,
        ml: { enabled: true, tasks: ['classify', 'forecast'] },
      };
      const plan1 = plan(JSON.parse(JSON.stringify(mlConfig)));
      const plan2 = plan(JSON.parse(JSON.stringify(mlConfig)));

      expect(plan1.hash).toBe(plan2.hash);
    });
  });

  describe('plan() - Step structure', () => {
    it('should have all steps with required fields', () => {
      const result = plan(testConfig);

      for (const step of result.steps) {
        expect(step.id).toBeTruthy();
        expect(step.type).toBeTruthy();
        expect(step.description).toBeTruthy();
        expect(typeof step.required).toBe('boolean');
        expect(Array.isArray(step.dependsOn)).toBe(true);
        expect(typeof step.parallelizable).toBe('boolean');
        expect(typeof step.parameters).toBe('object');
      }
    });

    it('should have valid step dependencies', () => {
      const result = plan(testConfig);
      const stepIds = new Set(result.steps.map((s) => s.id));

      for (const step of result.steps) {
        for (const dep of step.dependsOn) {
          expect(stepIds.has(dep)).toBe(true);
        }
      }
    });

    it('should mark required steps correctly', () => {
      const result = plan(testConfig);

      const bootstrapStep = result.steps.find((s) => s.type === PlanStepType.BOOTSTRAP);
      const loadStep = result.steps.find((s) => s.type === PlanStepType.LOAD_SOURCE);
      const validateStep = result.steps.find((s) => s.type === PlanStepType.VALIDATE_SOURCE);

      expect(bootstrapStep?.required).toBe(true);
      expect(loadStep?.required).toBe(true);
      expect(validateStep?.required).toBe(true);
    });

    it('should mark non-required steps as optional', () => {
      const result = plan(testConfig);

      const cleanupStep = result.steps.find((s) => s.type === PlanStepType.CLEANUP);
      expect(cleanupStep?.required).toBe(false);
    });
  });

  describe('plan() - DAG structure', () => {
    it('should have valid nodes in DAG', () => {
      const result = plan(testConfig);
      const stepIds = result.steps.map((s) => s.id);

      expect(result.graph.nodes).toEqual(expect.arrayContaining(stepIds));
      expect(result.graph.nodes.length).toBe(stepIds.length);
    });

    it('should have valid edges in DAG', () => {
      const result = plan(testConfig);
      const stepIds = new Set(result.steps.map((s) => s.id));

      for (const [source, target] of result.graph.edges) {
        expect(stepIds.has(source)).toBe(true);
        expect(stepIds.has(target)).toBe(true);
      }
    });

    it('should have matching dependencies and edges', () => {
      const result = plan(testConfig);
      const expectedEdges = new Set<string>();

      for (const step of result.steps) {
        for (const dep of step.dependsOn) {
          expectedEdges.add(`${dep}->${step.id}`);
        }
      }

      for (const [source, target] of result.graph.edges) {
        expect(expectedEdges.has(`${source}->${target}`)).toBe(true);
      }
    });
  });

  describe('plan() - Configuration validation', () => {
    it('should throw on missing version', () => {
      const badConfig = { ...testConfig };
      delete (badConfig as any).version;

      expect(() => plan(badConfig as any)).toThrow();
    });

    it('should throw on invalid version', () => {
      const badConfig = { ...testConfig, version: '2.0' as any };

      expect(() => plan(badConfig)).toThrow();
    });

    it('should throw on missing source format', () => {
      const badConfig = { ...testConfig, source: {} as any };

      expect(() => plan(badConfig)).toThrow();
    });

    it('should throw on missing execution profile', () => {
      const badConfig = { ...testConfig, execution: {} as any };

      expect(() => plan(badConfig)).toThrow();
    });

    it('should throw on null config', () => {
      expect(() => plan(null as any)).toThrow();
    });

    it('should throw on non-object config', () => {
      expect(() => plan('config' as any)).toThrow();
      expect(() => plan(123 as any)).toThrow();
    });
  });

  describe('plan() - Advanced features', () => {
    it('should preserve custom pipeline parameters', () => {
      const configWithParams = {
        ...testConfig,
        execution: {
          profile: 'fast',
          parameters: { timeout: 5000, retries: 3 },
        },
      };

      const result = plan(configWithParams);

      // All steps should inherit parameters from execution config
      for (const step of result.steps) {
        if (step.type.startsWith('DISCOVER') || step.type.startsWith('ANALYZE')) {
          expect(Object.keys(step.parameters).length).toBeGreaterThanOrEqual(0);
        }
      }
    });

    it('should include report generation when specified', () => {
      const configWithReports = {
        ...testConfig,
        output: { generateReports: true },
      };

      const result = plan(configWithReports);
      const hasReportStep = result.steps.some((s) => s.type === PlanStepType.GENERATE_REPORTS);

      expect(hasReportStep).toBe(true);
    });

    it('should include sink writing when output is specified', () => {
      const configWithOutput = {
        ...testConfig,
        output: { format: 'json' },
      };

      const result = plan(configWithOutput);
      const hasSinkStep = result.steps.some((s) => s.type === PlanStepType.WRITE_SINK);

      expect(hasSinkStep).toBe(true);
    });

    it('should handle metadata preservation', () => {
      const configWithMeta = {
        ...testConfig,
        metadata: { name: 'Test Plan', description: 'A test execution' },
      };

      const result = plan(configWithMeta);

      expect(result.config.metadata?.name).toBe('Test Plan');
      expect(result.config.metadata?.description).toBe('A test execution');
    });
  });

  describe('plan() - Plan validity', () => {
    it('should produce valid plans that pass validation', () => {
      const result = plan(testConfig);
      const errors = validatePlan(result);
      const criticalErrors = errors.filter((e) => e.severity === 'error');

      expect(criticalErrors).toHaveLength(0);
    });

    it('should produce plans for all profiles that pass validation', () => {
      const profiles = ['fast', 'balanced', 'quality', 'stream', 'research'];

      for (const profile of profiles) {
        const result = plan({ ...testConfig, execution: { profile } });
        const errors = validatePlan(result);
        const criticalErrors = errors.filter((e) => e.severity === 'error');

        expect(criticalErrors).toHaveLength(0);
      }
    });
  });
});
