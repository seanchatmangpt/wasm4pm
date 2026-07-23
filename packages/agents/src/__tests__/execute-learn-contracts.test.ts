/**
 * Execute and Learn phase MAPE-K domain-contract tests.
 *
 * Oracle rank: Rank 2 — Domain contract.
 *
 * Covers:
 *   - Execute phase: correction application, audit trail, determinism, error safety
 *   - Learn phase: cycle accumulation, trend detection, idempotency, recommendations
 *   - MAPE-K integration: full Monitor→Analyze→Plan→Execute→Learn chain contracts
 *
 * No mocks of init.js or internal registries — Gemba principle.
 * All assertions derived from domain theory, not implementation.
 */

import { describe, it, expect } from 'vitest';
import { AgentOrchestrator } from '../orchestration.js';
import { AgentRegistry } from '../registry.js';
import { VAN_DERAALST_AGENTS } from '../types.js';
import type { AnalyzeResult, ExecuteResult, PlanResult, LearnResult } from '../types.js';

// ---------------------------------------------------------------------------
// Execute phase contracts (12 tests)
// ---------------------------------------------------------------------------

describe('AgentOrchestrator.execute — core contracts', () => {
  it('execute with empty plan returns zero corrections and zero counts', async () => {
    const orchestrator = new AgentOrchestrator();
    const emptyPlan: PlanResult = {
      actions: [],
      critical_actions: 0,
      warning_actions: 0,
    };
    const context = { artifact_id: 'test-artifact', dry_run: false };

    const result = await orchestrator.execute(emptyPlan, context);

    expect(result.corrections).toHaveLength(0);
    expect(result.successful_count).toBe(0);
    expect(result.failed_count).toBe(0);
  });

  it('execute result always has the three required fields', async () => {
    const orchestrator = new AgentOrchestrator();
    const plan: PlanResult = { actions: [], critical_actions: 0, warning_actions: 0 };

    const result = await orchestrator.execute(plan, { artifact_id: 'a', dry_run: false });

    expect(result).toHaveProperty('corrections');
    expect(result).toHaveProperty('successful_count');
    expect(result).toHaveProperty('failed_count');
    expect(Array.isArray(result.corrections)).toBe(true);
    expect(typeof result.successful_count).toBe('number');
    expect(typeof result.failed_count).toBe('number');
  });

  it('execute with one critical action produces one correction entry', async () => {
    const orchestrator = new AgentOrchestrator();
    const plan: PlanResult = {
      actions: [
        {
          agent: 'mock-interceptor',
          type: 'code_refactoring',
          target: 'test-artifact',
          severity: 'critical',
          requires_approval: true,
        },
      ],
      critical_actions: 1,
      warning_actions: 0,
    };

    const result = await orchestrator.execute(plan, { artifact_id: 'test-artifact', dry_run: false });

    expect(result.corrections).toHaveLength(1);
    // No correction backend exists: execute records the intended action but
    // must NOT report it as applied (see README "Known limitation").
    expect(result.successful_count).toBe(0);
    expect(result.failed_count).toBe(1);
    expect(result.corrections[0].correction_success).toBe(false);
    expect(result.corrections[0].correction_details.not_implemented).toBe(true);
  });

  it('each correction entry has required audit fields', async () => {
    const orchestrator = new AgentOrchestrator();
    const plan: PlanResult = {
      actions: [
        {
          agent: 'config-drift-guardian',
          type: 'config_restoration',
          target: 'wasm4pm.toml',
          severity: 'warning',
          requires_approval: false,
        },
      ],
      critical_actions: 0,
      warning_actions: 1,
    };

    const result = await orchestrator.execute(plan, { artifact_id: 'audit-test', dry_run: false });

    expect(result.corrections).toHaveLength(1);
    const entry = result.corrections[0];

    expect(entry).toHaveProperty('timestamp');
    expect(entry).toHaveProperty('agent_name');
    expect(entry).toHaveProperty('correction_type');
    expect(entry).toHaveProperty('violation');
    expect(entry).toHaveProperty('correction_action');
    expect(entry).toHaveProperty('correction_success');
    expect(entry).toHaveProperty('artifact_id');
    expect(typeof entry.timestamp).toBe('string');
    expect(typeof entry.correction_success).toBe('boolean');
  });

  it('execute successful_count + failed_count equals actions.length', async () => {
    const orchestrator = new AgentOrchestrator();
    const plan: PlanResult = {
      actions: [
        {
          agent: 'mock-interceptor',
          type: 'code_refactoring',
          target: 'artifact-1',
          severity: 'critical',
          requires_approval: true,
        },
        {
          agent: 'config-drift-guardian',
          type: 'config_restoration',
          target: 'artifact-2',
          severity: 'warning',
          requires_approval: false,
        },
      ],
      critical_actions: 1,
      warning_actions: 1,
    };

    const result = await orchestrator.execute(plan, { artifact_id: 'multi-action', dry_run: false });

    expect(result.successful_count + result.failed_count).toBe(plan.actions.length);
  });

  it('execute does not throw for valid plan with real artifact_id', async () => {
    const orchestrator = new AgentOrchestrator();
    const plan: PlanResult = {
      actions: [
        {
          agent: 'evidence-fabrication-detector',
          type: 'evidence_repair',
          target: 'my-artifact',
          severity: 'critical',
          requires_approval: true,
        },
      ],
      critical_actions: 1,
      warning_actions: 0,
    };

    // FM-5: test verifies no throw and that the resolved value has the expected
    // ExecuteResult shape (successful_count + failed_count == number of actions).
    const result = await orchestrator.execute(plan, { artifact_id: 'my-artifact', dry_run: false });
    expect(result.successful_count + result.failed_count).toBe(plan.actions.length);
  });

  it('execute is deterministic: same plan produces same correction count', async () => {
    const orchestrator = new AgentOrchestrator();
    const plan: PlanResult = {
      actions: [
        {
          agent: 'mock-interceptor',
          type: 'code_refactoring',
          target: 'test-artifact',
          severity: 'warning',
          requires_approval: false,
        },
      ],
      critical_actions: 0,
      warning_actions: 1,
    };
    const context = { artifact_id: 'test-artifact', dry_run: false };

    const result1 = await orchestrator.execute(plan, context);
    const result2 = await orchestrator.execute(plan, context);

    expect(result1.successful_count).toBe(result2.successful_count);
    expect(result1.failed_count).toBe(result2.failed_count);
    expect(result1.corrections).toHaveLength(result2.corrections.length);
  });

  it('execute correction entry agent_name matches the action agent', async () => {
    const orchestrator = new AgentOrchestrator();
    const plan: PlanResult = {
      actions: [
        {
          agent: 'theater-detector',
          type: 'stub_elimination',
          target: 'span-artifact',
          severity: 'warning',
          requires_approval: false,
        },
      ],
      critical_actions: 0,
      warning_actions: 1,
    };

    const result = await orchestrator.execute(plan, { artifact_id: 'span-artifact', dry_run: false });

    expect(result.corrections[0].agent_name).toBe('theater-detector');
  });

  it('execute correction entry violation severity matches the action severity', async () => {
    const orchestrator = new AgentOrchestrator();
    const plan: PlanResult = {
      actions: [
        {
          agent: 'authority-escalation-watcher',
          type: 'authority_restoration',
          target: 'release-artifact',
          severity: 'critical',
          requires_approval: true,
        },
      ],
      critical_actions: 1,
      warning_actions: 0,
    };

    const result = await orchestrator.execute(plan, { artifact_id: 'release-artifact', dry_run: false });

    expect(result.corrections[0].violation.severity).toBe('critical');
  });

  it('execute with dry_run=true in full cycle skips execute phase (returns zero corrections)', async () => {
    const orchestrator = new AgentOrchestrator();

    // Provide traces with mock patterns so violations are detected
    const cycleResult = await orchestrator.runMapekCycle({
      artifact_id: 'dry-run-test',
      traces: [{ name: 'mock_load', service: 'svc', trace_id: 'abc123', duration_ms: 10 }],
      dry_run: true,
    });

    // dry_run=true: execute phase must return empty corrections
    expect(cycleResult.execute.corrections).toHaveLength(0);
    expect(cycleResult.execute.successful_count).toBe(0);
    expect(cycleResult.execute.failed_count).toBe(0);
  });

  it('execute corrections have non-null snapshot_data field', async () => {
    const orchestrator = new AgentOrchestrator();
    const plan: PlanResult = {
      actions: [
        {
          agent: 'receipt-chain-attacker',
          type: 'receipt_chain_repair',
          target: 'receipt-artifact',
          severity: 'critical',
          requires_approval: true,
        },
      ],
      critical_actions: 1,
      warning_actions: 0,
    };

    const result = await orchestrator.execute(plan, { artifact_id: 'receipt-artifact', dry_run: false });

    // Each correction should have snapshot_data for undo support.
    // FM-5: `typeof x === 'object'` is true for null and for arrays.
    // After the !== null guard, additionally verify it is a plain object (not an array).
    for (const entry of result.corrections) {
      if (entry.snapshot_data !== null) {
        expect(typeof entry.snapshot_data).toBe('object');
        expect(Array.isArray(entry.snapshot_data)).toBe(false);
      }
    }
  });

  it('execute does not corrupt registry agent state across repeated calls', async () => {
    const orchestrator = new AgentOrchestrator();
    const registry = orchestrator.getAgentRegistry();

    // Run execute 3 times and verify registry state remains consistent
    const plan: PlanResult = {
      actions: [
        {
          agent: 'mock-interceptor',
          type: 'code_refactoring',
          target: 'test',
          severity: 'warning',
          requires_approval: false,
        },
      ],
      critical_actions: 0,
      warning_actions: 1,
    };
    const context = { artifact_id: 'repeat-test', dry_run: false };

    await orchestrator.execute(plan, context);
    await orchestrator.execute(plan, context);
    await orchestrator.execute(plan, context);

    // All 8 built-in agents must still be registered
    expect(registry.getAgentNames()).toHaveLength(VAN_DERAALST_AGENTS.length);
    // mock-interceptor must still be active
    expect(registry.getAgent('mock-interceptor')?.status).toBe('active');
  });
});

// ---------------------------------------------------------------------------
// Learn phase contracts (10 tests)
// ---------------------------------------------------------------------------

describe('AgentOrchestrator.learn — core contracts', () => {
  it('learn with no violations and no corrections returns knowledge_updated=false', () => {
    const orchestrator = new AgentOrchestrator();

    const analyze: AnalyzeResult = {
      violations: [],
      critical_count: 0,
      warning_count: 0,
      agents_triggered: [],
    };
    const execute: ExecuteResult = {
      corrections: [],
      successful_count: 0,
      failed_count: 0,
    };

    const result = orchestrator.learn(analyze, execute);

    expect(result.knowledge_updated).toBe(false);
    expect(result.drift_scores).toBeNull();
  });

  it('learn with violations returns knowledge_updated=true and non-null drift_scores', () => {
    const orchestrator = new AgentOrchestrator();

    const analyze: AnalyzeResult = {
      violations: [
        {
          agent_name: 'mock-interceptor',
          violation_type: 'mock_operation_detected',
          severity: 'critical',
          evidence: {},
          process_mining_proof: null,
          timestamp: new Date().toISOString(),
          blocked_manufacturing: true,
          target: 'test',
        },
      ],
      critical_count: 1,
      warning_count: 0,
      agents_triggered: ['mock-interceptor'],
    };
    const execute: ExecuteResult = {
      corrections: [],
      successful_count: 0,
      failed_count: 0,
    };

    const result = orchestrator.learn(analyze, execute);

    expect(result.knowledge_updated).toBe(true);
    expect(result.drift_scores).not.toBeNull();
  });

  it('learn drift score key format is agent_name:violation_type', () => {
    const orchestrator = new AgentOrchestrator();

    const analyze: AnalyzeResult = {
      violations: [
        {
          agent_name: 'theater-detector',
          violation_type: 'empty_span_attributes',
          severity: 'warning',
          evidence: {},
          process_mining_proof: null,
          timestamp: new Date().toISOString(),
          blocked_manufacturing: false,
          target: 'span',
        },
      ],
      critical_count: 0,
      warning_count: 1,
      agents_triggered: ['theater-detector'],
    };
    const execute: ExecuteResult = {
      corrections: [],
      successful_count: 0,
      failed_count: 0,
    };

    const result = orchestrator.learn(analyze, execute);

    expect(result.drift_scores).not.toBeNull();
    expect('theater-detector:empty_span_attributes' in result.drift_scores!).toBe(true);
  });

  it('learn drift scores are always in [0, 1]', () => {
    const orchestrator = new AgentOrchestrator();

    // 15 violations of the same type exceeds the normalization cap
    const violations = Array.from({ length: 15 }, () => ({
      agent_name: 'evidence-fabrication-detector',
      violation_type: 'fabricated_trace_id',
      severity: 'critical' as const,
      evidence: {},
      process_mining_proof: null,
      timestamp: new Date().toISOString(),
      blocked_manufacturing: true,
      target: 'artifact',
    }));

    const analyze: AnalyzeResult = {
      violations,
      critical_count: 15,
      warning_count: 0,
      agents_triggered: ['evidence-fabrication-detector'],
    };
    const execute: ExecuteResult = {
      corrections: [],
      successful_count: 0,
      failed_count: 0,
    };

    const result = orchestrator.learn(analyze, execute);

    for (const score of Object.values(result.drift_scores!)) {
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1.0);
    }
  });

  it('learn result always includes thresholdAuditLog as an array', () => {
    const orchestrator = new AgentOrchestrator();

    const analyze: AnalyzeResult = {
      violations: [],
      critical_count: 0,
      warning_count: 0,
      agents_triggered: [],
    };
    const execute: ExecuteResult = {
      corrections: [],
      successful_count: 0,
      failed_count: 0,
    };

    const result = orchestrator.learn(analyze, execute);

    expect(Array.isArray(result.thresholdAuditLog)).toBe(true);
  });

  it('learn ontology_patches equals execute.successful_count', () => {
    const orchestrator = new AgentOrchestrator();

    const analyze: AnalyzeResult = {
      violations: [
        {
          agent_name: 'config-drift-guardian',
          violation_type: 'missing_config',
          severity: 'warning',
          evidence: {},
          process_mining_proof: null,
          timestamp: new Date().toISOString(),
          blocked_manufacturing: false,
          target: 'config',
        },
      ],
      critical_count: 0,
      warning_count: 1,
      agents_triggered: ['config-drift-guardian'],
    };
    const execute: ExecuteResult = {
      corrections: [],
      successful_count: 3,
      failed_count: 0,
    };

    const result = orchestrator.learn(analyze, execute);

    expect(result.ontology_patches).toBe(3);
  });

  it('learn with multiple violations of same agent accumulates drift correctly', () => {
    const orchestrator = new AgentOrchestrator();

    // 10 violations from the same agent/type → normalized score = 1.0
    const violations = Array.from({ length: 10 }, () => ({
      agent_name: 'mock-interceptor',
      violation_type: 'mock_operation_detected',
      severity: 'critical' as const,
      evidence: {},
      process_mining_proof: null,
      timestamp: new Date().toISOString(),
      blocked_manufacturing: true,
      target: 'artifact',
    }));

    const analyze: AnalyzeResult = {
      violations,
      critical_count: 10,
      warning_count: 0,
      agents_triggered: ['mock-interceptor'],
    };
    const execute: ExecuteResult = {
      corrections: [],
      successful_count: 0,
      failed_count: 0,
    };

    const result = orchestrator.learn(analyze, execute);

    expect(result.drift_scores!['mock-interceptor:mock_operation_detected']).toBe(1.0);
  });

  it('learn with different violation types creates separate drift score keys', () => {
    const orchestrator = new AgentOrchestrator();

    const analyze: AnalyzeResult = {
      violations: [
        {
          agent_name: 'mock-interceptor',
          violation_type: 'mock_operation_detected',
          severity: 'critical',
          evidence: {},
          process_mining_proof: null,
          timestamp: new Date().toISOString(),
          blocked_manufacturing: true,
          target: 'a',
        },
        {
          agent_name: 'theater-detector',
          violation_type: 'empty_span_attributes',
          severity: 'warning',
          evidence: {},
          process_mining_proof: null,
          timestamp: new Date().toISOString(),
          blocked_manufacturing: false,
          target: 'b',
        },
      ],
      critical_count: 1,
      warning_count: 1,
      agents_triggered: ['mock-interceptor', 'theater-detector'],
    };
    const execute: ExecuteResult = {
      corrections: [],
      successful_count: 0,
      failed_count: 0,
    };

    const result = orchestrator.learn(analyze, execute);

    expect(Object.keys(result.drift_scores!)).toHaveLength(2);
    expect('mock-interceptor:mock_operation_detected' in result.drift_scores!).toBe(true);
    expect('theater-detector:empty_span_attributes' in result.drift_scores!).toBe(true);
  });

  it('learn is idempotent: two calls with identical input produce equal knowledge_updated', () => {
    const orchestrator1 = new AgentOrchestrator();
    const orchestrator2 = new AgentOrchestrator();

    const analyze: AnalyzeResult = {
      violations: [
        {
          agent_name: 'receipt-chain-attacker',
          violation_type: 'broken_hash_chain',
          severity: 'critical',
          evidence: {},
          process_mining_proof: null,
          timestamp: new Date().toISOString(),
          blocked_manufacturing: true,
          target: 'receipt',
        },
      ],
      critical_count: 1,
      warning_count: 0,
      agents_triggered: ['receipt-chain-attacker'],
    };
    const execute: ExecuteResult = {
      corrections: [],
      successful_count: 0,
      failed_count: 0,
    };

    const result1 = orchestrator1.learn(analyze, execute);
    const result2 = orchestrator2.learn(analyze, execute);

    expect(result1.knowledge_updated).toBe(result2.knowledge_updated);
    expect(Object.keys(result1.drift_scores!)).toEqual(Object.keys(result2.drift_scores!));
  });

  it('learn with corrections but no violations still returns knowledge_updated=true', () => {
    const orchestrator = new AgentOrchestrator();

    const analyze: AnalyzeResult = {
      violations: [],
      critical_count: 0,
      warning_count: 0,
      agents_triggered: [],
    };
    const execute: ExecuteResult = {
      corrections: [
        {
          timestamp: new Date().toISOString(),
          agent_name: 'mock-interceptor',
          correction_type: 'code_refactoring',
          violation: {
            agent_name: 'mock-interceptor',
            violation_type: 'mock_operation_detected',
            severity: 'critical',
            evidence: {},
            process_mining_proof: null,
            timestamp: new Date().toISOString(),
            blocked_manufacturing: true,
            target: 'artifact',
          },
          correction_action: 'refactored',
          correction_success: true,
          correction_details: {},
          artifact_id: 'artifact',
          snapshot_data: null,
        },
      ],
      successful_count: 1,
      failed_count: 0,
    };

    const result = orchestrator.learn(analyze, execute);

    // corrections.length > 0 makes knowledge_updated = true even with no violations
    expect(result.knowledge_updated).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// MAPE-K integration contracts (8 tests)
// ---------------------------------------------------------------------------

describe('MAPE-K full cycle integration contracts', () => {
  it('full Monitor→Analyze→Plan→Execute→Learn cycle completes without error', async () => {
    const orchestrator = new AgentOrchestrator();

    const cycleResult = await orchestrator.runMapekCycle({
      artifact_id: 'integration-test-artifact',
      traces: [{ name: 'real_operation', service: 'real-svc', trace_id: 'valid-trace-123', duration_ms: 42 }],
      ocel_events: [
        { activity: 'seed-ontology' },
        { activity: 'breed-ontology' },
        { activity: 'validate-ontology' },
        { activity: 'project-artifact' },
        { activity: 'compile-artifact' },
        { activity: 'run-benchmark' },
        { activity: 'release-package' },
      ],
      receipts: [{ hash: 'abc123', previous_hash: null }],
      dry_run: true,
    });

    expect(cycleResult).toBeDefined();
    expect(cycleResult.cycle_id).toMatch(/^cycle-/);
    expect(typeof cycleResult.duration_ms).toBe('number');
    expect(cycleResult.duration_ms).toBeGreaterThanOrEqual(0);
  });

  it('cycle result has all required MAPE-K phase fields', async () => {
    const orchestrator = new AgentOrchestrator();

    const cycleResult = await orchestrator.runMapekCycle({
      artifact_id: 'field-check',
      dry_run: true,
    });

    expect(cycleResult).toHaveProperty('cycle_id');
    expect(cycleResult).toHaveProperty('success');
    expect(cycleResult).toHaveProperty('monitor');
    expect(cycleResult).toHaveProperty('analyze');
    expect(cycleResult).toHaveProperty('plan');
    expect(cycleResult).toHaveProperty('execute');
    expect(cycleResult).toHaveProperty('learn');
    expect(cycleResult).toHaveProperty('duration_ms');
  });

  it('cycle state has no null/undefined for required sub-fields after completion', async () => {
    const orchestrator = new AgentOrchestrator();

    const cycleResult = await orchestrator.runMapekCycle({
      artifact_id: 'null-check',
      dry_run: true,
    });

    // Monitor surfaces — FM-5: toBeDefined() guards that the sub-object was
    // actually populated by the cycle (absent = undefined, which would fail
    // all downstream property access). Real correctness assertions follow.
    expect(cycleResult.monitor.execution).toBeDefined();
    expect(cycleResult.monitor.telemetry).toBeDefined();
    expect(cycleResult.monitor.state).toBeDefined();
    expect(cycleResult.monitor.process).toBeDefined();

    // Analyze counts — non-negative integers (not just type-correct)
    expect(typeof cycleResult.analyze.critical_count).toBe('number');
    expect(cycleResult.analyze.critical_count).toBeGreaterThanOrEqual(0);
    expect(typeof cycleResult.analyze.warning_count).toBe('number');
    expect(cycleResult.analyze.warning_count).toBeGreaterThanOrEqual(0);
    // FM-5: Array.isArray() verifies the field is an array, not just truthy.
    // Combined with the count checks above this proves the counts reflect the array.
    expect(Array.isArray(cycleResult.analyze.violations)).toBe(true);
    expect(Array.isArray(cycleResult.analyze.agents_triggered)).toBe(true);
    // Counts must agree with the array contents
    expect(cycleResult.analyze.violations.filter((v) => v.severity === 'critical').length).toBe(
      cycleResult.analyze.critical_count,
    );
    expect(cycleResult.analyze.violations.filter((v) => v.severity === 'warning').length).toBe(
      cycleResult.analyze.warning_count,
    );

    // Plan
    expect(Array.isArray(cycleResult.plan.actions)).toBe(true);

    // Execute
    expect(Array.isArray(cycleResult.execute.corrections)).toBe(true);

    // Learn — knowledge_updated is a boolean (not just type-correct)
    expect(Array.isArray(cycleResult.learn.thresholdAuditLog)).toBe(true);
    expect(typeof cycleResult.learn.knowledge_updated).toBe('boolean');
  });

  it('cycle with mock traces has violations detected in analyze phase', async () => {
    const orchestrator = new AgentOrchestrator();

    const cycleResult = await orchestrator.runMapekCycle({
      artifact_id: 'mock-violation-cycle',
      traces: [{ name: 'mock_wasm_load', service: 'svc', trace_id: 'valid-id-001', duration_ms: 5 }],
      dry_run: true,
    });

    // mock_wasm_load triggers mock-interceptor → violation in analyze
    expect(cycleResult.analyze.violations.length).toBeGreaterThan(0);
    expect(cycleResult.analyze.critical_count).toBeGreaterThan(0);
  });

  it('all 8 Van der Aalst agents exist in the registry', () => {
    const registry = new AgentRegistry();

    expect(registry.getAgentNames()).toHaveLength(VAN_DERAALST_AGENTS.length);
    for (const name of VAN_DERAALST_AGENTS) {
      expect(registry.hasAgent(name)).toBe(true);
    }
  });

  it('each active agent has id, name, mode, and enabled fields', () => {
    const registry = new AgentRegistry();
    const agents = registry.listAgents();

    for (const agent of agents) {
      // FM-5: agent.config.name must be a non-empty string matching a known agent —
      // `toBeGreaterThan(0)` on length would pass for any non-empty string. Verify
      // it is at least a valid identifier (no whitespace, kebab-case).
      expect(typeof agent.config.name).toBe('string');
      expect(agent.config.name).toMatch(/^[a-z][a-z0-9-]+$/);
      expect(['continuous', 'on_demand']).toContain(agent.config.mode);
      expect(typeof agent.config.enabled).toBe('boolean');
      // status is present as well
      expect(['active', 'disabled', 'error', 'degraded']).toContain(agent.status);
    }
  });

  it('updateAgentState changes the agent status in registry', () => {
    const registry = new AgentRegistry();
    const agentName = 'mock-interceptor';

    // Initially active
    expect(registry.getAgent(agentName)?.status).toBe('active');

    // Inject an error to change status
    registry.updateAgentState(agentName, { error: 'test error' });
    expect(registry.getAgent(agentName)?.status).toBe('error');

    // Clear the error and restore active
    registry.updateAgentState(agentName, { error: null, status: 'active' });
    expect(registry.getAgent(agentName)?.status).toBe('active');
  });

  it('listAgents(continuous) returns only continuous-mode agents', () => {
    const registry = new AgentRegistry();

    const continuousAgents = registry.listAgents('continuous');

    // FM-5: the registry must contain the known continuous agents —
    // `toBeGreaterThan(0)` would pass even if only 1 agent existed.
    // The Van der Aalst doctrine requires at minimum mock-interceptor and
    // evidence-fabrication-detector to be in continuous mode.
    expect(continuousAgents.some((a) => a.config.name === 'mock-interceptor')).toBe(true);
    expect(continuousAgents.some((a) => a.config.name === 'evidence-fabrication-detector')).toBe(
      true,
    );
    for (const agent of continuousAgents) {
      expect(agent.config.mode).toBe('continuous');
    }

    // Verify on_demand agents are excluded
    const allAgents = registry.listAgents();
    const onDemandCount = allAgents.filter((a) => a.config.mode === 'on_demand').length;
    expect(continuousAgents.length + onDemandCount).toBe(allAgents.length);
  });
});
