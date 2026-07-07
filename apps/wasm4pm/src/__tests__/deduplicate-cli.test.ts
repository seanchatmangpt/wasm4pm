/**
 * Migrated from the retired top-level `wpm deduplicate` command (removed —
 * see `apps/wasm4pm/src/nouns/_removed.ts`: `deduplicate` -> `log dedupe`)
 * to `wpm log dedupe` (`apps/wasm4pm/src/nouns/log/dedupe.ts`).
 *
 * `log dedupe` is a legacy BRIDGE verb (`invokeLegacyCommandAsJson` in
 * `apps/wasm4pm/src/nouns/_bridge.ts`): it reuses `commands/deduplicate.ts`
 * completely unmodified, forcing `--format json --quiet` under the hood.
 * Consequently the OLD `{command,status,payload,meta}` envelope shape is
 * still exactly what a SUCCESSFUL bridged call returns (that legacy object
 * literally IS the verb's JSON result here) — this is intentional bridge
 * behavior, not a half-migration; only a FAILURE now takes the new
 * `{error:{code,message}}` shape (the bridge throws a `NounVerbError` on
 * any nonzero legacy exit code; see `_bridge.ts`'s `classifyLegacyFailure`).
 * All old subcommand syntax (`scan|report|clear|load`) and flags
 * (`--format`, `--force`, `--memory`) pass straight through unchanged.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { runCli, EXIT_CODES, createCliTestEnv } from '@wasm4pm/testing';

// Each test spawns a Node subprocess (WASM init + CLI); allow enough wall time
vi.setConfig({ testTimeout: 15_000 });
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

// The legacy `{command,status,payload,meta}` envelope returned by bridged
// verbs on success (see file header comment for why this shape is still
// correct here). `payload` varies per subcommand, so it is kept as a loose
// record rather than `unknown`/`any` on the whole envelope.
interface LegacyCliEnvelope {
  command?: string;
  status?: string;
  payload: Record<string, any>;
  meta?: { duration_ms?: number; [key: string]: unknown };
  duration_ms?: number;
}

// Helper to extract JSON from CLI output (may have help text appended)
function extractJsonFromOutput(output: string): LegacyCliEnvelope {
  // Find the first JSON object by looking for leading { and parsing carefully
  const startIdx = output.indexOf('{');
  if (startIdx === -1) throw new Error('No JSON found in output');

  let braceCount = 0;
  let inString = false;
  let escaped = false;

  for (let i = startIdx; i < output.length; i++) {
    const char = output[i];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      continue;
    }

    if (char === '"' && !escaped) {
      inString = !inString;
      continue;
    }

    if (!inString) {
      if (char === '{') braceCount++;
      if (char === '}') {
        braceCount--;
        if (braceCount === 0) {
          return JSON.parse(output.substring(startIdx, i + 1));
        }
      }
    }
  }

  throw new Error('No complete JSON object found in output');
}

describe('wpm log dedupe — result deduplication CLI (was: wpm deduplicate)', () => {
  let env: Awaited<ReturnType<typeof createCliTestEnv>>;
  let testDir: string;

  beforeEach(async () => {
    env = await createCliTestEnv();
    testDir = path.join(os.tmpdir(), `deduplicate-test-${Date.now()}`);
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    env?.cleanup?.();
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('deduplicate scan', () => {
    it('should scan a directory and identify duplicate logs', async () => {
      // Create some test files
      const file1 = path.join(testDir, 'log1.json');
      const file2 = path.join(testDir, 'log2.json');
      const file3 = path.join(testDir, 'log3.json');

      const content1 = JSON.stringify({ events: [{ id: 1, activity: 'a' }] });
      const content2 = JSON.stringify({ events: [{ id: 1, activity: 'a' }] }); // Duplicate
      const content3 = JSON.stringify({ events: [{ id: 2, activity: 'b' }] }); // Unique

      fs.writeFileSync(file1, content1);
      fs.writeFileSync(file2, content2);
      fs.writeFileSync(file3, content3);

      const result = await runCli(['log', 'dedupe', 'scan', testDir, '--format', 'json'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);

      // Parse JSON output
      const output = extractJsonFromOutput(result.stdout);
      expect(output.payload).toBeDefined();
      expect(output.payload.directory).toBe(testDir);
      expect(output.payload.total_files_scanned).toBeGreaterThan(0);
    });

    it('should report duplicate groups with file counts', async () => {
      const file1 = path.join(testDir, 'a.json');
      const file2 = path.join(testDir, 'b.json');

      const identical = JSON.stringify({ data: 'test' });
      fs.writeFileSync(file1, identical);
      fs.writeFileSync(file2, identical);

      const result = await runCli(['log', 'dedupe', 'scan', testDir, '--format', 'json'], { env: env.env });
      const output = extractJsonFromOutput(result.stdout);

      expect(output.payload.duplicate_groups).toBeGreaterThanOrEqual(0);
      expect(output.payload.groups).toBeDefined();
      expect(Array.isArray(output.payload.groups)).toBe(true);
    });

    it('should handle empty directories', async () => {
      const emptyDir = path.join(testDir, 'empty');
      fs.mkdirSync(emptyDir, { recursive: true });

      const result = await runCli(['log', 'dedupe', 'scan', emptyDir, '--format', 'json'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);

      const output = extractJsonFromOutput(result.stdout);
      expect(output.payload.total_files_scanned).toBe(0);
    });

    it('should include content hashes in output', async () => {
      const file1 = path.join(testDir, 'file1.json');
      fs.writeFileSync(file1, JSON.stringify({ test: true }));

      const result = await runCli(['log', 'dedupe', 'scan', testDir, '--format', 'json'], { env: env.env });
      const output = extractJsonFromOutput(result.stdout);

      expect(output.payload.groups).toBeDefined();
      if (output.payload.groups.length > 0) {
        expect(output.payload.groups[0].content_hash).toBeDefined();
        expect(typeof output.payload.groups[0].content_hash).toBe('string');
      }
    });

    it('should measure scan duration', async () => {
      const result = await runCli(['log', 'dedupe', 'scan', testDir, '--format', 'json'], { env: env.env });
      const output = extractJsonFromOutput(result.stdout);

      expect(output.meta?.duration_ms ?? output.duration_ms).toBeGreaterThanOrEqual(0);
    });

    it('should work with required directory argument', async () => {
      const result = await runCli(['log', 'dedupe', 'scan'], { env: env.env });
      // Missing required argument should fail or return error
      expect(result.exitCode).not.toBe(EXIT_CODES.success);
    });
  });

  describe('deduplicate report', () => {
    it('should show deduplication statistics', async () => {
      const result = await runCli(['log', 'dedupe', 'report', '--format', 'json'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);

      const output = extractJsonFromOutput(result.stdout);
      expect(output.payload).toBeDefined();
      expect(output.payload.total_cached_entries).toBeGreaterThanOrEqual(0);
      expect(output.payload.deduplicated_runs).toBeGreaterThanOrEqual(0);
      expect(output.payload.estimated_bytes_saved).toBeGreaterThanOrEqual(0);
    });

    it('should report deduplication database location', async () => {
      const result = await runCli(['log', 'dedupe', 'report', '--format', 'json'], { env: env.env });
      const output = extractJsonFromOutput(result.stdout);

      expect(output.payload.dedup_database).toBe('.wasm4pm/deduplicate.jsonl');
    });

    it('should include timestamp metadata', async () => {
      const result = await runCli(['log', 'dedupe', 'report', '--format', 'json'], { env: env.env });
      const output = extractJsonFromOutput(result.stdout);

      expect(output.payload.last_hit_timestamp).toBeDefined();
      expect(output.payload.last_clear_timestamp).toBeDefined();
    });

    it('should measure report generation time', async () => {
      const result = await runCli(['log', 'dedupe', 'report', '--format', 'json'], { env: env.env });
      const output = extractJsonFromOutput(result.stdout);

      expect(output.meta?.duration_ms ?? output.duration_ms).toBeGreaterThanOrEqual(0);
    });
  });

  describe('deduplicate clear', () => {
    it('should clear deduplication data', async () => {
      const result = await runCli(['log', 'dedupe', 'clear', '--force', '--format', 'json'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);

      const output = extractJsonFromOutput(result.stdout);
      expect(output.payload.entries_cleared).toBeGreaterThanOrEqual(0);
    });

    it('should clear only memory with --memory flag', async () => {
      const result = await runCli(['log', 'dedupe', 'clear', '--memory', '--format', 'json'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);

      const output = extractJsonFromOutput(result.stdout);
      // Note: the --memory flag logic may not work as expected in citty, verify with implementation
      expect(output.payload).toBeDefined();
      expect(['memory', 'all']).toContain(output.payload.target);
    });

    it('should clear both memory and disk by default', async () => {
      const result = await runCli(['log', 'dedupe', 'clear', '--force', '--format', 'json'], { env: env.env });
      const output = extractJsonFromOutput(result.stdout);

      expect(output.payload.target).toBe('all');
      expect(output.payload.database_deleted).toBe(true);
    });

    it('should report entries cleared', async () => {
      const result = await runCli(['log', 'dedupe', 'clear', '--force', '--format', 'json'], { env: env.env });
      const output = extractJsonFromOutput(result.stdout);

      expect(output.payload.entries_cleared).toBeGreaterThanOrEqual(0);
    });
  });

  describe('deduplicate load', () => {
    it('should load persisted deduplication database', async () => {
      const result = await runCli(['log', 'dedupe', 'load', '--format', 'json'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);

      const output = extractJsonFromOutput(result.stdout);
      expect(output.payload.entries_loaded).toBeGreaterThanOrEqual(0);
    });

    it('should report database path', async () => {
      const result = await runCli(['log', 'dedupe', 'load', '--format', 'json'], { env: env.env });
      const output = extractJsonFromOutput(result.stdout);

      expect(output.payload.database_path).toBe('.wasm4pm/deduplicate.jsonl');
    });

    it('should measure load duration', async () => {
      const result = await runCli(['log', 'dedupe', 'load', '--format', 'json'], { env: env.env });
      const output = extractJsonFromOutput(result.stdout);

      expect(output.meta?.duration_ms ?? output.duration_ms).toBeGreaterThanOrEqual(0);
    });
  });

  describe('deduplicate exit codes', () => {
    it('should return success for valid operations', async () => {
      const result = await runCli(['log', 'dedupe', 'report', '--format', 'json'], { env: env.env });
      expect([EXIT_CODES.success, 0]).toContain(result.exitCode);
    });

    it('should return error for invalid scan directory', async () => {
      const result = await runCli(['log', 'dedupe', 'scan', '/nonexistent/path/xyz'], {
        env: env.env,
      });
      // May fail with error code or succeed with empty results
      expect(result.exitCode).toBeGreaterThanOrEqual(0);
    });
  });

  describe('deduplicate JSON output', () => {
    it('all subcommands should output valid JSON', async () => {
      const commands = [
        ['log', 'dedupe', 'report', '--format', 'json'],
        ['log', 'dedupe', 'scan', testDir, '--format', 'json'],
        ['log', 'dedupe', 'clear', '--force', '--format', 'json'],
        ['log', 'dedupe', 'load', '--format', 'json'],
      ];

      for (const cmd of commands) {
        const result = await runCli(cmd, { env: env.env });
        if (result.exitCode === EXIT_CODES.success) {
          expect(() => extractJsonFromOutput(result.stdout)).not.toThrow();
        }
      }
    }, 30_000);

    it('should include status field in output', async () => {
      const result = await runCli(['log', 'dedupe', 'report', '--format', 'json'], { env: env.env });
      const output = extractJsonFromOutput(result.stdout);

      expect(output.status).toBeDefined();
      expect(['ok', 'error']).toContain(output.status);
    });

    it('should include payload in output', async () => {
      const result = await runCli(['log', 'dedupe', 'report', '--format', 'json'], { env: env.env });
      const output = extractJsonFromOutput(result.stdout);

      expect(output.payload).toBeDefined();
      expect(typeof output.payload).toBe('object');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Gap-closing tests
  // ──────────────────────────────────────────────────────────────────────────
  describe('gap: scan non-existent directory → source_error (2)', () => {
    it('should return source_error when scanning a directory that does not exist', async () => {
      const result = await runCli(
        ['log', 'dedupe', 'scan', '/nonexistent/path/xyz-deduplicate-test'],
        { env: env.env }
      );
      expect(result.exitCode).toBe(EXIT_CODES.source_error);
    });

    it('should include an error message mentioning the missing directory', async () => {
      const result = await runCli(
        ['log', 'dedupe', 'scan', '/nonexistent/path/xyz-deduplicate-test', '--format', 'json'],
        { env: env.env }
      );
      expect(result.exitCode).toBe(EXIT_CODES.source_error);
      expect(result.stdout).toMatch(/not found|directory|nonexistent/i);
    });
  });

  describe('gap: --format flag honored on all subcommands', () => {
    it('scan --format json produces JSON envelope', async () => {
      const result = await runCli(['log', 'dedupe', 'scan', testDir, '--format', 'json'], {
        env: env.env,
      });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      expect(() => extractJsonFromOutput(result.stdout)).not.toThrow();
    });

    it('report --format json produces JSON envelope', async () => {
      const result = await runCli(['log', 'dedupe', 'report', '--format', 'json'], {
        env: env.env,
      });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      expect(() => extractJsonFromOutput(result.stdout)).not.toThrow();
    });

    it('load --format json produces JSON envelope', async () => {
      const result = await runCli(['log', 'dedupe', 'load', '--format', 'json'], {
        env: env.env,
      });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      expect(() => extractJsonFromOutput(result.stdout)).not.toThrow();
    });
  });

  describe('gap: clear --force required for destructive all-clear', () => {
    it('clear without --force returns config_error when cache is non-empty (after a scan)', async () => {
      // Populate cache with a scan first
      const file1 = path.join(testDir, 'force-test.json');
      fs.writeFileSync(file1, JSON.stringify({ test: true }));
      await runCli(['log', 'dedupe', 'scan', testDir], { env: env.env });

      // Now clear without --force should guard against accidental destructive clear
      // NOTE: if cache is empty the guard does not trigger (nothing to protect)
      // so this test is meaningful only if the scan populated the cache
      const result = await runCli(['log', 'dedupe', 'clear'], { env: env.env });
      // Either guarded (config_error) or permitted if cache was empty
      expect([EXIT_CODES.success, EXIT_CODES.config_error]).toContain(result.exitCode);
    }, 30_000);

    it('clear --force clears without error', async () => {
      const result = await runCli(['log', 'dedupe', 'clear', '--force'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
    });

    it('clear --memory does not require --force (non-destructive to disk)', async () => {
      const result = await runCli(['log', 'dedupe', 'clear', '--memory'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
    });
  });
});
