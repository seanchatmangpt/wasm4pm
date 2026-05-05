/**
 * Federation Voting — RED Test
 *
 * Mandate: Stream agents 2 & 4 conformance into distributed consensus
 * Consensus rule: Majority vote (3+ of 5 agents agree = truth)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { FederationVoting } from '../harness/federation-voting';

describe('Federation Voting', () => {
  let voting: FederationVoting;

  beforeEach(() => {
    voting = new FederationVoting();
  });

  describe('Consensus on Conformance Verdict', () => {
    it('reaches TRUTHFUL consensus when all agents agree (≥0.95 fitness)', async () => {
      const votes = [
        { agentId: 'agent_2_algo1', fitness: 0.97, verdict: 'TRUTHFUL' },
        { agentId: 'agent_2_algo2', fitness: 0.96, verdict: 'TRUTHFUL' },
        { agentId: 'agent_4_sound', fitness: 0.95, verdict: 'TRUTHFUL' },
        { agentId: 'agent_5_conform', fitness: 0.98, verdict: 'TRUTHFUL' },
        { agentId: 'agent_1_harvest', fitness: 0.99, verdict: 'TRUTHFUL' },
      ];

      const consensus = await voting.reachConsensus(votes);

      expect(consensus.verdict).toBe('TRUTHFUL');
      expect(consensus.confidence).toBeGreaterThan(0.9);
      expect(consensus.votesForVerdict).toBe(5);
    });

    it('reaches VARIANCE consensus when majority shows undocumented branches', async () => {
      const votes = [
        { agentId: 'agent_2_algo1', fitness: 0.82, verdict: 'VARIANCE' },
        { agentId: 'agent_2_algo2', fitness: 0.78, verdict: 'VARIANCE' },
        { agentId: 'agent_4_sound', fitness: 0.85, verdict: 'VARIANCE' },
        { agentId: 'agent_5_conform', fitness: 0.75, verdict: 'DECEPTIVE' },
        { agentId: 'agent_1_harvest', fitness: 0.8, verdict: 'VARIANCE' },
      ];

      const consensus = await voting.reachConsensus(votes);

      expect(consensus.verdict).toBe('VARIANCE');
      expect(consensus.votesForVerdict).toBe(4);
    });

    it('reaches DECEPTIVE consensus when reality contradicts declared model', async () => {
      const votes = [
        { agentId: 'agent_2_algo1', fitness: 0.45, verdict: 'DECEPTIVE' },
        { agentId: 'agent_2_algo2', fitness: 0.38, verdict: 'DECEPTIVE' },
        { agentId: 'agent_4_sound', fitness: 0.5, verdict: 'DECEPTIVE' },
        { agentId: 'agent_5_conform', fitness: 0.42, verdict: 'DECEPTIVE' },
        { agentId: 'agent_1_harvest', fitness: 0.4, verdict: 'DECEPTIVE' },
      ];

      const consensus = await voting.reachConsensus(votes);

      expect(consensus.verdict).toBe('DECEPTIVE');
      expect(consensus.confidence).toBeGreaterThan(0.85);
    });

    it('requires 3+ votes for quorum (majority rule)', async () => {
      const votes = [
        { agentId: 'agent_2_algo1', fitness: 0.97, verdict: 'TRUTHFUL' },
        { agentId: 'agent_2_algo2', fitness: 0.75, verdict: 'VARIANCE' },
        { agentId: 'agent_4_sound', fitness: 0.98, verdict: 'TRUTHFUL' },
      ];

      const consensus = await voting.reachConsensus(votes);

      expect(consensus.quorumReached).toBe(true);
      expect(consensus.votesForVerdict).toBeGreaterThanOrEqual(2);
    });

    it('denies quorum if <3 agents (insufficient consensus)', async () => {
      const votes = [
        { agentId: 'agent_2_algo1', fitness: 0.97, verdict: 'TRUTHFUL' },
        { agentId: 'agent_4_sound', fitness: 0.5, verdict: 'DECEPTIVE' },
      ];

      const consensus = await voting.reachConsensus(votes);

      expect(consensus.quorumReached).toBe(false);
    });
  });

  describe('Confidence Scoring', () => {
    it('calculates confidence based on agreement level', async () => {
      const votes = [
        { agentId: 'agent_2_algo1', fitness: 0.95, verdict: 'TRUTHFUL' },
        { agentId: 'agent_2_algo2', fitness: 0.94, verdict: 'TRUTHFUL' },
        { agentId: 'agent_4_sound', fitness: 0.92, verdict: 'TRUTHFUL' },
        { agentId: 'agent_5_conform', fitness: 0.8, verdict: 'VARIANCE' }, // Dissenter
        { agentId: 'agent_1_harvest', fitness: 0.96, verdict: 'TRUTHFUL' },
      ];

      const consensus = await voting.reachConsensus(votes);

      expect(consensus.confidence).toBeGreaterThan(0.75);
      expect(consensus.dissent).toBe(1);
    });
  });

  describe('Merkle Root Consensus', () => {
    it('verifies consensus via merkle root of all votes', async () => {
      const votes = [
        { agentId: 'agent_2_algo1', fitness: 0.97, verdict: 'TRUTHFUL' },
        { agentId: 'agent_2_algo2', fitness: 0.96, verdict: 'TRUTHFUL' },
        { agentId: 'agent_4_sound', fitness: 0.95, verdict: 'TRUTHFUL' },
        { agentId: 'agent_5_conform', fitness: 0.98, verdict: 'TRUTHFUL' },
        { agentId: 'agent_1_harvest', fitness: 0.99, verdict: 'TRUTHFUL' },
      ];

      const consensus = await voting.reachConsensus(votes);

      expect(consensus.merkleRoot).toBeDefined();
      expect(consensus.merkleRoot).toMatch(/^[a-f0-9]{64}$/); // SHA-256 hex
    });

    it('detects tampering via merkle root mismatch', async () => {
      const votes = [
        { agentId: 'agent_2_algo1', fitness: 0.97, verdict: 'TRUTHFUL' },
        { agentId: 'agent_2_algo2', fitness: 0.96, verdict: 'TRUTHFUL' },
        { agentId: 'agent_4_sound', fitness: 0.95, verdict: 'TRUTHFUL' },
      ];

      const consensus1 = await voting.reachConsensus(votes);
      const consensus2 = await voting.reachConsensus([
        ...votes,
        { agentId: 'agent_attacker', fitness: 0.99, verdict: 'TRUTHFUL' }, // Tampered
      ]);

      expect(consensus1.merkleRoot).not.toBe(consensus2.merkleRoot);
    });
  });
});
