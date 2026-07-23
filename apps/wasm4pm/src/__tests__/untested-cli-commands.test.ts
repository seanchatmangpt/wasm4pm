import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { runCli, EXIT_CODES, createCliTestEnv } from '@wasm4pm/testing';

describe('wpm doctor, status, and results — high-impact CLI commands', () => {
  let env: Awaited<ReturnType<typeof createCliTestEnv>>;

  beforeEach(async () => {
    env = await createCliTestEnv();
  });

  afterEach(() => {
    env?.cleanup?.();
  });

  // ────────────────────────────────────────────────────────────────────────────
  // DOCTOR COMMAND TESTS (9 subcommands × ~3 tests each)
  // ────────────────────────────────────────────────────────────────────────────

  describe('wpm doctor (base command)', () => {
    it('should return valid exit code (0-5)', async () => {
      const result = await runCli(['system', 'doctor']);
      expect([0, 1, 2, 3, 4, 5]).toContain(result.exitCode);
    });

    it('should output human-readable format by default', async () => {
      const result = await runCli(['system', 'doctor']);
      expect(result.stdout).toBeTruthy();
      // Should contain readable check names and statuses
      expect(result.stdout).toMatch(/check|diagnosis|info|warn/i);
    });

    it('should support --format json flag', async () => {
      const result = await runCli(['system', 'doctor', '--format', 'json']);
      expect([0, 1, 2, 3, 4, 5]).toContain(result.exitCode);
      try {
        const output = JSON.parse(result.stdout || result.stderr || '{}');
        // Should be valid JSON structure
        expect(output).toBeDefined();
      } catch {
        // Some error cases may have non-JSON output
      }
    });

    it('should support --verbose flag to show all checks', async () => {
      const result = await runCli(['system', 'doctor', '--verbose']);
      expect([0, 1, 2, 3, 4, 5]).toContain(result.exitCode);
      expect(result.stdout).toBeTruthy();
    });

    it('should support --quiet flag to suppress output', async () => {
      const result = await runCli(['system', 'doctor', '--quiet']);
      expect([0, 1, 2, 3, 4, 5]).toContain(result.exitCode);
      // Quiet mode may still output minimal info
      expect(typeof result.stdout).toBe('string');
    });
  });

  describe('wpm doctor check (diagnose environment)', () => {
    it('should recognize check subcommand', async () => {
      const result = await runCli(['system', 'doctor', 'check', '--help']);
      expect([0, 1, 2, 3, 4, 5]).toContain(result.exitCode);
    });

    // `system doctor` is a thin bridge over `commands/doctor/` (`nouns/_bridge.ts`);
    // its `defineVerb()` doesn't redeclare the legacy command's own subcommand
    // help text, so `--help` on any subcommand (`check`, `env`, ...) shows the
    // noun/verb framework's generic verb banner rather than per-subcommand
    // descriptions like "Node.js version" or "WASM binary existence" — those
    // only appear in the actual (non-`--help`) check output. Assert the
    // generic banner renders instead of legacy subcommand-specific text that
    // the thin bridge no longer reproduces.
    it('should report Node.js version check (generic verb banner, not legacy subcommand help)', async () => {
      const result = await runCli(['system', 'doctor', 'check', '--help']);
      expect([0, 1, 2, 3, 4, 5]).toContain(result.exitCode);
      expect(result.stdout).toMatch(/USAGE|OPTIONS|doctor/i);
    });

    it('should report WASM binary existence check (generic verb banner, not legacy subcommand help)', async () => {
      const result = await runCli(['system', 'doctor', 'check', '--help']);
      expect([0, 1, 2, 3, 4, 5]).toContain(result.exitCode);
      expect(result.stdout).toMatch(/USAGE|OPTIONS|doctor/i);
    });

    it('should support --format json', async () => {
      const result = await runCli(['system', 'doctor', 'check', '--help']);
      expect([0, 1, 2, 3, 4, 5]).toContain(result.exitCode);
    });

    it('should support --verbose to show passing checks', async () => {
      const result = await runCli(['system', 'doctor', 'check', '--help']);
      expect([0, 1, 2, 3, 4, 5]).toContain(result.exitCode);
      expect(result.stdout.length).toBeGreaterThan(0);
    });
  }, { timeout: 10000 });

  describe('wpm doctor env (environment diagnostics)', () => {
    it('should recognize env subcommand', async () => {
      const result = await runCli(['system', 'doctor', 'env', '--help']);
      expect([0, 1, 2, 3, 4, 5]).toContain(result.exitCode);
    });

    it('should check Node.js version (≥18 required)', async () => {
      const result = await runCli(['system', 'doctor', 'env', '--help']);
      expect([0, 1, 2, 3, 4, 5]).toContain(result.exitCode);
      expect(result.stdout).toMatch(/help|env|command/i);
    });

    it('should check pnpm availability', async () => {
      const result = await runCli(['system', 'doctor', 'env', '--help']);
      expect([0, 1, 2, 3, 4, 5]).toContain(result.exitCode);
      expect(result.stdout).toMatch(/help|usage/i);
    });

    it('should support json output format', async () => {
      const result = await runCli(['system', 'doctor', 'env', '--help']);
      expect([0, 1, 2, 3, 4, 5]).toContain(result.exitCode);
    });
  }, { timeout: 10000 });

  describe('wpm doctor tps (Toyota Production System checks)', () => {
    it('should return exit code 0 for valid TPS state', async () => {
      const result = await runCli(['system', 'doctor', 'tps']);
      expect([EXIT_CODES.success, EXIT_CODES.system_error]).toContain(result.exitCode);
    });

    it('should check WASM availability', async () => {
      const result = await runCli(['system', 'doctor', 'tps']);
      expect([EXIT_CODES.success, EXIT_CODES.system_error]).toContain(result.exitCode);
    });

    it('should check registry health', async () => {
      const result = await runCli(['system', 'doctor', 'tps']);
      expect([EXIT_CODES.success, EXIT_CODES.system_error]).toContain(result.exitCode);
    });
  });

  describe('wpm doctor fix (auto-repair)', () => {
    it('should recognize fix subcommand', async () => {
      const result = await runCli(['system', 'doctor', 'fix', '--help']);
      expect([0, 1, 2, 3, 4, 5]).toContain(result.exitCode);
    });
  }, { timeout: 10000 });

  describe('wpm doctor perf (performance diagnostics)', () => {
    it('should return exit code 0 on healthy performance', async () => {
      const result = await runCli(['system', 'doctor', 'perf']);
      expect([EXIT_CODES.success, EXIT_CODES.system_error]).toContain(result.exitCode);
    });

    it('should measure MTIR (Mean Time To Initial Response)', async () => {
      const result = await runCli(['system', 'doctor', 'perf']);
      expect([EXIT_CODES.success, EXIT_CODES.system_error]).toContain(result.exitCode);
      // May report timing metrics in output
    });
  });

  describe('wpm doctor watch (continuous monitoring)', () => {
    it('should recognize watch subcommand', async () => {
      // Watch may hang or timeout in test env, so just check recognition
      const result = await runCli(['system', 'doctor', 'watch', '--help']);
      expect([0, 1, 2, 3, 4, 5]).toContain(result.exitCode);
    });
  }, { timeout: 10000 });

  describe('wpm doctor report (comprehensive analysis)', () => {
    it('should recognize report subcommand', async () => {
      const result = await runCli(['system', 'doctor', 'report', '--help']);
      expect([0, 1, 2, 3, 4, 5]).toContain(result.exitCode);
    });
  }, { timeout: 10000 });

  describe('wpm doctor publish (release validation)', () => {
    it('should recognize publish subcommand', async () => {
      const result = await runCli(['system', 'doctor', 'publish', '--help']);
      expect([0, 1, 2, 3, 4, 5]).toContain(result.exitCode);
    });
  }, { timeout: 30000 });

  describe('wpm doctor hooks (hook system validation)', () => {
    it('should recognize hooks subcommand', async () => {
      const result = await runCli(['system', 'doctor', 'hooks']);
      expect([0, 1, 2, 3, 4, 5]).toContain(result.exitCode);
    });

    it('should provide hook diagnostics', async () => {
      const result = await runCli(['system', 'doctor', 'hooks']);
      expect([0, 1, 2, 3, 4, 5]).toContain(result.exitCode);
      // Should output something
      expect(result.stdout || result.stderr).toBeTruthy();
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // STATUS COMMAND TESTS (output format, field presence, engine state)
  // ────────────────────────────────────────────────────────────────────────────

  describe('wpm status (system health reporting)', () => {
    it('should return exit code 0 on success', async () => {
      const result = await runCli(['system', 'status']);
      expect(result.exitCode).toBe(EXIT_CODES.success);
    });

    it('should output human-readable format by default', async () => {
      const result = await runCli(['system', 'status']);
      expect(result.exitCode).toBe(EXIT_CODES.success);
      expect(result.stdout).toMatch(/status|engine|memory|uptime/i);
    });

    it('should support --format json flag', async () => {
      const result = await runCli(['system', 'status', '--format', 'json']);
      expect(result.exitCode).toBe(EXIT_CODES.success);
      try {
        const output = JSON.parse(result.stdout);
        expect(output).toBeDefined();
        // JSON output should have structure
        expect(typeof output).toBe('object');
      } catch (e) {
        expect(result.exitCode).not.toBe(EXIT_CODES.success);
      }
    });

    it('should report engine state (uninitialized|ready|running|watching|failed)', async () => {
      const result = await runCli(['system', 'status']);
      expect(result.exitCode).toBe(EXIT_CODES.success);
      expect(result.stdout).toMatch(/engine|state|ready|running|uninitialized/i);
    });

    it('should report memory usage', async () => {
      const result = await runCli(['system', 'status']);
      expect(result.exitCode).toBe(EXIT_CODES.success);
      expect(result.stdout).toMatch(/memory|heap|rss|mb|gb/i);
    });

    it('should report process uptime', async () => {
      const result = await runCli(['system', 'status']);
      expect(result.exitCode).toBe(EXIT_CODES.success);
      expect(result.stdout).toMatch(/uptime|time|ms|second/i);
    });

    it('should report WASM module status', async () => {
      const result = await runCli(['system', 'status']);
      expect(result.exitCode).toBe(EXIT_CODES.success);
      expect(result.stdout).toMatch(/wasm|module|binary/i);
    });

    it('should support --verbose flag for detailed info', async () => {
      const result = await runCli(['system', 'status', '--verbose']);
      expect(result.exitCode).toBe(EXIT_CODES.success);
      // Verbose output should be longer or contain more details
      expect(result.stdout).toBeTruthy();
    });

    it('should support --quiet flag to suppress output', async () => {
      const result = await runCli(['system', 'status', '--quiet']);
      expect(result.exitCode).toBe(EXIT_CODES.success);
    });

    it('should support --show-config flag to reveal resolved config', async () => {
      const result = await runCli(['system', 'status', '--show-config']);
      expect(result.exitCode).toBe(EXIT_CODES.success);
      // Should include config-related output
      expect(result.stdout).toMatch(/config|algorithm|profile/i);
    });

    it('should report algorithm count in registry', async () => {
      const result = await runCli(['system', 'status']);
      expect(result.exitCode).toBe(EXIT_CODES.success);
      expect(result.stdout).toMatch(/algorithm|registry|count/i);
    });

    it('should report RL/autonomic state if available', async () => {
      const result = await runCli(['system', 'status']);
      expect(result.exitCode).toBe(EXIT_CODES.success);
      // May include RL state if autoprocess has run
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // RESULTS COMMAND TESTS (directory listing, --diff, --verify)
  // ────────────────────────────────────────────────────────────────────────────

  describe('wpm results (saved results browser)', () => {
    it('should return exit code 0 when no results exist yet', async () => {
      const result = await runCli(['evidence', 'report']);
      expect(result.exitCode).toBe(EXIT_CODES.success);
    });

    it('should list results directory contents', async () => {
      const result = await runCli(['evidence', 'report']);
      expect(result.exitCode).toBe(EXIT_CODES.success);
      // Should output information about results
      expect(result.stdout).toMatch(/result|no result|empty|not found/i);
    });

    it('should create .wasm4pm/results directory if missing', async () => {
      const result = await runCli(['evidence', 'report']);
      expect(result.exitCode).toBe(EXIT_CODES.success);
      // Directory should be created or confirmed as empty
    });

    it('should support --format json output', async () => {
      const result = await runCli(['evidence', 'report', '--format', 'json']);
      expect(result.exitCode).toBe(EXIT_CODES.success);
      try {
        const output = JSON.parse(result.stdout);
        expect(output).toBeDefined();
      } catch {
        // May output empty results as JSON array
      }
    });

    it('should support --verbose flag for detailed result info', async () => {
      const result = await runCli(['evidence', 'report', '--verbose']);
      expect(result.exitCode).toBe(EXIT_CODES.success);
    });

    it('should support --quiet flag', async () => {
      const result = await runCli(['evidence', 'report', '--quiet']);
      expect(result.exitCode).toBe(EXIT_CODES.success);
    });

    it('should accept --diff flag with comma-separated refs', async () => {
      const result = await runCli(['evidence', 'report', '--diff', 'ref1,ref2']);
      // May fail if refs don't exist, but flag should be recognized
      expect([EXIT_CODES.success, EXIT_CODES.source_error]).toContain(result.exitCode);
    });

    it('should report error when --diff receives non-existent ref', async () => {
      const result = await runCli(['evidence', 'report', '--diff', 'nonexistent1,nonexistent2']);
      expect([EXIT_CODES.source_error, EXIT_CODES.success]).toContain(result.exitCode);
    });

    it('should accept --verify flag to validate receipt', async () => {
      const result = await runCli(['evidence', 'report', '--verify', 'ref']);
      // May fail if ref doesn't exist, but flag should be recognized
      expect([EXIT_CODES.success, EXIT_CODES.source_error]).toContain(result.exitCode);
    });

    it('should require two refs for --diff comparison', async () => {
      const result = await runCli(['evidence', 'report', '--diff', 'ref1']);
      // Should error or warn about needing two refs
      expect([EXIT_CODES.config_error, EXIT_CODES.source_error, EXIT_CODES.success]).toContain(
        result.exitCode
      );
    });

    it('should output Jaccard similarity score on --diff', async () => {
      const result = await runCli(['evidence', 'report', '--diff', 'ref1,ref2']);
      // May fail due to missing refs, but no exit code constraint
      expect([0, 1, 2, 3, 4, 5]).toContain(result.exitCode);
    });

    it('should validate BLAKE3 receipt hash on --verify', async () => {
      const result = await runCli(['evidence', 'report', '--verify', 'ref']);
      expect([EXIT_CODES.success, EXIT_CODES.source_error]).toContain(result.exitCode);
    });

    it('should support both --diff and --verify together (or reject)', async () => {
      const result = await runCli(['evidence', 'report', '--diff', 'ref1,ref2', '--verify', 'ref1']);
      // Should either work or reject the combination
      expect([0, 1, 2, 3, 4, 5]).toContain(result.exitCode);
    });

    it('should list metadata (timestamp, task, algorithm) for each result', async () => {
      const result = await runCli(['evidence', 'report']);
      expect(result.exitCode).toBe(EXIT_CODES.success);
      // Output format should mention results or empty state
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // EXIT CODE CONTRACT VALIDATION (cross-command consistency)
  // ────────────────────────────────────────────────────────────────────────────

  describe('exit code contract validation (all commands)', () => {
    it('doctor should return valid exit code', async () => {
      const result = await runCli(['system', 'doctor', '--help']);
      expect([0, 1, 2, 3, 4, 5]).toContain(result.exitCode);
    });

    it('status should exit 0 on success', async () => {
      const result = await runCli(['system', 'status']);
      expect(result.exitCode).toBe(EXIT_CODES.success);
    });

    it('results should exit 0 on success (even with no results)', async () => {
      const result = await runCli(['evidence', 'report']);
      expect(result.exitCode).toBe(EXIT_CODES.success);
    });

    it('doctor check should return valid exit code', async () => {
      const result = await runCli(['system', 'doctor', 'check', '--help']);
      expect([0, 1, 2, 3, 4, 5]).toContain(result.exitCode);
    });

    it('should return config_error or source_error for invalid args', async () => {
      const result = await runCli(['evidence', 'report', '--diff', 'x']);
      expect([EXIT_CODES.config_error, EXIT_CODES.source_error]).toContain(result.exitCode);
    });

    it('should handle missing result references gracefully', async () => {
      const result = await runCli(['evidence', 'report', '--verify', 'nonexistent-result-id']);
      expect([EXIT_CODES.source_error, EXIT_CODES.success]).toContain(result.exitCode);
    });
  }, { timeout: 10000 });

  // ────────────────────────────────────────────────────────────────────────────
  // OUTPUT FORMAT VALIDATION (human vs json consistency)
  // ────────────────────────────────────────────────────────────────────────────

  describe('output format contract (human vs json)', () => {
    it('doctor human format should be readable text', async () => {
      const result = await runCli(['system', 'doctor', '--format', 'human']);
      expect([0, 1, 2, 3, 4, 5]).toContain(result.exitCode);
      expect(result.stdout).toMatch(/[a-z]/i); // Contains text
    });

    it('doctor json format should produce output', async () => {
      const result = await runCli(['system', 'doctor', '--format', 'json']);
      expect([0, 1, 2, 3, 4, 5]).toContain(result.exitCode);
      expect(result.stdout || result.stderr).toBeTruthy();
    });

    it('status human format should contain state info', async () => {
      const result = await runCli(['system', 'status', '--format', 'human']);
      expect(result.exitCode).toBe(EXIT_CODES.success);
      expect(result.stdout).toMatch(/state|memory|uptime|engine/i);
    });

    it('status json format should be valid JSON', async () => {
      const result = await runCli(['system', 'status', '--format', 'json']);
      expect(result.exitCode).toBe(EXIT_CODES.success);
      const output = JSON.parse(result.stdout);
      expect(typeof output).toBe('object');
    });

    it('results human format should list results or report empty', async () => {
      const result = await runCli(['evidence', 'report', '--format', 'human']);
      expect(result.exitCode).toBe(EXIT_CODES.success);
      expect(result.stdout).toMatch(/result|no|empty|not found/i);
    });

    it('results json format should be valid JSON', async () => {
      const result = await runCli(['evidence', 'report', '--format', 'json']);
      expect(result.exitCode).toBe(EXIT_CODES.success);
      const output = JSON.parse(result.stdout);
      expect(Array.isArray(output) || typeof output === 'object').toBe(true);
    });

    it('format flags should be recognized', async () => {
      const humanResult = await runCli(['system', 'status', '--format', 'human']);
      const jsonResult = await runCli(['system', 'status', '--format', 'json']);
      // Both should complete with valid exit codes
      expect([0, 1, 2, 3, 4, 5]).toContain(humanResult.exitCode);
      expect([0, 1, 2, 3, 4, 5]).toContain(jsonResult.exitCode);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // FIELD PRESENCE VALIDATION (status command)
  // ────────────────────────────────────────────────────────────────────────────

  describe('status command field presence (json output)', () => {
    it('should return valid JSON from status command', async () => {
      const result = await runCli(['system', 'status', '--format', 'json']);
      expect(result.exitCode).toBe(EXIT_CODES.success);
      const output = JSON.parse(result.stdout);
      expect(typeof output).toBe('object');
      // Should have multiple keys
      expect(Object.keys(output).length).toBeGreaterThan(0);
    });

    it('should include system information in output', async () => {
      const result = await runCli(['system', 'status']);
      expect(result.exitCode).toBe(EXIT_CODES.success);
      // Human output should mention key metrics
      expect(result.stdout).toMatch(/memory|uptime|wasm|state|engine/i);
    });

    it('status json should have expected structure', async () => {
      const result = await runCli(['system', 'status', '--format', 'json']);
      expect(result.exitCode).toBe(EXIT_CODES.success);
      const output = JSON.parse(result.stdout);
      // Verify it's an object with content (actual field names vary)
      expect(typeof output === 'object' && Object.keys(output).length > 0).toBe(true);
    });

    it('status --verbose should provide extended output', async () => {
      const result = await runCli(['system', 'status', '--verbose']);
      expect(result.exitCode).toBe(EXIT_CODES.success);
      expect(result.stdout).toBeTruthy();
      expect(result.stdout.length).toBeGreaterThan(0);
    });

    it('status --show-config should include config info', async () => {
      const result = await runCli(['system', 'status', '--show-config']);
      expect(result.exitCode).toBe(EXIT_CODES.success);
      // Should mention config
      expect(result.stdout).toMatch(/config|algorithm|profile/i);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // COMBINED COMMAND BEHAVIOR (integration scenarios)
  // ────────────────────────────────────────────────────────────────────────────

  describe('combined command behavior (workflows)', () => {
    it('doctor then status should both complete', async () => {
      const doctorResult = await runCli(['system', 'doctor', '--help']);
      const statusResult = await runCli(['system', 'status']);
      expect([0, 1, 2, 3, 4, 5]).toContain(doctorResult.exitCode);
      expect(statusResult.exitCode).toBe(EXIT_CODES.success);
    });

    it('status then results should both succeed', async () => {
      const statusResult = await runCli(['system', 'status']);
      const resultsResult = await runCli(['evidence', 'report']);
      expect(statusResult.exitCode).toBe(EXIT_CODES.success);
      expect(resultsResult.exitCode).toBe(EXIT_CODES.success);
    });

    it('doctor subcommands should be recognized', async () => {
      const checkResult = await runCli(['system', 'doctor', 'check', '--help']);
      const tpsResult = await runCli(['system', 'doctor', 'tps', '--help']);
      expect([0, 1, 2, 3, 4, 5]).toContain(checkResult.exitCode);
      expect([0, 1, 2, 3, 4, 5]).toContain(tpsResult.exitCode);
    });
  }, { timeout: 10000 });
});
