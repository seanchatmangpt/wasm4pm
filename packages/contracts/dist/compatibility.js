/**
 * Compatibility Matrix (PRD §22)
 *
 * Defines platform support and feature availability across different
 * deployment targets (Node.js, Browser, WASI).
 */
/**
 * Get compatibility matrix for a platform
 *
 * @param platform Target platform
 * @returns Compatibility matrix for the platform
 */
export function getCompatibility(platform) {
    const matrices = {
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
export function isFeatureSupported(platform, feature) {
    const matrix = getCompatibility(platform);
    return matrix.features[feature];
}
/**
 * Get all supported platforms
 *
 * @returns Array of all supported platforms
 */
export function getSupportedPlatforms() {
    return ['node', 'browser', 'wasi'];
}
/**
 * Get current runtime platform (Node.js specific)
 *
 * @returns Current platform if running in Node.js, null otherwise
 */
export function getCurrentPlatform() {
    if (typeof globalThis !== 'undefined' && globalThis.process?.versions?.node) {
        return 'node';
    }
    if (typeof globalThis !== 'undefined' && globalThis.window) {
        return 'browser';
    }
    // WASI detection would depend on how it's invoked
    return null;
}
//# sourceMappingURL=compatibility.js.map