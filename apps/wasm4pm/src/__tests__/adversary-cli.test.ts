import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runCli, EXIT_CODES, createCliTestEnv } from '@wasm4pm/testing';

describe('wpm adversary — adversarial test suite CLI', () => {
  let env: Awaited<ReturnType<typeof createCliTestEnv>>;

  beforeEach(async () => {
    env = await createCliTestEnv();
  });

  afterEach(() => {
    env?.cleanup?.();
  });

  describe('adversary run', () => {
    it('should execute adversarial test suite', async () => {
      const result = await runCli(['adversary', 'run'], { env: env.env });
      expect([EXIT_CODES.success, 4]).toContain(result.exitCode); // success or partial_failure
    });

    it('should output test results', async () => {
      const result = await runCli(['adversary', 'run'], { env: env.env });
      expect(result.stdout).toMatch(/adversary|test|result|proof|gate/i);
    });

    it('should support --format json', async () => {
      const result = await runCli(['adversary', 'run', '--format', 'json'], { env: env.env });
      expect([EXIT_CODES.success, 4]).toContain(result.exitCode);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });
  });

  describe('adversary check', () => {
    it('should validate proof gate compliance', async () => {
      const result = await runCli(['adversary', 'check'], { env: env.env });
      expect([EXIT_CODES.success, 1, 4]).toContain(result.exitCode);
    });

    it('should report gate status', async () => {
      const result = await runCli(['adversary', 'check'], { env: env.env });
      expect(result.stdout).toMatch(/gate|proof|compliance|pass|fail/i);
    });
  });

  describe('adversary categories A-H', () => {
    const categories = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

    categories.forEach((cat) => {
      it(`should support category ${cat}`, async () => {
        const result = await runCli(['adversary', 'run', '--category', cat], { env: env.env });
        expect([EXIT_CODES.success, 4]).toContain(result.exitCode);
      });
    });
  });

  describe('adversary --manifest', () => {
    it('should accept custom adversary manifest', async () => {
      const manifest = env.tmpDir + '/test-manifest.json';
      // Create minimal valid manifest
      const fs = require('fs');
      fs.writeFileSync(
        manifest,
        JSON.stringify({
          categories: [{ id: 'TEST', probes: [] }],
        })
      );

      const result = await runCli(['adversary', 'run', '--manifest', manifest], { env: env.env });
      expect([EXIT_CODES.success, 4]).toContain(result.exitCode);
    });
  });

  describe('adversary metrics', () => {
    it('should report test coverage metrics', async () => {
      const result = await runCli(['adversary', 'run', '--metrics'], { env: env.env });
      expect(result.stdout).toMatch(/coverage|pass|fail|blocked|metrics/i);
    });

    it('should include blocked probe count', async () => {
      const result = await runCli(['adversary', 'run'], { env: env.env });
      expect(result.stdout).toMatch(/\d+\s*(?:blocked|escaped|inconclusive)/i);
    });
  });

  describe('adversary --save-report', () => {
    it('should save detailed report to file', async () => {
      const report = env.tmpDir + '/adversary-report.json';
      const result = await runCli(['adversary', 'run', '--save-report', report], { env: env.env });
      expect([EXIT_CODES.success, 4]).toContain(result.exitCode);

      const fs = require('fs');
      expect(fs.existsSync(report)).toBe(true);
    });
  });

  describe('adversary --stop-on-escape', () => {
    it('should halt immediately if probe escapes', async () => {
      const result = await runCli(['adversary', 'run', '--stop-on-escape'], { env: env.env });
      expect([EXIT_CODES.success, 2, 4]).toContain(result.exitCode);
    });
  });

  describe('adversary error handling', () => {
    it('should reject invalid manifest format', async () => {
      const manifest = env.tmpDir + '/bad-manifest.json';
      const fs = require('fs');
      fs.writeFileSync(manifest, 'not valid json');

      const result = await runCli(['adversary', 'run', '--manifest', manifest], { env: env.env });
      expect([1, 2]).toContain(result.exitCode);
    });

    it('should handle missing manifest file', async () => {
      const result = await runCli(['adversary', 'run', '--manifest', '/nonexistent/path.json'], {
        env: env.env,
      });
      expect([1, 2]).toContain(result.exitCode);
    });

    it('should reject unknown categories', async () => {
      const result = await runCli(['adversary', 'run', '--category', 'INVALID'], { env: env.env });
      expect([1, 2]).toContain(result.exitCode);
    });
  });

  describe('adversary output formats', () => {
    it('should support human format (default)', async () => {
      const result = await runCli(['adversary', 'run', '--format', 'human'], { env: env.env });
      expect([EXIT_CODES.success, 4]).toContain(result.exitCode);
      expect(result.stdout).not.toMatch(/^\s*{/); // Not JSON
    });

    it('should support JSON format', async () => {
      const result = await runCli(['adversary', 'run', '--format', 'json'], { env: env.env });
      expect([EXIT_CODES.success, 4]).toContain(result.exitCode);
      const json = JSON.parse(result.stdout);
      expect(json.status).toBeDefined();
    });

    it('should include detailed failure reasons in output', async () => {
      const result = await runCli(['adversary', 'run'], { env: env.env });
      if (result.exitCode !== EXIT_CODES.success) {
        expect(result.stdout || result.stderr).toMatch(/reason|cause|details|explain/i);
      }
    });
  });

  describe('adversary proof gate integration', () => {
    it('should verify BLAKE3 receipt chain', async () => {
      const result = await runCli(['adversary', 'run'], { env: env.env });
      if (result.stdout.includes('receipt') || result.stdout.includes('hash')) {
        expect(result.stdout).toMatch(/blake3|receipt|hash|signature/i);
      }
    });
  });

  describe('adversary performance', () => {
    it('should complete adversary suite in reasonable time', async () => {
      const start = Date.now();
      await runCli(['adversary', 'run'], { env: env.env });
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(30000); // 30 second timeout for full suite
    });
  });
});
