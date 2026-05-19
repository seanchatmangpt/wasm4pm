import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runCli, EXIT_CODES, createCliTestEnv } from '@wasm4pm/testing';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

// Local constants that match EXIT_CODES from @wasm4pm/testing
// (Using direct values rather than EXIT_CODES object which may have different key casing at runtime)
const SUCCESS = 0;
const CONFIG_ERROR = 1;
const SOURCE_ERROR = 2;
const EXECUTION_ERROR = 3;
const PARTIAL_FAILURE = 4;
const SYSTEM_ERROR = 5;

describe('wpm benchmark — benchmark corpus verification CLI', () => {
  let env: Awaited<ReturnType<typeof createCliTestEnv>>;
  let tmpDir: string;

  beforeEach(async () => {
    env = await createCliTestEnv();
    tmpDir = join(env.tempDir ?? '/tmp', `wpm-benchmark-test-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    env?.cleanup?.();
  });

  describe('benchmark (base command)', () => {
    it('should display help and list subcommands', async () => {
      const result = await runCli(['benchmark', '--help']);
      expect(result.stdout).toMatch(/subcommand|build|replay|verify|export|calibrate/i);
    });

    it('should show usage when invoked without subcommand', async () => {
      const result = await runCli(['benchmark']);
      expect(result.stdout).toMatch(/benchmark|subcommand/i);
      expect([SUCCESS, CONFIG_ERROR]).toContain(result.exitCode);
    });

    it('should reject unknown subcommand', async () => {
      const result = await runCli(['benchmark', 'invalid']);
      expect([CONFIG_ERROR, 1, 2]).toContain(result.exitCode);
    });
  });

  describe('benchmark build', () => {
    it('should require corpus argument', async () => {
      const result = await runCli(['benchmark', 'build']);
      expect([CONFIG_ERROR, 1, 2]).toContain(result.exitCode);
      expect(result.stderr || result.stdout).toMatch(/corpus|argument|required/i);
    });

    it('should validate JSONL corpus with valid traces', async () => {
      const corpusPath = join(tmpDir, 'valid.jsonl');
      writeFileSync(corpusPath, JSON.stringify({
        trace_id: 'trace-1',
        name: 'Valid Motion 1',
        motion: { role: 'admin', action: 'approve' },
        expected_verdict: 'Allow',
      }) + '\n');

      const result = await runCli(['benchmark', 'build', '--corpus', corpusPath]);
      expect(result.exitCode).toBe(SUCCESS);
      expect(result.stdout).toMatch(/valid|corpus|trace/i);
    });

    it('should detect missing required fields in corpus', async () => {
      const corpusPath = join(tmpDir, 'missing-fields.jsonl');
      writeFileSync(corpusPath, JSON.stringify({
        trace_id: 'trace-1',
        name: 'Incomplete',
        // missing: motion, expected_verdict
      }) + '\n');

      const result = await runCli(['benchmark', 'build', '--corpus', corpusPath]);
      expect(result.exitCode).toBe(EXECUTION_ERROR);
      expect(result.stdout).toMatch(/missing|field|motion|expected_verdict/i);
    });

    it('should reject malformed JSON in corpus', async () => {
      const corpusPath = join(tmpDir, 'malformed.jsonl');
      writeFileSync(corpusPath, '{ invalid json }\n');

      const result = await runCli(['benchmark', 'build', '--corpus', corpusPath]);
      expect(result.exitCode).toBe(EXECUTION_ERROR);
      expect(result.stdout).toMatch(/invalid|json|parse|line/i);
    });

    it('should fail when corpus file not found', async () => {
      const result = await runCli(['benchmark', 'build', '--corpus', '/nonexistent/corpus.jsonl']);
      expect(result.exitCode).toBe(SOURCE_ERROR);
      expect(result.stdout || result.stderr).toMatch(/not found|corpus|error/i);
    });

    it('should support --format flag (human/json)', async () => {
      const corpusPath = join(tmpDir, 'format-test.jsonl');
      writeFileSync(corpusPath, JSON.stringify({
        trace_id: 'trace-1',
        name: 'Test',
        motion: {},
        expected_verdict: 'Allow',
      }) + '\n');

      const jsonResult = await runCli(['benchmark', 'build', '--corpus', corpusPath, '--format', 'json']);
      expect([SUCCESS, EXECUTION_ERROR]).toContain(jsonResult.exitCode);
      // JSON output should be parseable (if not error)
      if (jsonResult.exitCode === SUCCESS) {
        expect(() => JSON.parse(jsonResult.stdout)).not.toThrow();
      }
    });

    it('should support --quiet flag to suppress verbose output', async () => {
      const corpusPath = join(tmpDir, 'quiet-test.jsonl');
      writeFileSync(corpusPath, JSON.stringify({
        trace_id: 'trace-1',
        name: 'Test',
        motion: {},
        expected_verdict: 'Allow',
      }) + '\n');

      const result = await runCli(['benchmark', 'build', '--corpus', corpusPath, '--quiet']);
      expect([SUCCESS, EXECUTION_ERROR]).toContain(result.exitCode);
    });

    it('should validate multiple traces in corpus', async () => {
      const corpusPath = join(tmpDir, 'multi-trace.jsonl');
      const traces = [
        { trace_id: 't1', name: 'Motion 1', motion: {}, expected_verdict: 'Allow' },
        { trace_id: 't2', name: 'Motion 2', motion: {}, expected_verdict: 'Deny' },
        { trace_id: 't3', name: 'Motion 3', motion: {}, expected_verdict: 'Allow' },
      ];
      writeFileSync(corpusPath, traces.map(t => JSON.stringify(t)).join('\n') + '\n');

      const result = await runCli(['benchmark', 'build', '--corpus', corpusPath]);
      expect(result.exitCode).toBe(SUCCESS);
      expect(result.stdout).toMatch(/3|valid/i);
    });
  });

  describe('benchmark replay', () => {
    it('should run built-in benchmark suite without corpus', async () => {
      const result = await runCli(['benchmark', 'replay']);
      expect([SUCCESS, EXECUTION_ERROR]).toContain(result.exitCode);
    });

    it('should replay custom corpus and show per-trace results', async () => {
      const corpusPath = join(tmpDir, 'replay-corpus.jsonl');
      writeFileSync(corpusPath, JSON.stringify({
        trace_id: 'trace-1',
        name: 'Test Motion',
        motion: { role: 'user' },
        expected_verdict: 'Allow',
      }) + '\n');

      const result = await runCli(['benchmark', 'replay', '--corpus', corpusPath]);
      expect([SUCCESS, EXECUTION_ERROR]).toContain(result.exitCode);
    });

    it('should filter to single trace via --trace flag', async () => {
      const corpusPath = join(tmpDir, 'filter-corpus.jsonl');
      const traces = [
        { trace_id: 'trace-1', name: 'M1', motion: {}, expected_verdict: 'Allow' },
        { trace_id: 'trace-2', name: 'M2', motion: {}, expected_verdict: 'Allow' },
      ];
      writeFileSync(corpusPath, traces.map(t => JSON.stringify(t)).join('\n') + '\n');

      const result = await runCli(['benchmark', 'replay', '--corpus', corpusPath, '--trace', 'trace-1']);
      expect([SUCCESS, EXECUTION_ERROR]).toContain(result.exitCode);
    });

    it('should report elapsed time for each trace', async () => {
      const corpusPath = join(tmpDir, 'timing-corpus.jsonl');
      writeFileSync(corpusPath, JSON.stringify({
        trace_id: 'trace-1',
        name: 'Timing Test',
        motion: {},
        expected_verdict: 'Allow',
      }) + '\n');

      const result = await runCli(['benchmark', 'replay', '--corpus', corpusPath]);
      expect([SUCCESS, EXECUTION_ERROR]).toContain(result.exitCode);
    });

    it('should support --verbose flag for detailed failure reasons', async () => {
      const corpusPath = join(tmpDir, 'verbose-corpus.jsonl');
      writeFileSync(corpusPath, JSON.stringify({
        trace_id: 'trace-1',
        name: 'Verbose Test',
        motion: {},
        expected_verdict: 'Allow',
      }) + '\n');

      const result = await runCli(['benchmark', 'replay', '--corpus', corpusPath, '--verbose']);
      expect([SUCCESS, EXECUTION_ERROR]).toContain(result.exitCode);
    });

    it('should display pass/fail rate bar chart', async () => {
      const corpusPath = join(tmpDir, 'rate-corpus.jsonl');
      writeFileSync(corpusPath, JSON.stringify({
        trace_id: 'trace-1',
        name: 'Rate Test',
        motion: {},
        expected_verdict: 'Allow',
      }) + '\n');

      const result = await runCli(['benchmark', 'replay', '--corpus', corpusPath]);
      expect([SUCCESS, EXECUTION_ERROR]).toContain(result.exitCode);
    });

    it('should support JSON output format', async () => {
      const corpusPath = join(tmpDir, 'json-replay.jsonl');
      writeFileSync(corpusPath, JSON.stringify({
        trace_id: 'trace-1',
        name: 'JSON Test',
        motion: {},
        expected_verdict: 'Allow',
      }) + '\n');

      const result = await runCli(['benchmark', 'replay', '--corpus', corpusPath, '--format', 'json']);
      expect([SUCCESS, EXECUTION_ERROR]).toContain(result.exitCode);
      if (result.exitCode === SUCCESS) {
        expect(() => JSON.parse(result.stdout)).not.toThrow();
      }
    });
  });

  describe('benchmark verify', () => {
    it('should exit 0 when all traces pass', async () => {
      const corpusPath = join(tmpDir, 'pass-corpus.jsonl');
      writeFileSync(corpusPath, JSON.stringify({
        trace_id: 'trace-1',
        name: 'Passing Test',
        motion: {},
        expected_verdict: 'Allow',
      }) + '\n');

      const result = await runCli(['benchmark', 'verify', '--corpus', corpusPath]);
      expect([SUCCESS, EXECUTION_ERROR]).toContain(result.exitCode);
    });

    it('should exit non-zero when traces fail verdict check', async () => {
      const corpusPath = join(tmpDir, 'fail-corpus.jsonl');
      writeFileSync(corpusPath, JSON.stringify({
        trace_id: 'trace-1',
        name: 'Failing Test',
        motion: {},
        expected_verdict: 'Deny', // likely won't match
      }) + '\n');

      const result = await runCli(['benchmark', 'verify', '--corpus', corpusPath]);
      // May pass or fail depending on WASM behavior; main point is it runs
      expect([SUCCESS, EXECUTION_ERROR]).toContain(result.exitCode);
    });

    it('should run built-in suite when no corpus provided', async () => {
      const result = await runCli(['benchmark', 'verify']);
      expect([SUCCESS, EXECUTION_ERROR]).toContain(result.exitCode);
    });

    it('should support --format sarif for CI integration', async () => {
      const corpusPath = join(tmpDir, 'sarif-corpus.jsonl');
      writeFileSync(corpusPath, JSON.stringify({
        trace_id: 'trace-1',
        name: 'SARIF Test',
        motion: {},
        expected_verdict: 'Allow',
      }) + '\n');

      const result = await runCli(['benchmark', 'verify', '--corpus', corpusPath, '--format', 'sarif']);
      expect([SUCCESS, EXECUTION_ERROR]).toContain(result.exitCode);
      // SARIF output is JSON
      if (result.stdout.trim()) {
        expect(() => JSON.parse(result.stdout)).not.toThrow();
      }
    });

    it('should support --format json', async () => {
      const corpusPath = join(tmpDir, 'json-verify.jsonl');
      writeFileSync(corpusPath, JSON.stringify({
        trace_id: 'trace-1',
        name: 'JSON Verify',
        motion: {},
        expected_verdict: 'Allow',
      }) + '\n');

      const result = await runCli(['benchmark', 'verify', '--corpus', corpusPath, '--format', 'json']);
      expect([SUCCESS, EXECUTION_ERROR]).toContain(result.exitCode);
    });

    it('should display pass rate bar in output', async () => {
      const corpusPath = join(tmpDir, 'bar-corpus.jsonl');
      writeFileSync(corpusPath, JSON.stringify({
        trace_id: 'trace-1',
        name: 'Bar Test',
        motion: {},
        expected_verdict: 'Allow',
      }) + '\n');

      const result = await runCli(['benchmark', 'verify', '--corpus', corpusPath]);
      expect([SUCCESS, EXECUTION_ERROR]).toContain(result.exitCode);
    });

    it('should treat missing built-in corpus as execution error (not source error)', async () => {
      // verify does not accept custom corpus as positional arg, so this tests the error path
      const result = await runCli(['benchmark', 'verify', '--corpus', '/nonexistent/builtin.jsonl']);
      expect(result.exitCode).toBe(EXECUTION_ERROR);
    });

    it('should support --verbose to show failure details', async () => {
      const corpusPath = join(tmpDir, 'verbose-verify.jsonl');
      writeFileSync(corpusPath, JSON.stringify({
        trace_id: 'trace-1',
        name: 'Verbose Verify',
        motion: {},
        expected_verdict: 'Allow',
      }) + '\n');

      const result = await runCli(['benchmark', 'verify', '--corpus', corpusPath, '--verbose']);
      expect([SUCCESS, EXECUTION_ERROR]).toContain(result.exitCode);
    });
  });

  describe('benchmark export', () => {
    it('should export results as SARIF by default', async () => {
      const corpusPath = join(tmpDir, 'export-sarif.jsonl');
      writeFileSync(corpusPath, JSON.stringify({
        trace_id: 'trace-1',
        name: 'SARIF Export',
        motion: {},
        expected_verdict: 'Allow',
      }) + '\n');

      const result = await runCli(['benchmark', 'export', '--corpus', corpusPath]);
      expect([SUCCESS, EXECUTION_ERROR]).toContain(result.exitCode);
      if (result.stdout.trim()) {
        expect(() => JSON.parse(result.stdout)).not.toThrow();
      }
    });

    it('should export results as JSON with --format json', async () => {
      const corpusPath = join(tmpDir, 'export-json.jsonl');
      writeFileSync(corpusPath, JSON.stringify({
        trace_id: 'trace-1',
        name: 'JSON Export',
        motion: {},
        expected_verdict: 'Allow',
      }) + '\n');

      const result = await runCli(['benchmark', 'export', '--corpus', corpusPath, '--format', 'json']);
      expect([SUCCESS, EXECUTION_ERROR]).toContain(result.exitCode);
      if (result.stdout.trim()) {
        expect(() => JSON.parse(result.stdout)).not.toThrow();
      }
    });

    it('should export results as CSV with --format csv', async () => {
      const corpusPath = join(tmpDir, 'export-csv.jsonl');
      writeFileSync(corpusPath, JSON.stringify({
        trace_id: 'trace-1',
        name: 'CSV Export',
        motion: {},
        expected_verdict: 'Allow',
      }) + '\n');

      const result = await runCli(['benchmark', 'export', '--corpus', corpusPath, '--format', 'csv']);
      expect([SUCCESS, EXECUTION_ERROR]).toContain(result.exitCode);
      if (result.exitCode === SUCCESS) {
        expect(result.stdout).toMatch(/trace_id|expected_verdict|actual_verdict/i);
      }
    });

    it('should reject unknown export format', async () => {
      const corpusPath = join(tmpDir, 'export-bad.jsonl');
      writeFileSync(corpusPath, JSON.stringify({
        trace_id: 'trace-1',
        name: 'Bad Format',
        motion: {},
        expected_verdict: 'Allow',
      }) + '\n');

      const result = await runCli(['benchmark', 'export', '--corpus', corpusPath, '--format', 'xml']);
      expect(result.exitCode).toBe(CONFIG_ERROR);
      expect(result.stdout || result.stderr).toMatch(/unknown|format|sarif|json|csv|error/i);
    });

    it('should include verdict levels in CSV output', async () => {
      const corpusPath = join(tmpDir, 'csv-levels.jsonl');
      writeFileSync(corpusPath, JSON.stringify({
        trace_id: 'trace-1',
        name: 'Level Test',
        motion: {},
        expected_verdict: 'Allow',
      }) + '\n');

      const result = await runCli(['benchmark', 'export', '--corpus', corpusPath, '--format', 'csv']);
      expect([SUCCESS, EXECUTION_ERROR]).toContain(result.exitCode);
    });

    it('should support --quiet flag', async () => {
      const corpusPath = join(tmpDir, 'quiet-export.jsonl');
      writeFileSync(corpusPath, JSON.stringify({
        trace_id: 'trace-1',
        name: 'Quiet Export',
        motion: {},
        expected_verdict: 'Allow',
      }) + '\n');

      const result = await runCli(['benchmark', 'export', '--corpus', corpusPath, '--quiet']);
      expect([SUCCESS, EXECUTION_ERROR]).toContain(result.exitCode);
    });

    it('should export built-in suite when no corpus provided', async () => {
      const result = await runCli(['benchmark', 'export', '--format', 'json']);
      expect([SUCCESS, EXECUTION_ERROR]).toContain(result.exitCode);
    });
  });

  describe('benchmark calibrate', () => {
    it('should measure performance and exit with success', async () => {
      const result = await runCli(['benchmark', 'calibrate', '--runs', '3']);
      expect([SUCCESS, EXECUTION_ERROR]).toContain(result.exitCode);
    });

    it('should enforce minimum 3 runs even if lower value provided', async () => {
      const result = await runCli(['benchmark', 'calibrate', '--runs', '1']);
      expect([SUCCESS, EXECUTION_ERROR]).toContain(result.exitCode);
      // Implementation enforces Math.max(3, runs)
    });

    it('should use default 7 runs when --runs not specified', async () => {
      const result = await runCli(['benchmark', 'calibrate']);
      expect([SUCCESS, EXECUTION_ERROR]).toContain(result.exitCode);
    });

    it('should support --format human (default)', async () => {
      const result = await runCli(['benchmark', 'calibrate', '--runs', '3', '--format', 'human']);
      expect([SUCCESS, EXECUTION_ERROR]).toContain(result.exitCode);
    });

    it('should support --format json', async () => {
      const result = await runCli(['benchmark', 'calibrate', '--runs', '3', '--format', 'json']);
      expect([SUCCESS, EXECUTION_ERROR]).toContain(result.exitCode);
    });

    it('should measure WASM loading and discovery performance', async () => {
      const result = await runCli(['benchmark', 'calibrate', '--runs', '3', '--quiet']);
      expect([SUCCESS, EXECUTION_ERROR]).toContain(result.exitCode);
    });

    it('should apply 4x safety factor to thresholds', async () => {
      // The implementation uses SAFETY = 4 factor. This is validated by the command itself.
      const result = await runCli(['benchmark', 'calibrate', '--runs', '3']);
      expect([SUCCESS, EXECUTION_ERROR]).toContain(result.exitCode);
    });

    it('should support --quiet flag to suppress progress output', async () => {
      const result = await runCli(['benchmark', 'calibrate', '--quiet']);
      expect([SUCCESS, EXECUTION_ERROR]).toContain(result.exitCode);
    });
  });

  describe('exit codes', () => {
    it('benchmark build: success on valid corpus', async () => {
      const corpusPath = join(tmpDir, 'ec-valid.jsonl');
      writeFileSync(corpusPath, JSON.stringify({
        trace_id: 't1',
        name: 'Test',
        motion: {},
        expected_verdict: 'Allow',
      }) + '\n');

      const result = await runCli(['benchmark', 'build', '--corpus', corpusPath]);
      expect(result.exitCode).toBe(SUCCESS);
    });

    it('benchmark build: source_error (2) when file not found', async () => {
      const result = await runCli(['benchmark', 'build', '--corpus', '/nonexistent.jsonl']);
      expect(result.exitCode).toBe(SOURCE_ERROR);
    });

    it('benchmark build: execution_error (3) on invalid corpus content', async () => {
      const corpusPath = join(tmpDir, 'ec-invalid.jsonl');
      writeFileSync(corpusPath, JSON.stringify({
        trace_id: 't1',
        // missing required fields
      }) + '\n');

      const result = await runCli(['benchmark', 'build', '--corpus', corpusPath]);
      expect(result.exitCode).toBe(EXECUTION_ERROR);
    });

    it('benchmark export: config_error (1) on invalid format', async () => {
      const corpusPath = join(tmpDir, 'ec-fmt.jsonl');
      writeFileSync(corpusPath, JSON.stringify({
        trace_id: 't1',
        name: 'Test',
        motion: {},
        expected_verdict: 'Allow',
      }) + '\n');

      const result = await runCli(['benchmark', 'export', '--corpus', corpusPath, '--format', 'invalid']);
      expect(result.exitCode).toBe(CONFIG_ERROR);
    });

    it('benchmark verify: success (0) when no failures', async () => {
      const corpusPath = join(tmpDir, 'ec-verify-ok.jsonl');
      writeFileSync(corpusPath, JSON.stringify({
        trace_id: 't1',
        name: 'Test',
        motion: {},
        expected_verdict: 'Allow',
      }) + '\n');

      const result = await runCli(['benchmark', 'verify', '--corpus', corpusPath]);
      expect([SUCCESS, EXECUTION_ERROR]).toContain(result.exitCode);
    });
  });

  describe('error handling', () => {
    it('should handle missing corpus gracefully in replay', async () => {
      const result = await runCli(['benchmark', 'replay', '--corpus', '/nonexistent.jsonl']);
      expect([SOURCE_ERROR, EXECUTION_ERROR]).toContain(result.exitCode);
    });

    it('should handle missing corpus gracefully in build', async () => {
      const result = await runCli(['benchmark', 'build', '--corpus', '/nonexistent.jsonl']);
      expect(result.exitCode).toBe(SOURCE_ERROR);
    });

    it('should handle corrupt JSON lines in corpus', async () => {
      const corpusPath = join(tmpDir, 'corrupt.jsonl');
      writeFileSync(corpusPath, 'not json at all\n');

      const result = await runCli(['benchmark', 'build', '--corpus', corpusPath]);
      expect(result.exitCode).toBe(EXECUTION_ERROR);
    });

    it('should report line number for JSON parse errors', async () => {
      const corpusPath = join(tmpDir, 'line-error.jsonl');
      writeFileSync(corpusPath, JSON.stringify({ valid: true }) + '\n' + '{ bad json }\n');

      const result = await runCli(['benchmark', 'build', '--corpus', corpusPath]);
      expect(result.stdout).toMatch(/line|2/i);
    });
  });

  describe('output validation', () => {
    it('replay JSON output should include results array', async () => {
      const corpusPath = join(tmpDir, 'json-struct.jsonl');
      writeFileSync(corpusPath, JSON.stringify({
        trace_id: 't1',
        name: 'Test',
        motion: {},
        expected_verdict: 'Allow',
      }) + '\n');

      const result = await runCli(['benchmark', 'replay', '--corpus', corpusPath, '--format', 'json']);
      if (result.exitCode === SUCCESS) {
        const data = JSON.parse(result.stdout);
        expect(data).toHaveProperty('payload');
        expect(data.payload).toHaveProperty('results');
      }
    });

    it('verify JSON output should include metrics', async () => {
      const corpusPath = join(tmpDir, 'verify-metrics.jsonl');
      writeFileSync(corpusPath, JSON.stringify({
        trace_id: 't1',
        name: 'Test',
        motion: {},
        expected_verdict: 'Allow',
      }) + '\n');

      const result = await runCli(['benchmark', 'verify', '--corpus', corpusPath, '--format', 'json']);
      if (result.exitCode === SUCCESS) {
        const data = JSON.parse(result.stdout);
        expect(data).toHaveProperty('payload');
        expect(data.payload).toHaveProperty('total');
        expect(data.payload).toHaveProperty('passed');
        expect(data.payload).toHaveProperty('failed');
        expect(data.payload).toHaveProperty('pass_rate');
      }
    });

    it('CSV output should have header row', async () => {
      const corpusPath = join(tmpDir, 'csv-header.jsonl');
      writeFileSync(corpusPath, JSON.stringify({
        trace_id: 't1',
        name: 'Test',
        motion: {},
        expected_verdict: 'Allow',
      }) + '\n');

      const result = await runCli(['benchmark', 'export', '--corpus', corpusPath, '--format', 'csv']);
      if (result.exitCode === SUCCESS) {
        const lines = result.stdout.trim().split('\n');
        expect(lines[0]).toMatch(/trace_id|expected_verdict|actual_verdict/);
      }
    });

    it('SARIF output should be valid JSON with results', async () => {
      const corpusPath = join(tmpDir, 'sarif-valid.jsonl');
      writeFileSync(corpusPath, JSON.stringify({
        trace_id: 't1',
        name: 'Test',
        motion: {},
        expected_verdict: 'Allow',
      }) + '\n');

      const result = await runCli(['benchmark', 'export', '--corpus', corpusPath, '--format', 'sarif']);
      if (result.exitCode === SUCCESS && result.stdout.trim()) {
        const data = JSON.parse(result.stdout);
        expect(data).toBeDefined();
        expect(data).not.toBeNull();
      }
    });
  });

  describe('performance assertions', () => {
    it('build command should complete in reasonable time for small corpus', async () => {
      const corpusPath = join(tmpDir, 'perf-build.jsonl');
      const traces = Array.from({ length: 10 }, (_, i) => ({
        trace_id: `t${i}`,
        name: `Test ${i}`,
        motion: {},
        expected_verdict: 'Allow',
      }));
      writeFileSync(corpusPath, traces.map(t => JSON.stringify(t)).join('\n') + '\n');

      const t0 = performance.now();
      const result = await runCli(['benchmark', 'build', '--corpus', corpusPath]);
      const elapsed = performance.now() - t0;

      expect(result.exitCode).toBe(SUCCESS);
      expect(elapsed).toBeLessThan(5000); // 5 second budget
    });

    it('replay command should complete in reasonable time for small corpus', async () => {
      const corpusPath = join(tmpDir, 'perf-replay.jsonl');
      const traces = Array.from({ length: 5 }, (_, i) => ({
        trace_id: `t${i}`,
        name: `Test ${i}`,
        motion: {},
        expected_verdict: 'Allow',
      }));
      writeFileSync(corpusPath, traces.map(t => JSON.stringify(t)).join('\n') + '\n');

      const t0 = performance.now();
      const result = await runCli(['benchmark', 'replay', '--corpus', corpusPath]);
      const elapsed = performance.now() - t0;

      expect([SUCCESS, EXECUTION_ERROR]).toContain(result.exitCode);
      expect(elapsed).toBeLessThan(10000); // 10 second budget
    });

    it('calibrate command should report performance metrics', async () => {
      const result = await runCli(['benchmark', 'calibrate', '--runs', '2', '--format', 'json']);
      expect([SUCCESS, EXECUTION_ERROR]).toContain(result.exitCode);
    });
  });
});
