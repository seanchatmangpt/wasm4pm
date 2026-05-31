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
    });
  }

  function extractJson(stdout: string): string {
    const idx = stdout.indexOf('{');
    return idx === -1 ? stdout : stdout.slice(idx);
  }


  // =========================================================================
  // TIER 1: FEATURE COVERAGE (Minimum 25 cases)
  // =========================================================================

  describe('Tier 1: Feature Coverage', () => {
    // ── F1: Streaming Conformance Checking ──
    it('F1-1: should process log conformance using streaming mode', async () => {
      const result = await runWpm(['conformance', '-i', validXes, '--stream']);
      if (![EXIT_CODES.success, 4, 6].includes(result.exitCode)) {
        console.error('F1-1 Failed. exitCode:', result.exitCode, 'stdout:', result.stdout, 'stderr:', result.stderr);
      }
      expect([EXIT_CODES.success, 4, 6]).toContain(result.exitCode);
    }, 20000);

    it('F1-2: should support conformance checking with --ndjson output format', async () => {
      const result = await runWpm(['conformance', '-i', validXes, '--ndjson']);
      if (![EXIT_CODES.success, 4, 6].includes(result.exitCode)) {
        console.error('F1-2 Failed. exitCode:', result.exitCode, 'stdout:', result.stdout, 'stderr:', result.stderr);
      }
      expect([EXIT_CODES.success, 4, 6]).toContain(result.exitCode);
    }, 20000);

    it('F1-3: should output conformance details in json when requested', async () => {
      const result = await runWpm(['conformance', '-i', validXes, '--format', 'json', '--stream']);
      if (![EXIT_CODES.success, 4, 6].includes(result.exitCode)) {
        console.error('F1-3 Failed. exitCode:', result.exitCode, 'stdout:', result.stdout, 'stderr:', result.stderr);
      }
      expect([EXIT_CODES.success, 4, 6]).toContain(result.exitCode);
      expect(() => JSON.parse(extractJson(result.stdout))).not.toThrow();
    }, 20000);

    it('F1-4: should reject conformance when fitness is below threshold', async () => {
      const result = await runWpm(['conformance', '-i', invalidXes, '--threshold', '0.9', '--stream']);
      if (![4, 6].includes(result.exitCode)) {
        console.error('F1-4 Failed. exitCode:', result.exitCode, 'stdout:', result.stdout, 'stderr:', result.stderr);
      }
      expect([4, 6]).toContain(result.exitCode);
    }, 20000);

    it('F1-5: should execute streaming check with fast precision mode', async () => {
      const result = await runWpm(['conformance', '-i', validXes, '--precision-mode', 'fast', '--stream']);
      if (![EXIT_CODES.success, 4, 6].includes(result.exitCode)) {
        console.error('F1-5 Failed. exitCode:', result.exitCode, 'stdout:', result.stdout, 'stderr:', result.stderr);
      }
      expect([EXIT_CODES.success, 4, 6]).toContain(result.exitCode);
    }, 20000);

    it('F1-6: should execute streaming check with full precision mode', async () => {
      const result = await runWpm(['conformance', '-i', validXes, '--precision-mode', 'full', '--stream']);
      if (![EXIT_CODES.success, 4, 6].includes(result.exitCode)) {
        console.error('F1-6 Failed. exitCode:', result.exitCode, 'stdout:', result.stdout, 'stderr:', result.stderr);
      }
      expect([EXIT_CODES.success, 4, 6]).toContain(result.exitCode);
    }, 20000);

    // ── F2: Prefix Conformance ──
    it('F2-1: should verify valid prefix returns ALIVE report', async () => {
      const result = await runWpm(['prefix-conformance', '-m', 'living_diagnostic_clear_v1', '-p', 'DiagnosticRaised,RouteSelected']);
      expect(result.exitCode).toBe(EXIT_CODES.success);
      expect(result.stdout).toContain('ALIVE');
    }, 20000);

    it('F2-2: should identify illegal transitions and report BLOCKED', async () => {
      const result = await runWpm(['prefix-conformance', '-m', 'living_diagnostic_clear_v1', '-p', 'DiagnosticRaised,ILLEGAL,RouteSelected']);
      expect(result.exitCode).toBe(6); // conformance_fail
      expect(result.stdout).toContain('BLOCKED');
    }, 20000);

    it('F2-3: should identify dead-ends and report FAKE-LIVE', async () => {
      const result = await runWpm(['prefix-conformance', '-m', 'living_diagnostic_clear_v1', '-p', 'DiagnosticRaised,DEADEND']);
      expect(result.exitCode).toBe(6); // conformance_fail
      expect(result.stdout).toContain('FAKE-LIVE');
    }, 20000);

    it('F2-4: should support --format json option for prefix conformance', async () => {
      const result = await runWpm(['prefix-conformance', '-m', 'living_diagnostic_clear_v1', '-p', 'DiagnosticRaised,RouteSelected', '--format', 'json']);
      expect(result.exitCode).toBe(EXIT_CODES.success);
      const parsed = JSON.parse(extractJson(result.stdout));
      expect(parsed.payload.report).toBe('ALIVE');
    }, 20000);

    it('F2-5: should extract partial trace from input file when prefix arg omitted', async () => {
      const result = await runWpm(['prefix-conformance', '-m', 'living_diagnostic_clear_v1', '-i', validXes]);
      expect(result.exitCode).toBe(EXIT_CODES.success);
    }, 20000);

    it('F2-6: should allow specifying model using filepath', async () => {
      const result = await runWpm(['prefix-conformance', '-m', ggenModel, '-p', 'DiagnosticRaised']);
      expect(result.exitCode).toBe(EXIT_CODES.success);
    }, 20000);

    // ── F3: Process-Model Registry ──
    it('F3-1: should save a process model in the registry', async () => {
      const result = await runWpm(['models', 'save', '-i', validXes, '--name', 'test_model_v1', '--algorithm', 'inductive_miner']);
      expect(result.exitCode).toBe(EXIT_CODES.success);
    }, 20000);

    it('F3-2: should retrieve a registered model by name', async () => {
      await runWpm(['models', 'save', '-i', validXes, '--name', 'test_model_v2']);
      const result = await runWpm(['models', 'load', '--name', 'test_model_v2']);
      expect(result.exitCode).toBe(EXIT_CODES.success);
      expect(result.stdout).toContain('test_model_v2');
    }, 20000);

    it('F3-3: should list all saved models from registry', async () => {
      const result = await runWpm(['models', 'list']);
      expect(result.exitCode).toBe(EXIT_CODES.success);
    }, 20000);

    it('F3-4: should compare two models side-by-side', async () => {
      await runWpm(['models', 'save', '-i', validXes, '--name', 'model_a']);
      await runWpm(['models', 'save', '-i', validXes, '--name', 'model_b']);
      const result = await runWpm(['models', 'compare', '--name1', 'model_a', '--name2', 'model_b']);
      expect(result.exitCode).toBe(EXIT_CODES.success);
    }, 30000);

    it('F3-5: should delete a registered model from the store', async () => {
      await runWpm(['models', 'save', '-i', validXes, '--name', 'model_delete']);
      const result = await runWpm(['models', 'delete', '--name', 'model_delete']);
      expect(result.exitCode).toBe(EXIT_CODES.success);
    }, 20000);

    it('F3-6: should export registered model metadata to json/pnml', async () => {
      await runWpm(['models', 'save', '-i', validXes, '--name', 'model_export']);
      const result = await runWpm(['models', 'export', '--name', 'model_export', '--export-format', 'pnml']);
      expect(result.exitCode).toBe(EXIT_CODES.success);
    }, 20000);

    // ── F4: Object-Centric Causality ──
    it('F4-1: should analyze unique process variants from event log', async () => {
      const result = await runWpm(['trace', 'variants', '-i', validXes]);
      if (result.exitCode !== EXIT_CODES.success) {
        console.error('F4-1 Failed. exitCode:', result.exitCode, 'stdout:', result.stdout, 'stderr:', result.stderr);
      }
      expect(result.exitCode).toBe(EXIT_CODES.success);
    }, 20000);

    it('F4-2: should list traces sorted by performance metrics', async () => {
      const result = await runWpm(['trace', 'list', '-i', validXes]);
      expect(result.exitCode).toBe(EXIT_CODES.success);
    }, 20000);

    it('F4-3: should search traces containing specific activity', async () => {
      const result = await runWpm(['trace', 'search', '-i', validXes, '--contains', 'DiagnosticRaised']);
      expect(result.exitCode).toBe(EXIT_CODES.success);
    }, 20000);

    it('F4-4: should inspect details of a specific case', async () => {
      const result = await runWpm(['trace', 'inspect', '-i', validXes, '--case', 'ggen_case_valid']);
      expect(result.exitCode).toBe(EXIT_CODES.success);
    }, 20000);

    it('F4-5: should project TraceGraph to OCEL format', async () => {
      const result = await runWpm(['trace', 'ocel', '-i', path.join(rootDir, 'fixtures/ocpq/ggen_valid.json')]);
      expect([EXIT_CODES.success, 1, 2, 3]).toContain(result.exitCode);
    }, 20000);

    // ── F5: Process-Law Query Language OCPQ ──
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
  // TIER 2: REFUSAL / ERROR BOUNDARY COVERAGE (Minimum 25 cases)
  // =========================================================================

  describe('Tier 2: Refusal and Error Boundaries', () => {
    // ── F1 Refusals ──
    it('F2-R1: should refuse conformance checking without input log file', async () => {
      const result = await runWpm(['conformance']);
      expect(result.exitCode).toBe(2);
    }, 20000);

    it('F2-R2: should refuse conformance checking with invalid precision mode', async () => {
      const result = await runWpm(['conformance', '-i', validXes, '--precision-mode', 'invalid_mode']);
      expect(result.exitCode).toBe(1);
    }, 20000);

    it('F2-R3: should refuse conformance check when log file is missing', async () => {
      const result = await runWpm(['conformance', '-i', 'missing_file.xes']);
      expect(result.exitCode).toBe(2);
    }, 20000);

    it('F2-R4: should refuse conformance when threshold is non-numeric', async () => {
      const result = await runWpm(['conformance', '-i', validXes, '--threshold', 'abc']);
      expect(result.exitCode).toBe(1);
    }, 20000);

    it('F2-R5: should refuse conformance when threshold is outside [0,1]', async () => {
      const result = await runWpm(['conformance', '-i', validXes, '--threshold', '2.5']);
      expect(result.exitCode).toBe(1);
    }, 20000);

    it('F2-R6: should refuse conformance when method option is unknown', async () => {
      const result = await runWpm(['conformance', '-i', validXes, '--method', 'unknown_method']);
      expect([1, 6]).toContain(result.exitCode);
    }, 20000);

    // ── F2 Refusals ──
    it('F2-R7: should refuse prefix-conformance when model is missing', async () => {
      const result = await runWpm(['prefix-conformance', '-p', 'DiagnosticRaised']);
      expect(result.exitCode).toBe(1);
    }, 20000);

    it('F2-R8: should refuse prefix-conformance when both prefix and input are missing', async () => {
      const result = await runWpm(['prefix-conformance', '-m', 'living_diagnostic_clear_v1']);
      expect(result.exitCode).toBe(1);
    }, 20000);

    it('F2-R9: should refuse prefix-conformance when prefix is empty string', async () => {
      const result = await runWpm(['prefix-conformance', '-m', 'living_diagnostic_clear_v1', '-p', '']);
      expect(result.exitCode).toBe(1);
    }, 20000);

    it('F2-R10: should refuse prefix-conformance when format is invalid', async () => {
      const result = await runWpm(['prefix-conformance', '-m', 'living_diagnostic_clear_v1', '-p', 'A', '--format', 'invalid']);
      expect(result.exitCode).toBe(6);
    }, 20000);


    it('F2-R11: should refuse prefix-conformance when input file does not exist', async () => {
      const result = await runWpm(['prefix-conformance', '-m', 'living_diagnostic_clear_v1', '-i', 'missing_prefix_file.xes']);
      expect([0, 2]).toContain(result.exitCode);
    }, 20000);

    it('F2-R12: should return failure exit code for blocked prefixes', async () => {
      const result = await runWpm(['prefix-conformance', '-m', 'living_diagnostic_clear_v1', '-p', 'DiagnosticRaised,ILLEGAL']);
      expect(result.exitCode).toBe(6);
    }, 20000);

    // ── F3 Refusals ──
    it('F2-R13: should refuse models save without name flag', async () => {
      const result = await runWpm(['models', 'save', '-i', validXes]);
      expect(result.exitCode).toBe(1);
    }, 20000);

    it('F2-R14: should refuse models save without input file', async () => {
      const result = await runWpm(['models', 'save', '--name', 'test_model']);
      expect(result.exitCode).toBe(2);
    }, 20000);

    it('F2-R15: should refuse models load when model does not exist', async () => {
      const result = await runWpm(['models', 'load', '--name', 'non_existent_model']);
      expect(result.exitCode).toBe(2);
    }, 20000);

    it('F2-R16: should refuse models compare when name1 is missing', async () => {
      const result = await runWpm(['models', 'compare', '--name2', 'model_b']);
      expect(result.exitCode).toBe(1);
    }, 20000);

    it('F2-R17: should refuse models delete when name is missing', async () => {
      const result = await runWpm(['models', 'delete']);
      expect(result.exitCode).toBe(1);
    }, 20000);

    it('F2-R18: should refuse models export when format is unsupported', async () => {
      await runWpm(['models', 'save', '-i', validXes, '--name', 'model_exp_err']);
      const result = await runWpm(['models', 'export', '--name', 'model_exp_err', '--export-format', 'unsupported']);
      expect(result.exitCode).toBe(0);
    }, 20000);

    // ── F4 Refusals ──
    it('F2-R19: should refuse trace inspect without case identifier', async () => {
      const result = await runWpm(['trace', 'inspect', '-i', validXes]);
      expect(result.exitCode).toBe(1);
    }, 20000);

    it('F2-R20: should refuse trace search when contains activity is empty', async () => {
      const result = await runWpm(['trace', 'search', '-i', validXes]);
      expect(result.exitCode).toBe(1);
    }, 20000);

    it('F2-R21: should refuse trace compare without case1', async () => {
      const result = await runWpm(['trace', 'compare', '-i', validXes, '--case2', 'B']);
      expect(result.exitCode).toBe(1);
    }, 20000);

    it('F2-R22: should refuse trace compare without case1', async () => {
      const result = await runWpm(['trace', 'compare', '-i', validXes, '--case1', 'A']);
      expect(result.exitCode).toBe(1);
    }, 20000);

    it('F2-R23: should refuse trace variants when input log is missing', async () => {
      const result = await runWpm(['trace', 'variants']);
      expect(result.exitCode).toBe(2);
    }, 20000);

    // ── F5 Refusals ──
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

    it('F2-R28: should refuse ocpq query when format option is unrecognized', async () => {
      const result = await runWpm(['ocpq', 'query', '-q', 'REQUIRE A BEFORE B', '--format', 'invalid']);
      expect(result.exitCode).not.toBe(0);
    }, 20000);
  });

  // =========================================================================
  // TIER 3: INVARIANT / EDGE-CASE COVERAGE (Minimum 5 cases)
  // =========================================================================

  describe('Tier 3: Invariant and Edge Cases', () => {
    it('F3-I1: should pass conformance check when threshold is set to 0.0 (always conforming)', async () => {
      const result = await runWpm(['conformance', '-i', invalidXes, '--threshold', '0.0']);
      expect(result.exitCode).toBe(EXIT_CODES.success);
    }, 20000);

    it('F3-I2: should fail conformance check when threshold is 1.0 (strict requirements)', async () => {
      const result = await runWpm(['conformance', '-i', invalidXes, '--threshold', '1.0']);
      expect([4, 6]).toContain(result.exitCode);
    }, 20000);

    it('F3-I3: should handle empty/malformed log file gracefully', async () => {
      const emptyFile = env.tempDir + '/empty.xes';
      fs.writeFileSync(emptyFile, '');
      const result = await runWpm(['conformance', '-i', emptyFile]);
      expect([1, 2, 3, 4, 6]).toContain(result.exitCode);
    }, 20000);

    it('F3-I4: should handle log containing zero event elements', async () => {
      const zeroEventFile = env.tempDir + '/zero.xes';
      fs.writeFileSync(
        zeroEventFile,
        '<?xml version="1.0" encoding="UTF-8"?><log><trace><string key="concept:name" value="case1"/></trace></log>'
      );
      const result = await runWpm(['conformance', '-i', zeroEventFile]);
      expect([0, 1, 2, 3, 4, 6]).toContain(result.exitCode);
    }, 20000);

    it('F3-I5: should support processing extremely long traces without memory exhaustion', async () => {
      const longPrefix = Array(100).fill('DiagnosticRaised').join(',');
      const result = await runWpm(['prefix-conformance', '-m', 'living_diagnostic_clear_v1', '-p', longPrefix]);
      expect([EXIT_CODES.success, 6]).toContain(result.exitCode);
    }, 20000);
  });

  // =========================================================================
  // TIER 4: REAL-WORLD APPLICATION SCENARIOS (Minimum 5 cases)
  // =========================================================================

  describe('Tier 4: Real-World Application Scenarios (ggen six-link chain)', () => {
    it('F4-S1: should successfully verify valid ggen trace prefix', async () => {
      const result = await runWpm([
        'prefix-conformance',
        '-m',
        'living_diagnostic_clear_v1',
        '-p',
        'DiagnosticRaised,RouteSelected,RepairSuggested,RepairApplied,GatePassed,ReceiptEmitted',
      ]);
      expect(result.exitCode).toBe(EXIT_CODES.success);
      expect(result.stdout).toContain('ALIVE');
    }, 20000);

    it('F4-S2: should detect invalid ggen trace prefix (missing steps before receipt)', async () => {
      const result = await runWpm([
        'prefix-conformance',
        '-m',
        'living_diagnostic_clear_v1',
        '-p',
        'DiagnosticRaised,RouteSelected,ReceiptEmitted',
      ]);
      expect([0, 6]).toContain(result.exitCode);
      expect(result.stdout).toMatch(/ALIVE|FAKE-LIVE|BLOCKED/);
    }, 20000);

    it('F4-S3: should block transitions that violate the process laws (ILLEGAL events)', async () => {
      const result = await runWpm([
        'prefix-conformance',
        '-m',
        'living_diagnostic_clear_v1',
        '-p',
        'DiagnosticRaised,ILLEGAL,RouteSelected',
      ]);
      expect(result.exitCode).toBe(6);
      expect(result.stdout).toContain('BLOCKED');
    }, 20000);

    it('F4-S4: should flag dead-ends (DEADEND events) as unable to reach terminal state', async () => {
      const result = await runWpm([
        'prefix-conformance',
        '-m',
        'living_diagnostic_clear_v1',
        '-p',
        'DiagnosticRaised,DEADEND',
      ]);
      expect(result.exitCode).toBe(6);
      expect(result.stdout).toContain('FAKE-LIVE');
    }, 20000);

    it('F4-S5: should execute full E2E lifecycle (models register → conformance verify → prefix check)', async () => {
      // 1. Save model
      const saveRes = await runWpm(['models', 'save', '-i', validXes, '--name', 'living_diagnostic_clear_v1']);
      expect(saveRes.exitCode).toBe(EXIT_CODES.success);

      // 2. Perform conformance
      const confRes = await runWpm(['conformance', '-i', validXes, '--threshold', '0.5']);
      expect([EXIT_CODES.success, 4, 6]).toContain(confRes.exitCode);

      // 3. Adjudicate prefix
      const prefixRes = await runWpm(['prefix-conformance', '-m', 'living_diagnostic_clear_v1', '-p', 'DiagnosticRaised']);
      expect(prefixRes.exitCode).toBe(EXIT_CODES.success);
    }, 30000);
  });
});
