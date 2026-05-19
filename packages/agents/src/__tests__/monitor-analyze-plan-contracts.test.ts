/**
 * Monitor, Analyze, and Plan phase MAPE-K domain-contract tests.
 *
 * Oracle rank: Rank 2 — Domain contract.
 *
 * Covers contracts not yet exercised by monitor-plan-phases.test.ts:
 *   - Monitor: fitness=null vs fitness=1.0 boundary, data payload structure,
 *     fixture idempotency (determinism), composite surface summary
 *   - Analyze: agent selection by mode (continuous vs on_demand), violation
 *     counting, count consistency, gate_name routing, empty-context pass
 *   - Plan: CorrectiveAction field shape, type field from registry, count
 *     consistency with severity, all-critical ordering
 *
 * No mocks of init.js. Gemba principle: read actual agent logic.
 */

import { describe, it, expect } from 'vitest';
import { AgentOrchestrator } from '../orchestration.js';
import type { AnalyzeResult, MonitorResult, PlanResult } from '../types.js';

// ─────────────────────────────────────────────────────────────────────────────
// Monitor phase — additional contracts
// ─────────────────────────────────────────────────────────────────────────────

describe('AgentOrchestrator.monitor — fitness field contract', () => {
  it('all 4 surfaces have a numeric fitness when evidence is present', async () => {
    const orchestrator = new AgentOrchestrator();
    const result = await orchestrator.monitor({
      artifact_id: 'art-1',
      receipts: [{ hash: 'h1', previous_hash: null }],
      traces: [{ name: 'op', service: 'svc', trace_id: 't1', duration_ms: 10 }],
      ocel_events: [{ activity: 'seed-ontology', ocel_id: 'e1' }],
    });

    // When evidence present, fitness === 1.0
    expect(result.execution.fitness).toBe(1.0);
    expect(result.telemetry.fitness).toBe(1.0);
    expect(result.state.fitness).toBe(1.0);
    expect(result.process.fitness).toBe(1.0);
  });

  it('execution fitness is 0.0 (not null) when receipts array is absent', async () => {
    const orchestrator = new AgentOrchestrator();
    const result = await orchestrator.monitor({ artifact_id: 'art-2' });
    expect(result.execution.fitness).toBe(0.0);
  });

  it('telemetry fitness is 0.0 when traces array is absent', async () => {
    const orchestrator = new AgentOrchestrator();
    const result = await orchestrator.monitor({ artifact_id: 'art-3' });
    expect(result.telemetry.fitness).toBe(0.0);
  });

  it('process fitness is 0.0 when ocel_events array is absent', async () => {
    const orchestrator = new AgentOrchestrator();
    const result = await orchestrator.monitor({ artifact_id: 'art-4' });
    expect(result.process.fitness).toBe(0.0);
  });

  it('state fitness is always 1.0 when artifact_id is non-empty', async () => {
    const orchestrator = new AgentOrchestrator();
    // No receipts/traces — state surface depends only on artifact_id
    const result = await orchestrator.monitor({ artifact_id: 'any-artifact' });
    expect(result.state.fitness).toBe(1.0);
  });
});

describe('AgentOrchestrator.monitor — data payload structure', () => {
  it('execution.data contains artifact_id and receipts', async () => {
    const orchestrator = new AgentOrchestrator();
    const receipts = [{ hash: 'h1', previous_hash: null }];
    const result = await orchestrator.monitor({ artifact_id: 'art-x', receipts });

    expect(result.execution.data).toHaveProperty('artifact_id', 'art-x');
    expect(result.execution.data).toHaveProperty('receipts');
    expect(result.execution.data.receipts).toEqual(receipts);
  });

  it('telemetry.data contains traces array', async () => {
    const orchestrator = new AgentOrchestrator();
    const traces = [{ name: 'span1', service: 'svc', trace_id: 't1', duration_ms: 5 }];
    const result = await orchestrator.monitor({ artifact_id: 'art-x', traces });

    expect(result.telemetry.data).toHaveProperty('traces');
    expect(result.telemetry.data.traces).toEqual(traces);
  });

  it('process.data contains events array', async () => {
    const orchestrator = new AgentOrchestrator();
    const events = [
      { activity: 'seed-ontology', ocel_id: 'e1' },
      { activity: 'breed-ontology', ocel_id: 'e2' },
    ];
    const result = await orchestrator.monitor({ artifact_id: 'art-x', ocel_events: events });

    expect(result.process.data).toHaveProperty('events');
    expect(result.process.data.events).toEqual(events);
  });

  it('monitor is deterministic: identical inputs produce identical surface counts', async () => {
    const orchestrator = new AgentOrchestrator();
    const ctx = {
      artifact_id: 'stable-art',
      receipts: [{ hash: 'abc', previous_hash: null }],
      traces: [{ name: 'op', service: 'svc', trace_id: 't1', duration_ms: 20 }],
      ocel_events: [{ activity: 'seed-ontology', ocel_id: 'e1' }],
    };

    const r1 = await orchestrator.monitor(ctx);
    const r2 = await orchestrator.monitor(ctx);

    expect(r1.execution.count).toBe(r2.execution.count);
    expect(r1.telemetry.count).toBe(r2.telemetry.count);
    expect(r1.process.count).toBe(r2.process.count);
    expect(r1.state.count).toBe(r2.state.count);
  });

  it('multiple receipts reflected in execution.count', async () => {
    const orchestrator = new AgentOrchestrator();
    const receipts = [
      { hash: 'h1', previous_hash: null },
      { hash: 'h2', previous_hash: 'h1' },
      { hash: 'h3', previous_hash: 'h2' },
    ];
    const result = await orchestrator.monitor({ artifact_id: 'art', receipts });
    expect(result.execution.count).toBe(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Analyze phase — domain contracts
// ─────────────────────────────────────────────────────────────────────────────

describe('AgentOrchestrator.analyze — result shape contract', () => {
  it('analyze always returns the four required fields', async () => {
    const orchestrator = new AgentOrchestrator();
    const ctx = { artifact_id: 'test-art' };
    const monitor = await orchestrator.monitor(ctx);
    const result = await orchestrator.analyze(ctx, monitor);

    expect(result).toHaveProperty('violations');
    expect(result).toHaveProperty('critical_count');
    expect(result).toHaveProperty('warning_count');
    expect(result).toHaveProperty('agents_triggered');
  });

  it('violations is an array (never undefined or null)', async () => {
    const orchestrator = new AgentOrchestrator();
    const ctx = { artifact_id: 'art-a' };
    const monitor = await orchestrator.monitor(ctx);
    const result = await orchestrator.analyze(ctx, monitor);

    expect(Array.isArray(result.violations)).toBe(true);
  });

  it('agents_triggered is an array', async () => {
    const orchestrator = new AgentOrchestrator();
    const ctx = { artifact_id: 'art-b' };
    const monitor = await orchestrator.monitor(ctx);
    const result = await orchestrator.analyze(ctx, monitor);

    expect(Array.isArray(result.agents_triggered)).toBe(true);
  });

  it('critical_count + warning_count equals violations with those severities', async () => {
    const orchestrator = new AgentOrchestrator();
    // Inject a mock trace to trigger mock-interceptor (continuous agent)
    const ctx = {
      artifact_id: 'art-c',
      traces: [{ name: 'mock_operation', service: 'mock-svc', trace_id: 't1', duration_ms: 10 }],
    };
    const monitor = await orchestrator.monitor(ctx);
    const result = await orchestrator.analyze(ctx, monitor);

    const derivedCritical = result.violations.filter((v) => v.severity === 'critical').length;
    const derivedWarning = result.violations.filter((v) => v.severity === 'warning').length;

    expect(result.critical_count).toBe(derivedCritical);
    expect(result.warning_count).toBe(derivedWarning);
  });

  it('context with no suspicious data produces no critical violations', async () => {
    const orchestrator = new AgentOrchestrator();
    // Clean context: real trace_id, no mock patterns, no suspicious services.
    // NOTE: config-drift-guardian fires a *warning* when wasm4pm.toml is absent
    // from the test CWD — this is expected behavior, not a bug. The contract
    // under test is that NO CRITICAL violations fire for clean input.
    const ctx = {
      artifact_id: 'clean-art',
      traces: [{ name: 'real_operation', service: 'real-svc', trace_id: 'abc123', duration_ms: 50 }],
    };
    const monitor = await orchestrator.monitor(ctx);
    const result = await orchestrator.analyze(ctx, monitor);

    // Only warnings (e.g. missing wasm4pm.toml) — no critical violations
    expect(result.critical_count).toBe(0);
    // All violations are from continuous agents — none are mock/stub/fabrication
    for (const v of result.violations) {
      expect(v.severity).not.toBe('critical');
    }
  });

  it('mock trace pattern triggers mock-interceptor violation', async () => {
    const orchestrator = new AgentOrchestrator();
    const ctx = {
      artifact_id: 'art-mock',
      traces: [{ name: 'mock_seed', service: 'test', trace_id: 'tr1', duration_ms: 10 }],
    };
    const monitor = await orchestrator.monitor(ctx);
    const result = await orchestrator.analyze(ctx, monitor);

    const mockViolation = result.violations.find(
      (v) => v.agent_name === 'mock-interceptor' && v.violation_type === 'mock_operation_detected'
    );
    expect(mockViolation).toBeDefined();
  });

  it('stub trace name triggers mock-interceptor stub violation', async () => {
    const orchestrator = new AgentOrchestrator();
    const ctx = {
      artifact_id: 'art-stub',
      traces: [{ name: 'stub_handler', service: 'test-svc', trace_id: 'tr2', duration_ms: 15 }],
    };
    const monitor = await orchestrator.monitor(ctx);
    const result = await orchestrator.analyze(ctx, monitor);

    const stubViolation = result.violations.find(
      (v) => v.violation_type === 'stub_operation_detected'
    );
    expect(stubViolation).toBeDefined();
    expect(stubViolation?.severity).toBe('critical');
  });

  it('each violation has all required fields', async () => {
    const orchestrator = new AgentOrchestrator();
    const ctx = {
      artifact_id: 'art-v',
      traces: [{ name: 'mock_op', service: 'svc', trace_id: 'tr3', duration_ms: 10 }],
    };
    const monitor = await orchestrator.monitor(ctx);
    const result = await orchestrator.analyze(ctx, monitor);

    for (const v of result.violations) {
      expect(v).toHaveProperty('agent_name');
      expect(v).toHaveProperty('violation_type');
      expect(v).toHaveProperty('severity');
      expect(v).toHaveProperty('evidence');
      expect(v).toHaveProperty('timestamp');
      expect(v).toHaveProperty('blocked_manufacturing');
      expect(v).toHaveProperty('target');
      expect(['critical', 'warning']).toContain(v.severity);
    }
  });

  it('gate_name routing — on_demand agent not triggered without gate', async () => {
    const orchestrator = new AgentOrchestrator();
    // No gate_name → only continuous agents run → receipt-chain-attacker (on_demand) NOT triggered
    const ctx = {
      artifact_id: 'art-gate',
      // No receipts → receipt-chain-attacker would fire if it ran
    };
    const monitor = await orchestrator.monitor(ctx);
    const result = await orchestrator.analyze(ctx, monitor);

    const receiptAgent = result.agents_triggered.find((a) => a === 'receipt-chain-attacker');
    expect(receiptAgent).toBeUndefined();
  });

  it('gate_name routing — on_demand receipt agent triggered with matching gate', async () => {
    const orchestrator = new AgentOrchestrator();
    const ctx = {
      artifact_id: 'art-gate2',
      gate_name: 'benchmark-passed',
      // No receipts → receipt-chain-attacker fires with empty_receipt_chain violation
    };
    const monitor = await orchestrator.monitor(ctx);
    const result = await orchestrator.analyze(ctx, monitor);

    const receiptViolation = result.violations.find(
      (v) => v.agent_name === 'receipt-chain-attacker'
    );
    expect(receiptViolation).toBeDefined();
    expect(result.agents_triggered).toContain('receipt-chain-attacker');
  });

  it('analyze is deterministic: fresh orchestrators with same input produce same severity breakdown', async () => {
    // NOTE: AgentRegistry is stateful — running the same context twice on the
    // same orchestrator instance causes threshold adaptation after the first run,
    // which changes subsequent results.  True determinism is checked by comparing
    // two *independent* orchestrator instances against the same input.
    const ctx = {
      artifact_id: 'det-art',
      traces: [{ name: 'mock_op', service: 'svc', trace_id: 'trX', duration_ms: 5 }],
    };

    const orc1 = new AgentOrchestrator();
    const monitor1 = await orc1.monitor(ctx);
    const result1 = await orc1.analyze(ctx, monitor1);

    const orc2 = new AgentOrchestrator();
    const monitor2 = await orc2.monitor(ctx);
    const result2 = await orc2.analyze(ctx, monitor2);

    // Two fresh orchestrators must agree on severity breakdown
    expect(result1.critical_count).toBe(result2.critical_count);
    expect(result1.warning_count).toBe(result2.warning_count);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Plan phase — additional field contracts
// ─────────────────────────────────────────────────────────────────────────────

describe('AgentOrchestrator.plan — CorrectiveAction field shape', () => {
  it('each action has the 5 required fields: agent, type, target, severity, requires_approval', async () => {
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
          target: 'op-x',
        },
      ],
      critical_count: 1,
      warning_count: 0,
      agents_triggered: ['mock-interceptor'],
    };

    const plan = await orchestrator.plan(analyze);

    expect(plan.actions).toHaveLength(1);
    const action = plan.actions[0];
    expect(action).toHaveProperty('agent');
    expect(action).toHaveProperty('type');
    expect(action).toHaveProperty('target');
    expect(action).toHaveProperty('severity');
    expect(action).toHaveProperty('requires_approval');
  });

  it('action.type matches the correction_type registered for the agent', async () => {
    const orchestrator = new AgentOrchestrator();
    const analyze: AnalyzeResult = {
      violations: [
        {
          agent_name: 'mock-interceptor', // registered with 'code_refactoring'
          violation_type: 'mock_operation_detected',
          severity: 'critical',
          evidence: {},
          process_mining_proof: null,
          timestamp: new Date().toISOString(),
          blocked_manufacturing: true,
          target: 'op-y',
        },
      ],
      critical_count: 1,
      warning_count: 0,
      agents_triggered: ['mock-interceptor'],
    };

    const plan = await orchestrator.plan(analyze);

    expect(plan.actions[0].type).toBe('code_refactoring');
  });

  it('action.target mirrors violation.target', async () => {
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
          target: 'wasm4pm.toml',
        },
      ],
      critical_count: 0,
      warning_count: 1,
      agents_triggered: ['config-drift-guardian'],
    };

    const plan = await orchestrator.plan(analyze);

    expect(plan.actions[0].target).toBe('wasm4pm.toml');
  });

  it('plan.critical_actions equals count of actions with severity critical', async () => {
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
          target: 't1',
        },
        {
          agent_name: 'config-drift-guardian',
          violation_type: 'missing_config',
          severity: 'warning',
          evidence: {},
          process_mining_proof: null,
          timestamp: new Date().toISOString(),
          blocked_manufacturing: false,
          target: 't2',
        },
      ],
      critical_count: 1,
      warning_count: 1,
      agents_triggered: ['mock-interceptor', 'config-drift-guardian'],
    };

    const plan = await orchestrator.plan(analyze);
    const derived = plan.actions.filter((a) => a.severity === 'critical').length;

    expect(plan.critical_actions).toBe(derived);
  });

  it('plan.warning_actions equals count of actions with severity warning', async () => {
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
          target: 'cfg',
        },
      ],
      critical_count: 0,
      warning_count: 1,
      agents_triggered: ['config-drift-guardian'],
    };

    const plan = await orchestrator.plan(analyze);
    const derived = plan.actions.filter((a) => a.severity === 'warning').length;

    expect(plan.warning_actions).toBe(derived);
  });

  it('all-critical violations → all actions have requires_approval=true', async () => {
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
          target: 'op1',
        },
        {
          agent_name: 'evidence-fabrication-detector',
          violation_type: 'fabricated_trace_id',
          severity: 'critical',
          evidence: {},
          process_mining_proof: null,
          timestamp: new Date().toISOString(),
          blocked_manufacturing: true,
          target: 'op2',
        },
      ],
      critical_count: 2,
      warning_count: 0,
      agents_triggered: ['mock-interceptor', 'evidence-fabrication-detector'],
    };

    const plan = await orchestrator.plan(analyze);

    for (const action of plan.actions) {
      expect(action.requires_approval).toBe(true);
    }
  });

  it('all-warning violations → all actions have requires_approval=false', async () => {
    const orchestrator = new AgentOrchestrator();
    // config-drift-guardian fires warning for missing wasm4pm.toml
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
          target: 'wasm4pm.toml',
        },
      ],
      critical_count: 0,
      warning_count: 1,
      agents_triggered: ['config-drift-guardian'],
    };

    const plan = await orchestrator.plan(analyze);

    for (const action of plan.actions) {
      expect(action.requires_approval).toBe(false);
    }
  });

  it('plan result always has the three required top-level fields', async () => {
    const orchestrator = new AgentOrchestrator();
    const plan = await orchestrator.plan({
      violations: [],
      critical_count: 0,
      warning_count: 0,
      agents_triggered: [],
    });

    expect(plan).toHaveProperty('actions');
    expect(plan).toHaveProperty('critical_actions');
    expect(plan).toHaveProperty('warning_actions');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Monitor → Analyze → Plan chain: structural consistency
// ─────────────────────────────────────────────────────────────────────────────

describe('Monitor→Analyze→Plan chain — structural invariants', () => {
  it('chain from clean context produces zero critical actions', async () => {
    const orchestrator = new AgentOrchestrator();
    // Clean context: no mock/stub patterns, no fabricated trace IDs.
    // config-drift-guardian may fire a warning (missing wasm4pm.toml in test CWD)
    // but no critical violations should arise.
    const ctx = {
      artifact_id: 'clean-chain',
      traces: [{ name: 'real_op', service: 'real-svc', trace_id: 'clean1', duration_ms: 50 }],
    };
    const monitor = await orchestrator.monitor(ctx);
    const analyze = await orchestrator.analyze(ctx, monitor);
    const plan = await orchestrator.plan(analyze);

    // No critical violations → no critical actions
    expect(analyze.critical_count).toBe(0);
    expect(plan.critical_actions).toBe(0);
    // Plan counts must be internally consistent
    expect(plan.critical_actions + plan.warning_actions).toBe(plan.actions.length);
  });

  it('violations from analyze are reflected in plan action count', async () => {
    const orchestrator = new AgentOrchestrator();
    const ctx = {
      artifact_id: 'dirty-chain',
      traces: [{ name: 'mock_load', service: 'mock-svc', trace_id: 'tr9', duration_ms: 10 }],
    };
    const monitor = await orchestrator.monitor(ctx);
    const analyze = await orchestrator.analyze(ctx, monitor);
    const plan = await orchestrator.plan(analyze);

    // Violations from registered agents should produce actions
    // (only violations from registered agents produce actions)
    const registeredViolations = analyze.violations.filter((v) =>
      ['mock-interceptor', 'config-drift-guardian', 'receipt-chain-attacker',
       'gate-independence-verifier', 'evidence-fabrication-detector',
       'process-mining-skeptic', 'theater-detector', 'authority-escalation-watcher']
        .includes(v.agent_name)
    );

    // plan.actions.length ≤ registeredViolations.length (some may lack correction_type)
    expect(plan.actions.length).toBeLessThanOrEqual(registeredViolations.length);
    expect(plan.critical_actions + plan.warning_actions).toBe(plan.actions.length);
  });
});
