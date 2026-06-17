/**
 * Deterministic ensemble voting with tie-breaking.
 *
 * Implements Rank-1 oracle (mathematical determinism): same input → same output.
 * Tie-breaking uses deterministic sorting (no randomness).
 */

import { z } from 'zod';

export const VoteCountSchema = z.object({
  label: z.number(),
  votes: z.number(),
});

export type VoteCount = z.infer<typeof VoteCountSchema>;

/**
 * Aggregate votes from multiple classifiers into a single prediction.
 * Deterministic tie-breaking: when votes are equal, select the smallest label.
 *
 * @param votes - Array of vote counts per label [{ label: 0, votes: 5 }, ...]
 * @returns The label with most votes (deterministically broken ties)
 */
export function deterministic_ensemble_vote(votes: VoteCount[]): number {
  if (votes.length === 0) {
    throw new Error('No votes provided');
  }

  // Sort by vote count (descending), then by label (ascending) for deterministic tie-breaking
  const sorted = votes.slice().sort((a, b) => {
    // Primary: most votes wins
    if (b.votes !== a.votes) {
      return b.votes - a.votes;
    }
    // Tie-breaker: smallest label wins (deterministic)
    return a.label - b.label;
  });

  return sorted[0].label;
}

/**
 * Aggregate votes with confidence as fraction of winning votes.
 *
 * @param votes - Vote counts per label
 * @returns { label, confidence } where confidence = winning_votes / total_votes
 */
export function ensemble_vote_with_confidence(votes: VoteCount[]): {
  label: number;
  confidence: number;
} {
  if (votes.length === 0) {
    throw new Error('No votes provided');
  }

  const total_votes = votes.reduce((sum, v) => sum + v.votes, 0);
  const label = deterministic_ensemble_vote(votes);
  const winning_votes = votes.find((v) => v.label === label)?.votes || 0;

  return {
    label,
    confidence: total_votes > 0 ? winning_votes / total_votes : 0,
  };
}

/**
 * Verify determinism: run vote aggregation multiple times, confirm identical output.
 *
 * @param votes - Vote counts
 * @param runs - Number of times to execute (default 10)
 * @returns True if all runs produce identical result
 */
export function verify_voting_determinism(votes: VoteCount[], runs: number = 10): boolean {
  const results: number[] = [];
  for (let i = 0; i < runs; i++) {
    results.push(deterministic_ensemble_vote(votes));
  }
  // All results should be identical
  return results.every((r) => r === results[0]);
}

/**
 * Categorize vote distribution for testing/reporting.
 *
 * @param votes - Vote counts
 * @returns Distribution category: "unanimous", "majority", "tie", "distributed"
 */
export function categorize_vote_distribution(votes: VoteCount[]): string {
  if (votes.length === 0) return 'empty';
  if (votes.length === 1) return 'unanimous';

  const sorted = votes.slice().sort((a, b) => b.votes - a.votes);
  const [first, second] = sorted;

  if (first.votes === second.votes) {
    return 'tie';
  }
  // Unanimous: single label gets all votes (no second place)
  if (second.votes === 0) {
    return 'unanimous';
  }
  // Majority: clear winner (any non-tie situation with multiple labels)
  return 'majority';
}
