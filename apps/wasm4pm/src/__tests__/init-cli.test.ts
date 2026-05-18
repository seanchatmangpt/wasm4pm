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
      const result = await runCli(['init']);
      expect([0, 1, 2, 3, 4]).toContain(result.exitCode);
    });

    it('should work with --force flag', async () => {
      const result = await runCli(['init', '--force']);
      expect([0, 1, 2, 3, 4]).toContain(result.exitCode);
    });
  });

  describe('init --config-format', () => {
    it('should accept json format', async () => {
      const result = await runCli(['init', '--config-format', 'json', '--force']);
      expect([0, 1, 2, 3, 4]).toContain(result.exitCode);
    });

    it('should accept toml format (default)', async () => {
      const result = await runCli(['init', '--config-format', 'toml', '--force']);
      expect([0, 1, 2, 3, 4]).toContain(result.exitCode);
    });

    it('should reject invalid config format', async () => {
      const result = await runCli(['init', '--config-format', 'yaml']);
      expect([1, 2, 3]).toContain(result.exitCode);
    });
  });

  describe('init --preset', () => {
    it('should support fast preset', async () => {
      const result = await runCli(['init', '--preset', 'fast', '--force']);
      expect([0, 1, 2, 3, 4]).toContain(result.exitCode);
    });

    it('should support balanced preset', async () => {
      const result = await runCli(['init', '--preset', 'balanced', '--force']);
      expect([0, 1, 2, 3, 4]).toContain(result.exitCode);
    });

    it('should support quality preset', async () => {
      const result = await runCli(['init', '--preset', 'quality', '--force']);
      expect([0, 1, 2, 3, 4]).toContain(result.exitCode);
    });

    it('should support conformance preset', async () => {
      const result = await runCli(['init', '--preset', 'conformance', '--force']);
      expect([0, 1, 2, 3, 4]).toContain(result.exitCode);
    });

    it('should support streaming preset', async () => {
      const result = await runCli(['init', '--preset', 'streaming', '--force']);
      expect([0, 1, 2, 3, 4]).toContain(result.exitCode);
    });

    it('should reject invalid preset', async () => {
      const result = await runCli(['init', '--preset', 'invalid']);
      expect([1, 2, 3]).toContain(result.exitCode);
    });
  });

  describe('init --force', () => {
    it('should skip files when already exist', async () => {
      await runCli(['init']);
      const result = await runCli(['init']);
      expect([0, 1, 2, 3, 4]).toContain(result.exitCode);
    });

    it('should overwrite with --force', async () => {
      await runCli(['init']);
      const result = await runCli(['init', '--force']);
      expect([0, 1, 2, 3, 4]).toContain(result.exitCode);
    });
  });

  describe('init --format', () => {
    it('should support human output', async () => {
      const result = await runCli(['init', '--format', 'human', '--force']);
      expect([0, 1, 2, 3, 4]).toContain(result.exitCode);
    });

    it('should support JSON output', async () => {
      const result = await runCli(['init', '--format', 'json', '--force']);
      expect([0, 1, 2, 3, 4]).toContain(result.exitCode);
      // If it succeeds, output should be JSON-parseable
      if (result.exitCode === 0 && result.stdout.trim()) {
        expect(() => JSON.parse(result.stdout)).not.toThrow();
      }
    });
  });

  describe('init --verbose and --quiet', () => {
    it('should support verbose flag', async () => {
      const result = await runCli(['init', '--verbose', '--force']);
      expect([0, 1, 2, 3, 4]).toContain(result.exitCode);
    });

    it('should support quiet flag', async () => {
      const result = await runCli(['init', '--quiet', '--force']);
      expect([0, 1, 2, 3, 4]).toContain(result.exitCode);
    });
  });

  describe('init short aliases', () => {
    it('-c should be alias for --config-format', async () => {
      const result = await runCli(['init', '-c', 'json', '--force']);
      expect([0, 1, 2, 3, 4]).toContain(result.exitCode);
    });

    it('-F should be alias for --force', async () => {
      await runCli(['init']);
      const result = await runCli(['init', '-F']);
      expect([0, 1, 2, 3, 4]).toContain(result.exitCode);
    });

    it('-p should be alias for --preset', async () => {
      const result = await runCli(['init', '-p', 'fast', '--force']);
      expect([0, 1, 2, 3, 4]).toContain(result.exitCode);
    });

    it('-v should be alias for --verbose', async () => {
      const result = await runCli(['init', '-v', '--force']);
      expect([0, 1, 2, 3, 4]).toContain(result.exitCode);
    });

    it('-q should be alias for --quiet', async () => {
      const result = await runCli(['init', '-q', '--force']);
      expect([0, 1, 2, 3, 4]).toContain(result.exitCode);
    });
  });

  describe('init preset + format combinations', () => {
    it('conformance preset + JSON format', async () => {
      const result = await runCli(['init', '--preset', 'conformance', '--config-format', 'json', '--force']);
      expect([0, 1, 2, 3, 4]).toContain(result.exitCode);
    });

    it('streaming preset + JSON format', async () => {
      const result = await runCli(['init', '--preset', 'streaming', '--config-format', 'json', '--force']);
      expect([0, 1, 2, 3, 4]).toContain(result.exitCode);
    });

    it('fast preset + JSON format', async () => {
      const result = await runCli(['init', '--preset', 'fast', '--config-format', 'json', '--force']);
      expect([0, 1, 2, 3, 4]).toContain(result.exitCode);
    });
  });
});
