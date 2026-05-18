/**
 * feature-gates.test.ts
 * Tests for deployment profile feature validation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  validateDeploymentProfile,
  detectDeploymentProfile,
  describeProfile,
} from '../feature-gates.js';
import type { WasmModule } from '../handlers.js';
import type { DeploymentProfile } from '../registry.js';

/**
 * Create a mock WASM module with specific features enabled
 */
function createMockWasm(enabledFeatures: Set<string>): WasmModule {
  const wasmObj: Record<string, unknown> = {
    // Add some required base functions
    discover_dfg: () => ({ /* ... */ }),
    load_eventlog_from_xes: () => '',
    get_version: () => '26.4.0',
  };

  // Add feature markers for enabled features
  const featureMarkers: Record<string, string> = {
    genetic_discovery: '__test_genetic_discovery_available',
    ilp_discovery: '__test_ilp_discovery_available',
    ml_classify: '__test_ml_classify_available',
    ml_cluster: '__test_ml_cluster_available',
    ml_forecast: '__test_ml_forecast_available',
    ml_anomaly: '__test_ml_anomaly_available',
    ml_regress: '__test_ml_regress_available',
    ml_pca: '__test_ml_pca_available',
    ocel: '__test_ocel_available',
    powl: '__test_powl_available',
    streaming_simd: '__test_streaming_simd_available',
    streaming_basic: '__test_streaming_basic_available',
    conformance_alignments: '__test_conformance_alignments_available',
    gpu: '__test_gpu_available',
  };

  for (const [feature, marker] of Object.entries(featureMarkers)) {
    if (enabledFeatures.has(feature)) {
      wasmObj[marker] = () => {
        // Marker function that succeeds
      };
    }
  }

  return wasmObj as unknown as WasmModule;
}

describe('Feature Gates — Deployment Profile Validation', () => {
  describe('validateDeploymentProfile', () => {
    it('should validate mobile profile with no features', () => {
      const wasm = createMockWasm(new Set());
      const result = validateDeploymentProfile(wasm, 'mobile');

      expect(result.profile).toBe('mobile');
      expect(result.valid).toBe(true);
      expect(result.missingRequired).toHaveLength(0);
      expect(result.confidence).toBe(1);
    });

    it('should validate edge profile with streaming_basic', () => {
      const wasm = createMockWasm(new Set(['streaming_basic']));
      const result = validateDeploymentProfile(wasm, 'edge');

      expect(result.profile).toBe('edge');
      expect(result.valid).toBe(true);
      expect(result.missingRequired).toHaveLength(0);
      expect(result.confidence).toBe(1);
    });

    it('should fail edge profile without streaming_basic', () => {
      const wasm = createMockWasm(new Set());
      const result = validateDeploymentProfile(wasm, 'edge');

      expect(result.profile).toBe('edge');
      expect(result.valid).toBe(false);
      expect(result.missingRequired).toContain('streaming_basic');
      expect(result.confidence).toBeLessThan(1);
    });

    it('should validate fog profile with all required features', () => {
      const requiredFeatures = new Set([
        'genetic_discovery',
        'ilp_discovery',
        'ml_cluster',
        'ml_forecast',
        'ml_anomaly',
        'ml_regress',
        'ml_pca',
        'ocel',
        'streaming_simd',
        'streaming_basic',
        'conformance_alignments',
      ]);
      const wasm = createMockWasm(requiredFeatures);
      const result = validateDeploymentProfile(wasm, 'fog');

      expect(result.profile).toBe('fog');
      expect(result.valid).toBe(true);
      expect(result.missingRequired).toHaveLength(0);
      expect(result.confidence).toBe(1);
    });

    it('should fail fog profile with missing required features', () => {
      const partialFeatures = new Set(['genetic_discovery', 'ml_cluster']); // Only 2 of 11 required
      const wasm = createMockWasm(partialFeatures);
      const result = validateDeploymentProfile(wasm, 'fog');

      expect(result.profile).toBe('fog');
      expect(result.valid).toBe(false);
      expect(result.missingRequired.length).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThan(1);
    });

    it('should validate browser profile with all features', () => {
      const allFeatures = new Set([
        'genetic_discovery',
        'ilp_discovery',
        'ml_cluster',
        'ml_forecast',
        'ml_anomaly',
        'ml_regress',
        'ml_pca',
        'ocel',
        'powl',
        'streaming_simd',
        'streaming_basic',
        'conformance_alignments',
      ]);
      const wasm = createMockWasm(allFeatures);
      const result = validateDeploymentProfile(wasm, 'browser');

      expect(result.profile).toBe('browser');
      expect(result.valid).toBe(true);
      expect(result.missingRequired).toHaveLength(0);
      expect(result.confidence).toBe(1);
    });

    it('should fail browser profile without powl', () => {
      const almostAllFeatures = new Set([
        'genetic_discovery',
        'ilp_discovery',
        'ml_cluster',
        'ml_forecast',
        'ml_anomaly',
        'ml_regress',
        'ml_pca',
        'ocel',
        // powl is missing
        'streaming_simd',
        'streaming_basic',
        'conformance_alignments',
      ]);
      const wasm = createMockWasm(almostAllFeatures);
      const result = validateDeploymentProfile(wasm, 'browser');

      expect(result.profile).toBe('browser');
      expect(result.valid).toBe(false);
      expect(result.missingRequired).toContain('powl');
    });

    it('should return feature details for each feature', () => {
      const wasm = createMockWasm(new Set(['genetic_discovery']));
      const result = validateDeploymentProfile(wasm, 'mobile');

      expect(result.features).toBeDefined();
      expect(result.features.length).toBeGreaterThan(0);
      const geneticFeature = result.features.find((f) => f.feature === 'genetic_discovery');
      expect(geneticFeature?.available).toBe(true);
    });
  });

  describe('detectDeploymentProfile', () => {
    it('should detect browser profile when all features present', () => {
      const allFeatures = new Set([
        'genetic_discovery',
        'ilp_discovery',
        'ml_cluster',
        'ml_forecast',
        'ml_anomaly',
        'ml_regress',
        'ml_pca',
        'ocel',
        'powl',
        'streaming_simd',
        'streaming_basic',
        'conformance_alignments',
      ]);
      const wasm = createMockWasm(allFeatures);
      const result = detectDeploymentProfile(wasm);

      expect(result.detected).toBe('browser');
      expect(result.confidence).toBe(1);
    });

    it('should detect fog profile when powl missing', () => {
      const fogFeatures = new Set([
        'genetic_discovery',
        'ilp_discovery',
        'ml_cluster',
        'ml_forecast',
        'ml_anomaly',
        'ml_regress',
        'ml_pca',
        'ocel',
        'streaming_simd',
        'streaming_basic',
        'conformance_alignments',
      ]);
      const wasm = createMockWasm(fogFeatures);
      const result = detectDeploymentProfile(wasm);

      expect(result.detected).toBe('fog');
      expect(result.confidence).toBe(1);
    });

    it('should detect edge profile with streaming_basic only', () => {
      const wasm = createMockWasm(new Set(['streaming_basic']));
      const result = detectDeploymentProfile(wasm);

      expect(result.detected).toBe('edge');
      expect(result.confidence).toBe(1);
    });

    it('should detect iot profile with minimal features', () => {
      const wasm = createMockWasm(new Set());
      const result = detectDeploymentProfile(wasm);

      expect(['iot', 'mobile']).toContain(result.detected);
      expect(result.confidence).toBe(1);
    });

    it('should return validations for checked profiles', () => {
      const wasm = createMockWasm(new Set(['genetic_discovery']));
      const result = detectDeploymentProfile(wasm);

      expect(result.validations).toBeDefined();
      expect(Array.isArray(result.validations)).toBe(true);
      expect(result.validations.length).toBeGreaterThan(0);
    });

    it('should return best-confidence match if no perfect match', () => {
      // Partial edge features (has streaming_basic which is required for edge)
      // but also missing some other features
      const wasm = createMockWasm(new Set(['streaming_basic', 'genetic_discovery']));
      const result = detectDeploymentProfile(wasm);

      expect(result.detected).toBeDefined();
      // Since we have streaming_basic, edge profile should match with 100% confidence
      // But if we're testing partial match, check that validations array exists
      expect(result.validations.length).toBeGreaterThan(0);
    });
  });

  describe('describeProfile', () => {
    it('should describe mobile profile', () => {
      const desc = describeProfile('mobile');

      expect(desc.name).toBe('Mobile');
      expect(desc.description).toContain('mobile');
      expect(desc.size).toBe('~500KB');
      expect(desc.features).toHaveLength(0); // No required features
    });

    it('should describe edge profile', () => {
      const desc = describeProfile('edge');

      expect(desc.name).toBe('Edge');
      expect(desc.description).toContain('edge');
      expect(desc.size).toBe('~1.5MB');
      expect(desc.features).toContain('streaming_basic');
    });

    it('should describe fog profile', () => {
      const desc = describeProfile('fog');

      expect(desc.name).toBe('Fog');
      expect(desc.description).toContain('fog');
      expect(desc.size).toBe('~2MB');
      expect(desc.features).toContain('genetic_discovery');
      expect(desc.features).toContain('ml_cluster');
      expect(desc.features).not.toContain('powl');
    });

    it('should describe browser profile', () => {
      const desc = describeProfile('browser');

      expect(desc.name).toBe('Browser');
      expect(desc.description).toContain('Full');
      expect(desc.size).toBe('~2.7MB');
      expect(desc.features).toContain('powl');
      expect(desc.features).toContain('genetic_discovery');
      expect(desc.features).toContain('ml_cluster');
    });

    it('should describe iot profile', () => {
      const desc = describeProfile('iot');

      expect(desc.name).toBe('IoT');
      expect(desc.description).toContain('IoT');
      expect(desc.size).toBe('~1MB');
      expect(desc.features).toHaveLength(0); // No required features
    });
  });

  describe('Edge cases', () => {
    it('should handle wasm module with missing marker functions gracefully', () => {
      const wasm = createMockWasm(new Set());
      // Remove one of the marker functions if it were added
      const result = validateDeploymentProfile(wasm, 'mobile');

      expect(result.valid).toBe(true);
      expect(() => detectDeploymentProfile(wasm)).not.toThrow();
    });

    it('should handle wasm module with broken marker functions', () => {
      const wasm: Record<string, unknown> = {
        discover_dfg: () => ({ /* ... */ }),
        __test_genetic_discovery_available: () => {
          throw new Error('Marker function error');
        },
      };

      const typedWasm = wasm as unknown as WasmModule;

      const result = validateDeploymentProfile(typedWasm, 'mobile');
      expect(result.valid).toBe(true); // Should still validate for mobile (no required features)
    });

    it('should handle partial feature availability', () => {
      const wasm = createMockWasm(new Set(['genetic_discovery', 'ml_cluster', 'ml_forecast']));
      const result = validateDeploymentProfile(wasm, 'fog');

      expect(result.valid).toBe(false);
      expect(result.features.filter((f) => f.available).length).toBeGreaterThan(0);
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThan(1);
    });
  });
});
