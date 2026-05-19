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
      const result = await runCli(['config', 'show']);
      expect(result.exitCode).toBe(EXIT_CODES.success);
      expect(result.stdout).toMatch(/wasm4pm configuration/i);
      expect(result.stdout).toMatch(/source kind|algorithm|execution profile|output format/i);
    });

    it('should show provenance for each field', async () => {
      const result = await runCli(['config', 'show']);
      expect(result.exitCode).toBe(EXIT_CODES.success);
      expect(result.stdout).toMatch(/\[DEFAULT\]|\[ENV\]|\[TOML\]|\[JSON\]|\[CLI\]/);
    });

    it('should include environment variable names in output', async () => {
      const result = await runCli(['config', 'show']);
      expect(result.exitCode).toBe(EXIT_CODES.success);
      expect(result.stdout).toMatch(/WASM4PM_PROFILE|WASM4PM_ALGORITHM|WASM4PM_OUTPUT_FORMAT/);
    });

    it('should respect --format json flag', async () => {
      const result = await runCli(['config', 'show', '--format', 'json']);
      expect(result.exitCode).toBe(EXIT_CODES.success);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
      const json = JSON.parse(result.stdout);
      expect(json.payload).toBeDefined();
      expect(json.payload.config).toBeDefined();
      expect(json.payload.provenance).toBeDefined();
      expect(json.payload.warnings).toBeDefined();
    });

    it('should respect --quiet flag', async () => {
      const result = await runCli(['config', 'show', '--quiet']);
      expect(result.exitCode).toBe(EXIT_CODES.success);
    });
  });

  describe('config show --detailed', () => {
    it('should expand to show all 24+ environment variables', async () => {
      const result = await runCli(['config', 'show', '--detailed']);
      expect(result.exitCode).toBe(EXIT_CODES.success);
      expect(result.stdout).toMatch(/Available environment variables/i);
      expect(result.stdout).toMatch(/WASM4PM_PREDICTION|WASM4PM_ML|WASM4PM_RL/);
    });

    it('should show field constraints', async () => {
      const result = await runCli(['config', 'show', '--detailed']);
      expect(result.exitCode).toBe(EXIT_CODES.success);
      expect(result.stdout).toMatch(/fast|balanced|quality|stream/);
    });
  });

  describe('config show JSON output structure', () => {
    it('should have correct payload structure in JSON mode', async () => {
      const result = await runCli(['config', 'show', '--format', 'json']);
      expect(result.exitCode).toBe(EXIT_CODES.success);
      const json = JSON.parse(result.stdout);
      expect(json).toHaveProperty('status');
      expect(json).toHaveProperty('payload');
      expect(json.payload).toHaveProperty('config');
      expect(json.payload).toHaveProperty('provenance');
      expect(json.payload).toHaveProperty('warnings');
    });

    it('config.execution.profile should be valid', async () => {
      const result = await runCli(['config', 'show', '--format', 'json']);
      const json = JSON.parse(result.stdout);
      const profile = json.payload.config.execution.profile;
      expect(['fast', 'balanced', 'quality', 'stream']).toContain(profile);
    });

    it('config.output.format should be human or json', async () => {
      const result = await runCli(['config', 'show', '--format', 'json']);
      const json = JSON.parse(result.stdout);
      const format = json.payload.config.output.format;
      expect(['human', 'json']).toContain(format);
    });

    it('should have provenance entry for each config field', async () => {
      const result = await runCli(['config', 'show', '--format', 'json']);
      const json = JSON.parse(result.stdout);
      const prov = json.payload.provenance;
      expect(Object.keys(prov).length).toBeGreaterThan(0);
      for (const [, value] of Object.entries(prov)) {
        const v = value as any;
        expect(v).toHaveProperty('source');
        expect(['default', 'env', 'toml', 'json', 'cli']).toContain(v.source);
      }
    });
  });

  describe('config show missing required arguments', () => {
    it('config show has no required positional arguments', async () => {
      const result = await runCli(['config', 'show']);
      expect([EXIT_CODES.success]).toContain(result.exitCode);
    });
  });
});
