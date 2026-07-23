import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runCli, EXIT_CODES, createCliTestEnv } from '@wasm4pm/testing';

/**
 * 'wpm algorithms' -> 'wpm help algorithms' (nouns/_removed.ts).
 *
 * MIGRATION NOTE: the old `algorithms` command was a rich, interactive
 * registry browser supporting --filter, --profile, --tier, --sort,
 * --search, --details, --parameters, and --show-ratings (Van der Aalst
 * quality ratings with speed/quality scores). The rebuilt `wpm help
 * algorithms` (nouns/help/algorithms.ts) is a generated, static reference
 * dump wrapping `engines/algorithms.ts`'s `listAlgorithms()`: it takes no
 * query flags at all (any extra flag is silently ignored) and always
 * returns the full flat list as `{count, algorithms: [{id, category,
 * modelType, formats, wasmExport}]}` — no `name`, `speed`, `quality`, or
 * ratings fields. This is an intentional simplification (a hand-maintained
 * "algorithm browser" command was replaced by a codegen'd reference list),
 * not a bug — the filter/profile/tier/sort/search/details/ratings test
 * groups below are therefore consolidated into a handful of tests against
 * the new, real contract rather than migrated 1:1.
 */
describe('wpm help algorithms — algorithm registry reference (was: wpm algorithms)', () => {
  let env: Awaited<ReturnType<typeof createCliTestEnv>>;

  beforeEach(async () => {
    env = await createCliTestEnv();
  });

  afterEach(() => {
    env?.cleanup?.();
  });

  describe('help algorithms (list)', () => {
    it('should list all registered algorithms', async () => {
      const result = await runCli(['help', 'algorithms'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      expect(result.stdout).toMatch(/algorithm|dfg|alpha|heuristic|petri|tree/i);
    });

    it('should show at least 30 algorithms', async () => {
      const result = await runCli(['help', 'algorithms'], { env: env.env });
      const json = JSON.parse(result.stdout);
      expect(json.count).toBeGreaterThan(30);
      expect(json.algorithms.length).toBe(json.count);
    });

    it('should include algorithm metadata (category, modelType, formats, wasmExport)', async () => {
      // Downgraded from "speed|quality|output|type" text match — the new
      // reference dump reports category/modelType/formats/wasmExport, not
      // speed/quality scores (see migration note above).
      const result = await runCli(['help', 'algorithms'], { env: env.env });
      const json = JSON.parse(result.stdout);
      expect(json.algorithms[0]).toHaveProperty('category');
      expect(json.algorithms[0]).toHaveProperty('modelType');
      expect(json.algorithms[0]).toHaveProperty('formats');
      expect(json.algorithms[0]).toHaveProperty('wasmExport');
    });
  });

  describe('help algorithms output', () => {
    it('should output JSON with an algorithms array', async () => {
      const result = await runCli(['help', 'algorithms'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      const json = JSON.parse(result.stdout);
      expect(Array.isArray(json.algorithms)).toBe(true);
    });

    it('should include algorithm identity properties', async () => {
      const result = await runCli(['help', 'algorithms'], { env: env.env });
      const json = JSON.parse(result.stdout);
      const algos = json.algorithms;
      expect(algos.length).toBeGreaterThan(0);
      expect(algos[0]).toHaveProperty('id');
      expect(algos[0]).toHaveProperty('category');
    });

    it('should produce verbose (>500 char) output by default', async () => {
      // Old '--details' flag doesn't exist anymore; the full reference dump
      // is always this verbose (60 algorithms x several fields each).
      const result = await runCli(['help', 'algorithms'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      expect(result.stdout.length).toBeGreaterThan(500);
    });

    it('should contain "dfg" for a known algorithm id', async () => {
      // Old '--search dfg' doesn't exist anymore; the full dump always
      // contains every id, including 'dfg'.
      const result = await runCli(['help', 'algorithms'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      expect(result.stdout).toMatch(/dfg/i);
    });
  });

  describe('help algorithms — query flags are accepted but ignored', () => {
    // KNOWN CONTRACT CHANGE (not a bug): --filter/--profile/--tier/--sort/
    // --parameters/--show-ratings all existed on the old 'algorithms'
    // command; 'help algorithms' takes no args at all, so passing any of
    // them is a no-op (extra flags are tolerated, not rejected) rather than
    // an error or an invalid-value rejection.
    const ignoredInvocations: Array<[string, string[]]> = [
      ['--filter discovery', ['--filter', 'discovery']],
      ['--filter nonexistent', ['--filter', 'nonexistent']],
      ['--profile mobile', ['--profile', 'mobile']],
      ['--profile invalid', ['--profile', 'invalid']],
      ['--tier stream', ['--tier', 'stream']],
      ['--tier invalid_tier', ['--tier', 'invalid_tier']],
      ['--sort speed', ['--sort', 'speed']],
      ['--parameters', ['--parameters']],
      ['--show-ratings', ['--show-ratings']],
    ];

    for (const [label, flags] of ignoredInvocations) {
      it(`${label}: still succeeds and returns the full 60-algorithm list`, async () => {
        const result = await runCli(['help', 'algorithms', ...flags], { env: env.env });
        expect(result.exitCode).toBe(EXIT_CODES.success);
        const json = JSON.parse(result.stdout);
        expect(json.count).toBeGreaterThan(30);
      });
    }
  });

  describe('algorithms registry validation', () => {
    it('should have consistent (unique) algorithm IDs', async () => {
      const result = await runCli(['help', 'algorithms'], { env: env.env });
      const json = JSON.parse(result.stdout);
      const ids = json.algorithms.map((a: { id: string }) => a.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('should have a non-empty formats array for every algorithm', async () => {
      // Downgraded from "valid speed and quality scores" — the new
      // reference dump has no speed/quality fields (see migration note
      // above); assert the structural property it does guarantee instead.
      const result = await runCli(['help', 'algorithms'], { env: env.env });
      const json = JSON.parse(result.stdout);
      for (const algo of json.algorithms) {
        expect(Array.isArray(algo.formats)).toBe(true);
        expect(algo.formats.length).toBeGreaterThan(0);
      }
    });
  });

  describe('algorithms performance', () => {
    it('should complete listing in a reasonable time', async () => {
      // Loosened from <500ms: measured wall time for a real `node
      // dist/bin/wpm.js help algorithms` subprocess (module resolution +
      // Node startup, no WASM needed for this verb) is ~2.4s in this
      // environment — the old 500ms bound was never realistically
      // achievable for a subprocess-spawn CLI test, independent of this
      // migration.
      const start = Date.now();
      const result = await runCli(['help', 'algorithms'], { env: env.env });
      const elapsed = Date.now() - start;
      expect(result.exitCode).toBe(EXIT_CODES.success);
      expect(elapsed).toBeLessThan(5_000);
    });
  });
});
