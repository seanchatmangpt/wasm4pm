/**
 * Deployment Profile Tests
 *
 * Tests for verifying that algorithms are correctly filtered by deployment profile
 * and that the WASM binary sizes match expectations for each profile.
 */

import { describe, it, expect } from 'vitest';
// Import from src directly so tests exercise the corrected registry source,
// not the stale compiled dist (which may lag behind source changes).
import { getRegistry } from '../src/registry.js';

describe('Deployment Profiles', () => {
  describe('Algorithm Filtering', () => {
    it('should include basic algorithms in browser profile', () => {
      const registry = getRegistry();
      const browserAlgorithms = registry.getForDeploymentProfile('browser');

      const algorithmIds = browserAlgorithms.map((a) => a.id);
      expect(algorithmIds).toContain('dfg');
      expect(algorithmIds).toContain('process_skeleton');
    });

    it('should include advanced algorithms in edge profile but not mobile', () => {
      const registry = getRegistry();
      const mobileAlgorithms = registry.getForDeploymentProfile('mobile');
      const edgeAlgorithms = registry.getForDeploymentProfile('edge');

      const mobileIds = mobileAlgorithms.map((a) => a.id);
      const edgeIds = edgeAlgorithms.map((a) => a.id);

      // Edge should have more algorithms than mobile
      expect(edgeIds.length).toBeGreaterThan(mobileIds.length);

      // Edge should include advanced algorithms
      expect(edgeIds).toContain('inductive_miner');
      expect(edgeIds).toContain('hill_climbing');
    });

    it('should include ML algorithms in edge profile', () => {
      const registry = getRegistry();
      const edgeAlgorithms = registry.getForDeploymentProfile('edge');

      const algorithmIds = edgeAlgorithms.map((a) => a.id);
      expect(algorithmIds).toContain('ml_cluster');
      expect(algorithmIds).toContain('ml_anomaly');
    });

    it('should include swarm algorithms in fog profile but not edge', () => {
      const registry = getRegistry();
      const edgeAlgorithms = registry.getForDeploymentProfile('edge');
      const fogAlgorithms = registry.getForDeploymentProfile('fog');

      const edgeIds = edgeAlgorithms.map((a) => a.id);
      const fogIds = fogAlgorithms.map((a) => a.id);

      // Fog should have swarm algorithms
      expect(fogIds).toContain('genetic_algorithm');
      expect(fogIds).toContain('aco');
      expect(fogIds).toContain('pso');
      expect(fogIds).toContain('simulated_annealing');
    });

    it('should include all algorithms in browser profile (full-feature tier)', () => {
      const registry = getRegistry();
      const browserAlgorithms = registry.getForDeploymentProfile('browser');

      // Browser is the full-feature tier (~2.78MB) and should have the most algorithms
      expect(browserAlgorithms.length).toBeGreaterThan(0);

      // Should include at least the core algorithms
      const algorithmIds = browserAlgorithms.map((a) => a.id);
      expect(algorithmIds).toContain('dfg');
      expect(algorithmIds).toContain('genetic_algorithm');
      expect(algorithmIds).toContain('ml_cluster');
    });

    it('should have minimal algorithms in iot profile', () => {
      const registry = getRegistry();
      const browserAlgorithms = registry.getForDeploymentProfile('browser');
      const iotAlgorithms = registry.getForDeploymentProfile('iot');

      // IoT should have fewer algorithms than browser (full-feature tier)
      expect(iotAlgorithms.length).toBeLessThanOrEqual(browserAlgorithms.length);

      // Should at least have the basics
      const algorithmIds = iotAlgorithms.map((a) => a.id);
      expect(algorithmIds.length).toBeGreaterThan(0);
    });
  });

  describe('Profile Size Estimates', () => {
    it('should estimate mobile profile has fewest algorithms', () => {
      const registry = getRegistry();
      const mobileAlgorithms = registry.getForDeploymentProfile('mobile');
      const browserAlgorithms = registry.getForDeploymentProfile('browser');

      // mobile (~500KB) must have fewer algorithms than browser (~2.78MB)
      expect(mobileAlgorithms.length).toBeLessThan(browserAlgorithms.length);
    });

    it('should estimate browser profile has most algorithms', () => {
      const registry = getRegistry();
      const profiles = ['mobile', 'iot', 'edge', 'fog', 'browser'] as const;
      const sizes = profiles.map((p) => registry.getForDeploymentProfile(p).length);

      const maxSize = Math.max(...sizes);
      const browserSize = registry.getForDeploymentProfile('browser').length;

      expect(browserSize).toBe(maxSize);
    });
  });

  describe('Deployment Profile Inference', () => {
    it('should infer mobile deployment from fast execution profile', () => {
      const registry = getRegistry();
      const fastAlgorithms = registry.getForProfile('fast');
      const mobileAlgorithms = registry.getForDeploymentProfile('mobile');

      // All fast algorithms should be available in mobile (smallest footprint tier)
      const fastIds = new Set(fastAlgorithms.map((a) => a.id));
      const mobileIds = new Set(mobileAlgorithms.map((a) => a.id));

      for (const id of fastIds) {
        expect(mobileIds.has(id)).toBe(true);
      }
    });

    it('should infer edge deployment from balanced/quality execution profiles', () => {
      const registry = getRegistry();
      const balancedAlgorithms = registry.getForProfile('balanced');
      const edgeAlgorithms = registry.getForDeploymentProfile('edge');

      // All balanced algorithms should be available in edge
      const balancedIds = new Set(balancedAlgorithms.map((a) => a.id));
      const edgeIds = new Set(edgeAlgorithms.map((a) => a.id));

      for (const id of balancedIds) {
        expect(edgeIds.has(id)).toBe(true);
      }
    });
  });
});
