/**
 * Learn-phase feedback loop tests (MAPE-K gap closure).
 *
 * Verifies that `AgentOrchestrator.learn()` feeds drift scores back into
 * `AgentRegistry.adaptThresholdsFromDrift()`, so that repeated violations
 * tighten agent thresholds and prolonged silence relaxes them.
 *
 * Oracle rank: Rank 2 — Domain contract (threshold monotonicity under drift).
 */
import { describe, it, expect } from 'vitest';
import { AgentRegistry } from '../registry.js';
import { AgentOrchestrator } from '../orchestration.js';
import type { AnalyzeResult, ExecuteResult } from '../types.js';

describe('AgentRegistry.adaptThresholdsFromDrift', () => {
  it('tightens max_deviations for agents with high drift score (> 0.5)', () => {
    const registry = new AgentRegistry();

    // Start: mock-interceptor has max_deviations = 0 (DEFAULT_THRESHOLDS)
    const before = registry.getAgent('mock-interceptor')!.config.thresholds.max_deviations;

    // Simulate high drift: mock-interceptor:mock_operation_detected fires repeatedly
    registry.adaptThresholdsFromDrift({
      'mock-interceptor:mock_operation_detected': 0.8,
    });

    const after = registry.getAgent('mock-interceptor')!.config.thresholds.max_deviations;

    // Tighten: threshold must decrease (or stay at 0 floor)
    expect(after).toBeLessThanOrEqual(before);
    // It cannot go below 0
    expect(after).toBeGreaterThanOrEqual(0);
  });

  it('relaxes max_deviations for quiet agents after >= 5 runs', () => {
    const registry = new AgentRegistry();
    const agentName = 'config-drift-guardian';

    // Simulate 5 runs so the agent qualifies for relaxation
    for (let i = 0; i < 5; i++) {
      registry.updateAgentState(agentName, { violations: 0 });
    }

    const before = registry.getAgent(agentName)!.config.thresholds.max_deviations;

    // No violations in drift scores for this agent
    registry.adaptThresholdsFromDrift({
      'config-drift-guardian:missing_config': 0.0,
    });

    const after = registry.getAgent(agentName)!.config.thresholds.max_deviations;

    // Relax: threshold may increase by 1 (bounded at 3)
    expect(after).toBeGreaterThanOrEqual(before);
    expect(after).toBeLessThanOrEqual(3);
  });

  it('ignores drift scores for unknown agents without throwing', () => {
    const registry = new AgentRegistry();

    // Should not throw even for non-existent agents
    expect(() =>
      registry.adaptThresholdsFromDrift({
        'nonexistent-agent:some_violation': 0.9,
      })
    ).not.toThrow();
  });

  it('does not relax threshold when agent has run fewer than 5 times', () => {
    const registry = new AgentRegistry();
    const agentName = 'theater-detector';

    // Only 2 runs — below the relaxation threshold
    registry.updateAgentState(agentName, { violations: 0 });
    registry.updateAgentState(agentName, { violations: 0 });

    const before = registry.getAgent(agentName)!.config.thresholds.max_deviations;

    registry.adaptThresholdsFromDrift({
      'theater-detector:empty_span_attributes': 0.0,
    });

    const after = registry.getAgent(agentName)!.config.thresholds.max_deviations;

    // Not enough runs: threshold must NOT change
    expect(after).toBe(before);
  });
});

describe('AgentRegistry.adaptThresholdsFromDrift — thresholdAuditLog', () => {
  it('returns an audit entry when max_deviations is tightened', () => {
    const registry = new AgentRegistry();
    // mock-interceptor starts at max_deviations=0 (floor) — tighten has no effect
    // Use config-drift-guardian which also starts at 0, same floor
    // Give process-mining-skeptic a non-zero starting value to see tightening
    // Actually all start at 0 per DEFAULT_THRESHOLDS. Relax first then tighten.
    const agentName = 'config-drift-guardian';

    // Relax first: 5 runs, score=0
    for (let i = 0; i < 5; i++) {
      registry.updateAgentState(agentName, { violations: 0 });
    }
    registry.adaptThresholdsFromDrift({ [`${agentName}:missing_config`]: 0.0 });
    // Now max_deviations = 1

    // Tighten: score > 0.5
    const auditLog = registry.adaptThresholdsFromDrift({
      [`${agentName}:missing_config`]: 0.9,
    });

    expect(auditLog).toHaveLength(1);
    expect(auditLog[0].agentId).toBe(agentName);
    expect(auditLog[0].field).toBe('max_deviations');
    expect(auditLog[0].before).toBeGreaterThan(auditLog[0].after);
    expect(auditLog[0].driftScore).toBe(0.9);
    expect(auditLog[0].reason).toMatch(/tightened sensitivity/);
  });

  it('returns an audit entry when max_deviations is relaxed', () => {
    const registry = new AgentRegistry();
    const agentName = 'theater-detector';

    // 5 runs with no violations
    for (let i = 0; i < 5; i++) {
      registry.updateAgentState(agentName, { violations: 0 });
    }

    const auditLog = registry.adaptThresholdsFromDrift({
      [`${agentName}:empty_span_attributes`]: 0.0,
    });

    expect(auditLog).toHaveLength(1);
    expect(auditLog[0].agentId).toBe(agentName);
    expect(auditLog[0].after).toBeGreaterThan(auditLog[0].before);
    expect(auditLog[0].reason).toMatch(/relaxed noise threshold/);
  });

  it('returns empty array when no thresholds changed (at floor with high drift)', () => {
    const registry = new AgentRegistry();
    // max_deviations=0 already — tightening is a no-op
    const auditLog = registry.adaptThresholdsFromDrift({
      'mock-interceptor:mock_operation_detected': 0.9,
    });
    expect(auditLog).toHaveLength(0);
  });

  it('returns empty array for unknown agents', () => {
    const registry = new AgentRegistry();
    const auditLog = registry.adaptThresholdsFromDrift({
      'nonexistent-agent:violation': 0.9,
    });
    expect(auditLog).toHaveLength(0);
  });

  it('includes violationType from the key after the colon', () => {
    const registry = new AgentRegistry();
    const agentName = 'evidence-fabrication-detector';

    for (let i = 0; i < 5; i++) {
      registry.updateAgentState(agentName, { violations: 0 });
    }

    const auditLog = registry.adaptThresholdsFromDrift({
      [`${agentName}:fabricated_span`]: 0.0,
    });

    expect(auditLog.length).toBeGreaterThanOrEqual(1);
    expect(auditLog[0].violationType).toBe('fabricated_span');
  });
});

describe('AgentOrchestrator.learn — closed feedback loop', () => {
  it('returns knowledge_updated=true when drift scores exist', () => {
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
          target: 'test-artifact',
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
    expect(result.drift_scores!['mock-interceptor:mock_operation_detected']).toBeGreaterThan(0);
  });

  it('returns thresholdAuditLog field in LearnResult', () => {
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
          target: 'test-artifact',
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

    // thresholdAuditLog must always be present (empty array when nothing changed)
    expect(Array.isArray(result.thresholdAuditLog)).toBe(true);
    // Each entry must have the required fields
    for (const entry of result.thresholdAuditLog) {
      expect(typeof entry.agentId).toBe('string');
      expect(typeof entry.violationType).toBe('string');
      expect(typeof entry.driftScore).toBe('number');
      expect(typeof entry.field).toBe('string');
      expect(typeof entry.before).toBe('number');
      expect(typeof entry.after).toBe('number');
      expect(typeof entry.reason).toBe('string');
    }
  });

  it('returns knowledge_updated=false when no violations and no corrections', () => {
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

  it('drift scores are normalized to [0, 1]', () => {
    const orchestrator = new AgentOrchestrator();

    // 15 violations of the same type — score should be capped at 1.0
    const violations = Array.from({ length: 15 }, () => ({
      agent_name: 'mock-interceptor',
      violation_type: 'mock_operation_detected',
      severity: 'critical' as const,
      evidence: {},
      process_mining_proof: null,
      timestamp: new Date().toISOString(),
      blocked_manufacturing: true,
      target: 'test-artifact',
    }));

    const analyze: AnalyzeResult = {
      violations,
      critical_count: 15,
      warning_count: 0,
      agents_triggered: ['mock-interceptor'],
    };

    const execute: ExecuteResult = {
      corrections: [],
      successful_count: 0,
      failed_count: 0,
    };

    const result = orchestrator.learn(analyze, execute);

    expect(result.drift_scores).not.toBeNull();
    for (const score of Object.values(result.drift_scores!)) {
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1.0);
    }
  });

  it('registry thresholds tighten after repeated high-drift learn cycles', () => {
    const orchestrator = new AgentOrchestrator();
    const registry = orchestrator.getAgentRegistry();

    const thresholdBefore = registry.getAgent('mock-interceptor')!.config.thresholds.max_deviations;

    // Simulate 5 learn cycles with 10 violations each — drift score = 1.0 after norm
    for (let i = 0; i < 5; i++) {
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

      orchestrator.learn(
        {
          violations,
          critical_count: 10,
          warning_count: 0,
          agents_triggered: ['mock-interceptor'],
        },
        { corrections: [], successful_count: 0, failed_count: 0 }
      );
    }

    const thresholdAfter = registry.getAgent('mock-interceptor')!.config.thresholds.max_deviations;

    // Threshold must not have increased — adaptation must be monotone under high drift
    expect(thresholdAfter).toBeLessThanOrEqual(thresholdBefore);
    // And cannot go below 0
    expect(thresholdAfter).toBeGreaterThanOrEqual(0);
  });
});
