import type { Config, LoadConfigOptions } from './types.js';
/**
 * Resolution order (highest to lowest priority):
 *  1. CLI arguments
 *  2. TOML config file (pictl.toml)
 *  3. JSON config file (wasm4pm.json)
 *  4. Environment variables (WASM4PM_* prefix)
 *  5. Defaults
 */
export declare function resolveConfig(options?: LoadConfigOptions): Promise<Config>;
/**
 * Get example TOML configuration string.
 */
export declare function getExampleTomlConfig(): string;
/**
 * Get example JSON configuration string.
 */
export declare function getExampleJsonConfig(): string;
//# sourceMappingURL=resolver.d.ts.map