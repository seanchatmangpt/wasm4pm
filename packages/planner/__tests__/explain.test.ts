/**
 * Tests for the plan explanation functionality
 * Per PRD §11: explain() == run()
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { explain, explainBrief } from '../src/explain';
import { plan, type Config } from '../src/planner';

describe('Explain', () => {
  let testConfig: Config;

  beforeEach(() => {
    testConfig = {
      version: '1.0',
      source: { format: 'xes' },
      execution: { profile: 'fast' },
    };
  });

  describe('explain()', () => {
    it('should generate markdown explanation', () => {
      const explanation = explain(testConfig);

      expect(explanation).toBeTruthy();
      expect(typeof explanation).toBe('string');
      expect(explanation.length).toBeGreaterThan(0);
    });

    it('should include header', () => {
      const explanation = explain(testConfig);

      expect(explanation).toMatch(/# Execution Plan/);
    });

    it('should include plan information section', () => {
      const explanation = explain(testConfig);

      expect(explanation).toMatch(/## Plan Information/);
      expect(explanation).toMatch(/ID/);
      expect(explanation).toMatch(/Hash/);
      expect(explanation).toMatch(/Profile/);
    });

    it('should include configuration section', () => {
      const explanation = explain(testConfig);

      expect(explanation).toMatch(/## Configuration/);
      expect(explanation).toMatch(/fast/);
    });

    it('should include execution steps section', () => {
      const explanation = explain(testConfig);

      expect(explanation).toMatch(/## Execution Steps/);
    });

    it('should list all steps with descriptions', () => {
      const explanation = explain(testConfig);
      const executionPlan = plan(testConfig);

      for (const step of executionPlan.steps) {
        expect(explanation).toContain(step.id);
      }
    });

    it('should include dependency graph section', () => {
      const explanation = explain(testConfig);

      expect(explanation).toMatch(/## Dependency Graph/);
    });

    it('should include resource estimates section', () => {
      const explanation = explain(testConfig);

      expect(explanation).toMatch(/## Resource Estimates/);
      expect(explanation).toMatch(/Duration/);
      expect(explanation).toMatch(/Memory/);
    });

    it('should include reproducibility note', () => {
      const explanation = explain(testConfig);

      expect(explanation).toMatch(/## Reproducibility/);
      expect(explanation).toMatch(/deterministic/i);
    });

    it('should mark required steps', () => {
      const explanation = explain(testConfig);

      expect(explanation).toMatch(/Status.*Required/);
    });

    it('should mark optional steps', () => {
      const explanation = explain(testConfig);

      expect(explanation).toMatch(/Status.*Optional/);
    });

    it('should show step dependencies', () => {
      const explanation = explain(testConfig);
      const executionPlan = plan(testConfig);

      const stepWithDeps = executionPlan.steps.find((s) => s.dependsOn.length > 0);
      if (stepWithDeps) {
        expect(explanation).toContain(stepWithDeps.id);
      }
    });

    it('should include step parameters when present', () => {
      const configWithParams = {
        ...testConfig,
        execution: {
          profile: 'fast',
          parameters: { key: 'value' },
        },
      };

      const explanation = explain(configWithParams);

      expect(explanation).toContain('Parameters');
    });

    it('should handle configs with timeout', () => {
      const configWithTimeout = {
        ...testConfig,
        execution: { profile: 'fast', timeoutMs: 5000 },
      };

      const explanation = explain(configWithTimeout);

      expect(explanation).toMatch(/5000/);
    });

    it('should handle configs with max events', () => {
      const configWithMaxEvents = {
        ...testConfig,
        execution: { profile: 'fast', maxEvents: 10000 },
      };

      const explanation = explain(configWithMaxEvents);

      expect(explanation).toMatch(/10000/);
    });

    it('should be consistent with plan structure', () => {
      const explanation = explain(testConfig);
      const executionPlan = plan(testConfig);

      // Explanation should reference the profile
      expect(explanation).toContain(executionPlan.profile);

      // Explanation should reference source kind
      expect(explanation).toContain(executionPlan.sourceKind);

      // Explanation should list all step IDs
      for (const step of executionPlan.steps) {
        expect(explanation).toContain(step.id);
      }
    });
  });

  describe('explainBrief()', () => {
    it('should generate brief markdown explanation', () => {
      const explanation = explainBrief(testConfig);

      expect(explanation).toBeTruthy();
      expect(typeof explanation).toBe('string');
      expect(explanation.length).toBeGreaterThan(0);
    });

    it('should include profile and source', () => {
      const explanation = explainBrief(testConfig);

      expect(explanation).toContain('fast');
      expect(explanation).toContain('xes');
    });

    it('should include hash preview', () => {
      const explanation = explainBrief(testConfig);

      expect(explanation).toMatch(/[a-f0-9]{12}\.\.\./);
    });

    it('should list steps with status indicators', () => {
      const explanation = explainBrief(testConfig);

      expect(explanation).toContain('Steps:');
      // Should have status indicators
      expect(explanation).toMatch(/[✓○]/);
    });

    it('should show parallelization markers', () => {
      const explanation = explainBrief(testConfig);

      // Should have parallelization markers [P] or [S]
      expect(explanation).toMatch(/\[P\]|\[S\]/);
    });

    it('should include time estimate', () => {
      const explanation = explainBrief(testConfig);

      expect(explanation).toMatch(/Estimated.*\d+ms/);
    });

    it('should be shorter than full explanation', () => {
      const fullExplanation = explain(testConfig);
      const briefExplanation = explainBrief(testConfig);

      expect(briefExplanation.length).toBeLessThan(fullExplanation.length);
    });

    it('should reference same plan as full explanation', () => {
      const fullExplanation = explain(testConfig);
      const briefExplanation = explainBrief(testConfig);

      // Both should reference profile
      expect(fullExplanation).toContain('fast');
      expect(briefExplanation).toContain('fast');

      // Both should reference source
      expect(fullExplanation).toContain('xes');
      expect(briefExplanation).toContain('xes');
    });
  });

  describe('explain() - Determinism', () => {
    it('should generate same explanation for same config', () => {
      const config1 = JSON.parse(JSON.stringify(testConfig));
      const config2 = JSON.parse(JSON.stringify(testConfig));

      const explanation1 = explain(config1);
      const explanation2 = explain(config2);

      // Extract hash from explanations
      const hash1 = explanation1.match(/Hash.*`([a-f0-9]+)`/)?.[1];
      const hash2 = explanation2.match(/Hash.*`([a-f0-9]+)`/)?.[1];

      expect(hash1).toBe(hash2);
    });

    it('should generate different explanation for different profiles', () => {
      const fastExplain = explain({ ...testConfig, execution: { profile: 'fast' } });
      const balancedExplain = explain({ ...testConfig, execution: { profile: 'balanced' } });

      // Should have different hashes
      const fastHash = fastExplain.match(/Hash.*`([a-f0-9]+)`/)?.[1];
      const balancedHash = balancedExplain.match(/Hash.*`([a-f0-9]+)`/)?.[1];

      expect(fastHash).not.toBe(balancedHash);
    });

    it('should show consistent step count', () => {
      const explanation = explain(testConfig);
      const executionPlan = plan(testConfig);

      // Count numbered steps in explanation
      const stepMatches = explanation.match(/### \d+\./g);
      const stepCount = stepMatches ? stepMatches.length : 0;

      expect(stepCount).toBe(executionPlan.steps.length);
    });
  });

  describe('explain() - Parity with plan()', () => {
    // PRD §11: explain() output must reflect plan() output. These tests
    // guard against narrative drift — a regression where plan() emits a
    // field but explain() forgets to mention it.

    it('should narrate the BudgetEnvelope attached by plan()', () => {
      const explanation = explain(testConfig);
      const executionPlan = plan(testConfig);

      // BudgetEnvelope is Section 4.1 — every plan has one.
      expect(explanation).toMatch(/## Budget Envelope/);
      expect(explanation).toContain(executionPlan.budget.latencyBudget);
      expect(explanation).toContain(executionPlan.budget.qualityFloor);
      expect(explanation).toContain(executionPlan.budget.mode);
    });

    it('should narrate latency budget tier (fast → sub_ms)', () => {
      const explanation = explain({ ...testConfig, execution: { profile: 'fast' } });

      // fast profile must produce sub_ms latency budget.
      expect(explanation).toMatch(/Latency Budget.*sub_ms/);
    });

    it('should narrate latency budget tier (quality → high_ms)', () => {
      const explanation = explain({ ...testConfig, execution: { profile: 'quality' } });

      // quality profile must produce high_ms latency budget.
      expect(explanation).toMatch(/Latency Budget.*high_ms/);
    });

    it('should narrate memory budget when set', () => {
      const config: Config = {
        ...testConfig,
        execution: { profile: 'fast', maxMemoryMB: 256 },
      };
      const explanation = explain(config);

      // 256 MB → 256 * 1024 * 1024 bytes in budget.
      expect(explanation).toMatch(/Memory Budget.*256 MB/);
    });

    it('should narrate "unlimited" memory budget when maxMemoryMB=0', () => {
      const explanation = explain(testConfig);

      // Default config has no maxMemoryMB → budget.memoryBudget = 0 = unlimited.
      expect(explanation).toMatch(/Memory Budget.*unlimited/);
    });

    it('should narrate algorithm override when config.algorithm.name is set', () => {
      const config: Config = {
        ...testConfig,
        algorithm: { name: 'heuristic_miner', parameters: { dependency_threshold: 0.7 } },
      };
      const explanation = explain(config);

      // Without this surface, a user cannot tell from explain() that
      // their algorithm override was applied — plan() silently consumes it.
      expect(explanation).toMatch(/Algorithm Override.*heuristic_miner/);
      expect(explanation).toMatch(/dependency_threshold/);
    });

    it('should NOT mention algorithm override when not set', () => {
      const explanation = explain(testConfig);

      // No algorithm override → no override section.
      expect(explanation).not.toMatch(/Algorithm Override/);
    });

    it('should narrate ML tasks when config.ml is enabled', () => {
      const config: Config = {
        ...testConfig,
        ml: { enabled: true, tasks: ['classify', 'cluster'], method: 'kmeans' },
      };
      const explanation = explain(config);

      // plan() emits ML_CLASSIFY + ML_CLUSTER steps — explain() must mention them.
      expect(explanation).toMatch(/ML Tasks.*classify.*cluster/);
      expect(explanation).toMatch(/ML Method.*kmeans/);
    });

    it('should NOT mention ML tasks when ml is disabled', () => {
      const explanation = explain(testConfig);

      // No ml block → no ML section in narrative.
      expect(explanation).not.toMatch(/ML Tasks/);
    });

    it('budget mode should reflect quality+ilp → batch dispatch', () => {
      const config: Config = {
        ...testConfig,
        execution: { profile: 'quality' },
        algorithm: { name: 'ilp' },
      };
      const explanation = explain(config);

      // quality profile + ilp/genetic algorithm → batch mode per planner spec.
      expect(explanation).toMatch(/Execution Mode.*batch/);
    });
  });

  describe('explain() - All profiles', () => {
    const profiles = ['fast', 'balanced', 'quality', 'stream', 'research'];

    for (const profile of profiles) {
      it(`should generate valid explanation for ${profile} profile`, () => {
        const config = { ...testConfig, execution: { profile } };
        const explanation = explain(config);

        expect(explanation).toBeTruthy();
        expect(explanation).toMatch(/# Execution Plan/);
        expect(explanation).toMatch(/## Execution Steps/);
        expect(explanation).toContain(profile);
      });

      it(`should generate valid brief explanation for ${profile} profile`, () => {
        const config = { ...testConfig, execution: { profile } };
        const explanation = explainBrief(config);

        expect(explanation).toBeTruthy();
        expect(explanation).toContain(profile);
      });
    }
  });
});
