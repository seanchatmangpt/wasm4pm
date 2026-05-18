import { describe, it, expect, beforeEach } from 'vitest';
import { getRegistry, type AlgorithmMetadata } from '../registry';

describe('Algorithm Metadata Validation — registry completeness', () => {
  let registry: ReturnType<typeof getRegistry>;

  beforeEach(() => {
    registry = getRegistry();
  });

  it('should have algorithms registered', () => {
    const algorithms = registry.list();
    expect(algorithms.length).toBeGreaterThan(0);
  });

  it('should validate algorithm IDs are unique', () => {
    const algorithms = registry.list();
    const ids = algorithms.map((a) => a.algorithmId);
    const uniqueIds = new Set(ids);
    
    expect(ids.length).toBe(uniqueIds.size);
  });

  it('should validate all algorithms have required metadata', () => {
    const algorithms = registry.list();
    
    algorithms.forEach((algo) => {
      expect(algo).toHaveProperty('algorithmId');
      expect(algo).toHaveProperty('displayName');
      expect(typeof algo.algorithmId).toBe('string');
      expect(typeof algo.displayName).toBe('string');
    });
  });

  it('should validate deployment profiles are defined', () => {
    const algorithms = registry.list();
    
    algorithms.forEach((algo) => {
      expect(algo).toHaveProperty('deploymentProfiles');
      expect(Array.isArray(algo.deploymentProfiles)).toBe(true);
      expect(algo.deploymentProfiles.length).toBeGreaterThan(0);
    });
  });

  it('should validate speed and quality scores are numeric', () => {
    const algorithms = registry.list();
    
    algorithms.forEach((algo) => {
      if ('speed' in algo) {
        expect(typeof algo.speed).toBe('number');
        expect(algo.speed).toBeGreaterThanOrEqual(0);
      }
      if ('quality' in algo) {
        expect(typeof algo.quality).toBe('number');
        expect(algo.quality).toBeGreaterThanOrEqual(0);
      }
    });
  });

  it('should validate output format is specified', () => {
    const algorithms = registry.list();
    
    algorithms.forEach((algo) => {
      expect(algo).toHaveProperty('outputFormat');
      expect(['dfg', 'petri_net', 'tree', 'declare', 'ml_result', 'other']).toContain(
        algo.outputFormat
      );
    });
  });

  it('should categorize algorithms correctly', () => {
    const algorithms = registry.list();
    const categories = new Set(
      algorithms.map((a) => a.category ?? 'uncategorized')
    );
    
    expect(categories.size).toBeGreaterThan(0);
  });

  it('should validate discovery algorithms', () => {
    const discoveryAlgos = registry.getByCategory('discovery');
    
    discoveryAlgos.forEach((algo) => {
      expect(algo.algorithmId).toMatch(/^discover_|^dfg|^alpha|^heuristic|^inductive|^genetic|^ilp/);
    });
  });

  it('should validate ML algorithms', () => {
    const mlAlgos = registry.getByCategory('ml');
    
    mlAlgos.forEach((algo) => {
      expect(['ml_classify', 'ml_cluster', 'ml_forecast', 'ml_anomaly', 'ml_regress', 'ml_pca']).toContain(
        algo.algorithmId
      );
    });
  });

  it('should provide algorithm metadata by deployment profile', () => {
    const browserAlgos = registry.getForDeploymentProfile('browser');
    const fogAlgos = registry.getForDeploymentProfile('fog');
    
    expect(browserAlgos.length).toBeGreaterThan(0);
    expect(fogAlgos.length).toBeGreaterThan(0);
    
    // Browser should have all algos, fog should be subset
    expect(browserAlgos.length).toBeGreaterThanOrEqual(fogAlgos.length);
  });

  it('should validate algorithm parameter schemas', () => {
    const algorithms = registry.list();
    
    algorithms.forEach((algo) => {
      if (algo.parameters && algo.parameters.length > 0) {
        algo.parameters.forEach((param) => {
          expect(param).toHaveProperty('name');
          expect(param).toHaveProperty('type');
          expect(['string', 'number', 'boolean', 'array', 'object']).toContain(param.type);
        });
      }
    });
  });

  it('should validate algorithm descriptions', () => {
    const algorithms = registry.list();
    
    algorithms.forEach((algo) => {
      expect(algo.displayName).toBeTruthy();
      expect(typeof algo.displayName).toBe('string');
      expect(algo.displayName.length).toBeGreaterThan(0);
    });
  });

  it('should support algorithm lookup by ID', () => {
    const algo = registry.getById('dfg');
    
    expect(algo).toBeDefined();
    expect(algo?.algorithmId).toBe('dfg');
  });

  it('should handle lookup for non-existent algorithm gracefully', () => {
    const algo = registry.getById('nonexistent_algorithm_xyz');
    
    expect(algo).toBeUndefined();
  });

  it('should validate profile constraints are respected', () => {
    const mobileAlgos = registry.getForDeploymentProfile('mobile');
    const browserAlgos = registry.getForDeploymentProfile('browser');
    
    // Mobile should be more constrained than browser
    expect(mobileAlgos.length).toBeLessThanOrEqual(browserAlgos.length);
  });

  it('should provide profile availability metadata', () => {
    const profiles = ['mobile', 'iot', 'edge', 'fog', 'browser'];
    
    profiles.forEach((profile) => {
      const algos = registry.getForDeploymentProfile(profile as any);
      expect(Array.isArray(algos)).toBe(true);
      expect(algos.length).toBeGreaterThan(0);
    });
  });

  it('should validate algorithm feature flags align with metadata', () => {
    const algorithms = registry.list();
    
    algorithms.forEach((algo) => {
      // Algorithms with advanced discovery should be tagged
      if (['genetic_algorithm', 'ilp', 'aco', 'pso', 'simulated_annealing', 'a_star'].includes(
        algo.algorithmId
      )) {
        expect(algo.deploymentProfiles).toContain('browser');
        expect(algo.deploymentProfiles).toContain('fog');
      }
    });
  });
});
