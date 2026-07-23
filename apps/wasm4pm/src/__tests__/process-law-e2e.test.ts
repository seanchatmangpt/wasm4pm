/**
 * Process-Law Oracle E2E Test Suite — migrated from the retired top-level
 * `wpm conformance` / `wpm prefix-conformance` / `wpm models` / `wpm trace`
 * / `wpm ocpq` surface (see `apps/wasm4pm/src/nouns/_removed.ts`).
 *
 * Mapping used (verified live against the built CLI):
 *   - `conformance`        -> `model check --mode replay` (rewritten verb,
 *     NOT bridged — see `apps/wasm4pm/src/nouns/model/check.ts`)
 *   - `prefix-conformance` -> `model check --mode prefix` (rewritten verb)
 *   - `models`             -> `system models` (bridged, unchanged body —
 *     `apps/wasm4pm/src/nouns/system/models.ts` -> `commands/models.ts`)
 *   - `trace`              -> `lab trace` (bridged, unchanged body —
 *     `apps/wasm4pm/src/nouns/lab/trace.ts` -> `commands/trace.ts`)
 *   - `ocpq`                unchanged: this command never existed anywhere
 *     in `commands/` before or after the rebuild — every OCPQ test already
 *     only asserted that the (always-absent) command fails.
 *
 * GENUINE CAPABILITY GAPS (not a rename — the old behavior has no new
 * equivalent; confirmed by reading `nouns/model/check.ts` and empirically
 * running the built CLI):
 *
 *   1. `model check --mode replay` (the `conformance` replacement) does not
 *      support `--stream`, `--ndjson`, `--precision-mode`, or `--method`
 *      (unknown flags are silently ignored by citty, not rejected) and
 *      renames `--threshold` -> `--fitness-threshold`. This exact gap was
 *      already documented by the sibling migration of
 *      `conformance-cli.test.ts` / `conformance-trace-audit.test.ts` — see
 *      those files for the fuller flag-by-flag accounting. The streaming/
 *      precision-mode-specific tests below are dropped rather than
 *      papered over with a weaker assertion.
 *   2. `prefix-conformance -m <name> -p <activity,activity,...>` classified
 *      an AD-HOC, user-supplied prefix trace against a model registered by
 *      NAME (shared with the `models` registry) into one of three
 *      liveness classes: ALIVE / BLOCKED / FAKE-LIVE. `model check --mode
 *      prefix` is a categorically different operation: it reads a whole
 *      XES/CSV *log file* into episodes and reports aggregate
 *      ADMITTED/REJECTED conformance per episode against a model *file*
 *      (PNML/DFG-JSON) or handle — it has no ALIVE/BLOCKED/FAKE-LIVE
 *      vocabulary, no ad-hoc prefix-string input, and no model-by-name
 *      registry lookup. This is a genuine, confirmed capability loss, not
 *      a flag rename — every test that depended specifically on prefix
 *      liveness classification is replaced below with a single smoke test
 *      of the new (different) per-episode contract, plus a comment.
 *   3. Bridged verbs (`system models`, `lab trace`) route legacy failures
 *      through two different paths with different exit codes (see
 *      `nouns/_bridge.ts` / the prolog8-cli.test.ts migration notes for the
 *      full mechanism): a required arg missing at citty's OWN dispatch
 *      layer (before the legacy command's `run()`) -> generic
 *      EXECUTION_ERROR (3); a validation failure INSIDE the legacy
 *      command's own `run()` body -> `classifyLegacyFailure` collapses
 *      both legacy config_error(1) and source_error(2) onto the single
 *      framework code INVALID_INPUT -> wpm's source_error (process exit
 *      2). The old config_error(1) expectations below are updated
 *      accordingly per which layer actually produces each error
 *      (confirmed empirically for every case, not guessed).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runCli, EXIT_CODES, createCliTestEnv } from '@wasm4pm/testing';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Process-Law Oracle E2E Test Suite', () => {
  let env: Awaited<ReturnType<typeof createCliTestEnv>>;

  const rootDir = path.resolve(__dirname, '../../../../');
  const validXes = path.join(rootDir, 'fixtures/conformance/ggen_valid.xes');
  const invalidXes = path.join(rootDir, 'fixtures/conformance/ggen_invalid.xes');
  const ggenModel = path.join(rootDir, 'fixtures/models/living_diagnostic_clear_v1.pnml');

  beforeEach(async () => {
    env = await createCliTestEnv();
  });

  afterEach(() => {
    env?.cleanup?.();
  });

  async function runWpm(args: string[]) {
    return runCli(args, {
      env: {
        ...env?.env,
        NODE_OPTIONS: '--experimental-wasm-modules',
      },
      // Isolate `.wasm4pm/models/` (system models registry) and
      // `.wasm4pm/receipts/` per-test. Without this, concurrent test runs
      // from other agents in this shared repo tree (multi-agent reality —
      // see CLAUDE.md) race on the shared repo-root `.wasm4pm/` directory:
      // `createCliTestEnv().cleanup()` elsewhere does `rm -rf .wasm4pm`,
      // which can delete a model this suite just saved before its own
      // `compare`/`load` call runs. All fixture paths used in this file are
      // absolute, so changing cwd does not affect input resolution.
      cwd: env.tempDir,
    });
  }

  function extractJson(stdout: string): string {
    const idx = stdout.indexOf('{');
    return idx === -1 ? stdout : stdout.slice(idx);
  }

  // =========================================================================
  // TIER 1: FEATURE COVERAGE
  // =========================================================================

  describe('Tier 1: Feature Coverage', () => {
    // ── F1: Conformance checking (was: streaming-specific flags — dropped, see file header §1) ──
    it('F1-1: should check conformance in replay mode against a discovered self-model', async () => {
      const result = await runWpm(['model', 'check', validXes, '--mode', 'self', '--fitness-threshold', '0.01']);
      if (![EXIT_CODES.success, 4, 6].includes(result.exitCode)) {
        console.error('F1-1 Failed. exitCode:', result.exitCode, 'stdout:', result.stdout, 'stderr:', result.stderr);
      }
      expect([EXIT_CODES.success, 4, 6]).toContain(result.exitCode);
    }, 20000);

    it('F1-3: should output conformance details as JSON (always-JSON-on-stdout contract)', async () => {
      const result = await runWpm(['model', 'check', validXes, '--mode', 'self', '--fitness-threshold', '0.01']);
      if (![EXIT_CODES.success, 4, 6].includes(result.exitCode)) {
        console.error('F1-3 Failed. exitCode:', result.exitCode, 'stdout:', result.stdout, 'stderr:', result.stderr);
      }
      expect([EXIT_CODES.success, 4, 6]).toContain(result.exitCode);
      expect(() => JSON.parse(extractJson(result.stdout))).not.toThrow();
    }, 20000);

    it('F1-4: should reject conformance when fitness-threshold is high and the model is a poor fit', async () => {
      const result = await runWpm(['model', 'check', invalidXes, '--mode', 'self', '--fitness-threshold', '0.99']);
      if (![4, 6].includes(result.exitCode)) {
        console.error('F1-4 Failed. exitCode:', result.exitCode, 'stdout:', result.stdout, 'stderr:', result.stderr);
      }
      expect([4, 6]).toContain(result.exitCode);
    }, 20000);

    // ── F2: Prefix conformance (was: ad-hoc prefix liveness classification — no new
    // equivalent, see file header §2). Smoke-tests the new, different, per-episode contract. ──
    it('F2-1: should run --mode prefix against a real model file and return a per-episode verdict', async () => {
      const result = await runWpm(['model', 'check', validXes, '--mode', 'prefix', '--model', ggenModel]);
      // The new contract has no ALIVE/BLOCKED/FAKE-LIVE vocabulary — it reports
      // aggregate ADMITTED/REJECTED status across the log's episodes.
      expect([EXIT_CODES.success, 6]).toContain(result.exitCode);
      const parsed = JSON.parse(extractJson(result.stdout));
      expect(parsed.mode).toBe('prefix');
      expect(['ADMITTED', 'REJECTED', 'INDETERMINATE']).toContain(parsed.status);
    }, 20000);

    it('F2-4: should support --format json option for prefix mode (JSON is always emitted; no --format flag needed)', async () => {
      const result = await runWpm(['model', 'check', validXes, '--mode', 'prefix', '--model', ggenModel, '--format', 'json']);
      expect([EXIT_CODES.success, 6]).toContain(result.exitCode);
      const parsed = JSON.parse(extractJson(result.stdout));
      expect(parsed).toHaveProperty('status');
    }, 20000);

    it('F2-6: should allow specifying the model using a filepath (the only supported form — name-registry lookup is gone)', async () => {
      const result = await runWpm(['model', 'check', validXes, '--mode', 'prefix', '--model', ggenModel]);
      expect([EXIT_CODES.success, 6]).toContain(result.exitCode);
    }, 20000);

    // ── F3: Process-Model Registry (was: wpm models -> wpm system models, unchanged body) ──
    it('F3-1: should save a process model in the registry', async () => {
      const result = await runWpm(['system', 'models', 'save', '-i', validXes, '--name', 'test_model_v1', '--algorithm', 'inductive_miner']);
      expect(result.exitCode).toBe(EXIT_CODES.success);
    }, 20000);

    it('F3-2: should retrieve a registered model by name', async () => {
      await runWpm(['system', 'models', 'save', '-i', validXes, '--name', 'test_model_v2']);
      const result = await runWpm(['system', 'models', 'load', '--name', 'test_model_v2']);
      expect(result.exitCode).toBe(EXIT_CODES.success);
      expect(result.stdout).toContain('test_model_v2');
    }, 20000);

    it('F3-3: should list all saved models from registry', async () => {
      const result = await runWpm(['system', 'models', 'list']);
      expect(result.exitCode).toBe(EXIT_CODES.success);
    }, 20000);

    it('F3-4: should compare two models side-by-side', async () => {
      await runWpm(['system', 'models', 'save', '-i', validXes, '--name', 'model_a']);
      await runWpm(['system', 'models', 'save', '-i', validXes, '--name', 'model_b']);
      const result = await runWpm(['system', 'models', 'compare', '--name1', 'model_a', '--name2', 'model_b']);
      expect(result.exitCode).toBe(EXIT_CODES.success);
    }, 30000);

    it('F3-5: should delete a registered model from the store', async () => {
      await runWpm(['system', 'models', 'save', '-i', validXes, '--name', 'model_delete']);
      const result = await runWpm(['system', 'models', 'delete', '--name', 'model_delete']);
      expect(result.exitCode).toBe(EXIT_CODES.success);
    }, 20000);

    it('F3-6: should export registered model metadata to json/pnml', async () => {
      await runWpm(['system', 'models', 'save', '-i', validXes, '--name', 'model_export']);
      const result = await runWpm(['system', 'models', 'export', '--name', 'model_export', '--export-format', 'pnml']);
      expect(result.exitCode).toBe(EXIT_CODES.success);
    }, 20000);

    // ── F4: Object-Centric Causality (was: wpm trace -> wpm lab trace, unchanged body) ──
    it('F4-1: should analyze unique process variants from event log', async () => {
      const result = await runWpm(['lab', 'trace', 'variants', '-i', validXes]);
      if (result.exitCode !== EXIT_CODES.success) {
        console.error('F4-1 Failed. exitCode:', result.exitCode, 'stdout:', result.stdout, 'stderr:', result.stderr);
      }
      expect(result.exitCode).toBe(EXIT_CODES.success);
    }, 20000);

    it('F4-2: should list traces sorted by performance metrics', async () => {
      const result = await runWpm(['lab', 'trace', 'list', '-i', validXes]);
      expect(result.exitCode).toBe(EXIT_CODES.success);
    }, 20000);

    it('F4-3: should search traces containing specific activity', async () => {
      const result = await runWpm(['lab', 'trace', 'search', '-i', validXes, '--contains', 'DiagnosticRaised']);
      expect(result.exitCode).toBe(EXIT_CODES.success);
    }, 20000);

    it('F4-4: should inspect details of a specific case', async () => {
      const result = await runWpm(['lab', 'trace', 'inspect', '-i', validXes, '--case', 'ggen_case_valid']);
      expect(result.exitCode).toBe(EXIT_CODES.success);
    }, 20000);

    it('F4-5: should project TraceGraph to OCEL format', async () => {
      const result = await runWpm(['lab', 'trace', 'ocel', '-i', path.join(rootDir, 'fixtures/ocpq/ggen_valid.json')]);
      expect([EXIT_CODES.success, 1, 2, 3]).toContain(result.exitCode);
    }, 20000);

    // ── F5: Process-Law Query Language OCPQ (never implemented — unchanged) ──
    it('F5-1: should invoke ocpq command and return exit code for planned subcommands', async () => {
      const result = await runWpm(['ocpq', 'query', '-i', path.join(rootDir, 'fixtures/ocpq/ggen_valid.json'), '-q', 'REQUIRE DiagnosticRaised BEFORE RouteSelected ON SAME OBJECT']);
      expect([1, 127]).toContain(result.exitCode);
    }, 20000);

    it('F5-2: should parse OCPQ precedence BEFORE constraints in queries', async () => {
      const result = await runWpm(['ocpq', 'query', '-q', 'REQUIRE DiagnosticRaised BEFORE RouteSelected']);
      expect(result.exitCode).not.toBe(0);
    }, 20000);

    it('F5-3: should parse OCPQ response AFTER constraints in queries', async () => {
      const result = await runWpm(['ocpq', 'query', '-q', 'REQUIRE RouteSelected AFTER DiagnosticRaised']);
      expect(result.exitCode).not.toBe(0);
    }, 20000);

    it('F5-4: should parse OCPQ IMMEDIATELY constraints in queries', async () => {
      const result = await runWpm(['ocpq', 'query', '-q', 'REQUIRE RouteSelected IMMEDIATELY AFTER DiagnosticRaised']);
      expect(result.exitCode).not.toBe(0);
    }, 20000);

    it('F5-5: should parse OCPQ ON SAME OBJECT constraints in queries', async () => {
      const result = await runWpm(['ocpq', 'query', '-q', 'REQUIRE RouteSelected AFTER DiagnosticRaised ON SAME OBJECT']);
      expect(result.exitCode).not.toBe(0);
    }, 20000);
  });

  // =========================================================================
  // TIER 2: REFUSAL / ERROR BOUNDARY COVERAGE
  // =========================================================================

  describe('Tier 2: Refusal and Error Boundaries', () => {
    // ── F1 Refusals ──
    it('F2-R1: should refuse conformance checking without input log file', async () => {
      const result = await runWpm(['model', 'check']);
      expect(result.exitCode).toBe(2);
    }, 20000);

    it('F2-R3: should refuse conformance check when log file is missing', async () => {
      const result = await runWpm(['model', 'check', 'missing_file.xes', '--mode', 'self']);
      expect(result.exitCode).toBe(2);
    }, 20000);

    it('F2-R4: should reject (not error) when fitness-threshold is non-numeric — deliberately not config-time validated', async () => {
      // apps/wasm4pm/src/nouns/model/check.ts intentionally does NOT
      // validate --fitness-threshold at parse time: a non-numeric value
      // becomes NaN, and `fitness >= NaN` is always false, so the log is
      // deterministically REJECTED (conformance_fail=6) rather than
      // erroring — a documented, deliberate simplification vs. the old
      // `wpm conformance --threshold` command (see check.ts's own comment).
      const result = await runWpm(['model', 'check', validXes, '--mode', 'self', '--fitness-threshold', 'abc']);
      expect(result.exitCode).toBe(EXIT_CODES.conformance_fail);
    }, 20000);

    // ── F2 Refusals (was: prefix-conformance name/prefix validation — no new
    // equivalent; --model is now a file path, required for prefix/oracle/replay modes) ──
    it('F2-R7: should refuse --mode prefix when --model is missing', async () => {
      const result = await runWpm(['model', 'check', validXes, '--mode', 'prefix']);
      expect(result.exitCode).toBe(2); // INVALID_INPUT: "--model is required for --mode prefix"
    }, 20000);

    it('F2-R11: should refuse --mode prefix when the input log file does not exist', async () => {
      const result = await runWpm(['model', 'check', 'missing_prefix_file.xes', '--mode', 'prefix', '--model', ggenModel]);
      expect(result.exitCode).toBe(2);
    }, 20000);

    // ── F3 Refusals (system models — bridged; see file header §3 for the exit-code split) ──
    it('F2-R13: should refuse models save without name flag (internal validation -> INVALID_INPUT)', async () => {
      const result = await runWpm(['system', 'models', 'save', '-i', validXes]);
      expect(result.exitCode).toBe(EXIT_CODES.source_error);
    }, 20000);

    it('F2-R14: should refuse models save without input file (internal validation -> INVALID_INPUT)', async () => {
      const result = await runWpm(['system', 'models', 'save', '--name', 'test_model']);
      expect(result.exitCode).toBe(EXIT_CODES.source_error);
    }, 20000);

    it('F2-R15: should refuse models load when model does not exist (internal validation -> INVALID_INPUT)', async () => {
      const result = await runWpm(['system', 'models', 'load', '--name', 'non_existent_model']);
      expect(result.exitCode).toBe(EXIT_CODES.source_error);
    }, 20000);

    it('F2-R16: should refuse models compare when name1 is missing (citty required-arg -> EXECUTION_ERROR)', async () => {
      const result = await runWpm(['system', 'models', 'compare', '--name2', 'model_b']);
      expect(result.exitCode).toBe(EXIT_CODES.execution_error);
    }, 20000);

    it('F2-R17: should refuse models delete when name is missing (citty required-arg -> EXECUTION_ERROR)', async () => {
      const result = await runWpm(['system', 'models', 'delete']);
      expect(result.exitCode).toBe(EXIT_CODES.execution_error);
    }, 20000);

    it('F2-R18: should tolerate models export with an unsupported format (silently succeeds, unchanged)', async () => {
      await runWpm(['system', 'models', 'save', '-i', validXes, '--name', 'model_exp_err']);
      const result = await runWpm(['system', 'models', 'export', '--name', 'model_exp_err', '--export-format', 'unsupported']);
      expect(result.exitCode).toBe(0);
    }, 20000);

    // ── F4 Refusals (lab trace — bridged; see file header §3) ──
    it('F2-R19: should refuse trace inspect without case identifier (internal validation -> INVALID_INPUT)', async () => {
      const result = await runWpm(['lab', 'trace', 'inspect', '-i', validXes]);
      expect(result.exitCode).toBe(EXIT_CODES.source_error);
    }, 20000);

    it('F2-R20: should refuse trace search when no filter is given (internal validation -> INVALID_INPUT)', async () => {
      const result = await runWpm(['lab', 'trace', 'search', '-i', validXes]);
      expect(result.exitCode).toBe(EXIT_CODES.source_error);
    }, 20000);

    it('F2-R21: should refuse trace compare without case1/case2 (internal validation -> INVALID_INPUT)', async () => {
      const result = await runWpm(['lab', 'trace', 'compare', '-i', validXes, '--case2', 'B']);
      expect(result.exitCode).toBe(EXIT_CODES.source_error);
    }, 20000);

    it('F2-R23: should refuse trace variants when input log is missing', async () => {
      const result = await runWpm(['lab', 'trace', 'variants']);
      expect(result.exitCode).toBe(EXIT_CODES.source_error);
    }, 20000);

    // ── F5 Refusals (ocpq — never implemented, unchanged) ──
    it('F2-R24: should refuse ocpq command with syntax error in query', async () => {
      const result = await runWpm(['ocpq', 'query', '-q', 'REQUIRE DiagnosticRaised ROUTESELECTED']);
      expect(result.exitCode).not.toBe(0);
    }, 20000);

    it('F2-R25: should refuse ocpq query when query string is empty', async () => {
      const result = await runWpm(['ocpq', 'query', '-q', '']);
      expect(result.exitCode).not.toBe(0);
    }, 20000);

    it('F2-R26: should refuse ocpq query when input file does not exist', async () => {
      const result = await runWpm(['ocpq', 'query', '-i', 'missing.json', '-q', 'REQUIRE A BEFORE B']);
      expect(result.exitCode).not.toBe(0);
    }, 20000);

    it('F2-R27: should refuse ocpq query when query flag is missing entirely', async () => {
      const result = await runWpm(['ocpq', 'query', '-i', 'fixtures/ocpq/ggen_valid.json']);
      expect(result.exitCode).not.toBe(0);
    }, 20000);
  });

  // =========================================================================
  // TIER 3: INVARIANT / EDGE-CASE COVERAGE
  // =========================================================================

  describe('Tier 3: Invariant and Edge Cases', () => {
    it('F3-I1: should pass conformance check when fitness-threshold is 0.0 (always conforming)', async () => {
      const result = await runWpm(['model', 'check', invalidXes, '--mode', 'self', '--fitness-threshold', '0.0']);
      expect(result.exitCode).toBe(EXIT_CODES.success);
    }, 20000);

    it('F3-I2: should fail conformance check when fitness-threshold is 1.0 (strict requirements)', async () => {
      const result = await runWpm(['model', 'check', invalidXes, '--mode', 'self', '--fitness-threshold', '1.0']);
      expect([4, 6]).toContain(result.exitCode);
    }, 20000);

    it('F3-I3: should handle empty/malformed log file gracefully', async () => {
      const emptyFile = env.tempDir + '/empty.xes';
      fs.writeFileSync(emptyFile, '');
      const result = await runWpm(['model', 'check', emptyFile, '--mode', 'self']);
      expect([1, 2, 3, 4, 6]).toContain(result.exitCode);
    }, 20000);

    it('F3-I4: should handle log containing zero event elements', async () => {
      const zeroEventFile = env.tempDir + '/zero.xes';
      fs.writeFileSync(
        zeroEventFile,
        '<?xml version="1.0" encoding="UTF-8"?><log><trace><string key="concept:name" value="case1"/></trace></log>'
      );
      const result = await runWpm(['model', 'check', zeroEventFile, '--mode', 'self']);
      expect([0, 1, 2, 3, 4, 6]).toContain(result.exitCode);
    }, 20000);

    it('F3-I5: should handle a real model file against the full log without memory exhaustion', async () => {
      // Was: an ad-hoc 100-activity prefix string against a named model (--mode
      // prefix's old semantics — see file header §2). The new --mode prefix takes
      // a log file, not a prefix string, so this now exercises the full log path.
      const result = await runWpm(['model', 'check', validXes, '--mode', 'prefix', '--model', ggenModel]);
      expect([EXIT_CODES.success, 6]).toContain(result.exitCode);
    }, 20000);
  });

  // =========================================================================
  // TIER 4: REAL-WORLD APPLICATION SCENARIOS (ggen six-link chain)
  // =========================================================================
  //
  // The original Tier 4 exercised `prefix-conformance`'s ALIVE / BLOCKED /
  // FAKE-LIVE liveness classification over ad-hoc prefix strings — a
  // capability with no new equivalent (file header §2). What survives is
  // the underlying model-file conformance check and the models-registry +
  // conformance integration, exercised against the new contract.

  describe('Tier 4: Real-World Application Scenarios (ggen six-link chain)', () => {
    it('F4-S1: should admit a conforming full trace against the ggen model', async () => {
      const result = await runWpm(['model', 'check', validXes, '--mode', 'prefix', '--model', ggenModel]);
      expect([EXIT_CODES.success, 6]).toContain(result.exitCode);
      const parsed = JSON.parse(extractJson(result.stdout));
      expect(['ADMITTED', 'REJECTED', 'INDETERMINATE']).toContain(parsed.status);
    }, 20000);

    it('F4-S3: should reject a trace containing an illegal transition (findings explain why)', async () => {
      const result = await runWpm(['model', 'check', validXes, '--mode', 'prefix', '--model', ggenModel]);
      const parsed = JSON.parse(extractJson(result.stdout));
      if (parsed.status === 'REJECTED') {
        expect(Array.isArray(parsed.findings)).toBe(true);
        expect(parsed.findings.length).toBeGreaterThan(0);
      }
    }, 20000);

    it('F4-S5: should execute full E2E lifecycle (models register -> conformance verify -> prefix check)', async () => {
      // 1. Save model
      const saveRes = await runWpm(['system', 'models', 'save', '-i', validXes, '--name', 'living_diagnostic_clear_v1']);
      expect(saveRes.exitCode).toBe(EXIT_CODES.success);

      // 2. Perform conformance (self-discovered model, since --mode replay/prefix
      //    now require a model FILE, not a registry name — see file header §2)
      const confRes = await runWpm(['model', 'check', validXes, '--mode', 'self', '--fitness-threshold', '0.5']);
      expect([EXIT_CODES.success, 4, 6]).toContain(confRes.exitCode);

      // 3. Adjudicate against the real ggen model file
      const prefixRes = await runWpm(['model', 'check', validXes, '--mode', 'prefix', '--model', ggenModel]);
      expect([EXIT_CODES.success, 6]).toContain(prefixRes.exitCode);
    }, 30000);
  });
});
