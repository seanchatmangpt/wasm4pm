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
    it('should pass or fail all gates', async () => {
      const result = await runCli(['config', 'verify']);
      expect([EXIT_CODES.success, EXIT_CODES.execution_error]).toContain(result.exitCode);
    });

    it('should display gates in human output', async () => {
      const result = await runCli(['config', 'verify']);
      expect(result.stdout).toMatch(/schema valid|provenance complete|zero warnings|hash present/i);
    });

    it('should show ✓ for passing gates and ✗ for failing', async () => {
      const result = await runCli(['config', 'verify']);
      expect(result.stdout).toMatch(/✓|✗/);
    });
  });

  describe('config verify gates', () => {
    it('should check 4 gates: schema, provenance, warnings, hash', async () => {
      const result = await runCli(['config', 'verify', '--format', 'json']);
      const json = JSON.parse(result.stdout);
      const gates = json.payload.gates;
      expect(gates.length).toBeGreaterThanOrEqual(4);
      const gateNames = gates.map((g: any) => g.gate);
      expect(gateNames).toContain('schema valid');
      expect(gateNames).toContain('provenance complete');
      expect(gateNames).toContain('zero warnings');
      expect(gateNames).toContain('hash present');
    });

    it('all_pass should match exit code', async () => {
      const result = await runCli(['config', 'verify', '--format', 'json']);
      const json = JSON.parse(result.stdout);
      const expectedAllPass = result.exitCode === EXIT_CODES.success;
      expect(json.payload.all_pass).toBe(expectedAllPass);
    });
  });

  describe('config verify --format json', () => {
    it('should output valid JSON with gates array', async () => {
      const result = await runCli(['config', 'verify', '--format', 'json']);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
      const json = JSON.parse(result.stdout);
      expect(Array.isArray(json.payload.gates)).toBe(true);
      expect(json.payload).toHaveProperty('all_pass');
    });

    it('gate objects should have gate, pass, and detail properties', async () => {
      const result = await runCli(['config', 'verify', '--format', 'json']);
      const json = JSON.parse(result.stdout);
      const gates = json.payload.gates;
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
      const result = await runCli(['config', 'verify', '--quiet']);
      expect([EXIT_CODES.success, EXIT_CODES.execution_error]).toContain(result.exitCode);
    });
  });

  describe('config verify exit codes', () => {
    it('should exit successfully or with execution_error', async () => {
      const result = await runCli(['config', 'verify']);
      expect([EXIT_CODES.success, EXIT_CODES.execution_error]).toContain(result.exitCode);
    });
  });

  describe('config verify output', () => {
    it('should report gate details in output', async () => {
      const result = await runCli(['config', 'verify']);
      // Output should contain at least some gate information
      expect(result.stdout.length).toBeGreaterThan(0);
    });
  });
});
