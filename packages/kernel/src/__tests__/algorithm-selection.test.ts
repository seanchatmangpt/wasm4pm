/**
 * algorithm-selection.test.ts
 *
 * Unit tests for AlgorithmRegistry.getBestAlgorithmForLogSize().
 *
 * Oracle rank: Rank 2 (Domain contract) — the selection rules are design decisions
 * derived from Van der Aalst's quality/speed tradeoff taxonomy. Each assertion
 * verifies a named boundary in the selection logic, not a mathematical theorem.
 */

import { describe, it, expect } from 'vitest';
import { AlgorithmRegistry } from '../registry.js';

describe('AlgorithmRegistry.getBestAlgorithmForLogSize', () => {
  const registry = new AlgorithmRegistry();

  // ── fast profile ──────────────────────────────────────────────────────────

  describe('fast profile', () => {
    it('returns dfg for a tiny log', () => {
      expect(
        registry.getBestAlgorithmForLogSize({ traces: 10, activities: 5, profile: 'fast' })
      ).toBe('dfg');
    });

    it('returns dfg for a very large log (no size guard needed)', () => {
      expect(
        registry.getBestAlgorithmForLogSize({ traces: 1_000_000, activities: 500, profile: 'fast' })
      ).toBe('dfg');
    });

    it('returns dfg regardless of activity count', () => {
      expect(
        registry.getBestAlgorithmForLogSize({ traces: 50_000, activities: 300, profile: 'fast' })
      ).toBe('dfg');
    });
  });

  // ── quality profile ───────────────────────────────────────────────────────

  describe('quality profile', () => {
    it('returns genetic_algorithm for a small log (best quality when feasible)', () => {
      expect(
        registry.getBestAlgorithmForLogSize({ traces: 500, activities: 15, profile: 'quality' })
      ).toBe('genetic_algorithm');
    });

    it('returns genetic_algorithm at exactly 10 000 traces (boundary inclusive)', () => {
      expect(
        registry.getBestAlgorithmForLogSize({ traces: 10_000, activities: 30, profile: 'quality' })
      ).toBe('genetic_algorithm');
    });

    it('returns heuristic_miner when traces > 10 000 (speed guard)', () => {
      expect(
        registry.getBestAlgorithmForLogSize({ traces: 10_001, activities: 30, profile: 'quality' })
      ).toBe('heuristic_miner');
    });

    it('returns heuristic_miner for a very large log', () => {
      expect(
        registry.getBestAlgorithmForLogSize({
          traces: 500_000,
          activities: 200,
          profile: 'quality',
        })
      ).toBe('heuristic_miner');
    });
  });

  // ── balanced profile ──────────────────────────────────────────────────────

  describe('balanced profile', () => {
    it('returns dfg when traces > 50 000 (scale guard)', () => {
      expect(
        registry.getBestAlgorithmForLogSize({ traces: 50_001, activities: 50, profile: 'balanced' })
      ).toBe('dfg');
    });

    it('returns dfg when activities > 200 even if traces are small', () => {
      expect(
        registry.getBestAlgorithmForLogSize({
          traces: 1_000,
          activities: 201,
          profile: 'balanced',
        })
      ).toBe('dfg');
    });

    it('returns heuristic_miner when 10 000 < traces <= 50 000', () => {
      expect(
        registry.getBestAlgorithmForLogSize({ traces: 25_000, activities: 50, profile: 'balanced' })
      ).toBe('heuristic_miner');
    });

    it('returns heuristic_miner at exactly 10 001 traces', () => {
      expect(
        registry.getBestAlgorithmForLogSize({
          traces: 10_001,
          activities: 50,
          profile: 'balanced',
        })
      ).toBe('heuristic_miner');
    });

    it('returns inductive_miner for small clean logs (traces < 5 000, activities < 20)', () => {
      expect(
        registry.getBestAlgorithmForLogSize({ traces: 4_999, activities: 19, profile: 'balanced' })
      ).toBe('inductive_miner');
    });

    it('returns heuristic_miner when traces < 5 000 but activities >= 20', () => {
      expect(
        registry.getBestAlgorithmForLogSize({ traces: 4_999, activities: 20, profile: 'balanced' })
      ).toBe('heuristic_miner');
    });

    it('returns heuristic_miner for medium log (5 000 < traces <= 10 000, few activities)', () => {
      expect(
        registry.getBestAlgorithmForLogSize({ traces: 7_500, activities: 15, profile: 'balanced' })
      ).toBe('heuristic_miner');
    });
  });

  // ── returned IDs must be registered ──────────────────────────────────────

  describe('returned algorithm IDs are registered in the registry', () => {
    const cases: Array<{ traces: number; activities: number; profile: 'fast' | 'balanced' | 'quality' }> = [
      { traces: 10, activities: 5, profile: 'fast' },
      { traces: 500, activities: 15, profile: 'quality' },
      { traces: 50_000, activities: 100, profile: 'quality' },
      { traces: 100, activities: 5, profile: 'balanced' },
      { traces: 5_000, activities: 15, profile: 'balanced' },
      { traces: 15_000, activities: 50, profile: 'balanced' },
      { traces: 100_000, activities: 300, profile: 'balanced' },
    ];

    for (const c of cases) {
      it(`profile=${c.profile} traces=${c.traces} activities=${c.activities} → registered`, () => {
        const id = registry.getBestAlgorithmForLogSize(c);
        expect(registry.get(id)).toBeDefined();
      });
    }
  });
});
