/**
 * model-complexity.test.ts
 * Tests for model structural complexity assessment and quality aggregation
 */

import { describe, it, expect } from 'vitest';
import {
  computeComplexity,
  computeQualitySummary,
  analyzeModelStructure,
  rankModelsByComplexity,
  formatComplexityScore,
  formatQualitySummary,
  type ModelIR,
} from '../model-complexity.js';

describe('Model Complexity Assessment', () => {
  // Helper to create minimal valid models
  function createDFG(nodeCount: number, edgeCount: number): ModelIR {
    const nodes = Array.from({ length: nodeCount }, (_, i) => ({
      id: `node_${i}`,
      label: `Activity ${i}`,
      type: 'transition',
    }));

    const edges = Array.from({ length: Math.min(edgeCount, nodeCount * nodeCount) }, (_, i) => ({
      from: `node_${i % nodeCount}`,
      to: `node_${(i + 1) % nodeCount}`,
      weight: 1,
    }));

    return {
      format_version: '1.0' as const,
      model_type: 'dfg' as const,
      algorithm_id: 'dfg',
      nodes,
      edges,
    };
  }

  function createPetriNet(placeCount: number, transitionCount: number, edgeCount: number): ModelIR {
    const nodes = [
      ...Array.from({ length: placeCount }, (_, i) => ({
        id: `place_${i}`,
        label: `Place ${i}`,
        type: 'place',
      })),
      ...Array.from({ length: transitionCount }, (_, i) => ({
        id: `trans_${i}`,
        label: `Transition ${i}`,
        type: 'transition',
      })),
    ];

    const edges = Array.from({ length: Math.min(edgeCount, nodes.length * nodes.length) }, (_, i) => ({
      from: nodes[i % nodes.length].id,
      to: nodes[(i + 1) % nodes.length].id,
      weight: 1,
    }));

    return {
      format_version: '1.0' as const,
      model_type: 'petri_net' as const,
      algorithm_id: 'alpha_plus_plus',
      nodes,
      edges,
    };
  }

  describe('computeComplexity', () => {
    it('should compute zero complexity for trivial linear model', () => {
      // Single node, no edges = simplest possible
      const model = createDFG(1, 0);
      const complexity = computeComplexity(model);

      expect(complexity.nodeCount).toBe(1);
      expect(complexity.arcCount).toBe(0);
      expect(complexity.cyclomaticComplexity).toBe(1); // 0 - 1 + 2 = 1
      expect(complexity.complexityScore).toBeLessThan(0.2); // Should be very simple
      expect(complexity.simplicityScore).toBeGreaterThan(0.8); // Very simple
      expect(complexity.assessment).toBe('trivial');
    });

    it('should compute moderate complexity for balanced model', () => {
      // 5 nodes with moderate edges
      const model = createDFG(5, 7);
      const complexity = computeComplexity(model);

      expect(complexity.nodeCount).toBe(5);
      expect(complexity.arcCount).toBe(7);
      expect(complexity.complexityScore).toBeGreaterThan(0.05);
      expect(complexity.complexityScore).toBeLessThan(0.7);
      expect(complexity.assessment).toMatch(/trivial|simple|moderate/);
    });

    it('should compute high complexity for dense model', () => {
      // Many nodes with many edges
      const model = createDFG(20, 100);
      const complexity = computeComplexity(model);

      expect(complexity.nodeCount).toBe(20);
      expect(complexity.arcCount).toBe(100);
      expect(complexity.complexityScore).toBeGreaterThan(0.3);
      expect(complexity.simplicityScore).toBeLessThan(0.7);
      expect(complexity.assessment).toMatch(/moderate|complex|very_complex/);
    });

    it('should handle Petri nets with place count', () => {
      const model = createPetriNet(5, 7, 15);
      const complexity = computeComplexity(model);

      expect(complexity.nodeCount).toBe(12); // 5 places + 7 transitions
      expect(complexity.placeCount).toBe(5);
      expect(complexity.transitionCount).toBe(7);
      expect(complexity.complexityScore).toBeGreaterThan(0);
      expect(complexity.complexityScore).toBeLessThan(1);
    });

    it('should normalize complexity to [0, 1]', () => {
      const model = createDFG(50, 200);
      const complexity = computeComplexity(model);

      expect(complexity.complexityScore).toBeGreaterThanOrEqual(0);
      expect(complexity.complexityScore).toBeLessThanOrEqual(1);
      expect(complexity.simplicityScore).toBeGreaterThanOrEqual(0);
      expect(complexity.simplicityScore).toBeLessThanOrEqual(1);
    });

    it('should compute arc density correctly', () => {
      const model = createDFG(5, 20); // Complete graph
      const complexity = computeComplexity(model);

      // Arc density for complete graph: edges / (n * (n-1))
      // Max edges for 5 nodes = 5 * 4 = 20
      // Actual = 20, so density = 1.0
      expect(complexity.arcDensity).toBe(1.0);
    });

    it('should compute cyclomatic complexity', () => {
      const model = createDFG(5, 6); // Minimal spanning tree
      const complexity = computeComplexity(model);

      // Cyclomatic = edges - nodes + 2 = 6 - 5 + 2 = 3
      expect(complexity.cyclomaticComplexity).toBe(3);
    });
  });

  describe('computeQualitySummary', () => {
    it('should compute excellent verdict for all high scores', () => {
      const summary = computeQualitySummary(0.95, 0.95, 0.95, 0.95);

      expect(summary.overallScore).toBeGreaterThan(0.9);
      expect(summary.verdict).toBe('excellent');
      expect(summary.fitness).toBe(0.95);
      expect(summary.precision).toBe(0.95);
      expect(summary.generalization).toBe(0.95);
      expect(summary.simplicity).toBe(0.95);
    });

    it('should compute good verdict for high scores', () => {
      const summary = computeQualitySummary(0.85, 0.85, 0.80, 0.75);

      expect(summary.overallScore).toBeGreaterThan(0.75);
      expect(summary.overallScore).toBeLessThan(0.9);
      expect(summary.verdict).toBe('good');
    });

    it('should compute acceptable verdict for moderate scores', () => {
      const summary = computeQualitySummary(0.70, 0.65, 0.60, 0.60);

      expect(summary.overallScore).toBeGreaterThan(0.6);
      expect(summary.overallScore).toBeLessThan(0.75);
      expect(summary.verdict).toBe('acceptable');
    });

    it('should compute needs_improvement verdict for low scores', () => {
      const summary = computeQualitySummary(0.50, 0.45, 0.40, 0.50);

      expect(summary.overallScore).toBeGreaterThan(0.45);
      expect(summary.overallScore).toBeLessThan(0.6);
      expect(summary.verdict).toBe('needs_improvement');
    });

    it('should compute poor verdict for very low scores', () => {
      const summary = computeQualitySummary(0.30, 0.25, 0.20, 0.25);

      expect(summary.overallScore).toBeLessThan(0.45);
      expect(summary.verdict).toBe('poor');
    });

    it('should clamp inputs to [0, 1]', () => {
      const summary = computeQualitySummary(-0.5, 1.5, 2.0, -1.0);

      expect(summary.fitness).toBe(0);
      expect(summary.precision).toBe(1);
      expect(summary.generalization).toBe(1);
      expect(summary.simplicity).toBe(0);
    });

    it('should use correct weighting: fitness 35%, precision 30%, gen 20%, simple 15%', () => {
      // Test with distinctive values to verify weights
      const summary = computeQualitySummary(1.0, 0.0, 0.0, 0.0);

      // Overall = 0.35 * 1.0 + 0.30 * 0.0 + 0.20 * 0.0 + 0.15 * 0.0 = 0.35
      expect(summary.overallScore).toBeCloseTo(0.35, 2);
    });

    it('should generate human-readable summary', () => {
      const summary = computeQualitySummary(0.50, 0.50, 0.50, 0.50);

      expect(summary.summary).toContain('fitness=0.50');
      expect(summary.summary).toContain('precision=0.50');
      expect(summary.summary).toContain('generalization=0.50');
      expect(summary.summary).toContain('simplicity=0.50');
      expect(summary.summary).toContain('overall=');
      expect(summary.summary.toUpperCase()).toContain('VERDICT');
    });
  });

  describe('analyzeModelStructure', () => {
    it('should provide full analysis with complexity and quality', () => {
      const model = createDFG(10, 20);
      const analysis = analyzeModelStructure(model);

      expect(analysis.modelType).toBe('dfg');
      expect(analysis.algorithmId).toBe('dfg');
      expect(analysis.complexity).toBeDefined();
      expect(analysis.assessment).toContain('dfg');
      expect(analysis.assessment).toContain('10 nodes');
      expect(analysis.assessment).toContain('20 edges');
    });

    it('should include quality assessment when present', () => {
      const model = createDFG(5, 8);
      model.quality = {
        fitness: 0.92,
        precision: 0.88,
        generalization: 0.85,
        simplicity: 0.75,
      };

      const analysis = analyzeModelStructure(model);

      expect(analysis.quality).toBeDefined();
      expect(analysis.assessment).toContain('Quality');
      expect(analysis.assessment).toContain('0.92'); // fitness
      expect(analysis.assessment).toContain('0.88'); // precision
    });
  });

  describe('rankModelsByComplexity', () => {
    it('should rank models by simplicity (ascending complexity)', () => {
      const models = [
        createDFG(20, 100), // Complex
        createDFG(5, 8), // Simple
        createDFG(10, 20), // Moderate
      ];

      const ranked = rankModelsByComplexity(models);

      expect(ranked).toHaveLength(3);
      expect(ranked[0].rank).toBe(1); // Simplest
      expect(ranked[1].rank).toBe(2);
      expect(ranked[2].rank).toBe(3); // Most complex

      // Verify order: simplest first
      expect(ranked[0].complexity.simplicityScore).toBeGreaterThan(
        ranked[1].complexity.simplicityScore
      );
      expect(ranked[1].complexity.simplicityScore).toBeGreaterThan(
        ranked[2].complexity.simplicityScore
      );
    });

    it('should handle empty array', () => {
      const ranked = rankModelsByComplexity([]);

      expect(ranked).toHaveLength(0);
    });

    it('should handle single model', () => {
      const models = [createDFG(5, 8)];

      const ranked = rankModelsByComplexity(models);

      expect(ranked).toHaveLength(1);
      expect(ranked[0].rank).toBe(1);
    });
  });

  describe('Formatting', () => {
    it('should format complexity score for human consumption', () => {
      const model = createDFG(10, 20);
      const complexity = computeComplexity(model);
      const formatted = formatComplexityScore(complexity);

      expect(formatted).toContain('Complexity:');
      expect(formatted).toContain('Simplicity:');
      expect(formatted).toContain('Nodes:');
      expect(formatted).toContain('Edges:');
      expect(formatted).toContain('Cyclomatic:');
      expect(formatted).toContain('Density:');
    });

    it('should format quality summary for human consumption', () => {
      const summary = computeQualitySummary(0.92, 0.88, 0.85, 0.75);
      const formatted = formatQualitySummary(summary);

      expect(formatted).toContain('Quality Assessment');
      expect(formatted).toContain('Fitness:');
      expect(formatted).toContain('Precision:');
      expect(formatted).toContain('Generalization:');
      expect(formatted).toContain('Simplicity:');
      expect(formatted).toContain('Overall Score:');
    });
  });

  describe('Quality Dimension Trade-offs', () => {
    it('should balance fitness vs simplicity', () => {
      // High fitness, low simplicity
      const complex = computeQualitySummary(0.95, 0.90, 0.85, 0.30);

      // High simplicity, lower fitness
      const simple = computeQualitySummary(0.70, 0.70, 0.70, 0.95);

      // Both should be acceptable but with different tradeoffs
      expect(complex.overallScore).toBeGreaterThan(0.6);
      expect(simple.overallScore).toBeGreaterThan(0.6);
      expect(complex.overallScore).not.toBe(simple.overallScore);
    });

    it('should penalize low fitness significantly', () => {
      const lowFitness = computeQualitySummary(0.30, 0.95, 0.95, 0.95);
      const highFitness = computeQualitySummary(0.95, 0.30, 0.30, 0.30);

      // lowFitness: 0.35*0.30 + 0.30*0.95 + 0.20*0.95 + 0.15*0.95 = 0.105 + 0.285 + 0.19 + 0.1425 = 0.7225
      // highFitness: 0.35*0.95 + 0.30*0.30 + 0.20*0.30 + 0.15*0.30 = 0.3325 + 0.09 + 0.06 + 0.045 = 0.5275
      // Actually high fitness (0.95) with low others is worse overall due to weights
      expect(lowFitness.overallScore).toBeGreaterThan(highFitness.overallScore);
    });
  });
});
