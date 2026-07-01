import { describe, it, expect } from 'vitest';
import { AgentOrchestrator } from '../orchestration.js';

/**
 * Tests for orchestration timeout guard and error propagation (no mocks — Gemba principle).
 *
 * Gap 1: constructor must accept cycleTimeoutMs / agentTimeoutMs options
 * Gap 2: unknown agent name must propagate as agent_not_found violation, not throw
 * Gap 3: disabled agent must propagate as agent_disabled violation, not throw
 * Gap 4: broken receipt chain must propagate as broken_hash_chain violation into cycle result
 */
describe('AgentOrchestrator — timeout options and error propagation', () => {
  describe('timeout constructor options', () => {
    it('accepts cycleTimeoutMs and agentTimeoutMs without throwing', () => {
      // Verifies the timeout guard API surface exists.
      // If the constructor does not accept these options, TypeScript compilation fails.
      expect(
        () =>
          new AgentOrchestrator({
            cycleTimeoutMs: 5_000,
            agentTimeoutMs: 1_000,
          })
      ).not.toThrow();
    });

    it('uses default timeouts when options are omitted', () => {
      // Verifies the orchestrator constructs without errors when no timeout options given.
      expect(() => new AgentOrchestrator()).not.toThrow();
    });
  });

  describe('unknown agent — error propagated as violation, not thrown', () => {
    it('returns agent_not_found violation for unregistered agent name', async () => {
      const orchestrator = new AgentOrchestrator();

      const result = await orchestrator.executeAgent('nonexistent-agent-xyz', {
        artifact_id: 'test-artifact',
        dry_run: true,
      });

      // Must not throw — must return a failed AgentResult
      expect(result.passed).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].violation_type).toBe('agent_not_found');
      expect(result.violations[0].severity).toBe('critical');
      expect(result.violations[0].blocked_manufacturing).toBe(true);
    });
  });

  describe('disabled agent — error propagated as violation, not thrown', () => {
    it('returns agent_disabled violation when agent is inactive', async () => {
      const orchestrator = new AgentOrchestrator();
      // Disable one of the built-in agents (receipt-chain-attacker is on_demand by default)
      orchestrator.getAgentRegistry().disableAgent('receipt-chain-attacker');

      const result = await orchestrator.executeAgent('receipt-chain-attacker', {
        artifact_id: 'test-artifact',
        dry_run: true,
      });

      expect(result.passed).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].violation_type).toBe('agent_disabled');
      // Disabled agent is warning, not critical — it doesn't block manufacturing
      expect(result.violations[0].severity).toBe('warning');
      expect(result.violations[0].blocked_manufacturing).toBe(false);
    });
  });

  describe('broken receipt chain — violation propagates via executeAgent and via gate-triggered cycle', () => {
    it('broken_hash_chain violation surfaces when executeAgent is called directly', async () => {
      const orchestrator = new AgentOrchestrator();

      // Provide receipts with deliberately broken chain linkage
      const brokenChain = [
        { hash: 'aaa000', previous_hash: null },
        { hash: 'bbb111', previous_hash: 'WRONG_HASH' }, // should be 'aaa000'
        { hash: 'ccc222', previous_hash: 'bbb111' },
      ];

      // receipt-chain-attacker is on_demand; call it directly via executeAgent
      const result = await orchestrator.executeAgent('receipt-chain-attacker', {
        artifact_id: 'broken-chain-artifact',
        receipts: brokenChain,
        dry_run: true,
      });

      expect(result.passed).toBe(false);
      const chainViolation = result.violations.find(
        (v) => v.violation_type === 'broken_hash_chain'
      );
      expect(chainViolation).toBeDefined();
      expect(chainViolation?.severity).toBe('critical');
      expect(chainViolation?.blocked_manufacturing).toBe(true);
    });

    it('broken_hash_chain violation appears in cycle analyze result when gate_name triggers the agent', async () => {
      const orchestrator = new AgentOrchestrator();

      const brokenChain = [
        { hash: 'aaa000', previous_hash: null },
        { hash: 'bbb111', previous_hash: 'WRONG_HASH' },
      ];

      // gate_name 'benchmark-passed' triggers receipt-chain-attacker (on_demand target gate)
      const cycleResult = await orchestrator.runMapekCycle({
        artifact_id: 'broken-chain-cycle',
        receipts: brokenChain,
        gate_name: 'benchmark-passed',
        dry_run: true,
      });

      expect(cycleResult).toBeDefined();
      expect(cycleResult.cycle_id).toMatch(/^cycle-/);

      const chainViolation = cycleResult.analyze.violations.find(
        (v) => v.violation_type === 'broken_hash_chain'
      );
      expect(chainViolation).toBeDefined();
      expect(chainViolation?.severity).toBe('critical');
      expect(cycleResult.analyze.critical_count).toBeGreaterThan(0);
    });

    it('self-referential receipt surfaces via executeAgent', async () => {
      const orchestrator = new AgentOrchestrator();

      const selfRefChain = [
        { hash: 'deadbeef', previous_hash: 'deadbeef' }, // self-referential
      ];

      // gate-independence-verifier catches self-referential receipts
      const result = await orchestrator.executeAgent('gate-independence-verifier', {
        artifact_id: 'self-ref-artifact',
        receipts: selfRefChain,
        dry_run: true,
      });

      expect(result.passed).toBe(false);
      const selfRefViolation = result.violations.find(
        (v) => v.violation_type === 'self_referential_receipt'
      );
      expect(selfRefViolation).toBeDefined();
      expect(selfRefViolation?.severity).toBe('critical');
    });
  });

  describe('mock trace detection — violation propagates through cycle', () => {
    it('mock_operation_detected violation appears when traces contain mock_ prefix', async () => {
      const orchestrator = new AgentOrchestrator();

      const mockTraces = [
        { name: 'mock_wasm_run', service: 'test-service', trace_id: 'abc123', duration_ms: 5 },
      ];

      const cycleResult = await orchestrator.runMapekCycle({
        artifact_id: 'mock-trace-artifact',
        traces: mockTraces,
        dry_run: true,
      });

      const mockViolation = cycleResult.analyze.violations.find(
        (v) => v.violation_type === 'mock_operation_detected'
      );
      expect(mockViolation).toBeDefined();
      expect(mockViolation?.severity).toBe('critical');
      expect(mockViolation?.blocked_manufacturing).toBe(true);
    });
  });
});
