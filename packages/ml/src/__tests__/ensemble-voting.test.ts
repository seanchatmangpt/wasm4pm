import { describe, it, expect } from 'vitest';
import {
  deterministic_ensemble_vote,
  ensemble_vote_with_confidence,
  verify_voting_determinism,
  categorize_vote_distribution,
  VoteCount,
} from '../ensemble-voting.js';

describe('Ensemble Voting — Deterministic Tie-Breaking', () => {
  // ─────────────────────────────────────────────────────────────────────────
  // Test 1: Exact Tie (5-5)
  // ─────────────────────────────────────────────────────────────────────────

  it('Test 1: Exact tie (5-5) resolves to smallest label', () => {
    const votes: VoteCount[] = [
      { label: 1, votes: 5 },
      { label: 0, votes: 5 },
    ];
    const result = deterministic_ensemble_vote(votes);
    expect(result).toBe(0); // Smaller label wins deterministically
  });

  it('Test 1: Exact tie (5-5) is deterministic across 10 runs', () => {
    const votes: VoteCount[] = [
      { label: 1, votes: 5 },
      { label: 0, votes: 5 },
    ];
    expect(verify_voting_determinism(votes, 10)).toBe(true);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Test 2: Three-Way Tie (3-3-3)
  // ─────────────────────────────────────────────────────────────────────────

  it('Test 2: Three-way tie (3-3-3) resolves to smallest label', () => {
    const votes: VoteCount[] = [
      { label: 2, votes: 3 },
      { label: 1, votes: 3 },
      { label: 0, votes: 3 },
    ];
    const result = deterministic_ensemble_vote(votes);
    expect(result).toBe(0); // Smallest label wins in three-way tie
  });

  it('Test 2: Three-way tie (3-3-3) is deterministic across 10 runs', () => {
    const votes: VoteCount[] = [
      { label: 2, votes: 3 },
      { label: 1, votes: 3 },
      { label: 0, votes: 3 },
    ];
    expect(verify_voting_determinism(votes, 10)).toBe(true);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Test 3: Distributed Voting (10-5-2)
  // ─────────────────────────────────────────────────────────────────────────

  it('Test 3: Distributed voting (10-5-2) respects vote majority', () => {
    const votes: VoteCount[] = [
      { label: 0, votes: 10 },
      { label: 1, votes: 5 },
      { label: 2, votes: 2 },
    ];
    const result = deterministic_ensemble_vote(votes);
    expect(result).toBe(0); // Highest votes wins
  });

  it('Test 3: Distributed voting (10-5-2) is deterministic', () => {
    const votes: VoteCount[] = [
      { label: 0, votes: 10 },
      { label: 1, votes: 5 },
      { label: 2, votes: 2 },
    ];
    expect(verify_voting_determinism(votes, 10)).toBe(true);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Test 4: Five-Way Tie (1-1-1-1-1)
  // ─────────────────────────────────────────────────────────────────────────

  it('Test 4: Five-way tie (1-1-1-1-1) resolves to smallest label', () => {
    const votes: VoteCount[] = [
      { label: 4, votes: 1 },
      { label: 3, votes: 1 },
      { label: 2, votes: 1 },
      { label: 1, votes: 1 },
      { label: 0, votes: 1 },
    ];
    const result = deterministic_ensemble_vote(votes);
    expect(result).toBe(0); // Smallest label wins
  });

  it('Test 4: Five-way tie (1-1-1-1-1) is deterministic', () => {
    const votes: VoteCount[] = [
      { label: 4, votes: 1 },
      { label: 3, votes: 1 },
      { label: 2, votes: 1 },
      { label: 1, votes: 1 },
      { label: 0, votes: 1 },
    ];
    expect(verify_voting_determinism(votes, 10)).toBe(true);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Test 5: Partial Tie (10-10-5) — Two-way tie for highest
  // ─────────────────────────────────────────────────────────────────────────

  it('Test 5: Partial tie (10-10-5) resolves to smaller of tied labels', () => {
    const votes: VoteCount[] = [
      { label: 1, votes: 10 },
      { label: 2, votes: 10 },
      { label: 0, votes: 5 },
    ];
    const result = deterministic_ensemble_vote(votes);
    expect(result).toBe(1); // Smaller of the two tied for highest
  });

  it('Test 5: Partial tie (10-10-5) is deterministic', () => {
    const votes: VoteCount[] = [
      { label: 1, votes: 10 },
      { label: 2, votes: 10 },
      { label: 0, votes: 5 },
    ];
    expect(verify_voting_determinism(votes, 10)).toBe(true);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Confidence Scoring
  // ─────────────────────────────────────────────────────────────────────────

  it('Confidence scoring: exact tie yields 0.5 confidence', () => {
    const votes: VoteCount[] = [
      { label: 0, votes: 5 },
      { label: 1, votes: 5 },
    ];
    const result = ensemble_vote_with_confidence(votes);
    expect(result.label).toBe(0);
    expect(result.confidence).toBeCloseTo(0.5);
  });

  it('Confidence scoring: unanimous vote yields 1.0 confidence', () => {
    const votes: VoteCount[] = [{ label: 0, votes: 10 }];
    const result = ensemble_vote_with_confidence(votes);
    expect(result.label).toBe(0);
    expect(result.confidence).toBe(1.0);
  });

  it('Confidence scoring: distributed vote (10-5-3) yields correct ratio', () => {
    const votes: VoteCount[] = [
      { label: 0, votes: 10 },
      { label: 1, votes: 5 },
      { label: 2, votes: 3 },
    ];
    const result = ensemble_vote_with_confidence(votes);
    expect(result.label).toBe(0);
    expect(result.confidence).toBeCloseTo(10 / 18); // 10 out of 18 total votes
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Vote Distribution Categorization
  // ─────────────────────────────────────────────────────────────────────────

  it('Categorize: unanimous vote recognized', () => {
    const votes: VoteCount[] = [{ label: 0, votes: 10 }];
    expect(categorize_vote_distribution(votes)).toBe('unanimous');
  });

  it('Categorize: majority vote recognized', () => {
    const votes: VoteCount[] = [
      { label: 0, votes: 7 },
      { label: 1, votes: 3 },
    ];
    expect(categorize_vote_distribution(votes)).toBe('majority');
  });

  it('Categorize: tie recognized', () => {
    const votes: VoteCount[] = [
      { label: 0, votes: 5 },
      { label: 1, votes: 5 },
    ];
    expect(categorize_vote_distribution(votes)).toBe('tie');
  });

  it('Categorize: distributed votes recognized', () => {
    const votes: VoteCount[] = [
      { label: 0, votes: 10 },
      { label: 1, votes: 5 },
      { label: 2, votes: 2 },
    ];
    expect(categorize_vote_distribution(votes)).toBe('majority');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Edge Cases
  // ─────────────────────────────────────────────────────────────────────────

  it('Edge case: single vote for single label', () => {
    const votes: VoteCount[] = [{ label: 0, votes: 1 }];
    const result = deterministic_ensemble_vote(votes);
    expect(result).toBe(0);
  });

  it('Edge case: empty votes should throw', () => {
    const votes: VoteCount[] = [];
    expect(() => deterministic_ensemble_vote(votes)).toThrow('No votes provided');
  });

  it('Edge case: negative labels (unlikely but test it)', () => {
    const votes: VoteCount[] = [
      { label: -1, votes: 5 },
      { label: 0, votes: 5 },
    ];
    const result = deterministic_ensemble_vote(votes);
    expect(result).toBe(-1); // Smaller label (-1 < 0)
  });

  it('Edge case: large vote counts remain deterministic', () => {
    const votes: VoteCount[] = [
      { label: 0, votes: 1000000 },
      { label: 1, votes: 999999 },
    ];
    const result = deterministic_ensemble_vote(votes);
    expect(result).toBe(0);
    expect(verify_voting_determinism(votes, 10)).toBe(true);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Rank-1 Oracle Verification (Mathematical Determinism)
  // ─────────────────────────────────────────────────────────────────────────

  it('Rank-1 oracle: 100 runs with identical votes produce identical results', () => {
    const votes: VoteCount[] = [
      { label: 2, votes: 7 },
      { label: 1, votes: 7 },
      { label: 0, votes: 5 },
    ];
    const results = Array.from({ length: 100 }, () =>
      deterministic_ensemble_vote(votes)
    );
    // All results should be identical (no randomness)
    expect(new Set(results).size).toBe(1);
    expect(results[0]).toBe(1); // Smaller of the two tied for highest
  });

  it('Rank-1 oracle: Different orderings of input votes produce same result', () => {
    const orderings = [
      [
        { label: 0, votes: 5 },
        { label: 1, votes: 5 },
      ],
      [
        { label: 1, votes: 5 },
        { label: 0, votes: 5 },
      ],
    ];

    const results = orderings.map((votes) => deterministic_ensemble_vote(votes));
    expect(results[0]).toBe(results[1]); // Same result regardless of input order
    expect(results[0]).toBe(0); // Always the smaller label
  });

  it('Rank-1 oracle: Confidence is deterministic (tied votes)', () => {
    const votes: VoteCount[] = [
      { label: 0, votes: 5 },
      { label: 1, votes: 5 },
    ];
    const confidences = Array.from({ length: 50 }, () =>
      ensemble_vote_with_confidence(votes).confidence
    );
    // All confidences should be identical (0.5)
    expect(new Set(confidences).size).toBe(1);
    expect(confidences[0]).toBe(0.5);
  });
});
