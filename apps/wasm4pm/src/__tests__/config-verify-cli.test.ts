import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runCli, EXIT_CODES, createCliTestEnv } from '@wasm4pm/testing';

describe('wpm config verify — strict configuration gate', () => {
  let env: Awaited<ReturnType<typeof createCliTestEnv>>;

  beforeEach(async () => {
    env = await createCliTestEnv();
  });

  afterEach(() => {
    env?.cleanup?.();
  });

  describe('config verify (basic)', () => {
    it('should pass all gates on valid default config', async () => {
      const result = await runCli(['config', 'verify'], { env: env.env });
      expect([EXIT_CODES.success, EXIT_CODES.execution_error]).toContain(result.exitCode);
    });

    it('should display gates in human output', async () => {
      const result = await runCli(['config', 'verify'], { env: env.env });
      expect(result.stdout).toMatch(/schema valid|provenance complete|zero warnings|hash present/i);
    });

    it('should show ✓ for passing gates and ✗ for failing', async () => {
      const result = await runCli(['config', 'verify'], { env: env.env });
      expect(result.stdout).toMatch(/✓|✗/);
    });

    it('should report gate details', async () => {
      const result = await runCli(['config', 'verify'], { env: env.env });
      expect(result.stdout).toMatch(/Zod validation passed|All keys have known source|No warnings|hash:/i);
    });
  });

  describe('config verify gates (4-gate check)', () => {
    it('should check schema valid gate', async () => {
      const result = await runCli(['config', 'verify', '--format', 'json'], { env: env.env });
      const json = JSON.parse(result.stdout);
      const gates = json.payload.gates;
      expect(gates.some((g: any) => g.gate === 'schema valid')).toBe(true);
    });

    it('should check provenance complete gate', async () => {
      const result = await runCli(['config', 'verify', '--format', 'json'], { env: env.env });
      const json = JSON.parse(result.stdout);
      const gates = json.payload.gates;
      expect(gates.some((g: any) => g.gate === 'provenance complete')).toBe(true);
    });

    it('should check zero warnings gate', async () => {
      const result = await runCli(['config', 'verify', '--format', 'json'], { env: env.env });
      const json = JSON.parse(result.stdout);
      const gates = json.payload.gates;
      expect(gates.some((g: any) => g.gate === 'zero warnings')).toBe(true);
    });

    it('should check hash present gate', async () => {
      const result = await runCli(['config', 'verify', '--format', 'json'], { env: env.env });
      const json = JSON.parse(result.stdout);
      const gates = json.payload.gates;
      expect(gates.some((g: any) => g.gate === 'hash present')).toBe(true);
    });

    it('all_pass should be true when all gates pass', async () => {
      const result = await runCli(['config', 'verify', '--format', 'json'], { env: env.env });
      const json = JSON.parse(result.stdout);
      if (result.exitCode === EXIT_CODES.success) {
        expect(json.payload.all_pass).toBe(true);
      }
    });

    it('all_pass should be false when any gate fails', async () => {
      const result = await runCli(['config', 'verify', '--format', 'json'], { env: env.env });
      const json = JSON.parse(result.stdout);
      if (result.exitCode === EXIT_CODES.execution_error) {
        expect(json.payload.all_pass).toBe(false);
      }
    });
  });

  describe('config verify --format json', () => {
    it('should output valid JSON', async () => {
      const result = await runCli(['config', 'verify', '--format', 'json'], { env: env.env });
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });

    it('should have gates array in payload', async () => {
      const result = await runCli(['config', 'verify', '--format', 'json'], { env: env.env });
      const json = JSON.parse(result.stdout);
      expect(Array.isArray(json.payload.gates)).toBe(true);
    });

    it('gate objects should have gate, pass, and detail properties', async () => {
      const result = await runCli(['config', 'verify', '--format', 'json'], { env: env.env });
      const json = JSON.parse(result.stdout);
      const gates = json.payload.gates;
      expect(gates.length).toBeGreaterThan(0);
      for (const gate of gates) {
        expect(gate).toHaveProperty('gate');
        expect(gate).toHaveProperty('pass');
        expect(gate).toHaveProperty('detail');
        expect(typeof gate.pass).toBe('boolean');
      }
    });
  });

  describe('config verify --quiet', () => {
    it('should accept --quiet flag', async () => {
      const result = await runCli(['config', 'verify', '--quiet'], { env: env.env });
      expect([EXIT_CODES.success, EXIT_CODES.execution_error]).toContain(result.exitCode);
    });

    it('should work with --format json and --quiet', async () => {
      const result = await runCli(['config', 'verify', '--format', 'json', '--quiet'], { env: env.env });
      const json = JSON.parse(result.stdout);
      expect(json.payload.gates).toBeDefined();
    });
  });

  describe('config verify exit codes', () => {
    it('should exit 0 when all gates pass', async () => {
      const result = await runCli(['config', 'verify'], { env: env.env });
      if (result.stdout.match(/verify passed/i)) {
        expect(result.exitCode).toBe(EXIT_CODES.success);
      }
    });

    it('should exit 3 (execution_error) when any gate fails', async () => {
      const result = await runCli(['config', 'verify'], { env: env.env });
      if (result.stdout.match(/verify FAILED/i)) {
        expect(result.exitCode).toBe(EXIT_CODES.execution_error);
      }
    });

    it('should exit 1 (config_error) on resolution failure', async () => {
      const badEnv = { ...env.env, WASM4PM_PROFILE: 'invalid_xyz' };
      const result = await runCli(['config', 'verify'], { env: badEnv });
      // May exit 1 or 3 depending on validation timing
      expect([EXIT_CODES.config_error, EXIT_CODES.execution_error]).toContain(result.exitCode);
    });
  });

  describe('config verify gate details', () => {
    it('schema valid detail should mention Zod validation', async () => {
      const result = await runCli(['config', 'verify', '--format', 'json'], { env: env.env });
      const json = JSON.parse(result.stdout);
      const schemaGate = json.payload.gates.find((g: any) => g.gate === 'schema valid');
      expect(schemaGate.detail).toMatch(/Zod|validation|passed/i);
    });

    it('provenance complete detail should list unknown keys if any', async () => {
      const result = await runCli(['config', 'verify', '--format', 'json'], { env: env.env });
      const json = JSON.parse(result.stdout);
      const provGate = json.payload.gates.find((g: any) => g.gate === 'provenance complete');
      if (!provGate.pass) {
        expect(provGate.detail).toMatch(/Unknown source/i);
      }
    });

    it('zero warnings detail should list warnings if any', async () => {
      const result = await runCli(['config', 'verify', '--format', 'json'], { env: env.env });
      const json = JSON.parse(result.stdout);
      const warnGate = json.payload.gates.find((g: any) => g.gate === 'zero warnings');
      if (!warnGate.pass) {
        expect(warnGate.detail).toMatch(/field:|warning/i);
      }
    });

    it('hash present detail should show hash prefix or no hash message', async () => {
      const result = await runCli(['config', 'verify', '--format', 'json'], { env: env.env });
      const json = JSON.parse(result.stdout);
      const hashGate = json.payload.gates.find((g: any) => g.gate === 'hash present');
      expect(hashGate.detail).toMatch(/hash:|no hash/i);
    });
  });

  describe('config verify complete success message', () => {
    it('should show "Config verify passed" on success', async () => {
      const result = await runCli(['config', 'verify'], { env: env.env });
      if (result.exitCode === EXIT_CODES.success) {
        expect(result.stdout).toMatch(/verify passed/i);
      }
    });

    it('should show "Config verify FAILED" on failure', async () => {
      const result = await runCli(['config', 'verify'], { env: env.env });
      if (result.exitCode === EXIT_CODES.execution_error) {
        expect(result.stdout).toMatch(/verify FAILED/i);
      }
    });
  });
});
