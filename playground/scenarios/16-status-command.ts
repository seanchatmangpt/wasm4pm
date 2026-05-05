/**
 * Scenario: status command — wpm status
 *
 * Tests the system health and WASM module status endpoint.
 * Uses real WASM — no mocks.
 *
 * Key contracts verified:
 *   - wpm status exits 0 (success)
 *   - JSON output contains engine, system, memory sections
 *   - engine.wasmLoaded is true
 *   - engine.state is "ready"
 *   - system fields (platform, arch, nodeVersion) are present
 *   - memory fields (heapUsed, heapTotal, rss) are numbers
 *   - WASM version field exists
 *
 * NOTE: Human output tests are limited because consola filters log-level
 *       messages in child process capture. Only JSON output is fully verifiable.
 *
 * Binary: apps/wasm4pm/dist/bin/wpm.js (must be built first)
 */

import { describe, it, expect } from 'vitest';
import { assertExitCode, wasm4pm, extractJson, EXIT_CODES } from '../helpers/cli.js';

describe('status command', () => {
  // ── JSON output ───────────────────────────────────────────────────────────

  describe('JSON output', () => {
    it('exits 0 and returns valid JSON', async () => {
      const result = await wpm(['status', '--format', 'json']);
      assertExitCode(result, EXIT_CODES.SUCCESS);
      const json = extractJson(result.stdout);
      expect(json).toBeDefined();
    });

    it('contains engine section with wasmLoaded=true', async () => {
      const result = await wpm(['status', '--format', 'json']);
      const json = extractJson(result.stdout);
      const engine = json.engine as Record<string, unknown>;

      expect(engine).toBeDefined();
      expect(engine.wasmLoaded).toBe(true);
      expect(engine.state).toBe('ready');
      expect(engine.kernelReady).toBe(true);
    });

    it('contains system section with platform info', async () => {
      const result = await wpm(['status', '--format', 'json']);
      const json = extractJson(result.stdout);
      const system = json.system as Record<string, unknown>;

      expect(system).toBeDefined();
      expect(typeof system.platform).toBe('string');
      expect(typeof system.arch).toBe('string');
      expect(typeof system.nodeVersion).toBe('string');
      expect(typeof system.uptime).toBe('number');
      expect((system.uptime as number)).toBeGreaterThanOrEqual(0);
    });

    it('contains memory section with numeric fields in MB', async () => {
      const result = await wpm(['status', '--format', 'json']);
      const json = extractJson(result.stdout);
      const memory = json.memory as Record<string, unknown>;

      expect(memory).toBeDefined();
      expect(typeof memory.heapUsed).toBe('number');
      expect(typeof memory.heapTotal).toBe('number');
      expect(typeof memory.rss).toBe('number');
      expect(typeof memory.external).toBe('number');
      // Memory should be positive
      expect((memory.heapUsed as number)).toBeGreaterThan(0);
      expect((memory.heapTotal as number)).toBeGreaterThan(0);
    });

    it('includes WASM version when available', async () => {
      const result = await wpm(['status', '--format', 'json']);
      const json = extractJson(result.stdout);
      const engine = json.engine as Record<string, unknown>;

      // version may be null if WASM doesn't expose it, but the key should exist
      expect('version' in engine).toBe(true);
    });
  });

  // ── Default behavior ──────────────────────────────────────────────────────

  describe('default behavior', () => {
    it('exits 0 without --format flag', async () => {
      const result = await wpm(['status']);
      assertExitCode(result, EXIT_CODES.SUCCESS);
    });

    it('produces output (not empty) in default format', async () => {
      const result = await wpm(['status']);
      assertExitCode(result, EXIT_CODES.SUCCESS);
      // Combined output should have WASM init messages at minimum
      const out = result.stdout + result.stderr;
      expect(out.length).toBeGreaterThan(0);
    });
  });
});
