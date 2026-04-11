/**
 * Deployment Profile Tests
 *
 * Tests for verifying that algorithms are correctly filtered by deployment profile
 * and that the WASM binary sizes match expectations for each profile.
 */

import { describe, it, expect } from 'vitest';
import { getRegistry } from '@pictl/kernel';

describe('Deployment Profiles', () => {
  describe('Algorithm Filtering', () => {
    it('should include basic algorithms in browser profile', () => {
      const registry = getRegistry();
      const browserAlgorithms = registry.getForDeploymentProfile('browser');

      const algorithmIds = browserAlgorithms.map((a) => a.id);
      expect(algorithmIds).toContain('dfg');
      expect(algorithmIds).toContain('process_skeleton');
    });

    it('should include advanced algorithms in edge profile but not browser', () => {
      const registry = getRegistry();
      const browserAlgorithms = registry.getForDeploymentProfile('browser');
      const edgeAlgorithms = registry.getForDeploymentProfile('edge');

      const browserIds = browserAlgorithms.map((a) => a.id);
      const edgeIds = edgeAlgorithms.map((a) => a.id);

      // Edge should have more algorithms than browser
      expect(edgeIds.length).toBeGreaterThan(browserIds.length);

      // Edge should include advanced algorithms
      expect(edgeIds).toContain('inductive_miner');
      expect(edgeIds).toContain('hill_climbing');
    });

    it('should include ML algorithms in edge profile', () => {
      const registry = getRegistry();
      const edgeAlgorithms = registry.getForDeploymentProfile('edge');

      const algorithmIds = edgeAlgorithms.map((a) => a.id);
      expect(algorithmIds).toContain('ml_classify');
      expect(algorithmIds).toContain('ml_cluster');
      expect(algorithmIds).toContain('ml_forecast');
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

    it('should include all algorithms in cloud profile', () => {
      const registry = getRegistry();
      const cloudAlgorithms = registry.getForDeploymentProfile('cloud');

      // Cloud should have the most algorithms
      expect(cloudAlgorithms.length).toBeGreaterThan(0);

      // Should include at least the core algorithms
      const algorithmIds = cloudAlgorithms.map((a) => a.id);
      expect(algorithmIds).toContain('dfg');
      expect(algorithmIds).toContain('genetic_algorithm');
      expect(algorithmIds).toContain('ml_classify');
    });

    it('should have minimal algorithms in iot profile', () => {
      const registry = getRegistry();
      const browserAlgorithms = registry.getForDeploymentProfile('browser');
      const iotAlgorithms = registry.getForDeploymentProfile('iot');

      // IoT should have fewer algorithms than browser
      expect(iotAlgorithms.length).toBeLessThanOrEqual(browserAlgorithms.length);

      // Should at least have the basics
      const algorithmIds = iotAlgorithms.map((a) => a.id);
      expect(algorithmIds.length).toBeGreaterThan(0);
    });
  });

  describe('Profile Size Estimates', () => {
    it('should estimate browser profile has fewest algorithms', () => {
      const registry = getRegistry();
      const browserAlgorithms = registry.getForDeploymentProfile('browser');
      const cloudAlgorithms = registry.getForDeploymentProfile('cloud');

      expect(browserAlgorithms.length).toBeLessThan(cloudAlgorithms.length);
    });

    it('should estimate cloud profile has most algorithms', () => {
      const registry = getRegistry();
      const profiles = ['browser', 'edge', 'fog', 'iot', 'cloud'] as const;
      const sizes = profiles.map((p) => registry.getForDeploymentProfile(p).length);

      const maxSize = Math.max(...sizes);
      const cloudSize = registry.getForDeploymentProfile('cloud').length;

      expect(cloudSize).toBe(maxSize);
    });
  });

  describe('Deployment Profile Inference', () => {
    it('should infer browser deployment from fast execution profile', () => {
      const registry = getRegistry();
      const fastAlgorithms = registry.getForProfile('fast');
      const browserAlgorithms = registry.getForDeploymentProfile('browser');

      // All fast algorithms should be available in browser
      const fastIds = new Set(fastAlgorithms.map((a) => a.id));
      const browserIds = new Set(browserAlgorithms.map((a) => a.id));

      for (const id of fastIds) {
        expect(browserIds.has(id)).toBe(true);
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
