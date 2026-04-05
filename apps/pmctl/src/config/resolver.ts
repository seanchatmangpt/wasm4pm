import * as fs from 'fs/promises';
import * as path from 'path';
import { existsSync } from 'fs';

/**
 * Config file search order:
 * 1. Explicit --config path
 * 2. ./pmctl.toml
 * 3. ./pmctl.json
 * 4. PMC_CONFIG_PATH environment variable
 * 5. Defaults (no file)
 */

export interface ResolvedConfigPath {
  path: string | null;
  source: 'cli' | 'pmctl.toml' | 'pmctl.json' | 'env' | 'defaults';
}

const SEARCH_FILES = ['pmctl.toml', 'pmctl.json'] as const;

/**
 * Resolve config file path using standard search order
 */
export function resolveConfigPath(cliConfigPath?: string): ResolvedConfigPath {
  // 1. Explicit CLI path
  if (cliConfigPath) {
    return { path: path.resolve(cliConfigPath), source: 'cli' };
  }

  // 2-3. Search for pmctl.toml, then pmctl.json in cwd
  const cwd = process.cwd();
  for (const file of SEARCH_FILES) {
    const candidate = path.join(cwd, file);
    if (existsSync(candidate)) {
      return { path: candidate, source: file as 'pmctl.toml' | 'pmctl.json' };
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
export async function readConfigFile(resolved: ResolvedConfigPath): Promise<Record<string, unknown> | null> {
  if (!resolved.path) {
    return null;
  }

  const content = await fs.readFile(resolved.path, 'utf-8');
  const ext = path.extname(resolved.path).toLowerCase();

  if (ext === '.json') {
    return JSON.parse(content);
  }

  if (ext === '.toml') {
    // Delegate to @wasm4pm/config for TOML parsing
    const { resolveConfig } = await import('@wasm4pm/config');
    const config = await resolveConfig({ configSearchPaths: [path.dirname(resolved.path)] });
    return config as unknown as Record<string, unknown>;
  }

  throw new Error(`Unsupported config format: ${ext}`);
}
