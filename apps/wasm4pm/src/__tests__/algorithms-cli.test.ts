import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runCli, EXIT_CODES, createCliTestEnv } from '@wasm4pm/testing';

describe('wpm algorithms — algorithm registry CLI', () => {
  let env: Awaited<ReturnType<typeof createCliTestEnv>>;

  beforeEach(async () => {
    env = await createCliTestEnv();
  });

  afterEach(() => {
    env?.cleanup?.();
  });

  describe('algorithms (list)', () => {
    it('should list all registered algorithms', async () => {
      const result = await runCli(['algorithms'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      expect(result.stdout).toMatch(/algorithm|dfg|alpha|heuristic|petri|tree/i);
    });

    it('should show at least 30 algorithms', async () => {
      const result = await runCli(['algorithms'], { env: env.env });
      const lines = result.stdout.split('\n').length;
      expect(lines).toBeGreaterThan(30);
    });

    it('should include algorithm metadata', async () => {
      const result = await runCli(['algorithms'], { env: env.env });
      expect(result.stdout).toMatch(/speed|quality|output|type/i);
    });
  });

  describe('algorithms --filter', () => {
    it('should filter by discovery category', async () => {
      const result = await runCli(['algorithms', '--filter', 'discovery'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      expect(result.stdout).toMatch(/dfg|alpha|heuristic|inductive/i);
    });

    it('should filter by ML category', async () => {
      const result = await runCli(['algorithms', '--filter', 'ml'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      expect(result.stdout).toMatch(/classify|cluster|forecast|anomaly|regress|pca/i);
    });

    it('should filter by conformance category', async () => {
      const result = await runCli(['algorithms', '--filter', 'conformance'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
    });
  });

  describe('algorithms --profile', () => {
    const profiles = ['mobile', 'iot', 'edge', 'fog', 'browser'];

    profiles.forEach((profile) => {
      it(`should list algorithms for ${profile} profile`, async () => {
        const result = await runCli(['algorithms', '--profile', profile], { env: env.env });
        expect([EXIT_CODES.success, 0]).toContain(result.exitCode);
        expect(result.stdout.length).toBeGreaterThan(0);
      });
    });
  });

  describe('algorithms --json', () => {
    it('should output JSON format', async () => {
      const result = await runCli(['algorithms', '--format', 'json'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      const json = JSON.parse(result.stdout);
      expect(
        Array.isArray(json.algorithms) ||
          Array.isArray(json.payload?.algorithms) ||
          Array.isArray(json)
      ).toBe(true);
    });

    it('should include algorithm properties', async () => {
      const result = await runCli(['algorithms', '--format', 'json'], { env: env.env });
      const json = JSON.parse(result.stdout);
      const algos = Array.isArray(json) ? json : json.algorithms || json.payload?.algorithms || [];
      if (algos.length > 0) {
        expect(algos[0]).toHaveProperty('id');
        expect(algos[0]).toHaveProperty('name');
      }
    });
  });

  describe('algorithms --details', () => {
    it('should show detailed information with --details flag', async () => {
      const result = await runCli(['algorithms', '--details'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      expect(result.stdout.length).toBeGreaterThan(500); // More verbose output
    });
  });

  describe('algorithms --search', () => {
    it('should search by name pattern', async () => {
      const result = await runCli(['algorithms', '--search', 'dfg'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      expect(result.stdout).toMatch(/dfg/i);
    });

    it('should search by category', async () => {
      const result = await runCli(['algorithms', '--search', 'discovery'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
    });
  });

  describe('algorithms --sort', () => {
    it('should sort by speed', async () => {
      const result = await runCli(['algorithms', '--sort', 'speed'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
    });

    it('should sort by quality', async () => {
      const result = await runCli(['algorithms', '--sort', 'quality'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
    });

    it('should sort by name', async () => {
      const result = await runCli(['algorithms', '--sort', 'name'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
    });
  });

  describe('algorithms --parameters', () => {
    it('should show algorithm parameters when requested', async () => {
      const result = await runCli(['algorithms', '--parameters'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      expect(result.stdout).toMatch(/parameter|arg|option|config/i);
    });
  });

  describe('algorithms registry validation', () => {
    it('should have consistent algorithm IDs', async () => {
      const result = await runCli(['algorithms', '--format', 'json'], { env: env.env });
      const json = JSON.parse(result.stdout);
      const algos = Array.isArray(json) ? json : json.algorithms || json.payload?.algorithms || [];

      const ids = algos.map((a: any) => a.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length); // All IDs should be unique
    });

    it('should have valid speed and quality scores', async () => {
      const result = await runCli(['algorithms', '--format', 'json'], { env: env.env });
      const json = JSON.parse(result.stdout);
      const algos = Array.isArray(json) ? json : json.algorithms || json.payload?.algorithms || [];

      algos.forEach((algo: any) => {
        if (algo.speed !== undefined) expect(algo.speed).toBeGreaterThanOrEqual(0);
        if (algo.quality !== undefined) expect(algo.quality).toBeGreaterThanOrEqual(0);
      });
    });
  });

  describe('algorithms error handling', () => {
    it('should handle invalid profile gracefully', async () => {
      const result = await runCli(['algorithms', '--profile', 'invalid'], { env: env.env });
      expect([1, 2]).toContain(result.exitCode);
    });

    it('should handle invalid filter', async () => {
      const result = await runCli(['algorithms', '--filter', 'nonexistent'], { env: env.env });
      expect([1, 2]).toContain(result.exitCode);
    });
  });

  describe('algorithms performance', () => {
    it('should complete listing in <500ms', async () => {
      const start = Date.now();
      await runCli(['algorithms'], { env: env.env });
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(500);
    });
  });
});
