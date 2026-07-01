/**
 * Rank-1 / Rank-2 contract tests for AgentOrchestrator validation logic.
 *
 * Covers the three field-contract violations fixed in autoinstincts/iter12:
 *   1. `ProcessMiningProof.simplicity` must stay in [0.0, 1.0] (Rank-1: type contract)
 *   2. `_runAgentLogic` must not silently pass unknown agents (Rank-2: doctrine)
 *   3. `receipt-chain-attacker` must reject undefined/missing hash fields
 *      instead of silently accepting `undefined !== undefined` chains (Rank-2).
 */

import { describe, it, expect } from 'vitest';
import { AgentOrchestrator } from '../orchestration.js';

const ARTIFACT_ID = 'artifact-iter12-contracts';

describe('AgentOrchestrator — Rank-1/Rank-2 contracts', () => {
  describe('process-mining-skeptic: simplicity ∈ [0,1] (Rank-1)', () => {
    it('clamps simplicity to 0 when total deviations exceed contract limit', async () => {
      // 30 extra activities → unclamped formula would give 1 - 30*0.05 = -0.5.
      const extraActivities = Array.from({ length: 30 }, (_, i) => ({
        activity: `extra-stage-${i}`,
      }));
      const orch = new AgentOrchestrator();
      const result = await orch.executeAgent('process-mining-skeptic', {
        artifact_id: ARTIFACT_ID,
        ocel_events: extraActivities,
      });
      expect(result.process_mining_proof).not.toBeNull();
      const proof = result.process_mining_proof!;
      expect(proof.simplicity).toBeGreaterThanOrEqual(0);
      expect(proof.simplicity).toBeLessThanOrEqual(1);
      expect(proof.fitness).toBeGreaterThanOrEqual(0);
      expect(proof.fitness).toBeLessThanOrEqual(1);
      expect(proof.precision).toBeGreaterThanOrEqual(0);
      expect(proof.precision).toBeLessThanOrEqual(1);
      expect(proof.generalization).toBeGreaterThanOrEqual(0);
      expect(proof.generalization).toBeLessThanOrEqual(1);
    });

    it('returns simplicity = 1 when log matches expected pipeline exactly', async () => {
      const events = [
        { activity: 'seed-ontology' },
        { activity: 'breed-ontology' },
        { activity: 'validate-ontology' },
        { activity: 'project-artifact' },
        { activity: 'compile-artifact' },
        { activity: 'run-benchmark' },
        { activity: 'release-package' },
      ];
      const orch = new AgentOrchestrator();
      const result = await orch.executeAgent('process-mining-skeptic', {
        artifact_id: ARTIFACT_ID,
        ocel_events: events,
      });
      const proof = result.process_mining_proof!;
      expect(proof.simplicity).toBe(1.0);
      expect(proof.fitness).toBe(1.0);
      expect(proof.precision).toBe(1.0);
    });
  });

  describe('_runAgentLogic: unknown agents must not silently pass (Rank-2)', () => {
    it('registers a custom agent then refuses to silently pass it', async () => {
      const orch = new AgentOrchestrator();
      orch.getAgentRegistry().registerAgent({
        name: 'unknown-custom-agent',
        description: 'agent with no dispatch case',
        mode: 'on_demand',
        target_gates: [],
        enabled: true,
        correction_type: null,
        version: '0.0.0',
        tags: [],
        thresholds: {
          min_fitness: 0.95,
          min_precision: 0.8,
          max_deviations: 0,
          timeout_ms: 1000,
        },
      });
      const result = await orch.executeAgent('unknown-custom-agent', {
        artifact_id: ARTIFACT_ID,
      });
      expect(result.passed).toBe(false);
      // FM-5: exactly one violation expected — an agent-not-found scenario should
      // produce one 'agent_logic_not_implemented', not multiple. `> 0` would mask
      // a regression that generates duplicate violations.
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].violation_type).toBe('agent_logic_not_implemented');
      expect(result.violations[0].severity).toBe('warning');
      // Manufacturing-blocking left to gate logic; warning severity is the
      // explicit signal that no real validation ran.
      expect(result.violations[0].blocked_manufacturing).toBe(false);
    });
  });

  describe('receipt-chain-attacker: undefined hashes must fail (Rank-2)', () => {
    it('flags receipts whose `hash` field is missing/non-string', async () => {
      const orch = new AgentOrchestrator();
      const result = await orch.executeAgent('receipt-chain-attacker', {
        artifact_id: ARTIFACT_ID,
        // No hash, no previous_hash — would silently pass under the old
        // implementation because `undefined !== undefined` is false.
        receipts: [{ index: 0 }, { index: 1 }, { index: 2 }],
      });
      expect(result.passed).toBe(false);
      const types = result.violations.map((v) => v.violation_type);
      expect(types).toContain('missing_hash_field');
      expect(types).toContain('missing_previous_hash');
    });

    it('flags missing previous_hash and broken chain on linked receipts', async () => {
      // Note: orchestrator mutates agent registry state on violations, so
      // each negative case needs a fresh orchestrator.
      const missing = await new AgentOrchestrator().executeAgent('receipt-chain-attacker', {
        artifact_id: ARTIFACT_ID,
        receipts: [{ hash: 'a' }, { hash: 'b' /* missing previous_hash */ }],
      });
      expect(missing.violations.map((v) => v.violation_type)).toContain(
        'missing_previous_hash'
      );
      const broken = await new AgentOrchestrator().executeAgent('receipt-chain-attacker', {
        artifact_id: ARTIFACT_ID,
        receipts: [{ hash: 'a' }, { hash: 'b', previous_hash: 'wrong' }],
      });
      expect(broken.violations.map((v) => v.violation_type)).toContain('broken_hash_chain');
    });

    it('accepts a well-formed BLAKE3-style chain', async () => {
      const orch = new AgentOrchestrator();
      const result = await orch.executeAgent('receipt-chain-attacker', {
        artifact_id: ARTIFACT_ID,
        receipts: [
          { hash: 'a' },
          { hash: 'b', previous_hash: 'a' },
          { hash: 'c', previous_hash: 'b' },
        ],
      });
      expect(result.violations).toHaveLength(0);
      expect(result.passed).toBe(true);
    });
  });
});
