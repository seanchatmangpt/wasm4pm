/**
 * MAPE-K Monitor and Plan phase domain-contract tests.
 *
 * Oracle rank: Rank 2 — Domain contract.
 *
 * The Monitor phase captures evidence from 4 surfaces.
 * The Plan phase produces corrective actions ordered by severity.
 * Neither is covered by the existing test suite.
 */
import { describe, it, expect } from 'vitest';
import { AgentOrchestrator } from '../orchestration.js';
import type { AnalyzeResult } from '../types.js';

// ---------------------------------------------------------------------------
// Monitor phase
// ---------------------------------------------------------------------------

describe('AgentOrchestrator.monitor — surface contract', () => {
  it('returns all 4 surfaces (execution, telemetry, state, process)', async () => {
    const orchestrator = new AgentOrchestrator();
    const result = await orchestrator.monitor({
      artifact_id: 'test-artifact',
    });

    expect(result).toHaveProperty('execution');
    expect(result).toHaveProperty('telemetry');
    expect(result).toHaveProperty('state');
    expect(result).toHaveProperty('process');
  });

  it('execution surface is valid when receipts are provided', async () => {
    const orchestrator = new AgentOrchestrator();
    const result = await orchestrator.monitor({
      artifact_id: 'test-artifact',
      receipts: [{ hash: 'abc123', previous_hash: null }],
    });

    expect(result.execution.valid).toBe(true);
    expect(result.execution.count).toBe(1);
    expect(result.execution.fitness).toBe(1.0);
  });

  it('execution surface is invalid when no receipts are provided', async () => {
    const orchestrator = new AgentOrchestrator();
    const result = await orchestrator.monitor({
      artifact_id: 'test-artifact',
    });

    expect(result.execution.valid).toBe(false);
    expect(result.execution.count).toBe(0);
    expect(result.execution.fitness).toBe(0.0);
  });

  it('telemetry surface reflects trace count', async () => {
    const orchestrator = new AgentOrchestrator();
    const traces = [
      { name: 'operation_a', service: 'svc-a', trace_id: 't001', duration_ms: 50 },
      { name: 'operation_b', service: 'svc-b', trace_id: 't002', duration_ms: 30 },
    ];

    const result = await orchestrator.monitor({ artifact_id: 'test', traces });

    expect(result.telemetry.valid).toBe(true);
    expect(result.telemetry.count).toBe(2);
    expect(result.telemetry.fitness).toBe(1.0);
  });

  it('telemetry surface is invalid when no traces provided', async () => {
    const orchestrator = new AgentOrchestrator();
    const result = await orchestrator.monitor({ artifact_id: 'test' });

    expect(result.telemetry.valid).toBe(false);
    expect(result.telemetry.count).toBe(0);
    expect(result.telemetry.fitness).toBe(0.0);
  });

  it('state surface is valid whenever artifact_id is present', async () => {
    const orchestrator = new AgentOrchestrator();
    const result = await orchestrator.monitor({ artifact_id: 'my-artifact' });

    expect(result.state.valid).toBe(true);
    expect(result.state.count).toBe(1);
    expect(result.state.fitness).toBe(1.0);
  });

  it('process surface reflects OCEL event count', async () => {
    const orchestrator = new AgentOrchestrator();
    const events = [
      { activity: 'seed-ontology', ocel_id: 'e1' },
      { activity: 'breed-ontology', ocel_id: 'e2' },
      { activity: 'validate-ontology', ocel_id: 'e3' },
    ];

    const result = await orchestrator.monitor({ artifact_id: 'test', ocel_events: events });

    expect(result.process.valid).toBe(true);
    expect(result.process.count).toBe(3);
    expect(result.process.fitness).toBe(1.0);
  });

  it('process surface is invalid when no OCEL events provided', async () => {
    const orchestrator = new AgentOrchestrator();
    const result = await orchestrator.monitor({ artifact_id: 'test' });

    expect(result.process.valid).toBe(false);
    expect(result.process.count).toBe(0);
    expect(result.process.fitness).toBe(0.0);
  });
});

// ---------------------------------------------------------------------------
// Plan phase
// ---------------------------------------------------------------------------

describe('AgentOrchestrator.plan — corrective action contract', () => {
  it('produces one action per violation that has a known correction_type', async () => {
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
          target: 'test-op',
        },
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
      critical_count: 1,
      warning_count: 1,
      agents_triggered: ['mock-interceptor', 'config-drift-guardian'],
    };

    const plan = await orchestrator.plan(analyze);

    expect(plan.actions).toHaveLength(2);
    expect(plan.critical_actions).toBe(1);
    expect(plan.warning_actions).toBe(1);
  });

  it('critical actions sort before warning actions', async () => {
    const orchestrator = new AgentOrchestrator();

    // Deliberately put warning before critical in input
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
        {
          agent_name: 'mock-interceptor',
          violation_type: 'mock_operation_detected',
          severity: 'critical',
          evidence: {},
          process_mining_proof: null,
          timestamp: new Date().toISOString(),
          blocked_manufacturing: true,
          target: 'test-op',
        },
      ],
      critical_count: 1,
      warning_count: 1,
      agents_triggered: ['config-drift-guardian', 'mock-interceptor'],
    };

    const plan = await orchestrator.plan(analyze);

    // First action must be critical
    expect(plan.actions[0].severity).toBe('critical');
    // Second action must be warning
    expect(plan.actions[1].severity).toBe('warning');
  });

  it('critical action requires_approval = true; warning requires_approval = false', async () => {
    const orchestrator = new AgentOrchestrator();

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
          target: 'artifact-x',
        },
        {
          agent_name: 'theater-detector',
          violation_type: 'empty_span_attributes',
          severity: 'warning',
          evidence: {},
          process_mining_proof: null,
          timestamp: new Date().toISOString(),
          blocked_manufacturing: false,
          target: 'span-y',
        },
      ],
      critical_count: 1,
      warning_count: 1,
      agents_triggered: ['receipt-chain-attacker', 'theater-detector'],
    };

    const plan = await orchestrator.plan(analyze);

    const criticalAction = plan.actions.find((a) => a.severity === 'critical');
    const warningAction = plan.actions.find((a) => a.severity === 'warning');

    expect(criticalAction!.requires_approval).toBe(true);
    expect(warningAction!.requires_approval).toBe(false);
  });

  it('empty violations produce empty plan', async () => {
    const orchestrator = new AgentOrchestrator();

    const plan = await orchestrator.plan({
      violations: [],
      critical_count: 0,
      warning_count: 0,
      agents_triggered: [],
    });

    expect(plan.actions).toHaveLength(0);
    expect(plan.critical_actions).toBe(0);
    expect(plan.warning_actions).toBe(0);
  });

  it('violation from unknown agent produces no action (no correction_type)', async () => {
    const orchestrator = new AgentOrchestrator();

    // 'unknown-agent' is not registered — plan must skip it gracefully
    const analyze: AnalyzeResult = {
      violations: [
        {
          agent_name: 'unknown-agent',
          violation_type: 'some_violation',
          severity: 'critical',
          evidence: {},
          process_mining_proof: null,
          timestamp: new Date().toISOString(),
          blocked_manufacturing: true,
          target: 'artifact',
        },
      ],
      critical_count: 1,
      warning_count: 0,
      agents_triggered: ['unknown-agent'],
    };

    const plan = await orchestrator.plan(analyze);

    // No registered agent with correction_type -> no action generated
    expect(plan.actions).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// formatLearnSummary (static) — Rank 2 domain contract
// ---------------------------------------------------------------------------

describe('AgentOrchestrator.formatLearnSummary — output contract', () => {
  it('returns single stable line when thresholdAuditLog is empty and no patches', () => {
    const lines = AgentOrchestrator.formatLearnSummary({
      knowledge_updated: false,
      drift_scores: null,
      ontology_patches: 0,
      thresholdAuditLog: [],
    });

    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/No threshold adjustments/);
  });

  it('returns one line per audit entry when thresholdAuditLog is non-empty', () => {
    const lines = AgentOrchestrator.formatLearnSummary({
      knowledge_updated: true,
      drift_scores: { 'mock-interceptor:mock_operation_detected': 0.6 },
      ontology_patches: 0,
      thresholdAuditLog: [
        {
          agentId: 'mock-interceptor',
          violationType: 'mock_operation_detected',
          driftScore: 0.6,
          field: 'max_deviations',
          before: 1,
          after: 0,
          reason: 'tightened sensitivity',
        },
      ],
    });

    // One entry — no "No threshold adjustments" line
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/mock-interceptor/);
    expect(lines[0]).toMatch(/max_deviations/);
    expect(lines[0]).toMatch(/0\.600/);
  });

  it('includes ontology patch count line when ontology_patches > 0', () => {
    const lines = AgentOrchestrator.formatLearnSummary({
      knowledge_updated: true,
      drift_scores: null,
      ontology_patches: 3,
      thresholdAuditLog: [],
    });

    // "No threshold adjustments" + patch count line
    expect(lines).toHaveLength(2);
    expect(lines[1]).toMatch(/3 ontology patch/);
  });

  it('each audit entry line contains agent id, field, before, after, and drift score', () => {
    const entry = {
      agentId: 'config-drift-guardian',
      violationType: 'missing_config',
      driftScore: 0.0,
      field: 'max_deviations' as const,
      before: 0,
      after: 1,
      reason: 'relaxed noise threshold',
    };

    const lines = AgentOrchestrator.formatLearnSummary({
      knowledge_updated: true,
      drift_scores: {},
      ontology_patches: 0,
      thresholdAuditLog: [entry],
    });

    expect(lines[0]).toContain('config-drift-guardian');
    expect(lines[0]).toContain('max_deviations');
    expect(lines[0]).toContain('0 →');
    expect(lines[0]).toContain('0.000');
  });
});
