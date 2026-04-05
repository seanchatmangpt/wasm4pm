/**
 * Compatibility Matrix (PRD §22)
 *
 * Defines platform support and feature availability across different
 * deployment targets (Node.js, Browser, WASI).
 */

/**
 * Deployment platform
 */
export type Platform = 'node' | 'browser' | 'wasi';

/**
 * Feature availability flags for a platform
 */
export interface PlatformFeatures {
  /**
   * Can run connectors and sinks (core capability)
   * - node: true
   * - browser: true (with appropriate adapters)
   * - wasi: true
   */
  run: boolean;

  /**
   * Can watch sources for changes and stream incremental updates
   * - node: true (file watching, stream APIs)
   * - browser: false (no file system access)
   * - wasi: true (if file system bindings available)
   */
  watch: boolean;

  /**
   * Can emit OpenTelemetry metrics and traces
   * - node: true
   * - browser: true (with HTTP exporter)
   * - wasi: false (limited to stdout)
   */
  otel: boolean;
}

/**
 * Complete compatibility matrix for a platform
 */
export interface CompatibilityMatrix {
  /**
   * Target platform
   */
  platform: Platform;

  /**
   * Feature availability for this platform
   */
  features: PlatformFeatures;
}

/**
 * Get compatibility matrix for a platform
 *
 * @param platform Target platform
 * @returns Compatibility matrix for the platform
 */
export function getCompatibility(platform: Platform): CompatibilityMatrix {
  const matrices: Record<Platform, CompatibilityMatrix> = {
    node: {
      platform: 'node',
      features: {
        run: true,
        watch: true,
        otel: true,
      },
    },
    browser: {
      platform: 'browser',
      features: {
        run: true,
        watch: false,
        otel: true,
      },
    },
    wasi: {
      platform: 'wasi',
      features: {
        run: true,
        watch: true,
        otel: false,
      },
    },
  };

  return matrices[platform];
}

/**
 * Check if a feature is supported on a platform
 *
 * @param platform Target platform
 * @param feature Feature name
 * @returns true if feature is supported, false otherwise
 */
export function isFeatureSupported(
  platform: Platform,
  feature: keyof PlatformFeatures
): boolean {
  const matrix = getCompatibility(platform);
  return matrix.features[feature];
}

/**
 * Get all supported platforms
 *
 * @returns Array of all supported platforms
 */
export function getSupportedPlatforms(): Platform[] {
  return ['node', 'browser', 'wasi'];
}

/**
 * Get current runtime platform (Node.js specific)
 *
 * @returns Current platform if running in Node.js, null otherwise
 */
export function getCurrentPlatform(): Platform | null {
  if (typeof globalThis !== 'undefined' && globalThis.process?.versions?.node) {
    return 'node';
  }
  if (typeof globalThis !== 'undefined' && globalThis.window) {
    return 'browser';
  }
  // WASI detection would depend on how it's invoked
  return null;
}
