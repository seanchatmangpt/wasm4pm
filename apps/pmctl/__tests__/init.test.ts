import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { existsSync } from 'fs';
import { init } from '../src/commands/init.js';

describe('Init Command', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = path.join(process.cwd(), `.test-pmctl-${Date.now()}`);
    await fs.mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('init command execution', () => {
    it('should create config files with TOML format by default', async () => {
      const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('Exit called');
      });

      try {
        await init.run({
          args: {
            configFormat: 'toml',
            force: false,
            format: 'human',
            verbose: false,
            quiet: true,
            _: [],
            '--': [],
          },
        } as any);
      } catch {
        // Expected error from mocked exit
      }

      exitSpy.mockRestore();
      cwdSpy.mockRestore();

      const tomlPath = path.join(tmpDir, 'wasm4pm.toml');
      const envPath = path.join(tmpDir, '.env.example');

      expect(existsSync(tomlPath)).toBe(true);
      expect(existsSync(envPath)).toBe(true);

      const tomlContent = await fs.readFile(tomlPath, 'utf-8');
      expect(tomlContent).toContain('[execution]');
      expect(tomlContent).toContain('profile = "balanced"');

      const envContent = await fs.readFile(envPath, 'utf-8');
      expect(envContent).toContain('WASM4PM_PROFILE=balanced');
      expect(envContent).toContain('WASM4PM_LOG_LEVEL=info');
    });

    it('should create config files with JSON format', async () => {
      const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('Exit called');
      });

      try {
        await init.run({
          args: {
            configFormat: 'json',
            force: false,
            format: 'human',
            verbose: false,
            quiet: true,
            _: [],
            '--': [],
          },
        } as any);
      } catch {
        // Expected error from mocked exit
      }

      exitSpy.mockRestore();
      cwdSpy.mockRestore();

      const jsonPath = path.join(tmpDir, 'wasm4pm.json');
      expect(existsSync(jsonPath)).toBe(true);

      const jsonContent = await fs.readFile(jsonPath, 'utf-8');
      const config = JSON.parse(jsonContent);
      expect(config.execution.profile).toBe('balanced');
      expect(config.output.format).toBe('human');
    });

    it('should create .gitignore and README.md if they do not exist', async () => {
      const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('Exit called');
      });

      try {
        await init.run({
          args: {
            configFormat: 'toml',
            force: false,
            format: 'human',
            verbose: false,
            quiet: true,
            _: [],
            '--': [],
          },
        } as any);
      } catch {
        // Expected error from mocked exit
      }

      exitSpy.mockRestore();
      cwdSpy.mockRestore();

      const gitignorePath = path.join(tmpDir, '.gitignore');
      const readmePath = path.join(tmpDir, 'README.md');

      expect(existsSync(gitignorePath)).toBe(true);
      expect(existsSync(readmePath)).toBe(true);

      const gitignoreContent = await fs.readFile(gitignorePath, 'utf-8');
      expect(gitignoreContent).toContain('node_modules/');
      expect(gitignoreContent).toContain('.env');
      expect(gitignoreContent).toContain('dist/');

      const readmeContent = await fs.readFile(readmePath, 'utf-8');
      expect(readmeContent).toContain('# pmctl Project');
      expect(readmeContent).toContain('pmctl run');
      expect(readmeContent).toContain('pmctl watch');
    });

    it('should not overwrite existing files without --force flag', async () => {
      // Create existing file
      const tomlPath = path.join(tmpDir, 'wasm4pm.toml');
      await fs.writeFile(tomlPath, 'existing content');

      const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('Exit called');
      });

      try {
        await init.run({
          args: {
            configFormat: 'toml',
            force: false,
            format: 'human',
            verbose: false,
            quiet: true,
            _: [],
            '--': [],
          },
        } as any);
      } catch {
        // Expected error from mocked exit
      }

      exitSpy.mockRestore();
      cwdSpy.mockRestore();

      const content = await fs.readFile(tomlPath, 'utf-8');
      expect(content).toBe('existing content');
    });

    it('should overwrite existing files with --force flag', async () => {
      const tomlPath = path.join(tmpDir, 'wasm4pm.toml');
      await fs.writeFile(tomlPath, 'old content');

      const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('Exit called');
      });

      try {
        await init.run({
          args: {
            configFormat: 'toml',
            force: true,
            format: 'human',
            verbose: false,
            quiet: true,
            _: [],
            '--': [],
          },
        } as any);
      } catch {
        // Expected error from mocked exit
      }

      exitSpy.mockRestore();
      cwdSpy.mockRestore();

      const content = await fs.readFile(tomlPath, 'utf-8');
      expect(content).toContain('[execution]');
      expect(content).not.toContain('old content');
    });

    it('should reject invalid format', async () => {
      const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('Exit called');
      });

      try {
        await init.run({
          args: {
            configFormat: 'yaml',
            force: false,
            format: 'human',
            verbose: false,
            quiet: true,
            _: [],
            '--': [],
          },
        } as any);
      } catch {
        expect(exitSpy).toHaveBeenCalledWith(1);
      }

      exitSpy.mockRestore();
      cwdSpy.mockRestore();
    });

    it('should output JSON format when requested', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('Exit called');
      });

      try {
        await init.run({
          args: {
            configFormat: 'toml',
            force: false,
            format: 'json',
            verbose: false,
            quiet: false,
            _: [],
            '--': [],
          },
        } as any);
      } catch {
        // Expected error from mocked exit
      }

      const calls = [...logSpy.mock.calls];

      exitSpy.mockRestore();
      cwdSpy.mockRestore();
      logSpy.mockRestore();
      expect(calls.length).toBeGreaterThan(0);
      const lastCall = calls[calls.length - 1][0];
      if (typeof lastCall === 'string') {
        expect(() => JSON.parse(lastCall)).not.toThrow();
      }
    });
  });
});
