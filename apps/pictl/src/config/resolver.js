import * as fs from 'fs/promises';
import * as path from 'path';
import { existsSync } from 'fs';
const SEARCH_FILES = ['pictl.toml', 'pictl.json'];
/**
 * Resolve config file path using standard search order
 */
export function resolveConfigPath(cliConfigPath) {
    // 1. Explicit CLI path
    if (cliConfigPath) {
        return { path: path.resolve(cliConfigPath), source: 'cli' };
    }
    // 2-3. Search for pictl.toml, then pictl.json in cwd
    const cwd = process.cwd();
    for (const file of SEARCH_FILES) {
        const candidate = path.join(cwd, file);
        if (existsSync(candidate)) {
            return { path: candidate, source: file };
        }
    }
    // 4. PMC_CONFIG_PATH env var
    const envPath = process.env.PMC_CONFIG_PATH;
    if (envPath && existsSync(envPath)) {
        return { path: path.resolve(envPath), source: 'env' };
    }
    // 5. Defaults
    return { path: null, source: 'defaults' };
}
/**
 * Read and parse resolved config file content
 */
export async function readConfigFile(resolved) {
    if (!resolved.path) {
        return null;
    }
    const content = await fs.readFile(resolved.path, 'utf-8');
    const ext = path.extname(resolved.path).toLowerCase();
    if (ext === '.json') {
        return JSON.parse(content);
    }
    if (ext === '.toml') {
        // Delegate to @pictl/config for TOML parsing
        const { resolveConfig } = await import('@pictl/config');
        const config = await resolveConfig({ configSearchPaths: [path.dirname(resolved.path)] });
        return config;
    }
    throw new Error(`Unsupported config format: ${ext}`);
}
//# sourceMappingURL=resolver.js.map