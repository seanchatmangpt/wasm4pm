/**
 * Deterministic ensemble voting with tie-breaking.
 *
 * Implements Rank-1 oracle (mathematical determinism): same input → same output.
 * Tie-breaking uses deterministic sorting (no randomness).
 */
import { z } from 'zod';
export declare const VoteCountSchema: z.ZodObject<{
    label: z.ZodNumber;
    votes: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    label: number;
    votes: number;
}, {
    label: number;
    votes: number;
}>;
export type VoteCount = z.infer<typeof VoteCountSchema>;
/**
 * Aggregate votes from multiple classifiers into a single prediction.
 * Deterministic tie-breaking: when votes are equal, select the smallest label.
 *
 * @param votes - Array of vote counts per label [{ label: 0, votes: 5 }, ...]
 * @returns The label with most votes (deterministically broken ties)
 */
export declare function deterministic_ensemble_vote(votes: VoteCount[]): number;
/**
 * Aggregate votes with confidence as fraction of winning votes.
 *
 * @param votes - Vote counts per label
 * @returns { label, confidence } where confidence = winning_votes / total_votes
 */
export declare function ensemble_vote_with_confidence(votes: VoteCount[]): {
    label: number;
    confidence: number;
};
/**
 * Verify determinism: run vote aggregation multiple times, confirm identical output.
 *
 * @param votes - Vote counts
 * @param runs - Number of times to execute (default 10)
 * @returns True if all runs produce identical result
 */
export declare function verify_voting_determinism(votes: VoteCount[], runs?: number): boolean;
/**
 * Categorize vote distribution for testing/reporting.
 *
 * @param votes - Vote counts
 * @returns Distribution category: "unanimous", "majority", "tie", "distributed"
 */
export declare function categorize_vote_distribution(votes: VoteCount[]): string;
//# sourceMappingURL=ensemble-voting.d.ts.map