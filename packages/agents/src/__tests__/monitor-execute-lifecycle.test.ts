/**
 * Monitor → Plan → Execute lifecycle — oracle-ranked contract tests.
 *
 * Tests are grouped by oracle rank following the Van der Aalst / Chicago TDD doctrine:
 *   Rank 1 — Mathematical invariant (state sequencing, structural identity)
 *   Rank 2 — Domain contract (field semantics, correction linkage)
 *   Rank 3 — Metamorphic relation (input perturbation → output ordering)
 *
 * Coverage targets:
 *   A. MAPE-K lifecycle sequencing (Rank 1)
 *   B. Execute-phase isolation — an exception does not corrupt state (Rank 2)
 *   C. Monitor → Plan end-to-end linkage invariants (Rank 2)
 *   D. Execute ↔ Learn feedback metamorphic relations (Rank 3)
 *   E. Monitor surface fitness mathematical invariants (Rank 1)
 *   F. Execute correction audit-trail structural invariants (Rank 2)
 *   G. Registry state-change invariants around execute cycles (Rank 1)
 *   H. MAPE-K cycle idempotency (fresh orchestrator = same outcome) (Rank 3)
 */

import { describe, it, expect } from 'vitest';
import { AgentOrchestrator } from '../orchestration.js';
import { AgentRegistry } from '../registry.js';
import { AuditStore } from '../audit.js';
import { VAN_DERAALST_AGENTS } from '../types.js';
import type {
  AnalyzeResult,
  ExecuteResult,
  PlanResult,
  MAPEKCycleResult,
} from '../types.js';

// ─────────────────────────────────────────────────────────────────────────────
// A. MAPE-K lifecycle sequencing — Rank 1 (Mathematical invariant)
//
// The declared M→A→P→E→L pipeline must produce outputs in the correct
// phase order.  Each phase must be populated before the next phase runs.
// ─────────────────────────────────────────────────────────────────────────────

describe('MAPE-K lifecycle sequencing — Rank 1 (Mathematical invariant)', () => {
  it('runMapekCycle populates monitor before analyze: monitor.state.count > 0', async () => {
    const orchestrator = new AgentOrchestrator();
    const result = await orchestrator.runMapekCycle({
      artifact_id: 'seq-test-art',
    });

    // Monitor runs first; state surface is populated from artifact_id alone
    expect(result.monitor.state.count).toBe(1);
    // Analyze must have run afterward — violations is always an array (possibly empty)
    expect(Array.isArray(result.analyze.violations)).toBe(true);
  });

  it('analyze.agents_triggered is a subset of the 8 known agent names', async () => {
    const orchestrator = new AgentOrchestrator();
    const result = await orchestrator.runMapekCycle({
      artifact_id: 'subset-test',
      traces: [{ name: 'real_op', service: 'svc', trace_id: 'tr1', duration_ms: 10 }],
    });

    const knownAgents: string[] = [...VAN_DERAALST_AGENTS];
    for (const triggered of result.analyze.agents_triggered) {
      expect(knownAgents).toContain(triggered);
    }
  });

  it('plan.actions.length equals plan.critical_actions + plan.warning_actions — always', async () => {
    const orchestrator = new AgentOrchestrator();
    const result = await orchestrator.runMapekCycle({
      artifact_id: 'plan-sum-check',
      traces: [{ name: 'mock_op', service: 'mock-svc', trace_id: 'abc', duration_ms: 5 }],
      dry_run: true,
    });

    expect(result.plan.critical_actions + result.plan.warning_actions).toBe(
      result.plan.actions.length
    );
  });

  it('execute.successful_count + execute.failed_count is consistent with corrections length', async () => {
    const orchestrator = new AgentOrchestrator();
    const plan: PlanResult = {
      actions: [
        {
          agent: 'mock-interceptor',
          type: 'code_refactoring',
          target: 'art-1',
          severity: 'critical',
          requires_approval: true,
        },
        {
          agent: 'config-drift-guardian',
          type: 'config_restoration',
          target: 'art-2',
          severity: 'warning',
          requires_approval: false,
        },
      ],
      critical_actions: 1,
      warning_actions: 1,
    };

    const result = await orchestrator.execute(plan, { artifact_id: 'lifecycle-sum', dry_run: false });

    // This is a mathematical identity: successful + failed == corrections tracked
    expect(result.successful_count + result.failed_count).toBe(result.corrections.length);
  });

  it('learn always runs after execute — thresholdAuditLog is never undefined', async () => {
    const orchestrator = new AgentOrchestrator();
    const result = await orchestrator.runMapekCycle({
      artifact_id: 'learn-after-execute',
      dry_run: true,
    });

    // Learn phase must run regardless of whether violations occurred
    expect(result.learn).toBeDefined();
    expect(result.learn.thresholdAuditLog).toBeDefined();
    expect(Array.isArray(result.learn.thresholdAuditLog)).toBe(true);
  });

  it('cycle_id is always a non-empty string beginning with "cycle-"', async () => {
    const orchestrator = new AgentOrchestrator();

    const r1 = await orchestrator.runMapekCycle({ artifact_id: 'id-check-1', dry_run: true });
    const r2 = await orchestrator.runMapekCycle({ artifact_id: 'id-check-2', dry_run: true });

    expect(r1.cycle_id).toMatch(/^cycle-/);
    expect(r2.cycle_id).toMatch(/^cycle-/);
    // Cycle IDs must be distinct across successive calls
    expect(r1.cycle_id).not.toBe(r2.cycle_id);
  });

  it('duration_ms is non-negative and a finite number', async () => {
    const orchestrator = new AgentOrchestrator();
    const result = await orchestrator.runMapekCycle({ artifact_id: 'duration-check', dry_run: true });

    expect(typeof result.duration_ms).toBe('number');
    expect(isFinite(result.duration_ms)).toBe(true);
    expect(result.duration_ms).toBeGreaterThanOrEqual(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B. Execute-phase isolation — Rank 2 (Domain contract)
//
// An exception in one execute action MUST NOT corrupt subsequent actions or
// the registry state.  The result always captures error counts without
// propagating throws to the caller.
// ─────────────────────────────────────────────────────────────────────────────

describe('Execute-phase error isolation — Rank 2 (Domain contract)', () => {
  it('execute does not throw when actions reference an unregistered agent', async () => {
    const orchestrator = new AgentOrchestrator();
    const plan: PlanResult = {
      actions: [
        {
          agent: 'nonexistent-agent',
          type: 'config_restoration',
          target: 'some-target',
          severity: 'warning',
          requires_approval: false,
        },
      ],
      critical_actions: 0,
      warning_actions: 1,
    };

    // FM-5: resolves.not.toThrow() would be cleaner, but vitest requires a value
    // assertion in the resolves chain. What matters is that the call does NOT
    // reject — the returned ExecuteResult shape is verified by the subsequent
    // registry-intact test. The non-null check here confirms the promise resolved
    // to an actual ExecuteResult, not undefined.
    const executeResult = await orchestrator.execute(plan, { artifact_id: 'ghost-agent', dry_run: false });
    expect(executeResult).not.toBeNull();
    expect(typeof executeResult.successful_count).toBe('number');
    expect(typeof executeResult.failed_count).toBe('number');
  });

  it('registry remains intact after executing a plan with an unknown agent', async () => {
    const orchestrator = new AgentOrchestrator();
    const registry = orchestrator.getAgentRegistry();

    const plan: PlanResult = {
      actions: [
        {
          agent: 'ghost-agent-xyz',
          type: 'evidence_repair',
          target: 'artifact',
          severity: 'critical',
          requires_approval: true,
        },
      ],
      critical_actions: 1,
      warning_actions: 0,
    };

    await orchestrator.execute(plan, { artifact_id: 'registry-isolation', dry_run: false });

    // All 8 built-in agents must still be present and active
    for (const name of VAN_DERAALST_AGENTS) {
      const agent = registry.getAgent(name);
      expect(agent).toBeDefined();
    }
  });

  it('execute result is always returned (no uncaught throw) for any action list', async () => {
    const orchestrator = new AgentOrchestrator();

    // Mix of valid and invalid agents
    const plan: PlanResult = {
      actions: [
        {
          agent: 'mock-interceptor',
          type: 'code_refactoring',
          target: 'valid-target',
          severity: 'warning',
          requires_approval: false,
        },
        {
          agent: 'bad-agent-never-registered',
          type: 'stub_elimination',
          target: 'invalid-target',
          severity: 'critical',
          requires_approval: true,
        },
      ],
      critical_actions: 1,
      warning_actions: 1,
    };

    const result = await orchestrator.execute(plan, {
      artifact_id: 'mixed-execute',
      dry_run: false,
    });

    // We get a result either way — no throw
    expect(result).toBeDefined();
    expect(typeof result.successful_count).toBe('number');
    expect(typeof result.failed_count).toBe('number');
  });

  it('executeAgent for a disabled agent returns passed=false with agent_disabled violation', async () => {
    const orchestrator = new AgentOrchestrator();
    const registry = orchestrator.getAgentRegistry();

    registry.disableAgent('theater-detector');

    const result = await orchestrator.executeAgent('theater-detector', {
      artifact_id: 'disabled-agent-test',
    });

    expect(result.passed).toBe(false);
    const disabledViolation = result.violations.find(
      (v) => v.violation_type === 'agent_disabled'
    );
    // FM-5: toBeDefined() guard — subsequent severity/blocked checks depend on this
    // not being undefined. A bug that omits the violation would fail here first.
    expect(disabledViolation).toBeDefined();
    expect(disabledViolation?.severity).toBe('warning');
    expect(disabledViolation?.blocked_manufacturing).toBe(false);
  });

  it('executeAgent for an unknown agent returns passed=false with agent_not_found violation', async () => {
    const orchestrator = new AgentOrchestrator();

    const result = await orchestrator.executeAgent('no-such-agent', {
      artifact_id: 'missing-agent',
    });

    expect(result.passed).toBe(false);
    const notFound = result.violations.find((v) => v.violation_type === 'agent_not_found');
    expect(notFound).toBeDefined();
    expect(notFound!.severity).toBe('critical');
  });

  it('re-enabling a disabled agent restores executeAgent to normal operation', async () => {
    const orchestrator = new AgentOrchestrator();
    const registry = orchestrator.getAgentRegistry();

    // Disable then re-enable
    registry.disableAgent('mock-interceptor');
    registry.enableAgent('mock-interceptor');

    const result = await orchestrator.executeAgent('mock-interceptor', {
      artifact_id: 'reenable-test',
      traces: [],
    });

    // With no mock traces, mock-interceptor should pass
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('execute does not affect total_runs of agents not in the plan', async () => {
    const orchestrator = new AgentOrchestrator();
    const registry = orchestrator.getAgentRegistry();

    // Capture total_runs before for an agent NOT in the plan
    const authorityBefore = registry.getAgent('authority-escalation-watcher')!.total_runs;

    const plan: PlanResult = {
      actions: [
        {
          agent: 'mock-interceptor',
          type: 'code_refactoring',
          target: 'target-only-mock',
          severity: 'warning',
          requires_approval: false,
        },
      ],
      critical_actions: 0,
      warning_actions: 1,
    };

    await orchestrator.execute(plan, { artifact_id: 'selective-execute', dry_run: false });

    const authorityAfter = registry.getAgent('authority-escalation-watcher')!.total_runs;

    // authority-escalation-watcher was not in the plan, total_runs unchanged
    expect(authorityAfter).toBe(authorityBefore);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C. Monitor → Plan end-to-end linkage — Rank 2 (Domain contract)
//
// Properties derived from the declared MAPE-K semantics:
//   - Monitor surface validity drives analyze violations
//   - Analyze violations drive plan actions
//   - Plan action severity mirrors violation severity
// ─────────────────────────────────────────────────────────────────────────────

describe('Monitor→Plan linkage invariants — Rank 2 (Domain contract)', () => {
  it('monitor with valid receipts leads to zero empty_receipt_chain violations in analyze', async () => {
    const orchestrator = new AgentOrchestrator();
    const ctx = {
      artifact_id: 'valid-receipts',
      gate_name: 'benchmark-passed',
      receipts: [{ hash: 'abc123', previous_hash: null }],
    };
    const monitor = await orchestrator.monitor(ctx);
    const analyze = await orchestrator.analyze(ctx, monitor);

    const emptyChainViolation = analyze.violations.find(
      (v) => v.violation_type === 'empty_receipt_chain'
    );
    expect(emptyChainViolation).toBeUndefined();
  });

  it('monitor with no receipts + benchmark-passed gate triggers empty_receipt_chain violation', async () => {
    const orchestrator = new AgentOrchestrator();
    const ctx = {
      artifact_id: 'no-receipts',
      gate_name: 'benchmark-passed',
    };
    const monitor = await orchestrator.monitor(ctx);
    const analyze = await orchestrator.analyze(ctx, monitor);

    const emptyChain = analyze.violations.find(
      (v) => v.violation_type === 'empty_receipt_chain'
    );
    expect(emptyChain).toBeDefined();
    expect(emptyChain!.severity).toBe('critical');
  });

  it('plan with violations always produces at least as many actions as registered-agent violations', async () => {
    const orchestrator = new AgentOrchestrator();
    const ctx = {
      artifact_id: 'action-count-check',
      traces: [
        { name: 'mock_load', service: 'svc', trace_id: 'tr1', duration_ms: 10 },
      ],
    };
    const monitor = await orchestrator.monitor(ctx);
    const analyze = await orchestrator.analyze(ctx, monitor);
    const plan = await orchestrator.plan(analyze);

    // Every registered agent violation with a correction_type must become an action
    const registeredViolationsWithCorrection = analyze.violations.filter((v) => {
      const agentState = orchestrator.getAgentRegistry().getAgent(v.agent_name);
      return agentState && agentState.config.correction_type !== null;
    });

    expect(plan.actions.length).toBe(registeredViolationsWithCorrection.length);
  });

  it('broken receipt chain triggers plan action with type receipt_chain_repair', async () => {
    const orchestrator = new AgentOrchestrator();
    const analyze: AnalyzeResult = {
      violations: [
        {
          agent_name: 'receipt-chain-attacker',
          violation_type: 'broken_hash_chain',
          severity: 'critical',
          evidence: { index: 1, expected: 'h1', actual: 'h0' },
          process_mining_proof: null,
          timestamp: new Date().toISOString(),
          blocked_manufacturing: true,
          target: 'chain-artifact',
        },
      ],
      critical_count: 1,
      warning_count: 0,
      agents_triggered: ['receipt-chain-attacker'],
    };

    const plan = await orchestrator.plan(analyze);

    const repairAction = plan.actions.find((a) => a.type === 'receipt_chain_repair');
    expect(repairAction).toBeDefined();
    expect(repairAction!.requires_approval).toBe(true);
  });

  it('monitor returns identical structure whether called via monitor() or as part of runMapekCycle()', async () => {
    const orchestrator = new AgentOrchestrator();
    const ctx = {
      artifact_id: 'structure-compare',
      receipts: [{ hash: 'h1', previous_hash: null }],
      traces: [{ name: 'op', service: 'svc', trace_id: 't1', duration_ms: 20 }],
      ocel_events: [{ activity: 'seed-ontology', ocel_id: 'e1' }],
    };

    // Direct monitor call
    const directMonitor = await orchestrator.monitor(ctx);

    // Via cycle (we read monitor from the returned result)
    const cycleResult = await orchestrator.runMapekCycle({ ...ctx, dry_run: true });
    const cycleMonitor = cycleResult.monitor;

    // Structural keys must match
    expect(Object.keys(directMonitor)).toEqual(Object.keys(cycleMonitor));
    expect(directMonitor.execution.count).toBe(cycleMonitor.execution.count);
    expect(directMonitor.telemetry.count).toBe(cycleMonitor.telemetry.count);
    expect(directMonitor.process.count).toBe(cycleMonitor.process.count);
  });

  it('process-mining-skeptic fires when all 7 pipeline stages present (no missing stages)', async () => {
    const orchestrator = new AgentOrchestrator();
    const allStages = [
      { activity: 'seed-ontology' },
      { activity: 'breed-ontology' },
      { activity: 'validate-ontology' },
      { activity: 'project-artifact' },
      { activity: 'compile-artifact' },
      { activity: 'run-benchmark' },
      { activity: 'release-package' },
    ];
    const ctx = {
      artifact_id: 'full-pipeline',
      gate_name: 'process-conformance',
      ocel_events: allStages,
    };
    const monitor = await orchestrator.monitor(ctx);
    const analyze = await orchestrator.analyze(ctx, monitor);

    const skepticResult = await orchestrator.executeAgent('process-mining-skeptic', ctx);

    // With all stages present, passed should be true (no missing-stage violation)
    const missingStagesViolation = skepticResult.violations.find(
      (v) => v.violation_type === 'skipped_stages'
    );
    expect(missingStagesViolation).toBeUndefined();
    expect(skepticResult.passed).toBe(true);
  });

  it('process-mining-skeptic detects skipped stages and sets fitness < 1.0', async () => {
    const orchestrator = new AgentOrchestrator();
    // Omit validate-ontology and run-benchmark
    const incompleteStages = [
      { activity: 'seed-ontology' },
      { activity: 'breed-ontology' },
      { activity: 'project-artifact' },
      { activity: 'compile-artifact' },
      { activity: 'release-package' },
    ];
    const ctx = {
      artifact_id: 'incomplete-pipeline',
      gate_name: 'process-conformance',
      ocel_events: incompleteStages,
    };

    const skepticResult = await orchestrator.executeAgent('process-mining-skeptic', ctx);

    expect(skepticResult.passed).toBe(false);
    expect(skepticResult.process_mining_proof).not.toBeNull();
    expect(skepticResult.process_mining_proof!.fitness).toBeLessThan(1.0);
    expect(skepticResult.process_mining_proof!.deviations).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// D. Execute ↔ Learn feedback metamorphic relations — Rank 3
//
// Input perturbation (more violations) → output ordering (higher drift).
// ─────────────────────────────────────────────────────────────────────────────

describe('Execute↔Learn feedback metamorphic relations — Rank 3', () => {
  it('more violations of the same type → strictly higher drift score for that type', () => {
    const orchestrator1 = new AgentOrchestrator();
    const orchestrator2 = new AgentOrchestrator();

    const makeViolation = (n: number) =>
      Array.from({ length: n }, () => ({
        agent_name: 'mock-interceptor' as const,
        violation_type: 'mock_operation_detected',
        severity: 'critical' as const,
        evidence: {},
        process_mining_proof: null,
        timestamp: new Date().toISOString(),
        blocked_manufacturing: true,
        target: 'art',
      }));

    const emptyExecute: ExecuteResult = {
      corrections: [],
      successful_count: 0,
      failed_count: 0,
    };

    const analyze1: AnalyzeResult = {
      violations: makeViolation(1),
      critical_count: 1,
      warning_count: 0,
      agents_triggered: ['mock-interceptor'],
    };
    const analyze9: AnalyzeResult = {
      violations: makeViolation(9),
      critical_count: 9,
      warning_count: 0,
      agents_triggered: ['mock-interceptor'],
    };

    const learn1 = orchestrator1.learn(analyze1, emptyExecute);
    const learn9 = orchestrator2.learn(analyze9, emptyExecute);

    const key = 'mock-interceptor:mock_operation_detected';
    const score1 = learn1.drift_scores![key];
    const score9 = learn9.drift_scores![key];

    // More violations → higher drift score
    expect(score9).toBeGreaterThan(score1);
  });

  it('10 violations of same type produces exactly drift score 1.0 (normalization ceiling)', () => {
    const orchestrator = new AgentOrchestrator();

    const violations = Array.from({ length: 10 }, () => ({
      agent_name: 'evidence-fabrication-detector' as const,
      violation_type: 'fabricated_trace_id',
      severity: 'critical' as const,
      evidence: {},
      process_mining_proof: null,
      timestamp: new Date().toISOString(),
      blocked_manufacturing: true,
      target: 'art',
    }));

    const analyze: AnalyzeResult = {
      violations,
      critical_count: 10,
      warning_count: 0,
      agents_triggered: ['evidence-fabrication-detector'],
    };
    const execute: ExecuteResult = { corrections: [], successful_count: 0, failed_count: 0 };

    const learn = orchestrator.learn(analyze, execute);

    expect(learn.drift_scores!['evidence-fabrication-detector:fabricated_trace_id']).toBe(1.0);
  });

  it('drift score for 11 violations is the same as for 10 (capped at 1.0)', () => {
    const make = (n: number) =>
      Array.from({ length: n }, () => ({
        agent_name: 'theater-detector' as const,
        violation_type: 'empty_span_attributes',
        severity: 'warning' as const,
        evidence: {},
        process_mining_proof: null,
        timestamp: new Date().toISOString(),
        blocked_manufacturing: false,
        target: 'span',
      }));
    const emptyExec: ExecuteResult = { corrections: [], successful_count: 0, failed_count: 0 };

    const orc10 = new AgentOrchestrator();
    const orc11 = new AgentOrchestrator();

    const l10 = orc10.learn(
      { violations: make(10), critical_count: 0, warning_count: 10, agents_triggered: ['theater-detector'] },
      emptyExec
    );
    const l11 = orc11.learn(
      { violations: make(11), critical_count: 0, warning_count: 11, agents_triggered: ['theater-detector'] },
      emptyExec
    );

    const key = 'theater-detector:empty_span_attributes';
    // Both are capped at 1.0
    expect(l10.drift_scores![key]).toBe(1.0);
    expect(l11.drift_scores![key]).toBe(1.0);
  });

  it('high drift score (> 0.5) causes adaptThresholdsFromDrift to NOT increase max_deviations', () => {
    const registry = new AgentRegistry();
    const agentName = 'mock-interceptor';
    const before = registry.getAgent(agentName)!.config.thresholds.max_deviations;

    registry.adaptThresholdsFromDrift({ 'mock-interceptor:mock_operation_detected': 0.8 });

    const after = registry.getAgent(agentName)!.config.thresholds.max_deviations;

    // Tightening means max_deviations stays same or decreases — never increases
    expect(after).toBeLessThanOrEqual(before);
  });

  it('zero drift score after 5 runs relaxes max_deviations upward (or stays at floor 0)', () => {
    const registry = new AgentRegistry();
    const agentName = 'gate-independence-verifier';

    // Advance the agent to 5 runs
    for (let i = 0; i < 5; i++) {
      registry.updateAgentState(agentName, { violations: 0 });
    }

    const before = registry.getAgent(agentName)!.config.thresholds.max_deviations;
    registry.adaptThresholdsFromDrift({ 'gate-independence-verifier:self_referential_receipt': 0 });
    const after = registry.getAgent(agentName)!.config.thresholds.max_deviations;

    // Zero drift after 5+ runs → threshold relaxes (increases) or stays same
    expect(after).toBeGreaterThanOrEqual(before);
  });

  it('learn knowledge_updated is true when violations exist, false when both violations and corrections are empty', () => {
    const orchestrator = new AgentOrchestrator();
    const emptyExecute: ExecuteResult = { corrections: [], successful_count: 0, failed_count: 0 };

    const learnNoViolations = orchestrator.learn(
      { violations: [], critical_count: 0, warning_count: 0, agents_triggered: [] },
      emptyExecute
    );
    const learnWithViolation = orchestrator.learn(
      {
        violations: [
          {
            agent_name: 'theater-detector',
            violation_type: 'suspiciously_fast_operation',
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
      },
      emptyExecute
    );

    expect(learnNoViolations.knowledge_updated).toBe(false);
    expect(learnWithViolation.knowledge_updated).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// E. Monitor surface fitness mathematical invariants — Rank 1
//
// Fitness is binary (0.0 or 1.0) per surface; count equals input array length.
// ─────────────────────────────────────────────────────────────────────────────

describe('Monitor surface fitness invariants — Rank 1 (Mathematical)', () => {
  it('fitness is always 0.0 or 1.0 for every surface (no intermediate values)', async () => {
    const orchestrator = new AgentOrchestrator();

    const cases = [
      { artifact_id: 'case-empty' },
      {
        artifact_id: 'case-full',
        receipts: [{ hash: 'h1', previous_hash: null }],
        traces: [{ name: 'op', service: 'svc', trace_id: 't1', duration_ms: 5 }],
        ocel_events: [{ activity: 'seed-ontology' }],
      },
    ];

    for (const ctx of cases) {
      const result = await orchestrator.monitor(ctx);
      for (const surface of ['execution', 'telemetry', 'state', 'process'] as const) {
        const fitness = result[surface].fitness;
        // Fitness must be exactly 0.0 or 1.0 — no intermediate values
        expect([0.0, 1.0]).toContain(fitness);
      }
    }
  });

  it('execution.count === receipts.length for any input length', async () => {
    const orchestrator = new AgentOrchestrator();
    const receipts = [
      { hash: 'h1', previous_hash: null },
      { hash: 'h2', previous_hash: 'h1' },
      { hash: 'h3', previous_hash: 'h2' },
      { hash: 'h4', previous_hash: 'h3' },
    ];

    const result = await orchestrator.monitor({ artifact_id: 'count-check', receipts });
    expect(result.execution.count).toBe(receipts.length);
  });

  it('telemetry.count === traces.length for any input length', async () => {
    const orchestrator = new AgentOrchestrator();
    const traces = [
      { name: 'a', service: 'svc', trace_id: 't1', duration_ms: 10 },
      { name: 'b', service: 'svc', trace_id: 't2', duration_ms: 20 },
      { name: 'c', service: 'svc', trace_id: 't3', duration_ms: 30 },
    ];

    const result = await orchestrator.monitor({ artifact_id: 'telemetry-count', traces });
    expect(result.telemetry.count).toBe(traces.length);
  });

  it('process.count === ocel_events.length for any input length', async () => {
    const orchestrator = new AgentOrchestrator();
    const events = [
      { activity: 'seed-ontology' },
      { activity: 'breed-ontology' },
    ];

    const result = await orchestrator.monitor({ artifact_id: 'process-count', ocel_events: events });
    expect(result.process.count).toBe(events.length);
  });

  it('state.count is always exactly 1 when artifact_id is provided', async () => {
    const orchestrator = new AgentOrchestrator();
    const result = await orchestrator.monitor({ artifact_id: 'state-count-invariant' });
    // State surface encodes one artifact — count is 1
    expect(result.state.count).toBe(1);
  });

  it('adding more OCEL events increases process.count linearly', async () => {
    const orchestrator = new AgentOrchestrator();

    const makeEvents = (n: number) =>
      Array.from({ length: n }, (_, i) => ({ activity: `activity-${i}`, ocel_id: `e${i}` }));

    const r3 = await orchestrator.monitor({ artifact_id: 'linear-3', ocel_events: makeEvents(3) });
    const r7 = await orchestrator.monitor({ artifact_id: 'linear-7', ocel_events: makeEvents(7) });

    expect(r7.process.count - r3.process.count).toBe(4);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// F. Execute correction audit-trail structural invariants — Rank 2
//
// The AuditStore and each AuditEntry must satisfy field-shape contracts.
// ─────────────────────────────────────────────────────────────────────────────

describe('Execute correction audit-trail structural invariants — Rank 2', () => {
  it('audit store count increases by one per logged correction', async () => {
    const auditPath = `/tmp/audit-lifecycle-test-${Date.now()}.jsonl`;
    const orchestrator = new AgentOrchestrator({ auditPath });
    const auditStore = orchestrator.getAuditStore();

    const before = auditStore.count;

    const plan: PlanResult = {
      actions: [
        {
          agent: 'mock-interceptor',
          type: 'code_refactoring',
          target: 'audit-art',
          severity: 'warning',
          requires_approval: false,
        },
      ],
      critical_actions: 0,
      warning_actions: 1,
    };

    await orchestrator.execute(plan, { artifact_id: 'audit-art', dry_run: false });

    const after = auditStore.count;
    expect(after).toBe(before + 1);
  });

  it('audit entry correction_type matches the plan action type', async () => {
    const auditPath = `/tmp/audit-type-match-${Date.now()}.jsonl`;
    const orchestrator = new AgentOrchestrator({ auditPath });
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

    const result = await orchestrator.execute(plan, { artifact_id: 'type-match', dry_run: false });

    expect(result.corrections[0].correction_type).toBe('config_restoration');
  });

  it('audit entry artifact_id matches the context artifact_id', async () => {
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

    const result = await orchestrator.execute(plan, { artifact_id: 'my-artifact', dry_run: false });

    expect(result.corrections[0].artifact_id).toBe('my-artifact');
  });

  it('snapshot_data in audit entry has target field when non-null', async () => {
    const orchestrator = new AgentOrchestrator();
    const plan: PlanResult = {
      actions: [
        {
          agent: 'gate-independence-verifier',
          type: 'process_correction',
          target: 'snapshot-target',
          severity: 'critical',
          requires_approval: true,
        },
      ],
      critical_actions: 1,
      warning_actions: 0,
    };

    const result = await orchestrator.execute(plan, { artifact_id: 'snap-test', dry_run: false });

    const entry = result.corrections[0];
    if (entry.snapshot_data !== null) {
      expect(entry.snapshot_data).toHaveProperty('target');
      expect(entry.snapshot_data!['target']).toBe('snapshot-target');
    }
  });

  it('correction timestamp is a valid ISO 8601 string', async () => {
    const orchestrator = new AgentOrchestrator();
    const plan: PlanResult = {
      actions: [
        {
          agent: 'theater-detector',
          type: 'stub_elimination',
          target: 'span-x',
          severity: 'warning',
          requires_approval: false,
        },
      ],
      critical_actions: 0,
      warning_actions: 1,
    };

    const result = await orchestrator.execute(plan, { artifact_id: 'ts-test', dry_run: false });

    const ts = result.corrections[0].timestamp;
    expect(typeof ts).toBe('string');
    const parsed = new Date(ts);
    expect(isNaN(parsed.getTime())).toBe(false);
  });

  it('AuditStore.getLastForAgent returns the most recent entry for that agent', async () => {
    const auditPath = `/tmp/audit-last-agent-${Date.now()}.jsonl`;
    const orchestrator = new AgentOrchestrator({ auditPath });
    const auditStore = orchestrator.getAuditStore();

    const plan: PlanResult = {
      actions: [
        {
          agent: 'authority-escalation-watcher',
          type: 'authority_restoration',
          target: 'release-tgt',
          severity: 'critical',
          requires_approval: true,
        },
      ],
      critical_actions: 1,
      warning_actions: 0,
    };

    await orchestrator.execute(plan, { artifact_id: 'last-agent-test', dry_run: false });

    const lastEntry = auditStore.getLastForAgent('authority-escalation-watcher');
    expect(lastEntry).not.toBeNull();
    expect(lastEntry!.agent_name).toBe('authority-escalation-watcher');
  });

  it('AuditStore.getForArtifact filters correctly to the given artifact_id', async () => {
    const auditPath = `/tmp/audit-artifact-filter-${Date.now()}.jsonl`;
    const orchestrator = new AgentOrchestrator({ auditPath });
    const auditStore = orchestrator.getAuditStore();

    const plan: PlanResult = {
      actions: [
        {
          agent: 'mock-interceptor',
          type: 'code_refactoring',
          target: 'filter-art',
          severity: 'warning',
          requires_approval: false,
        },
      ],
      critical_actions: 0,
      warning_actions: 1,
    };

    await orchestrator.execute(plan, { artifact_id: 'filter-art', dry_run: false });

    const entries = auditStore.getForArtifact('filter-art');
    expect(entries.length).toBeGreaterThan(0);
    for (const e of entries) {
      expect(e.artifact_id).toBe('filter-art');
    }

    // Must not return entries for a different artifact
    const wrongEntries = auditStore.getForArtifact('other-art');
    expect(wrongEntries).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// G. Registry state-change invariants around execute cycles — Rank 1
//
// Agent total_runs and last_run fields must monotonically increase with each
// executeAgent call.
// ─────────────────────────────────────────────────────────────────────────────

describe('Registry state-change invariants around execute cycles — Rank 1', () => {
  it('total_runs increases by 1 for each executeAgent call', async () => {
    const orchestrator = new AgentOrchestrator();
    const registry = orchestrator.getAgentRegistry();
    const agentName = 'mock-interceptor';

    const before = registry.getAgent(agentName)!.total_runs;
    await orchestrator.executeAgent(agentName, { artifact_id: 'run-count-test', traces: [] });
    const after = registry.getAgent(agentName)!.total_runs;

    expect(after).toBe(before + 1);
  });

  it('total_runs is strictly monotonically increasing across multiple executeAgent calls', async () => {
    const orchestrator = new AgentOrchestrator();
    const registry = orchestrator.getAgentRegistry();
    // Use mock-interceptor with empty traces — always passes without setting status=error,
    // so subsequent executeAgent calls are not blocked by the status guard.
    const agentName = 'mock-interceptor';

    const runs: number[] = [];
    for (let i = 0; i < 3; i++) {
      await orchestrator.executeAgent(agentName, { artifact_id: `monotonic-${i}`, traces: [] });
      runs.push(registry.getAgent(agentName)!.total_runs);
    }

    // Each run must be strictly greater than the previous
    for (let i = 1; i < runs.length; i++) {
      expect(runs[i]).toBeGreaterThan(runs[i - 1]);
    }
  });

  it('last_run is null before any execution and a valid ISO timestamp after', async () => {
    const orchestrator = new AgentOrchestrator();
    const registry = orchestrator.getAgentRegistry();
    const agentName = 'gate-independence-verifier';

    // Fresh registry: last_run is null
    expect(registry.getAgent(agentName)!.last_run).toBeNull();

    await orchestrator.executeAgent(agentName, { artifact_id: 'last-run-test' });

    const lastRun = registry.getAgent(agentName)!.last_run;
    expect(lastRun).not.toBeNull();
    const parsed = new Date(lastRun!);
    expect(isNaN(parsed.getTime())).toBe(false);
  });

  it('registerAgent adds a 9th agent that becomes retrievable by name', () => {
    const registry = new AgentRegistry();

    registry.registerAgent({
      name: 'custom-test-agent',
      description: 'A test-only agent',
      mode: 'on_demand',
      target_gates: ['custom-gate'],
      enabled: true,
      correction_type: 'process_correction',
      version: '0.0.1',
      tags: ['test'],
      thresholds: {
        min_fitness: 0.9,
        min_precision: 0.8,
        max_deviations: 0,
        timeout_ms: 1000,
      },
    });

    expect(registry.hasAgent('custom-test-agent')).toBe(true);
    expect(registry.getAgent('custom-test-agent')?.status).toBe('active');
    expect(registry.getAgentNames()).toHaveLength(VAN_DERAALST_AGENTS.length + 1);
  });

  it('disableAgent changes status to disabled and enableAgent restores to active', () => {
    const registry = new AgentRegistry();
    const agentName = 'theater-detector';

    expect(registry.getAgent(agentName)!.status).toBe('active');

    registry.disableAgent(agentName);
    expect(registry.getAgent(agentName)!.status).toBe('disabled');
    expect(registry.getAgent(agentName)!.config.enabled).toBe(false);

    registry.enableAgent(agentName);
    expect(registry.getAgent(agentName)!.status).toBe('active');
    expect(registry.getAgent(agentName)!.config.enabled).toBe(true);
  });

  it('getSummary total equals active + disabled + error + degraded', () => {
    const registry = new AgentRegistry();

    registry.disableAgent('theater-detector');
    registry.updateAgentState('mock-interceptor', { error: 'simulated error' });

    const summary = registry.getSummary();
    expect(summary.total).toBe(summary.active + summary.disabled + summary.error + summary.degraded);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// H. MAPE-K cycle idempotency — Rank 3 (Metamorphic)
//
// Two independent orchestrators with identical context must agree on
// severity breakdown, surface validity, and plan shape.
// ─────────────────────────────────────────────────────────────────────────────

describe('MAPE-K cycle idempotency — Rank 3 (Metamorphic)', () => {
  it('two fresh orchestrators with same mock context agree on critical_count', async () => {
    const ctx = {
      artifact_id: 'idem-mock',
      traces: [{ name: 'mock_seed', service: 'svc', trace_id: 'tr-idem', duration_ms: 5 }],
      dry_run: true,
    };

    const orc1 = new AgentOrchestrator();
    const orc2 = new AgentOrchestrator();

    const r1 = await orc1.runMapekCycle(ctx);
    const r2 = await orc2.runMapekCycle(ctx);

    expect(r1.analyze.critical_count).toBe(r2.analyze.critical_count);
  });

  it('two fresh orchestrators with same context agree on plan.actions.length', async () => {
    const ctx = {
      artifact_id: 'idem-plan',
      traces: [{ name: 'stub_handler', service: 'svc', trace_id: 'stub-idem', duration_ms: 10 }],
      dry_run: true,
    };

    const orc1 = new AgentOrchestrator();
    const orc2 = new AgentOrchestrator();

    const r1 = await orc1.runMapekCycle(ctx);
    const r2 = await orc2.runMapekCycle(ctx);

    expect(r1.plan.actions.length).toBe(r2.plan.actions.length);
  });

  it('adding a self-referential receipt triggers gate-independence-verifier violation', async () => {
    const orchestrator = new AgentOrchestrator();
    // Call executeAgent directly to avoid config-drift-guardian require('fs') interactions
    // that can affect test isolation when run alongside other tests.
    const ctx = {
      artifact_id: 'self-ref-test',
      receipts: [{ hash: 'same-hash', previous_hash: 'same-hash' }],
    };

    const result = await orchestrator.executeAgent('gate-independence-verifier', ctx);

    const selfRefViolation = result.violations.find(
      (v) => v.violation_type === 'self_referential_receipt'
    );
    expect(selfRefViolation).toBeDefined();
    expect(selfRefViolation!.agent_name).toBe('gate-independence-verifier');
    expect(selfRefViolation!.severity).toBe('critical');
  });

  it('fabricated trace_id "fake" triggers evidence-fabrication-detector', async () => {
    const orchestrator = new AgentOrchestrator();
    const ctx = {
      artifact_id: 'fake-trace-test',
      traces: [{ name: 'real_op', service: 'svc', trace_id: 'fake', duration_ms: 50 }],
    };

    const monitor = await orchestrator.monitor(ctx);
    const analyze = await orchestrator.analyze(ctx, monitor);

    const fabricatedViolation = analyze.violations.find(
      (v) => v.violation_type === 'fabricated_trace_id'
    );
    expect(fabricatedViolation).toBeDefined();
    expect(fabricatedViolation!.severity).toBe('critical');
  });

  it('release without validation triggers authority-escalation-watcher', async () => {
    const orchestrator = new AgentOrchestrator();
    const ctx = {
      artifact_id: 'no-validate-release',
      gate_name: 'authority-chain-valid',
      ocel_events: [
        { activity: 'seed-ontology' },
        { activity: 'breed-ontology' },
        { activity: 'compile-artifact' },
        { activity: 'run-benchmark' },
        { activity: 'release-package' }, // no validate-ontology!
      ],
    };

    const result = await orchestrator.executeAgent('authority-escalation-watcher', ctx);

    const releaseViolation = result.violations.find(
      (v) => v.violation_type === 'release_without_validation'
    );
    expect(releaseViolation).toBeDefined();
    expect(releaseViolation!.severity).toBe('critical');
  });

  it('clean context with no mock/stub patterns produces zero critical violations across two cycles', async () => {
    const ctx = {
      artifact_id: 'clean-idempotent',
      traces: [
        { name: 'real_operation_alpha', service: 'real-svc', trace_id: 'valid-uuid-001', duration_ms: 45 },
      ],
      dry_run: true,
    };

    const orc1 = new AgentOrchestrator();
    const orc2 = new AgentOrchestrator();

    const r1 = await orc1.runMapekCycle(ctx);
    const r2 = await orc2.runMapekCycle(ctx);

    expect(r1.analyze.critical_count).toBe(0);
    expect(r2.analyze.critical_count).toBe(0);
  });
});
