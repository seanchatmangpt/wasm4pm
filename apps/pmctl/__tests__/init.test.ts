import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { existsSync } from 'fs';
import { init } from '../src/commands/init.js';

describe('Init Command', () => {
  let tmpDir: string;

  beforeEach(async () => {
    // Create temporary directory for test
    tmpDir = path.join(process.cwd(), `.test-pmctl-${Date.now()}`);
    await fs.mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    // Clean up temporary directory
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('init command execution', () => {
    it('should create config files with TOML format by default', async () => {
      const originalCwd = process.cwd();
      process.chdir(tmpDir);

      try {
        const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
          throw new Error('Exit called');
        });

        try {
          await init.run({
            args: {
              format: 'toml',
              force: false,
              output: 'human',
              verbose: false,
              quiet: true,
              _: [],
              '--': [],
            },
          } as any);
        } catch (error) {
          // Expected error from mocked exit
        }

        exitSpy.mockRestore();

        // Verify files were created
        const tomlPath = path.join(tmpDir, 'wasm4pm.toml');
        const envPath = path.join(tmpDir, '.env.example');

        expect(existsSync(tomlPath)).toBe(true);
        expect(existsSync(envPath)).toBe(true);

        // Verify content
        const tomlContent = await fs.readFile(tomlPath, 'utf-8');
        expect(tomlContent).toContain('version = "26.4.5"');
        expect(tomlContent).toContain('[execution]');
        expect(tomlContent).toContain('profile = "balanced"');

        const envContent = await fs.readFile(envPath, 'utf-8');
        expect(envContent).toContain('WASM4PM_PROFILE=balanced');
        expect(envContent).toContain('WASM4PM_LOG_LEVEL=info');
      } finally {
        process.chdir(originalCwd);
      }
    });

    it('should create config files with JSON format', async () => {
      const originalCwd = process.cwd();
      process.chdir(tmpDir);

      try {
        const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
          throw new Error('Exit called');
        });

        try {
          await init.run({
            args: {
              format: 'json',
              force: false,
              output: 'human',
              verbose: false,
              quiet: true,
              _: [],
              '--': [],
            },
          } as any);
        } catch (error) {
          // Expected error from mocked exit
        }

        exitSpy.mockRestore();

        // Verify JSON file was created
        const jsonPath = path.join(tmpDir, 'wasm4pm.json');
        expect(existsSync(jsonPath)).toBe(true);

        // Verify content
        const jsonContent = await fs.readFile(jsonPath, 'utf-8');
        const config = JSON.parse(jsonContent);
        expect(config.version).toBe('26.4.5');
        expect(config.execution.profile).toBe('balanced');
        expect(config.output.format).toBe('human');
      } finally {
        process.chdir(originalCwd);
      }
    });

    it('should create .gitignore and README.md if they do not exist', async () => {
      const originalCwd = process.cwd();
      process.chdir(tmpDir);

      try {
        const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
          throw new Error('Exit called');
        });

        try {
          await init.run({
            args: {
              format: 'toml',
              force: false,
              output: 'human',
              verbose: false,
              quiet: true,
              _: [],
              '--': [],
            },
          } as any);
        } catch (error) {
          // Expected error from mocked exit
        }

        exitSpy.mockRestore();

        const gitignorePath = path.join(tmpDir, '.gitignore');
        const readmePath = path.join(tmpDir, 'README.md');

        expect(existsSync(gitignorePath)).toBe(true);
        expect(existsSync(readmePath)).toBe(true);

        // Verify .gitignore content
        const gitignoreContent = await fs.readFile(gitignorePath, 'utf-8');
        expect(gitignoreContent).toContain('node_modules/');
        expect(gitignoreContent).toContain('.env');
        expect(gitignoreContent).toContain('dist/');

        // Verify README content
        const readmeContent = await fs.readFile(readmePath, 'utf-8');
        expect(readmeContent).toContain('# pmctl Project');
        expect(readmeContent).toContain('pmctl run');
        expect(readmeContent).toContain('pmctl watch');
      } finally {
        process.chdir(originalCwd);
      }
    });

    it('should not overwrite existing files without --force flag', async () => {
      const originalCwd = process.cwd();
      process.chdir(tmpDir);

      try {
        // Create existing file
        const tomlPath = path.join(tmpDir, 'wasm4pm.toml');
        await fs.writeFile(tomlPath, 'existing content');

        const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
          throw new Error('Exit called');
        });

        try {
          await init.run({
            args: {
              format: 'toml',
              force: false,
              output: 'human',
              verbose: false,
              quiet: true,
              _: [],
              '--': [],
            },
          } as any);
        } catch (error) {
          // Expected error from mocked exit
        }

        exitSpy.mockRestore();

        // Verify file was not overwritten
        const content = await fs.readFile(tomlPath, 'utf-8');
        expect(content).toBe('existing content');
      } finally {
        process.chdir(originalCwd);
      }
    });

    it('should overwrite existing files with --force flag', async () => {
      const originalCwd = process.cwd();
      process.chdir(tmpDir);

      try {
        // Create existing file
        const tomlPath = path.join(tmpDir, 'wasm4pm.toml');
        await fs.writeFile(tomlPath, 'old content');

        const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
          throw new Error('Exit called');
        });

        try {
          await init.run({
            args: {
              format: 'toml',
              force: true,
              output: 'human',
              verbose: false,
              quiet: true,
              _: [],
              '--': [],
            },
          } as any);
        } catch (error) {
          // Expected error from mocked exit
        }

        exitSpy.mockRestore();

        // Verify file was overwritten
        const content = await fs.readFile(tomlPath, 'utf-8');
        expect(content).toContain('version = "26.4.5"');
        expect(content).not.toContain('old content');
      } finally {
        process.chdir(originalCwd);
      }
    });

    it('should reject invalid format', async () => {
      const originalCwd = process.cwd();
      process.chdir(tmpDir);

      try {
        const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
          throw new Error('Exit called');
        });

        try {
          await init.run({
            args: {
              format: 'yaml',
              force: false,
              output: 'human',
              verbose: false,
              quiet: true,
              _: [],
              '--': [],
            },
          } as any);
        } catch (error) {
          expect(exitSpy).toHaveBeenCalledWith(1);
        }

        exitSpy.mockRestore();
      } finally {
        process.chdir(originalCwd);
      }
    });

    it('should output JSON format when requested', async () => {
      const originalCwd = process.cwd();
      process.chdir(tmpDir);

      try {
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
          throw new Error('Exit called');
        });

        try {
          await init.run({
            args: {
              format: 'toml',
              force: false,
              output: 'json',
              verbose: false,
              quiet: false,
              _: [],
              '--': [],
            },
          } as any);
        } catch (error) {
          // Expected error from mocked exit
        }

        exitSpy.mockRestore();
        logSpy.mockRestore();

        // Verify JSON was logged
        const calls = logSpy.mock.calls;
        expect(calls.length).toBeGreaterThan(0);
        const lastCall = calls[calls.length - 1][0];
        if (typeof lastCall === 'string') {
          expect(() => JSON.parse(lastCall)).not.toThrow();
        }
      } finally {
        process.chdir(originalCwd);
      }
    });
  });
});
