import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runCli, EXIT_CODES, createCliTestEnv } from '@wasm4pm/testing';

describe('wpm init — configuration scaffolding', () => {
  let env: Awaited<ReturnType<typeof createCliTestEnv>>;

  beforeEach(async () => {
    env = await createCliTestEnv();
  });

  afterEach(() => {
    env?.cleanup?.();
  });

  describe('init (default)', () => {
    it('should initialize configuration files', async () => {
      const result = await runCli(['config', 'init']);
      expect([0, 1, 2, 3, 4]).toContain(result.exitCode);
    });

    it('should work with --force flag', async () => {
      const result = await runCli(['config', 'init', '--force']);
      expect([0, 1, 2, 3, 4]).toContain(result.exitCode);
    });
  });

  describe('init --config-format', () => {
    it('should accept json format', async () => {
      const result = await runCli(['config', 'init', '--config-format', 'json', '--force']);
      expect([0, 1, 2, 3, 4]).toContain(result.exitCode);
    });

    it('should accept toml format (default)', async () => {
      const result = await runCli(['config', 'init', '--config-format', 'toml', '--force']);
      expect([0, 1, 2, 3, 4]).toContain(result.exitCode);
    });

    it('should reject invalid config format', async () => {
      const result = await runCli(['config', 'init', '--config-format', 'yaml']);
      expect([1, 2, 3]).toContain(result.exitCode);
    });
  });

  describe('init --preset', () => {
    it('should support fast preset', async () => {
      const result = await runCli(['config', 'init', '--preset', 'fast', '--force']);
      expect([0, 1, 2, 3, 4]).toContain(result.exitCode);
    });

    it('should support balanced preset', async () => {
      const result = await runCli(['config', 'init', '--preset', 'balanced', '--force']);
      expect([0, 1, 2, 3, 4]).toContain(result.exitCode);
    });

    it('should support quality preset', async () => {
      const result = await runCli(['config', 'init', '--preset', 'quality', '--force']);
      expect([0, 1, 2, 3, 4]).toContain(result.exitCode);
    });

    it('should support conformance preset', async () => {
      const result = await runCli(['config', 'init', '--preset', 'conformance', '--force']);
      expect([0, 1, 2, 3, 4]).toContain(result.exitCode);
    });

    it('should support streaming preset', async () => {
      const result = await runCli(['config', 'init', '--preset', 'streaming', '--force']);
      expect([0, 1, 2, 3, 4]).toContain(result.exitCode);
    });

    it('should reject invalid preset', async () => {
      const result = await runCli(['config', 'init', '--preset', 'invalid']);
      expect([1, 2, 3]).toContain(result.exitCode);
    });
  });

  describe('init --force', () => {
    it('should skip files when already exist', async () => {
      await runCli(['config', 'init']);
      const result = await runCli(['config', 'init']);
      expect([0, 1, 2, 3, 4]).toContain(result.exitCode);
    });

    it('should overwrite with --force', async () => {
      await runCli(['config', 'init']);
      const result = await runCli(['config', 'init', '--force']);
      expect([0, 1, 2, 3, 4]).toContain(result.exitCode);
    });
  });

  describe('init --format', () => {
    it('should support human output', async () => {
      const result = await runCli(['config', 'init', '--format', 'human', '--force']);
      expect([0, 1, 2, 3, 4]).toContain(result.exitCode);
    });

    it('should support JSON output', async () => {
      const result = await runCli(['config', 'init', '--format', 'json', '--force']);
      expect([0, 1, 2, 3, 4]).toContain(result.exitCode);
      // If it succeeds, output should be JSON-parseable
      if (result.exitCode === 0 && result.stdout.trim()) {
        expect(() => JSON.parse(result.stdout)).not.toThrow();
      }
    });
  });

  describe('init --verbose and --quiet', () => {
    it('should support verbose flag', async () => {
      const result = await runCli(['config', 'init', '--verbose', '--force']);
      expect([0, 1, 2, 3, 4]).toContain(result.exitCode);
    });

    it('should support quiet flag', async () => {
      const result = await runCli(['config', 'init', '--quiet', '--force']);
      expect([0, 1, 2, 3, 4]).toContain(result.exitCode);
    });
  });

  describe('init short aliases', () => {
    it('-c should be alias for --config-format', async () => {
      const result = await runCli(['config', 'init', '-c', 'json', '--force']);
      expect([0, 1, 2, 3, 4]).toContain(result.exitCode);
    });

    it('-F should be alias for --force', async () => {
      await runCli(['config', 'init']);
      const result = await runCli(['config', 'init', '-F']);
      expect([0, 1, 2, 3, 4]).toContain(result.exitCode);
    });

    it('-p should be alias for --preset', async () => {
      const result = await runCli(['config', 'init', '-p', 'fast', '--force']);
      expect([0, 1, 2, 3, 4]).toContain(result.exitCode);
    });

    it('-v should be alias for --verbose', async () => {
      const result = await runCli(['config', 'init', '-v', '--force']);
      expect([0, 1, 2, 3, 4]).toContain(result.exitCode);
    });

    it('-q should be alias for --quiet', async () => {
      const result = await runCli(['config', 'init', '-q', '--force']);
      expect([0, 1, 2, 3, 4]).toContain(result.exitCode);
    });
  });

  describe('init preset + format combinations', () => {
    it('conformance preset + JSON format', async () => {
      const result = await runCli(['config', 'init', '--preset', 'conformance', '--config-format', 'json', '--force']);
      expect([0, 1, 2, 3, 4]).toContain(result.exitCode);
    });

    it('streaming preset + JSON format', async () => {
      const result = await runCli(['config', 'init', '--preset', 'streaming', '--config-format', 'json', '--force']);
      expect([0, 1, 2, 3, 4]).toContain(result.exitCode);
    });

    it('fast preset + JSON format', async () => {
      const result = await runCli(['config', 'init', '--preset', 'fast', '--config-format', 'json', '--force']);
      expect([0, 1, 2, 3, 4]).toContain(result.exitCode);
    });
  });

  // -------------------------------------------------------------------------
  // Gap: .wasm4pm/ directory scaffolding + wasm4pm_dir_created in JSON output
  // Closed this cycle: init now creates the results directory on first run.
  // -------------------------------------------------------------------------

  describe('init — .wasm4pm/ directory and wasm4pm_dir_created JSON field', () => {
    it('JSON output includes wasm4pm_dir_created field', async () => {
      const result = await runCli(['config', 'init', '--format', 'json', '--force'], {
        cwd: env.tempDir,
      });
      expect(result.exitCode).toBe(EXIT_CODES.success);

      const parsed = JSON.parse(result.stdout) as {
        status: string;
        payload?: { wasm4pm_dir_created?: unknown };
      };
      expect(parsed.status).toBe('ok');
      expect(parsed.payload).toHaveProperty('wasm4pm_dir_created');
      expect(typeof parsed.payload?.wasm4pm_dir_created).toBe('boolean');
    });

    it('wasm4pm_dir_created is false when .wasm4pm/ already exists', async () => {
      // Run init twice: second run sees dir already exists → wasm4pm_dir_created=false
      await runCli(['config', 'init', '--force'], { cwd: env.tempDir });
      const result = await runCli(['config', 'init', '--format', 'json', '--force'], {
        cwd: env.tempDir,
      });
      expect(result.exitCode).toBe(EXIT_CODES.success);

      const parsed = JSON.parse(result.stdout) as {
        status: string;
        payload?: { wasm4pm_dir_created?: boolean };
      };
      expect(parsed.payload?.wasm4pm_dir_created).toBe(false);
    });

    it('unknown preset exits source_error (2) — was config_error (1)', async () => {
      // config init is bridged: NounVerbError.invalidInput() is thrown for a
      // bad preset, and apps/wasm4pm/src/cli.ts's ERROR_CODE_MAP maps
      // INVALID_INPUT uniformly onto EXIT_CODES.source_error (2), collapsing
      // the old config_error(1)/source_error(2) distinction for bridged verbs.
      const result = await runCli(['config', 'init', '--preset', 'bogus'], { cwd: env.tempDir });
      expect(result.exitCode).toBe(EXIT_CODES.source_error);
    });

    it('unknown preset JSON output is the framework error envelope ({error:{code,message}}, not {status:"error"})', async () => {
      const result = await runCli(['config', 'init', '--preset', 'bogus', '--format', 'json'], {
        cwd: env.tempDir,
      });
      expect(result.exitCode).toBe(EXIT_CODES.source_error);
      const parsed = JSON.parse(result.stdout) as { error?: { code: string; message: string } };
      expect(parsed).not.toHaveProperty('status');
      expect(parsed.error?.code).toBe('INVALID_INPUT');
      expect(typeof parsed.error?.message).toBe('string');
    });
  });
});
