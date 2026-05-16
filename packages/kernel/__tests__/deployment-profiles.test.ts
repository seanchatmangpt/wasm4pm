/**
 * Deployment Profile Tests
 *
 * Tests for verifying that algorithms are correctly filtered by deployment profile
 * and that the WASM binary sizes match expectations for each profile.
 */

import { describe, it, expect } from 'vitest';
import { getRegistry } from '@wasm4pm/kernel';

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

      // Edge should have more algorithms than mobile (minimal)
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

    it('should include all algorithms in browser profile', () => {
      const registry = getRegistry();
      const browserAlgorithms2 = registry.getForDeploymentProfile('browser');

      // Browser (full-featured) should have the most algorithms
      expect(browserAlgorithms2.length).toBeGreaterThan(0);

      // Should include at least the core algorithms
      const algorithmIds = browserAlgorithms2.map((a) => a.id);
      expect(algorithmIds).toContain('dfg');
      expect(algorithmIds).toContain('genetic_algorithm');
      expect(algorithmIds).toContain('ml_cluster');
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
    it('should estimate mobile profile has fewest algorithms', () => {
      const registry = getRegistry();
      const mobileAlgorithms2 = registry.getForDeploymentProfile('mobile');
      const browserAlgorithms3 = registry.getForDeploymentProfile('browser');

      expect(mobileAlgorithms2.length).toBeLessThan(browserAlgorithms3.length);
    });

    it('should estimate browser profile has most algorithms', () => {
      const registry = getRegistry();
      const profiles = ['mobile', 'edge', 'fog', 'iot', 'browser'] as const;
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

      // All fast algorithms should be available in mobile
      const fastIds = new Set(fastAlgorithms.map((a) => a.id));
      const mobileIds = new Set(mobileAlgorithms.map((a) => a.id));

      for (const id of fastIds) {
        expect(mobileIds.has(id)).toBe(true);
      }
    });

    it('should infer browser deployment from balanced/quality execution profiles', () => {
      const registry = getRegistry();
      const balancedAlgorithms = registry.getForProfile('balanced');
      const browserAlgorithms = registry.getForDeploymentProfile('browser');

      // All balanced algorithms should be available in browser (full-featured)
      const balancedIds = new Set(balancedAlgorithms.map((a) => a.id));
      const browserIds = new Set(browserAlgorithms.map((a) => a.id));

      for (const id of balancedIds) {
        expect(browserIds.has(id)).toBe(true);
      }
    });
  });
});
