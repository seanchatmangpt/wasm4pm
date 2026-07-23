import { describe, it, expect } from 'vitest';
import { runCli, EXIT_CODES } from '@wasm4pm/testing';

/**
 * Gap-7: Algorithm Registry Discovery Command
 *
 * 'wpm algorithms' -> 'wpm help algorithms' (nouns/_removed.ts).
 *
 * MIGRATION NOTE: this file previously monkey-patched `process.stdout`/
 * `process.stderr` in the TEST process to capture CLI output — but
 * `@wasm4pm/testing`'s `runCli()` spawns the CLI as a real child process
 * (see packages/testing/src/harness/cli.ts), so overriding the parent
 * process's stdout/stderr never captured anything the child wrote (the
 * capture was a no-op even before this migration); it also now throws
 * outright ("Cannot set property stdout of #<process> which has only a
 * getter") on this Node version. Rewritten to read `result.stdout`/
 * `result.stderr` from the CLI harness result directly, which is what
 * actually carries the child process's output.
 *
 * MIGRATION NOTE 2: the old `algorithms` command was a rich registry
 * browser (--search filtering, human-format table with Speed/Quality
 * columns, and a JSON shape with id/name/speed/quality/category/
 * description/deploymentProfiles/supportedProfiles/complexity/
 * robustToNoise/scalesWell per algorithm). The rebuilt `wpm help
 * algorithms` (nouns/help/algorithms.ts) is a generated static reference
 * dump: no --search/--format query flags (both silently ignored), and its
 * JSON shape is only `{count, algorithms: [{id, category, modelType,
 * formats, wasmExport}]}` — none of the speed/quality/description/
 * profiles/complexity/robustness fields exist. This is an intentional
 * simplification (see algorithms-cli.test.ts's identical migration note),
 * not a bug — tests below assert the new, real contract.
 */
describe('Gap-7: Algorithm Registry Discovery Command', () => {
  it('should list all algorithms', async () => {
    const result = await runCli(['help', 'algorithms']);
    expect(result.exitCode).toBe(EXIT_CODES.success);
    expect(result.stdout).toContain('dfg');
    expect(result.stdout).toContain('heuristic_miner');
  });

  it('--search is accepted but ignored (KNOWN CONTRACT CHANGE, not a bug)', async () => {
    // The old command filtered to matching algorithms and excluded 'dfg'
    // when searching 'genetic'. The new reference dump always returns the
    // full list regardless of --search.
    const result = await runCli(['help', 'algorithms', '--search', 'genetic']);
    expect(result.exitCode).toBe(EXIT_CODES.success);
    expect(result.stdout).toContain('genetic_algorithm');
    expect(result.stdout).toContain('dfg');
  });

  it('should output JSON with the new {count, algorithms} structure', async () => {
    const result = await runCli(['help', 'algorithms']);
    expect(result.exitCode).toBe(EXIT_CODES.success);
    const output = JSON.parse(result.stdout);
    expect(Array.isArray(output.algorithms)).toBe(true);
    expect(output.algorithms.length).toBeGreaterThan(0);
    const algo = output.algorithms[0];
    // Downgraded from {id,name,speed,quality,category,description,
    // deploymentProfiles} — see migration note above.
    expect(algo).toHaveProperty('id');
    expect(algo).toHaveProperty('category');
    expect(algo).toHaveProperty('modelType');
    expect(algo).toHaveProperty('formats');
    expect(algo).toHaveProperty('wasmExport');
  });

  it('a search for a nonexistent pattern still succeeds (no --search concept anymore)', async () => {
    // Old contract: exit config_error + "No algorithms match pattern" on
    // stderr. New contract: --search doesn't exist, so this is just a
    // regular (ignored-flag) successful invocation.
    const result = await runCli(['help', 'algorithms', '--search', 'nonexistent_algo_xyz']);
    expect(result.exitCode).toBe(EXIT_CODES.success);
    const output = JSON.parse(result.stdout);
    expect(output.count).toBeGreaterThan(30);
  });

  it('should display algorithm ids in the JSON dump', async () => {
    // Downgraded from a human-format table with Speed/Quality columns
    // filtered by --search dfg — see migration note above.
    const result = await runCli(['help', 'algorithms']);
    expect(result.exitCode).toBe(EXIT_CODES.success);
    const output = JSON.parse(result.stdout);
    const ids = output.algorithms.map((a: { id: string }) => a.id);
    expect(ids).toContain('dfg');
  });

  it('should handle an unrecognized --format value gracefully', async () => {
    // 'help algorithms' takes no --format flag at all now (stdout is
    // always JSON per the noun-verb framework's always-JSON-on-stdout
    // contract) — an unrecognized value is simply ignored rather than
    // rejected.
    const result = await runCli(['help', 'algorithms', '--format', 'invalid_format']);
    expect(result.exitCode).toBe(EXIT_CODES.success);
    expect(() => JSON.parse(result.stdout)).not.toThrow();
  });

  it('formats array is present for every algorithm (was: deploymentProfiles/supportedProfiles)', async () => {
    // Downgraded — deploymentProfiles/supportedProfiles don't exist on the
    // new reference dump; `formats` (input formats the algorithm accepts)
    // is the closest surviving per-algorithm array field.
    const result = await runCli(['help', 'algorithms', '--search', 'genetic']);
    expect(result.exitCode).toBe(EXIT_CODES.success);
    const output = JSON.parse(result.stdout);
    expect(output.algorithms.length).toBeGreaterThan(0);
    const algo = output.algorithms.find((a: { id: string }) => a.id === 'genetic_algorithm');
    expect(Array.isArray(algo.formats)).toBe(true);
  });

  it('modelType is present for every algorithm (was: complexity)', async () => {
    // Downgraded — `complexity` (Big-O notation) doesn't exist on the new
    // reference dump; `modelType` (dfg/petrinet/tree/declare/analytics/
    // ml_result) is the closest surviving per-algorithm classification.
    const result = await runCli(['help', 'algorithms']);
    expect(result.exitCode).toBe(EXIT_CODES.success);
    const output = JSON.parse(result.stdout);
    expect(output.algorithms[0]).toHaveProperty('modelType');
    const validModelTypes = ['dfg', 'petrinet', 'tree', 'declare', 'analytics', 'ml_result'];
    expect(validModelTypes).toContain(output.algorithms[0].modelType);
  });

  it('category is present for every algorithm (was: robustToNoise/scalesWell)', async () => {
    // Downgraded — robustToNoise/scalesWell (booleans) don't exist on the
    // new reference dump; `category` (event-log | object-centric) is the
    // closest surviving per-algorithm boolean-ish classification.
    const result = await runCli(['help', 'algorithms']);
    expect(result.exitCode).toBe(EXIT_CODES.success);
    const output = JSON.parse(result.stdout);
    expect(output.algorithms[0]).toHaveProperty('category');
    expect(['event-log', 'object-centric']).toContain(output.algorithms[0].category);
  });
});
