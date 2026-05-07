import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { existsSync } from 'fs';
import { init } from '../src/commands/init.js';

describe('Init Command', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = path.join(process.cwd(), `.test-wasm4pm-${Date.now()}`);
    await fs.mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  async function runInit(args: Record<string, unknown>) {
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('Exit called'); });
    try {
      await init.run({ args: { format: 'human', verbose: false, quiet: true, _: [], '--': [], ...args } } as any);
    } catch {
      // Expected from mocked exit
    } finally {
      exitSpy.mockRestore();
      cwdSpy.mockRestore();
    }
    return exitSpy;
  }

  it('creates TOML config, .env.example, .gitignore, and README.md with correct content', async () => {
    await runInit({ configFormat: 'toml', force: false });

    const tomlContent = await fs.readFile(path.join(tmpDir, 'wasm4pm.toml'), 'utf-8');
    expect(tomlContent).toContain('[execution]');
    expect(tomlContent).toContain('profile = "balanced"');

    const envContent = await fs.readFile(path.join(tmpDir, '.env.example'), 'utf-8');
    expect(envContent).toContain('WASM4PM_PROFILE=balanced');
    expect(envContent).toContain('WASM4PM_LOG_LEVEL=info');

    const gitignoreContent = await fs.readFile(path.join(tmpDir, '.gitignore'), 'utf-8');
    expect(gitignoreContent).toContain('node_modules/');
    expect(gitignoreContent).toContain('.env');
    expect(gitignoreContent).toContain('dist/');

    const readmeContent = await fs.readFile(path.join(tmpDir, 'README.md'), 'utf-8');
    expect(readmeContent).toContain('# wasm4pm Project');
    expect(readmeContent).toContain('wpm run');
    expect(readmeContent).toContain('wpm watch');
  });

  it('creates JSON config with correct structure', async () => {
    await runInit({ configFormat: 'json', force: false });
    const jsonContent = await fs.readFile(path.join(tmpDir, 'wasm4pm.json'), 'utf-8');
    const config = JSON.parse(jsonContent);
    expect(config.execution.profile).toBe('balanced');
    expect(config.output.format).toBe('human');
  });

  it('respects --force: does not overwrite without it, overwrites with it', async () => {
    const tomlPath = path.join(tmpDir, 'wasm4pm.toml');
    await fs.writeFile(tomlPath, 'existing content');

    await runInit({ configFormat: 'toml', force: false });
    expect(await fs.readFile(tomlPath, 'utf-8')).toBe('existing content');

    await runInit({ configFormat: 'toml', force: true });
    const newContent = await fs.readFile(tomlPath, 'utf-8');
    expect(newContent).toContain('[execution]');
    expect(newContent).not.toContain('existing content');
  });

  it('rejects invalid configFormat with exit code 1', async () => {
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('Exit called'); });
    try {
      await init.run({ args: { configFormat: 'yaml', force: false, format: 'human', verbose: false, quiet: true, _: [], '--': [] } } as any);
    } catch {
      expect(exitSpy).toHaveBeenCalledWith(1);
    } finally {
      exitSpy.mockRestore();
      cwdSpy.mockRestore();
    }
  });
});
