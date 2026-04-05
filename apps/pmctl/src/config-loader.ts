import { loadConfig } from '@wasm4pm/config';
import type { Config, CliOverrides, LoadConfigOptions } from '@wasm4pm/config';
import type { HumanFormatter, JSONFormatter } from './output.js';

/**
 * Load configuration for pmctl command with error handling and user feedback
 * @param cliOverrides CLI arguments (--config, --profile, etc.)
 * @param formatter Output formatter for error messages
 * @returns Loaded and validated configuration
 * @throws Error with appropriate exit code on failure
 */
export async function loadPmctlConfig(
  cliOverrides: CliOverrides = {},
  formatter?: HumanFormatter | JSONFormatter
): Promise<Config> {
  try {
    const options: LoadConfigOptions = {
      cliOverrides,
      configSearchPaths: cliOverrides.configPath
        ? [cliOverrides.configPath]
        : undefined // Use default search paths if not specified
    };

    const config = await loadConfig(options);

    // Log config provenance in verbose mode if formatter provided
    if (formatter && typeof formatter === 'object' && 'debug' in formatter) {
      const formatter_typed = formatter as HumanFormatter;
      formatter_typed.debug(`Config loaded from: ${config.source.kind} (${config.source.path || 'defaults'})`);
      formatter_typed.debug(`Config hash: ${config.metadata.hash}`);
    }

    return config;
  } catch (error) {
    if (formatter && typeof formatter === 'object') {
      if ('error' in formatter) {
        formatter.error(`Configuration error: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    throw error;
  }
}

/**
 * Build CLI overrides from command arguments
 * Maps pmctl flags to @wasm4pm/config CliOverrides interface
 */
export function buildCliOverrides(args: Record<string, unknown>): CliOverrides {
  const overrides: CliOverrides = {};

  // Map pmctl command arguments to config overrides
  if (args.config) {
    overrides.configPath = args.config as string;
  }

  if (args.profile) {
    overrides.profile = args.profile as any;
  }

  if (args.format) {
    overrides.outputFormat = args.format as 'human' | 'json';
  }

  if (args.output) {
    overrides.outputDestination = args.output as string;
  }

  if (typeof args.watch === 'boolean') {
    overrides.watchEnabled = args.watch;
  }

  return overrides;
}
