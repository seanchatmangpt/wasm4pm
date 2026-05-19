import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  runCli,
  assertExitCode,
  assertJsonOutput,
  EXIT_CODES,
  createCliTestEnv,
} from '@wasm4pm/testing';
import { execSync } from 'child_process';

describe('wpm doctor — system health diagnostics CLI', () => {
  let env: Awaited<ReturnType<typeof createCliTestEnv>>;

  beforeEach(async () => {
    env = await createCliTestEnv();
  });

  afterEach(() => {
    env?.cleanup?.();
  });

  describe('doctor (default summary)', () => {
    it('should exit 0 on healthy system', async () => {
      const result = await runCli(['doctor'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
    });

    it('should output human-readable status by default', async () => {
      const result = await runCli(['doctor'], { env: env.env });
      expect(result.stdout).toMatch(/status|health|system|diagnostics|checks/i);
    });

    it('should include check count in output', async () => {
      const result = await runCli(['doctor'], { env: env.env });
      expect(result.stdout).toMatch(/\d+\s*(?:checks|items|tests)/i);
    });

    it('should use JSON format when requested', async () => {
      const result = await runCli(['doctor', '--format', 'json'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      const json = JSON.parse(result.stdout);
      expect(json.status).toBeDefined();
    });
  });

  describe('doctor check <category>', () => {
    it('doctor check wasm should verify WASM binary availability', async () => {
      const result = await runCli(['doctor', 'check', 'wasm'], { env: env.env });
      expect([0, 1, 2, 3]).toContain(result.exitCode);
      expect(result.stdout).toMatch(/wasm|binary|module/i);
    });

    it('doctor check config should validate config resolution', async () => {
      const result = await runCli(['doctor', 'check', 'config'], { env: env.env });
      expect([EXIT_CODES.success, 1, 2]).toContain(result.exitCode);
      expect(result.stdout).toMatch(/config|schema|validation|toml|json/i);
    });

    it('doctor check dependencies should verify npm/cargo dependencies', async () => {
      const result = await runCli(['doctor', 'check', 'dependencies'], { env: env.env });
      expect([0, 1, 2, 3]).toContain(result.exitCode);
      expect(result.stdout).toMatch(/pnpm|cargo|packages|crates/i);
    });

    it('doctor check observability should validate OTEL setup', async () => {
      const result = await runCli(['doctor', 'check', 'observability'], { env: env.env });
      expect([EXIT_CODES.success, 1]).toContain(result.exitCode);
      expect(result.stdout).toMatch(/otel|tracing|spans|instrumentation/i);
    });

    it('doctor check cache should report cache status', async () => {
      const result = await runCli(['doctor', 'check', 'cache'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      expect(result.stdout).toMatch(/cache|memory|lru/i);
    });

    it('doctor check environment should verify NODE_ENV and critical vars', async () => {
      const result = await runCli(['doctor', 'check', 'environment'], { env: env.env });
      expect([0, 1, 2, 3]).toContain(result.exitCode);
      expect(result.stdout).toMatch(/node|environment|variables|paths/i);
    });

    it('doctor check disk should verify disk space availability', async () => {
      const result = await runCli(['doctor', 'check', 'disk'], { env: env.env });
      expect([0, 1, 2, 3]).toContain(result.exitCode);
      expect(result.stdout).toMatch(/disk|space|filesystem|available/i);
    });

    it('doctor check typescript should verify TypeScript compilation', async () => {
      const result = await runCli(['doctor', 'check', 'typescript'], { env: env.env });
      expect([0, 1, 2]).toContain(result.exitCode);
      expect(result.stdout).toMatch(/typescript|tsc|compilation|errors/i);
    });

    it('doctor check performance should measure algorithm performance', async () => {
      const result = await runCli(['doctor', 'check', 'performance'], { env: env.env });
      expect([0, 1, 2, 3]).toContain(result.exitCode);
      expect(result.stdout).toMatch(/performance|speed|duration|ms/i);
    });

    it('doctor check versions should report version strings', async () => {
      const result = await runCli(['doctor', 'check', 'versions'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      expect(result.stdout).toMatch(/version|v\d+\.\d+\.\d+|node|npm/i);
    });
  });

  describe('doctor analyze', () => {
    it('should run deep diagnostics with analyze subcommand', async () => {
      const result = await runCli(['doctor', 'analyze'], { env: env.env });
      expect([0, 1, 2, 3]).toContain(result.exitCode);
      expect(result.stdout).toMatch(/analyze|diagnosis|assessment|report/i);
    });

    it('should output detailed findings', async () => {
      const result = await runCli(['doctor', 'analyze'], { env: env.env });
      expect(result.stdout.length).toBeGreaterThan(200);
    });
  });

  describe('doctor fix', () => {
    it('should suggest fixes for detected issues', async () => {
      const result = await runCli(['doctor', 'fix'], { env: env.env });
      expect([0, 1, 2, 3]).toContain(result.exitCode);
      expect(result.stdout).toMatch(/fix|repair|suggest|solution|remedy/i);
    });
  });

  describe('doctor export', () => {
    it('should export diagnostics to JSON file', async () => {
      const result = await runCli(
        ['doctor', 'export', '--output', env.tmpDir + '/doctor-export.json'],
        { env: env.env }
      );
      expect([0, 1, 2, 3]).toContain(result.exitCode);
      expect(result.stdout).toMatch(/export|save|written/i);
    });
  });

  describe('doctor --continuous', () => {
    it('should support continuous monitoring mode', async () => {
      const result = await runCli(['doctor', '--continuous', '--interval', '100'], {
        env: env.env,
        timeout: 500,
      });
      expect([EXIT_CODES.success, 1]).toContain(result.exitCode);
    });
  });

  describe('doctor --json output structure', () => {
    it('should return valid JSON structure', async () => {
      const result = await runCli(['doctor', '--format', 'json'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      const json = JSON.parse(result.stdout);
      expect(json).toHaveProperty('status');
      expect(['ok', 'degraded', 'failed']).toContain(json.status);
    });

    it('should include check results in JSON', async () => {
      const result = await runCli(['doctor', '--format', 'json'], { env: env.env });
      const json = JSON.parse(result.stdout);
      expect(json.payload).toBeDefined();
    });

    it('should report check timestamps', async () => {
      const result = await runCli(['doctor', '--format', 'json'], { env: env.env });
      const json = JSON.parse(result.stdout);
      expect(json.payload.timestamp).toBeDefined();
    });
  });

  describe('doctor error handling', () => {
    it('should handle invalid subcommand gracefully', async () => {
      const result = await runCli(['doctor', 'invalid-subcommand'], { env: env.env });
      expect([1, 2, 3]).toContain(result.exitCode);
      expect(result.stderr || result.stdout).toMatch(/unknown|invalid|subcommand/i);
    });

    it('should handle missing required arguments', async () => {
      const result = await runCli(['doctor', 'check'], { env: env.env });
      expect([1, 2, 3]).toContain(result.exitCode);
      expect(result.stderr || result.stdout).toMatch(/category|argument|required/i);
    });

    it('should recover from transient failures', async () => {
      const result1 = await runCli(['doctor', 'check', 'cache'], { env: env.env });
      const result2 = await runCli(['doctor', 'check', 'cache'], { env: env.env });
      expect([0, 1, 2, 3]).toContain(result1.exitCode);
      expect([0, 1, 2, 3]).toContain(result2.exitCode);
    });
  });

  describe('doctor performance', () => {
    it('should complete summary check in <1s', async () => {
      const start = Date.now();
      await runCli(['doctor'], { env: env.env });
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(1000);
    });

    it('should complete analyze in <5s', async () => {
      const start = Date.now();
      await runCli(['doctor', 'analyze'], { env: env.env });
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(5000);
    });
  });
});
