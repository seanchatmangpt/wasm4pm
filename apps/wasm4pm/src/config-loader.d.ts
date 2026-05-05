import type { Config, CliOverrides } from '@wasm4pm/config';
import type { HumanFormatter, JSONFormatter } from './output.js';
/**
 * Load configuration for pictl command with error handling and user feedback
 * @param cliOverrides CLI arguments (--config, --profile, etc.)
 * @param formatter Output formatter for error messages
 * @returns Loaded and validated configuration
 * @throws Error with appropriate exit code on failure
 */
export declare function loadPictlConfig(cliOverrides?: CliOverrides, formatter?: HumanFormatter | JSONFormatter): Promise<Config>;
/**
 * Build CLI overrides from command arguments
 * Maps pictl flags to @wasm4pm/config CliOverrides interface
 */
export declare function buildCliOverrides(args: Record<string, unknown>): CliOverrides;
//# sourceMappingURL=config-loader.d.ts.map