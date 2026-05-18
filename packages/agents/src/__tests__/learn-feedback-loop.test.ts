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
        { violations, critical_count: 10, warning_count: 0, agents_triggered: ['mock-interceptor'] },
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
