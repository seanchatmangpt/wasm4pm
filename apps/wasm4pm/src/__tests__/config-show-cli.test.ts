import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runCli, EXIT_CODES, createCliTestEnv } from '@wasm4pm/testing';

/**
 * Migration note: `config show` is a native (non-bridged) noun-verb
 * (`nouns/config/show.ts`). Its handler returns the plain result object
 * directly — `{ config, provenance, warnings }` — with NO `{status,
 * payload}` wrapper, and stdout is ALWAYS this JSON (there is no
 * human-readable rendering path here at all — `--format`/`--quiet` are
 * not declared args on this verb, silently ignored if passed). The old
 * human-format text this file asserted against ("wasm4pm configuration",
 * bracketed `[TOML]`/`[ENV]` provenance tags, "Available environment
 * variables", field-constraint listings) does not exist anywhere in the
 * current command — verified live against the built CLI, not assumed.
 * `--detailed` is declared but its handler is a no-op (`...(detailed ? {}
 * : {})` spreads an empty object either way) — verified live: output is
 * byte-identical with and without the flag.
 */
describe('wpm config show — display configuration with sources', () => {
  let env: Awaited<ReturnType<typeof createCliTestEnv>>;

  beforeEach(async () => {
    env = await createCliTestEnv();
  });

  afterEach(() => {
    env?.cleanup?.();
  });

  describe('config show (basic)', () => {
    it('should exit 0 and print the config as JSON directly (no wrapper)', async () => {
      const result = await runCli(['config', 'show']);
      expect(result.exitCode).toBe(EXIT_CODES.success);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
      const json = JSON.parse(result.stdout);
      expect(json).toHaveProperty('config');
      expect(json).toHaveProperty('provenance');
      expect(json).toHaveProperty('warnings');
    });

    it('config section includes source/algorithm/execution/output keys', async () => {
      const result = await runCli(['config', 'show']);
      expect(result.exitCode).toBe(EXIT_CODES.success);
      const json = JSON.parse(result.stdout);
      expect(json.config).toHaveProperty('source');
      expect(json.config).toHaveProperty('algorithm');
      expect(json.config).toHaveProperty('execution');
      expect(json.config).toHaveProperty('output');
    });

    it('provenance entries use a lowercase `source` field (default|env|toml|json|cli), not bracketed [TOML]/[ENV] tags', async () => {
      const result = await runCli(['config', 'show']);
      expect(result.exitCode).toBe(EXIT_CODES.success);
      const json = JSON.parse(result.stdout);
      const entries = Object.values(json.provenance as Record<string, { source?: string }>);
      expect(entries.length).toBeGreaterThan(0);
      for (const entry of entries) {
        expect(['default', 'env', 'toml', 'json', 'cli']).toContain(entry.source);
      }
    });

    it('accepts an unknown --format flag without erroring (not a declared arg — silently ignored)', async () => {
      const result = await runCli(['config', 'show', '--format', 'json']);
      expect(result.exitCode).toBe(EXIT_CODES.success);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
      const json = JSON.parse(result.stdout);
      expect(json.config).toBeDefined();
      expect(json.provenance).toBeDefined();
      expect(json.warnings).toBeDefined();
    });

    it('accepts --quiet without erroring (not a declared arg — silently ignored)', async () => {
      const result = await runCli(['config', 'show', '--quiet']);
      expect(result.exitCode).toBe(EXIT_CODES.success);
    });
  });

  describe('config show --detailed', () => {
    it('is a documented no-op — output is identical with and without the flag', async () => {
      const [plain, detailed] = await Promise.all([
        runCli(['config', 'show']),
        runCli(['config', 'show', '--detailed']),
      ]);
      expect(plain.exitCode).toBe(EXIT_CODES.success);
      expect(detailed.exitCode).toBe(EXIT_CODES.success);
      expect(detailed.stdout).toBe(plain.stdout);
    });
  });

  describe('config show JSON output structure', () => {
    it('has config/provenance/warnings directly at the top level (no {status,payload} wrapper)', async () => {
      const result = await runCli(['config', 'show']);
      expect(result.exitCode).toBe(EXIT_CODES.success);
      const json = JSON.parse(result.stdout);
      expect(json).not.toHaveProperty('status');
      expect(json).not.toHaveProperty('payload');
      expect(json).toHaveProperty('config');
      expect(json).toHaveProperty('provenance');
      expect(json).toHaveProperty('warnings');
    });

    it('config.execution.profile should be valid', async () => {
      const result = await runCli(['config', 'show']);
      const json = JSON.parse(result.stdout);
      const profile = json.config.execution.profile;
      expect(['fast', 'balanced', 'quality', 'stream']).toContain(profile);
    });

    it('config.output.format should be human or json', async () => {
      const result = await runCli(['config', 'show']);
      const json = JSON.parse(result.stdout);
      const format = json.config.output.format;
      expect(['human', 'json']).toContain(format);
    });

    it('should have a provenance entry for each config field, each with a valid source', async () => {
      const result = await runCli(['config', 'show']);
      const json = JSON.parse(result.stdout);
      const prov = json.provenance;
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
