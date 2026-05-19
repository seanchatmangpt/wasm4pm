/**
 * Integration test for feedback loop and root cause diagnosis
 * Demonstrates the two autonomic features working together
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  captureFeedback,
  loadAlgorithmFeedback,
  getAlgorithmStats,
  type QualityMetrics,
} from '../feedback-loop.js';
import { diagnose, type ConformanceResult, type LogStats } from '../root-cause.js';

const testFeedbackDir = path.join(process.cwd(), '.wasm4pm', 'algorithm-feedback');

describe('feedback-loop + root-cause integration', () => {
  beforeEach(async () => {
    // Clean up test feedback directory before each test
    try {
      await fs.rm(testFeedbackDir, { recursive: true, force: true });
    } catch {
      // Directory might not exist yet
    }
  });

  afterEach(async () => {
    // Clean up after tests
    try {
      await fs.rm(testFeedbackDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('autonomic improvement loop', () => {
    it('should capture feedback after discovery and diagnose conformance', async () => {
      // Simulate discovery run
      const logSize = 2500;
      const algorithm = 'dfg';
      const executionTime = 120;

      const metrics: QualityMetrics = {
        fitness: 0.80,
        precision: 0.78,
        generalization: 0.72,
        simplicity: 0.85,
      };

      // Step 1: Capture feedback from discovery
      await captureFeedback(algorithm, logSize, metrics, executionTime);

      // Step 2: Perform conformance checking
      const conformanceResult: ConformanceResult = {
        fitness: metrics.fitness,
        precision: 0.85, // Good precision to avoid coverage check
        conformance_rate: 0.80,
        deviating_cases: 20,
      };

      const logStats: LogStats = {
        event_count: 2500,
        trace_count: 100,
        unique_activities: 8, // Fewer activities = good coverage
        unique_variants: 30,
        min_trace_length: 5,
        max_trace_length: 15,
        avg_trace_length: 7.5,
      };

      // Step 3: Diagnose root cause of low conformance
      const diagnosis = diagnose(conformanceResult, logStats);

      // Verify feedback was captured
      const records = await loadAlgorithmFeedback(algorithm);
      expect(records).toHaveLength(1);
      expect(records[0].metrics.fitness).toBe(0.80);

      // Verify diagnosis identified the issue
      expect(diagnosis.category).toBe('low_fitness');
      expect(diagnosis.recommendations.length).toBeGreaterThan(0);
    });

    it('should track algorithm improvement across iterations', async () => {
      const algorithm = 'heuristic_miner';
      const logSize = 3000;

      // Iteration 1: Initial discovery (poor quality)
      const metrics1: QualityMetrics = {
        fitness: 0.72,
        precision: 0.88, // Good precision, just low fitness
        generalization: 0.65,
        simplicity: 0.60,
      };

      await captureFeedback(algorithm, logSize, metrics1, 300);

      const conformanceResult1: ConformanceResult = {
        fitness: 0.72,
        precision: 0.88,
        conformance_rate: 0.72,
        deviating_cases: 28,
      };

      const logStats: LogStats = {
        event_count: 3000,
        trace_count: 100,
        unique_activities: 8, // Fewer activities = less coverage burden
        unique_variants: 40,
        min_trace_length: 4,
        max_trace_length: 18,
        avg_trace_length: 7,
      };

      const diagnosis1 = diagnose(conformanceResult1, logStats);
      expect(diagnosis1.category).toBe('low_fitness');

      // Iteration 2: After algorithm tuning (improved quality)
      const metrics2: QualityMetrics = {
        fitness: 0.88,
        precision: 0.86,
        generalization: 0.80,
        simplicity: 0.70,
      };

      await captureFeedback(algorithm, logSize, metrics2, 350);

      const conformanceResult2: ConformanceResult = {
        fitness: 0.88,
        precision: 0.86,
        conformance_rate: 0.88,
        deviating_cases: 12,
      };

      const diagnosis2 = diagnose(conformanceResult2, logStats);
      expect(diagnosis2.category).toBe('healthy');

      // Verify feedback captures the improvement
      const stats = await getAlgorithmStats(algorithm);
      expect(stats.count).toBe(2);
      expect(stats.meanFitness).toBeGreaterThan(0.75);
      expect(stats.meanFitness).toBeLessThan(0.90);
    });

    it('should identify rework patterns and recommend strategies', async () => {
      const algorithm = 'inductive_miner';
      const logSize = 5000;

      // Log with high rework (error recovery cycles)
      const logStats: LogStats = {
        event_count: 5000,
        trace_count: 100,
        unique_activities: 10,
        unique_variants: 60, // High variant count suggests rework
        min_trace_length: 15,
        max_trace_length: 80, // Long traces
        avg_trace_length: 45, // High average = rework
        rework_ratio: 0.4, // 40% rework detected
      };

      const metrics: QualityMetrics = {
        fitness: 0.60,
        precision: 0.65,
        generalization: 0.55,
        simplicity: 0.50,
      };

      await captureFeedback(algorithm, logSize, metrics, 500);

      const conformanceResult: ConformanceResult = {
        fitness: 0.60,
        precision: 0.65,
        conformance_rate: 0.60,
        deviating_cases: 40,
      };

      const diagnosis = diagnose(conformanceResult, logStats);
      expect(diagnosis.category).toBe('rework_loop');
      expect(diagnosis.recommendations).toContain(
        'Investigate root causes of rework (system errors, compliance exceptions, etc.).'
      );

      const records = await loadAlgorithmFeedback(algorithm);
      expect(records[0].metrics.fitness).toBe(0.60);
    });

    it('should detect and address insufficient activity coverage', async () => {
      const algorithm = 'alpha_plus_plus';
      const logSize = 2000;

      // Complex log with many rare activities
      const logStats: LogStats = {
        event_count: 2000,
        trace_count: 100,
        unique_activities: 20, // Many activities
        unique_variants: 45,
        min_trace_length: 3,
        max_trace_length: 18,
        avg_trace_length: 6.5,
      };

      const metrics: QualityMetrics = {
        fitness: 0.75,
        precision: 0.60, // Low precision = missing activities
        generalization: 0.68,
        simplicity: 0.62,
      };

      await captureFeedback(algorithm, logSize, metrics, 280);

      const conformanceResult: ConformanceResult = {
        fitness: 0.75,
        precision: 0.60,
        conformance_rate: 0.75,
        deviating_cases: 25,
      };

      const diagnosis = diagnose(conformanceResult, logStats);
      expect(diagnosis.category).toBe('insufficient_coverage');
      expect(diagnosis.recommendations).toContain(
        'Use quality-focused algorithm (genetic_algorithm, ilp) to capture rare variants.'
      );

      const records = await loadAlgorithmFeedback(algorithm);
      expect(records.length).toBeGreaterThan(0);
    });
  });

  describe('feedback statistics for autonomic decision making', () => {
    it('should compute algorithm statistics for profile selection', async () => {
      const dfgMetrics: QualityMetrics = {
        fitness: 0.78,
        precision: 0.75,
        generalization: 0.70,
        simplicity: 0.88,
      };

      const heuristicMetrics: QualityMetrics = {
        fitness: 0.85,
        precision: 0.83,
        generalization: 0.80,
        simplicity: 0.70,
      };

      // DFG: fast but lower quality
      await captureFeedback('dfg_profile', 1000, dfgMetrics, 50);
      await captureFeedback('dfg_profile', 5000, { ...dfgMetrics, fitness: 0.80 }, 60);

      // Heuristic: slower but higher quality
      await captureFeedback('heuristic_profile', 1000, heuristicMetrics, 150);
      await captureFeedback('heuristic_profile', 5000, { ...heuristicMetrics, fitness: 0.87 }, 200);

      const dfgStats = await getAlgorithmStats('dfg_profile');
      const heuristicStats = await getAlgorithmStats('heuristic_profile');

      // Speed-quality tradeoff
      expect(dfgStats.meanFitness).toBeLessThan(heuristicStats.meanFitness);

      // Use feedback to recommend profile:
      // If target fitness > 0.82, use heuristic
      // If target fitness < 0.80, use dfg
      if (heuristicStats.meanFitness >= 0.82) {
        expect(heuristicStats.count).toBeGreaterThan(0);
      }
    });

    it('should support log size bucket analysis', async () => {
      const algorithm = 'genetic_bucket_test';

      // Small logs
      await captureFeedback(algorithm, 50, {
        fitness: 0.82,
        precision: 0.80,
        generalization: 0.75,
        simplicity: 0.85,
      }, 400);

      // Medium logs
      await captureFeedback(algorithm, 2500, {
        fitness: 0.88,
        precision: 0.85,
        generalization: 0.82,
        simplicity: 0.70,
      }, 800);

      // Large logs
      await captureFeedback(algorithm, 25000, {
        fitness: 0.92,
        precision: 0.90,
        generalization: 0.88,
        simplicity: 0.65,
      }, 2000);

      const stats = await getAlgorithmStats(algorithm);
      expect(stats.count).toBe(3);
      expect(stats.bucketStats['0-100']).toBeDefined();
      expect(stats.bucketStats['1K-10K']).toBeDefined();
      expect(stats.bucketStats['10K-100K']).toBeDefined();
    });
  });
});
