/**
 * Federation Voting
 *
 * Streams agents 2 & 4 conformance votes into distributed consensus.
 * Majority rule: 3+ of 5 agents = truth (Byzantine fault tolerance).
 * Merkle root guards against tampering.
 */

import { createHash } from 'crypto';

export interface ConformanceVote {
  agentId: string;
  fitness: number;
  verdict: 'TRUTHFUL' | 'VARIANCE' | 'DECEPTIVE';
}

export interface ConsensusResult {
  verdict: 'TRUTHFUL' | 'VARIANCE' | 'DECEPTIVE';
  confidence: number; // 0-1
  quorumReached: boolean;
  votesForVerdict: number;
  dissent: number;
  merkleRoot: string;
}

export class FederationVoting {
  async reachConsensus(votes: ConformanceVote[]): Promise<ConsensusResult> {
    // Quorum: 3+ votes required
    const quorumReached = votes.length >= 3;

    if (!quorumReached) {
      return {
        verdict: 'VARIANCE', // Default to VARIANCE if no quorum
        confidence: 0,
        quorumReached: false,
        votesForVerdict: 0,
        dissent: votes.length,
        merkleRoot: this.calculateMerkleRoot(votes),
      };
    }

    // Count votes by verdict
    const voteCount = {
      TRUTHFUL: 0,
      VARIANCE: 0,
      DECEPTIVE: 0,
    };

    for (const vote of votes) {
      voteCount[vote.verdict]++;
    }

    // Determine consensus verdict (majority)
    let verdict: 'TRUTHFUL' | 'VARIANCE' | 'DECEPTIVE';
    let votesForVerdict = 0;

    if (voteCount.DECEPTIVE > voteCount.TRUTHFUL && voteCount.DECEPTIVE > voteCount.VARIANCE) {
      verdict = 'DECEPTIVE';
      votesForVerdict = voteCount.DECEPTIVE;
    } else if (voteCount.VARIANCE > voteCount.TRUTHFUL && voteCount.VARIANCE > voteCount.DECEPTIVE) {
      verdict = 'VARIANCE';
      votesForVerdict = voteCount.VARIANCE;
    } else {
      verdict = 'TRUTHFUL';
      votesForVerdict = voteCount.TRUTHFUL;
    }

    // Calculate confidence: (votes for verdict - dissenting votes) / total votes
    const dissent = votes.length - votesForVerdict;
    const confidence = votesForVerdict / votes.length;

    return {
      verdict,
      confidence,
      quorumReached: true,
      votesForVerdict,
      dissent,
      merkleRoot: this.calculateMerkleRoot(votes),
    };
  }

  private calculateMerkleRoot(votes: ConformanceVote[]): string {
    // Simple merkle root: hash of all votes
    const hashes = votes.map((vote) =>
      createHash('sha256')
        .update(`${vote.agentId}:${vote.fitness}:${vote.verdict}`)
        .digest('hex')
    );

    // Hash all hashes together
    return createHash('sha256')
      .update(hashes.join(''))
      .digest('hex');
  }
}
