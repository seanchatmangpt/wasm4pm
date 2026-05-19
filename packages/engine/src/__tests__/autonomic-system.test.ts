/**
 * Comprehensive tests for enhanced autonomic system
 * Tests multi-objective decisions, protection, and optimization
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  computeObjectiveScores,
  makeAutonomicDecision,
  validatePreferences,
  type MultiObjectiveScores,
  type DecisionPreferences,
} from '../autonomic-decision.js';
import {
  ProtectionManager,
  DegradationLevel,
  type AlgorithmCircuitBreaker,
} from '../protection-layer.js';
import {
  recommendAlgorithm,
  recommendProfile,
  optimize,
  type AlgorithmCharacteristics,
  type LogCharacteristics,
} from '../optimization-engine.js';

describe('Autonomic System Enhancements', () => {
  describe('Multi-Objective Decision Making', () => {
    it('should compute objective scores correctly from health state', () => {
      const scores = computeObjectiveScores(
        0, // healthState: normal
        0.9, // fitness
        0.85, // precision
        25, // cycleTimeMs
      );

      expect(scores.health).toBe(1.0);
      expect(scores.quality).toBeCloseTo(0.89, 1); // 0.9 * 0.6 + 0.85 * 0.4
      expect(scores.performance).toBeGreaterThan(0.8); // 50/25 = 2.0, clamped to 1.0
    });

    it('should degrade health score from degraded state', () => {
      const scores = computeObjectiveScores(
        2, // healthState: degraded (2/4 = 0.5)
        0.8,
        0.75,
        50,
      );

      expect(scores.health).toBeCloseTo(0.5, 1);
    });

    it('should make autonomous decision with default preferences', () => {
      const scores: MultiObjectiveScores = {
        health: 0.8,
        quality: 0.7,
        performance: 0.9,
      };

      const decision = makeAutonomicDecision(scores);

      expect(decision.primaryObjective).toBe('performance');
      expect(decision.confidence).toBeGreaterThan(0.5);
      expect(decision.compositeScore).toBeCloseTo(0.8, 1); // avg of three
      expect(decision.rationale).toContain('confidence=');
    });

    it('should make decision with quality bias', () => {
      const scores: MultiObjectiveScores = {
        health: 0.5,
        quality: 0.95,
        performance: 0.3,
      };

      const prefs: Partial<DecisionPreferences> = {
        qualityWeight: 0.7,
        healthWeight: 0.2,
        performanceWeight: 0.1,
      };

      const decision = makeAutonomicDecision(scores, prefs);

      expect(decision.primaryObjective).toBe('quality');
      expect(decision.preferenceWeights.qualityWeight).toBeCloseTo(0.7, 1);
    });

    it('should compute high confidence when objectives agree', () => {
      const scores: MultiObjectiveScores = {
        health: 0.8,
        quality: 0.82,
        performance: 0.79,
      };

      const decision = makeAutonomicDecision(scores);

      // Low variance → high confidence
      expect(decision.confidence).toBeGreaterThan(0.8);
    });

    it('should compute lower confidence when objectives disagree', () => {
      const scores: MultiObjectiveScores = {
        health: 0.1,
        quality: 0.95,
        performance: 0.05,
      };

      const decision = makeAutonomicDecision(scores);

      // High variance → lower confidence than agreement case
      const agreementScores: MultiObjectiveScores = {
        health: 0.5,
        quality: 0.5,
        performance: 0.5,
      };
      const agreementDecision = makeAutonomicDecision(agreementScores);

      expect(decision.confidence).toBeLessThan(agreementDecision.confidence);
    });

    it('should validate preferences correctly', () => {
      expect(() => validatePreferences({ healthWeight: 0.5 })).not.toThrow();
      expect(() => validatePreferences({ healthWeight: -0.1 })).toThrow();
      expect(() => validatePreferences({ healthWeight: 1.5 })).toThrow();
    });
  });

  describe('Protection Layer with Per-Algorithm Circuit Breakers', () => {
    let manager: ProtectionManager;

    beforeEach(() => {
      manager = new ProtectionManager();
    });

    it('should register algorithms and track their circuit breakers', () => {
      manager.registerAlgorithm('dfg', 3, 2);
      manager.registerAlgorithm('genetic', 5, 3);

      const active = manager.getActiveAlgorithms();
      expect(active.size).toBe(2);
      expect(active.has('dfg')).toBe(true);
      expect(active.has('genetic')).toBe(true);
    });

    it('should transition Closed→Open on repeated failures', () => {
      manager.registerAlgorithm('test_algo', 2, 2);

      manager.recordAlgorithmResult('test_algo', false);
      manager.recordAlgorithmResult('test_algo', false);
      manager.recordAlgorithmResult('test_algo', false); // 3rd failure, threshold=2

      const openBreakers = manager.getOpenCircuitBreakers();
      expect(openBreakers.length).toBe(1);
      expect(openBreakers[0].state).toBe('Open');
      expect(manager.getActiveAlgorithms().has('test_algo')).toBe(false);
    });

    it('should block algorithm when circuit is Open', () => {
      manager.registerAlgorithm('failing_algo', 1, 1);

      // Trigger Open state with failures
      manager.recordAlgorithmResult('failing_algo', false);
      manager.recordAlgorithmResult('failing_algo', false);

      // Should be blocked
      const openCircuits = manager.getOpenCircuitBreakers();
      expect(openCircuits.length).toBe(1);
      expect(openCircuits[0].algorithmName).toBe('failing_algo');
      expect(openCircuits[0].state).toBe('Open');
      expect(manager.getActiveAlgorithms().has('failing_algo')).toBe(false);
    });

    it('should isolate failures per algorithm', () => {
      manager.registerAlgorithm('algo_a', 2, 2);
      manager.registerAlgorithm('algo_b', 2, 2);

      manager.recordAlgorithmResult('algo_a', false);
      manager.recordAlgorithmResult('algo_a', false);
      manager.recordAlgorithmResult('algo_a', false); // Open

      manager.recordAlgorithmResult('algo_b', true);
      manager.recordAlgorithmResult('algo_b', true); // Stays Closed

      expect(manager.getOpenCircuitBreakers().length).toBe(1);
      expect(manager.getActiveAlgorithms().has('algo_a')).toBe(false);
      expect(manager.getActiveAlgorithms().has('algo_b')).toBe(true);
    });

    it('should determine graceful degradation level from failures', () => {
      manager.registerAlgorithm('algo1', 1, 1);
      manager.registerAlgorithm('algo2', 1, 1);
      manager.registerAlgorithm('algo3', 1, 1);

      // Open circuits 1 and 2
      for (let i = 0; i < 2; i++) {
        manager.recordAlgorithmResult('algo1', false);
        manager.recordAlgorithmResult('algo2', false);
      }

      const decision = manager.makeProtectionDecision(0, 2);

      expect(decision.degradationLevel).toBe(DegradationLevel.QUALITY);
      expect(decision.triggers.circuitBreakerOpen).toBe(true);
      expect(decision.triggers.spcAlerts).toBe(false);
    });

    it('should escalate degradation with SPC alerts and circuit failures', () => {
      manager.registerAlgorithm('algo1', 1, 1);
      manager.registerAlgorithm('algo2', 1, 1);

      // Open circuits
      for (let i = 0; i < 2; i++) {
        manager.recordAlgorithmResult('algo1', false);
        manager.recordAlgorithmResult('algo2', false);
      }

      const decision = manager.makeProtectionDecision(4, 2); // 4 SPC alerts

      expect(decision.degradationLevel).toBe(DegradationLevel.PERFORMANCE);
    });

    it('should prefer fastest algorithm when at PERFORMANCE degradation level', () => {
      const algorithms = ['dfg', 'genetic', 'pso', 'alpha_plus_plus'];
      const qualities = new Map<string, number>([
        ['dfg', 0.3],
        ['genetic', 0.8],
        ['pso', 0.75],
        ['alpha_plus_plus', 0.7],
      ]);

      // No degradation: prefer highest quality
      let selected = manager.selectAlgorithm(algorithms, qualities);
      expect(selected).toBe('genetic');

      // Manually set high degradation level
      manager.makeProtectionDecision(10, 5); // Many failures triggers PERFORMANCE
      selected = manager.selectAlgorithm(algorithms, qualities);
      // At PERFORMANCE level, prefer lowest quality (fastest)
      expect(selected).toBe('dfg');
    });
  });

  describe('Optimization Engine', () => {
    const testAlgorithms: AlgorithmCharacteristics[] = [
      {
        name: 'dfg',
        speedScore: 95,
        qualityScore: 30,
        memoryUsageMB: 10,
        supportedProfiles: ['mobile', 'iot', 'edge', 'fog', 'browser'],
      },
      {
        name: 'genetic',
        speedScore: 40,
        qualityScore: 85,
        memoryUsageMB: 100,
        supportedProfiles: ['edge', 'fog', 'browser'],
      },
      {
        name: 'ilp',
        speedScore: 30,
        qualityScore: 90,
        memoryUsageMB: 150,
        supportedProfiles: ['fog', 'browser'],
      },
    ];

    it('should recommend fast algorithm for small logs', () => {
      const logChars: LogCharacteristics = {
        eventCount: 100,
        traceCount: 10,
        uniqueActivities: 5,
        avgTraceLength: 10,
        estimatedMemoryUsageMB: 50,
      };

      const rec = recommendAlgorithm(testAlgorithms, logChars, { speedBias: 0.8 });

      expect(rec.algorithmName).toBe('dfg');
      expect(rec.costBenefitScore).toBeGreaterThan(0.7);
    });

    it('should recommend quality algorithm for large logs', () => {
      const logChars: LogCharacteristics = {
        eventCount: 100000,
        traceCount: 10000,
        uniqueActivities: 50,
        avgTraceLength: 10,
        estimatedMemoryUsageMB: 300,
      };

      const rec = recommendAlgorithm(testAlgorithms, logChars, { qualityBias: 0.9 });

      expect(rec.costBenefitScore).toBeGreaterThan(0);
      expect(rec.rationale).toContain('quality=');
    });

    it('should exclude algorithms that do not fit memory', () => {
      const logChars: LogCharacteristics = {
        eventCount: 1000,
        traceCount: 100,
        uniqueActivities: 20,
        avgTraceLength: 10,
        estimatedMemoryUsageMB: 120, // ILP needs 150MB
      };

      const rec = recommendAlgorithm(testAlgorithms, logChars);

      // Should not recommend ILP (120 * 0.8 = 96 < 150)
      expect(rec.algorithmName).not.toBe('ilp');
    });

    it('should recommend mobile profile for tiny logs', () => {
      const logChars: LogCharacteristics = {
        eventCount: 100,
        traceCount: 10,
        uniqueActivities: 5,
        avgTraceLength: 10,
        estimatedMemoryUsageMB: 50,
      };

      const rec = recommendProfile(logChars);

      expect(rec.profile).toBe('mobile');
      expect(rec.memoryHeadroom).toBeGreaterThan(0);
    });

    it('should recommend browser profile for large logs', () => {
      const logChars: LogCharacteristics = {
        eventCount: 1000000,
        traceCount: 100000,
        uniqueActivities: 100,
        avgTraceLength: 10,
        estimatedMemoryUsageMB: 2000,
      };

      const rec = recommendProfile(logChars);

      expect(rec.profile).toBe('browser');
    });

    it('should compute cost-benefit score', () => {
      const logChars: LogCharacteristics = {
        eventCount: 10000,
        traceCount: 1000,
        uniqueActivities: 30,
        avgTraceLength: 10,
        estimatedMemoryUsageMB: 200,
      };

      const result = optimize(testAlgorithms, logChars);

      expect(result.costBenefitAnalysis.overallScore).toBeGreaterThan(0);
      expect(result.costBenefitAnalysis.overallScore).toBeLessThanOrEqual(1);
      expect(result.rationale).toContain('overall_score=');
    });

    it('should provide actionable optimization results', () => {
      const logChars: LogCharacteristics = {
        eventCount: 50000,
        traceCount: 5000,
        uniqueActivities: 40,
        avgTraceLength: 10,
        estimatedMemoryUsageMB: 400,
      };

      const result = optimize(testAlgorithms, logChars, {
        speedBias: 0.6,
        qualityBias: 0.4,
      });

      expect(result.recommendedAlgorithm.algorithmName).toBeDefined();
      expect(result.recommendedProfile.profile).toBeDefined();
      expect(result.costBenefitAnalysis.timeTradeoff).toBeGreaterThanOrEqual(0);
      expect(result.costBenefitAnalysis.resourceTradeoff).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Decision Confidence Bounds', () => {
    it('should bound confidence between 0.2 and 1.0', () => {
      // Minimum agreement (high variance)
      let scores: MultiObjectiveScores = {
        health: 0.0,
        quality: 1.0,
        performance: 0.5,
      };
      let decision = makeAutonomicDecision(scores);
      expect(decision.confidence).toBeGreaterThanOrEqual(0.2);

      // Perfect agreement (no variance)
      scores = {
        health: 0.5,
        quality: 0.5,
        performance: 0.5,
      };
      decision = makeAutonomicDecision(scores);
      expect(decision.confidence).toBeLessThanOrEqual(1.0);
    });
  });
});
