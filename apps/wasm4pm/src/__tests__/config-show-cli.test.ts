import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runCli, EXIT_CODES, createCliTestEnv } from '@wasm4pm/testing';

describe('wpm config show — display configuration with sources', () => {
  let env: Awaited<ReturnType<typeof createCliTestEnv>>;

  beforeEach(async () => {
    env = await createCliTestEnv();
  });

  afterEach(() => {
    env?.cleanup?.();
  });

  describe('config show (basic)', () => {
    it('should display default configuration on success', async () => {
      const result = await runCli(['config', 'show'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      expect(result.stdout).toMatch(/wasm4pm configuration/i);
      expect(result.stdout).toMatch(/source kind|algorithm|execution profile/i);
    });

    it('should show provenance for each field', async () => {
      const result = await runCli(['config', 'show'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      expect(result.stdout).toMatch(/\[DEFAULT\]|\[ENV\]|\[TOML\]|\[JSON\]|\[CLI\]/);
    });

    it('should include environment variable notes in output', async () => {
      const result = await runCli(['config', 'show'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      expect(result.stdout).toMatch(/WASM4PM_PROFILE|WASM4PM_ALGORITHM|WASM4PM_OUTPUT_FORMAT/);
    });

    it('should respect --format json flag', async () => {
      const result = await runCli(['config', 'show', '--format', 'json'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
      const json = JSON.parse(result.stdout);
      expect(json.payload).toBeDefined();
      expect(json.payload.config).toBeDefined();
      expect(json.payload.provenance).toBeDefined();
    });

    it('should respect --quiet flag', async () => {
      const result = await runCli(['config', 'show', '--quiet'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
    });
  });

  describe('config show --detailed', () => {
    it('should expand to show all 24+ environment variables', async () => {
      const result = await runCli(['config', 'show', '--detailed'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      expect(result.stdout).toMatch(/Available environment variables/i);
      expect(result.stdout).toMatch(/WASM4PM_PREDICTION_TASKS|WASM4PM_ML_ENABLED|WASM4PM_RL_ENABLED/);
    });

    it('should show field constraints (fast|balanced|quality|stream, etc.)', async () => {
      const result = await runCli(['config', 'show', '--detailed'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      expect(result.stdout).toMatch(/fast|balanced|quality|stream|human|json/);
    });
  });

  describe('config show ENV precedence', () => {
    it('should reflect ENV variable values with [ENV] source tag', async () => {
      const customEnv = { ...env.env, WASM4PM_PROFILE: 'quality' };
      const result = await runCli(['config', 'show'], { env: customEnv });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      expect(result.stdout).toMatch(/quality/);
      expect(result.stdout).toMatch(/\[ENV\]/);
    });

    it('should show WASM4PM_ALGORITHM override with [ENV] tag', async () => {
      const customEnv = { ...env.env, WASM4PM_ALGORITHM: 'genetic_algorithm' };
      const result = await runCli(['config', 'show'], { env: customEnv });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      expect(result.stdout).toMatch(/genetic_algorithm/);
    });
  });

  describe('config show JSON output structure', () => {
    it('should have correct payload structure in JSON mode', async () => {
      const result = await runCli(['config', 'show', '--format', 'json'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      const json = JSON.parse(result.stdout);
      expect(json).toHaveProperty('status');
      expect(json).toHaveProperty('payload');
      expect(json.payload).toHaveProperty('config');
      expect(json.payload).toHaveProperty('provenance');
      expect(json.payload).toHaveProperty('warnings');
    });

    it('config.execution.profile should be valid', async () => {
      const result = await runCli(['config', 'show', '--format', 'json'], { env: env.env });
      const json = JSON.parse(result.stdout);
      const profile = json.payload.config.execution.profile;
      expect(['fast', 'balanced', 'quality', 'stream']).toContain(profile);
    });

    it('config.output.format should be human or json', async () => {
      const result = await runCli(['config', 'show', '--format', 'json'], { env: env.env });
      const json = JSON.parse(result.stdout);
      const format = json.payload.config.output.format;
      expect(['human', 'json']).toContain(format);
    });
  });
});
