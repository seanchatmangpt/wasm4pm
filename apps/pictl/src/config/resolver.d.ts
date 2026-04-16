/**
 * Config file search order:
 * 1. Explicit --config path
 * 2. ./pictl.toml
 * 3. ./pictl.json
 * 4. PMC_CONFIG_PATH environment variable
 * 5. Defaults (no file)
 */
export interface ResolvedConfigPath {
    path: string | null;
    source: 'cli' | 'pictl.toml' | 'pictl.json' | 'env' | 'defaults';
}
/**
 * Resolve config file path using standard search order
 */
export declare function resolveConfigPath(cliConfigPath?: string): ResolvedConfigPath;
/**
 * Read and parse resolved config file content
 */
export declare function readConfigFile(resolved: ResolvedConfigPath): Promise<Record<string, unknown> | null>;
//# sourceMappingURL=resolver.d.ts.map