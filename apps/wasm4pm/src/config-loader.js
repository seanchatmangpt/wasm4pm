import { resolveConfig as loadConfig } from '@wasm4pm/config';
/**
 * Load configuration for wasm4pm command with error handling and user feedback
 * @param cliOverrides CLI arguments (--config, --profile, etc.)
 * @param formatter Output formatter for error messages
 * @returns Loaded and validated configuration
 * @throws Error with appropriate exit code on failure
 */
export async function loadPictlConfig(cliOverrides = {}, formatter) {
    try {
        const options = {
            cliOverrides,
            configSearchPaths: cliOverrides.configPath
                ? [cliOverrides.configPath]
                : undefined // Use default search paths if not specified
        };
        const config = await loadConfig(options);
        // Log config provenance in verbose mode if formatter provided
        if (formatter && typeof formatter === 'object' && 'debug' in formatter) {
            const formatter_typed = formatter;
            formatter_typed.debug(`Config loaded from: ${config.source.kind} (${config.source.path || 'defaults'})`);
            formatter_typed.debug(`Config hash: ${config.metadata.hash}`);
        }
        return config;
    }
    catch (error) {
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
 * Maps wasm4pm flags to @wasm4pm/config CliOverrides interface
 */
export function buildCliOverrides(args) {
    const overrides = {};
    // Map wasm4pm command arguments to config overrides
    if (args.config) {
        overrides.configPath = args.config;
    }
    if (args.profile) {
        overrides.profile = args.profile;
    }
    if (args.format) {
        overrides.outputFormat = args.format;
    }
    if (args.output) {
        overrides.outputDestination = args.output;
    }
    if (typeof args.watch === 'boolean') {
        overrides.watchEnabled = args.watch;
    }
    if (typeof args.predictionEnabled === 'boolean') {
        overrides.predictionEnabled = args.predictionEnabled;
    }
    if (args.predictionTasks) {
        overrides.predictionTasks = String(args.predictionTasks)
            .split(',')
            .map(t => t.trim())
            .filter(Boolean);
    }
    if (args.predictionActivityKey) {
        overrides.predictionActivityKey = String(args.predictionActivityKey);
    }
    if (args.predictionNgramOrder) {
        const n = Number(args.predictionNgramOrder);
        if (!isNaN(n))
            overrides.predictionNgramOrder = n;
    }
    if (args.predictionDriftWindow) {
        const w = Number(args.predictionDriftWindow);
        if (!isNaN(w))
            overrides.predictionDriftWindow = w;
    }
    return overrides;
}
//# sourceMappingURL=config-loader.js.map