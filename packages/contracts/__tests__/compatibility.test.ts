import { describe, it, expect, beforeEach } from 'vitest';
import {
  getCompatibility,
  isFeatureSupported,
  getSupportedPlatforms,
  getCurrentPlatform,
  type Platform,
  type CompatibilityMatrix,
} from '../src/index.js';

describe('Compatibility Matrix (PRD §22)', () => {
  describe('getCompatibility', () => {
    it('should return compatibility matrix for Node.js', () => {
      const matrix = getCompatibility('node');

      expect(matrix).toHaveProperty('platform');
      expect(matrix).toHaveProperty('features');
      expect(matrix.platform).toBe('node');
    });

    it('should return compatibility matrix for Browser', () => {
      const matrix = getCompatibility('browser');

      expect(matrix.platform).toBe('browser');
      expect(matrix.features).toHaveProperty('run');
      expect(matrix.features).toHaveProperty('watch');
      expect(matrix.features).toHaveProperty('otel');
    });

    it('should return compatibility matrix for WASI', () => {
      const matrix = getCompatibility('wasi');

      expect(matrix.platform).toBe('wasi');
    });
  });

  describe('Node.js Platform', () => {
    it('should support all features on Node.js', () => {
      const matrix = getCompatibility('node');

      expect(matrix.features.run).toBe(true);
      expect(matrix.features.watch).toBe(true);
      expect(matrix.features.otel).toBe(true);
    });
  });

  describe('Browser Platform', () => {
    it('should support run feature on browser', () => {
      const matrix = getCompatibility('browser');

      expect(matrix.features.run).toBe(true);
    });

    it('should NOT support watch on browser', () => {
      const matrix = getCompatibility('browser');

      expect(matrix.features.watch).toBe(false);
    });

    it('should support OpenTelemetry on browser', () => {
      const matrix = getCompatibility('browser');

      expect(matrix.features.otel).toBe(true);
    });
  });

  describe('WASI Platform', () => {
    it('should support run feature on WASI', () => {
      const matrix = getCompatibility('wasi');

      expect(matrix.features.run).toBe(true);
    });

    it('should support watch on WASI', () => {
      const matrix = getCompatibility('wasi');

      expect(matrix.features.watch).toBe(true);
    });

    it('should NOT support OpenTelemetry on WASI', () => {
      const matrix = getCompatibility('wasi');

      expect(matrix.features.otel).toBe(false);
    });
  });

  describe('Feature Coverage Requirements', () => {
    it('should have run feature on all platforms', () => {
      const platforms: Platform[] = ['node', 'browser', 'wasi'];

      for (const platform of platforms) {
        const matrix = getCompatibility(platform);
        expect(matrix.features.run).toBe(true);
      }
    });

    it('should document watch support differences', () => {
      expect(getCompatibility('node').features.watch).toBe(true);
      expect(getCompatibility('browser').features.watch).toBe(false);
      expect(getCompatibility('wasi').features.watch).toBe(true);
    });

    it('should document OpenTelemetry support differences', () => {
      expect(getCompatibility('node').features.otel).toBe(true);
      expect(getCompatibility('browser').features.otel).toBe(true);
      expect(getCompatibility('wasi').features.otel).toBe(false);
    });
  });

  describe('isFeatureSupported', () => {
    it('should check Node.js feature support', () => {
      expect(isFeatureSupported('node', 'run')).toBe(true);
      expect(isFeatureSupported('node', 'watch')).toBe(true);
      expect(isFeatureSupported('node', 'otel')).toBe(true);
    });

    it('should check Browser feature support', () => {
      expect(isFeatureSupported('browser', 'run')).toBe(true);
      expect(isFeatureSupported('browser', 'watch')).toBe(false);
      expect(isFeatureSupported('browser', 'otel')).toBe(true);
    });

    it('should check WASI feature support', () => {
      expect(isFeatureSupported('wasi', 'run')).toBe(true);
      expect(isFeatureSupported('wasi', 'watch')).toBe(true);
      expect(isFeatureSupported('wasi', 'otel')).toBe(false);
    });

    it('should handle all valid feature names', () => {
      const features = ['run', 'watch', 'otel'] as const;
      const platforms: Platform[] = ['node', 'browser', 'wasi'];

      for (const platform of platforms) {
        for (const feature of features) {
          const supported = isFeatureSupported(platform, feature);
          expect(typeof supported).toBe('boolean');
        }
      }
    });
  });

  describe('getSupportedPlatforms', () => {
    it('should return array of all supported platforms', () => {
      const platforms = getSupportedPlatforms();

      expect(Array.isArray(platforms)).toBe(true);
      expect(platforms.length).toBe(3);
    });

    it('should include all expected platforms', () => {
      const platforms = getSupportedPlatforms();

      expect(platforms).toContain('node');
      expect(platforms).toContain('browser');
      expect(platforms).toContain('wasi');
    });

    it('should not contain duplicates', () => {
      const platforms = getSupportedPlatforms();
      const uniquePlatforms = new Set(platforms);

      expect(uniquePlatforms.size).toBe(platforms.length);
    });
  });

  describe('getCurrentPlatform', () => {
    it('should return a platform or null', () => {
      const current = getCurrentPlatform();

      expect(
        current === 'node' ||
        current === 'browser' ||
        current === 'wasi' ||
        current === null
      ).toBe(true);
    });

    it('should return node in Node.js environment', () => {
      const current = getCurrentPlatform();

      // In Node.js test environment
      if (typeof process !== 'undefined' && process.versions?.node) {
        expect(current).toBe('node');
      }
    });
  });

  describe('Compatibility Matrix Structure', () => {
    it('should have consistent structure across platforms', () => {
      const platforms: Platform[] = ['node', 'browser', 'wasi'];

      for (const platform of platforms) {
        const matrix = getCompatibility(platform);

        expect(matrix).toHaveProperty('platform');
        expect(matrix).toHaveProperty('features');

        const features = matrix.features;
        expect(features).toHaveProperty('run');
        expect(features).toHaveProperty('watch');
        expect(features).toHaveProperty('otel');

        expect(typeof features.run).toBe('boolean');
        expect(typeof features.watch).toBe('boolean');
        expect(typeof features.otel).toBe('boolean');
      }
    });

    it('should match platform name in matrix', () => {
      const platforms: Platform[] = ['node', 'browser', 'wasi'];

      for (const platform of platforms) {
        const matrix = getCompatibility(platform);
        expect(matrix.platform).toBe(platform);
      }
    });
  });

  describe('Watch Feature Semantics', () => {
    it('should indicate file watching capability', () => {
      // Node.js can watch files
      expect(getCompatibility('node').features.watch).toBe(true);

      // Browser cannot access file system for watching
      expect(getCompatibility('browser').features.watch).toBe(false);

      // WASI can watch if file system bindings available
      expect(getCompatibility('wasi').features.watch).toBe(true);
    });
  });

  describe('Observability Feature Semantics', () => {
    it('should indicate OpenTelemetry export capability', () => {
      // Node.js can export metrics
      expect(getCompatibility('node').features.otel).toBe(true);

      // Browser can export (HTTP exporter)
      expect(getCompatibility('browser').features.otel).toBe(true);

      // WASI is limited (no network capability typically)
      expect(getCompatibility('wasi').features.otel).toBe(false);
    });
  });

  describe('Core Run Feature', () => {
    it('should always support core run feature', () => {
      const platforms: Platform[] = ['node', 'browser', 'wasi'];

      for (const platform of platforms) {
        const matrix = getCompatibility(platform);
        expect(matrix.features.run).toBe(true);
      }
    });

    it('should indicate platform can execute connectors and sinks', () => {
      // All platforms can execute core algorithms
      expect(isFeatureSupported('node', 'run')).toBe(true);
      expect(isFeatureSupported('browser', 'run')).toBe(true);
      expect(isFeatureSupported('wasi', 'run')).toBe(true);
    });
  });
});

describe('Compatibility Matrix Use Cases', () => {
  it('should enable conditional feature loading based on platform', () => {
    const platform: Platform = 'browser';
    const matrix = getCompatibility(platform);

    if (matrix.features.watch) {
      // Load watch functionality
    } else {
      // Use polling or alternate strategy
    }

    expect(matrix.features.watch).toBe(false);
  });

  it('should enable graceful degradation for unsupported features', () => {
    const platform: Platform = 'wasi';

    if (!isFeatureSupported(platform, 'otel')) {
      // Disable OpenTelemetry export
      // Or fall back to console logging
    }

    expect(isFeatureSupported(platform, 'otel')).toBe(false);
  });

  it('should enable platform detection at runtime', () => {
    const currentPlatform = getCurrentPlatform();
    const matrix = currentPlatform ? getCompatibility(currentPlatform) : null;

    expect(matrix).not.toBeNull();
    expect(matrix?.features.run).toBe(true);
  });
});
