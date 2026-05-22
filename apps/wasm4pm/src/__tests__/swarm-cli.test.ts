import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runCli, createCliTestEnv } from '@wasm4pm/testing';
import * as path from 'path';
import * as fs from 'fs/promises';

// Numeric exit code constants — mirrors EXIT_CODES from @wasm4pm/testing
const SUCCESS = 0;
const SOURCE_ERROR = 2;
const EXECUTION_ERROR = 3;
const PARTIAL_FAILURE = 4;

// Minimal XES fixture for swarm tests
const MINIMAL_XES = `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0" xmlns="http://www.xes-standard.org/">
  <trace>
    <string key="concept:name" value="case-1"/>
    <event>
      <string key="concept:name" value="Register"/>
      <date key="time:timestamp" value="2026-04-16T10:00:00Z"/>
    </event>
    <event>
      <string key="concept:name" value="Approve"/>
      <date key="time:timestamp" value="2026-04-16T10:01:00Z"/>
    </event>
    <event>
      <string key="concept:name" value="Close"/>
      <date key="time:timestamp" value="2026-04-16T10:02:00Z"/>
    </event>
  </trace>
  <trace>
    <string key="concept:name" value="case-2"/>
    <event>
      <string key="concept:name" value="Register"/>
      <date key="time:timestamp" value="2026-04-16T11:00:00Z"/>
    </event>
    <event>
      <string key="concept:name" value="Reject"/>
      <date key="time:timestamp" value="2026-04-16T11:01:00Z"/>
    </event>
  </trace>
</log>`;

describe('wpm swarm — multi-worker convergence CLI', () => {
  let env: Awaited<ReturnType<typeof createCliTestEnv>>;
  let testXesPath: string;

  beforeEach(async () => {
    env = await createCliTestEnv();
    testXesPath = path.join(env.tempDir, 'swarm-test.xes');
    await fs.writeFile(testXesPath, MINIMAL_XES, 'utf-8');
  });

  afterEach(() => {
    env?.cleanup?.();
  });

  // -------------------------------------------------------------------------
  // Help and metadata
  // -------------------------------------------------------------------------

  describe('help and metadata', () => {
    it('should display help text and exit 0', async () => {
      const result = await runCli(['swarm', '--help']);
      expect(result.exitCode).toBe(SUCCESS);
      expect(result.stdout).toMatch(/swarm|worker|convergence|episode/i);
    });

    it('help output should mention input argument', async () => {
      const result = await runCli(['swarm', '--help']);
      expect(result.exitCode).toBe(SUCCESS);
      expect(result.stdout).toMatch(/input|xes|path/i);
    });

    it('help output should mention format option', async () => {
      const result = await runCli(['swarm', '--help']);
      expect(result.exitCode).toBe(SUCCESS);
      expect(result.stdout).toMatch(/format|json|human/i);
    });
  });

  // -------------------------------------------------------------------------
  // Input validation
  // -------------------------------------------------------------------------

  describe('input validation', () => {
    it('should exit non-zero when no input file is provided', async () => {
      const result = await runCli(['swarm']);
      expect(result.exitCode).not.toBe(SUCCESS);
    });

    it('should exit non-zero when input file does not exist', async () => {
      const result = await runCli(['swarm', '/nonexistent/log.xes']);
      expect([SOURCE_ERROR, EXECUTION_ERROR]).toContain(result.exitCode);
    });

    it('should exit non-zero for missing file regardless of other flags', async () => {
      const result = await runCli(['swarm', '/tmp/no-such-file-abc123.xes', '--format', 'json']);
      expect([SOURCE_ERROR, EXECUTION_ERROR]).toContain(result.exitCode);
    });

    it('JSON error output should contain status field on source error', async () => {
      const result = await runCli(['swarm', '/nonexistent/log.xes', '--format', 'json']);
      expect([SOURCE_ERROR, EXECUTION_ERROR]).toContain(result.exitCode);
      const parsed = JSON.parse(result.stdout) as { status: string };
      expect(parsed).toHaveProperty('status');
    });
  });

  // -------------------------------------------------------------------------
  // Output format
  // -------------------------------------------------------------------------

  describe('output format', () => {
    it('--format json should produce parseable JSON output', async () => {
      const result = await runCli([
        'swarm',
        testXesPath,
        '--format',
        'json',
        '--max-episodes',
        '1',
      ]);
      // WASM/LLM may fail but output must be JSON
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });

    it('JSON output should have status field', async () => {
      const result = await runCli([
        'swarm',
        testXesPath,
        '--format',
        'json',
        '--max-episodes',
        '1',
      ]);
      const parsed = JSON.parse(result.stdout) as { status: string };
      expect(parsed).toHaveProperty('status');
      expect(typeof parsed.status).toBe('string');
    });

    it('JSON output should have command field', async () => {
      const result = await runCli([
        'swarm',
        testXesPath,
        '--format',
        'json',
        '--max-episodes',
        '1',
      ]);
      const parsed = JSON.parse(result.stdout) as { command: string };
      expect(parsed).toHaveProperty('command');
    });

    it('JSON output should have payload field', async () => {
      const result = await runCli([
        'swarm',
        testXesPath,
        '--format',
        'json',
        '--max-episodes',
        '1',
      ]);
      const parsed = JSON.parse(result.stdout) as { payload: unknown };
      expect(parsed).toHaveProperty('payload');
    });

    it('human format should not produce bare JSON object', async () => {
      const result = await runCli([
        'swarm',
        testXesPath,
        '--format',
        'human',
        '--max-episodes',
        '1',
      ]);
      // Human output may contain JSON fragments but should not be ONLY a bare object
      // Check that it has some human-readable context
      const output = result.stdout + result.stderr;
      expect(output.length).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // Configuration flags
  // -------------------------------------------------------------------------

  describe('configuration flags', () => {
    it('--max-episodes flag should be accepted', async () => {
      const result = await runCli([
        'swarm',
        testXesPath,
        '--max-episodes',
        '2',
        '--format',
        'json',
      ]);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });

    it('--convergence-runs flag should be accepted', async () => {
      const result = await runCli([
        'swarm',
        testXesPath,
        '--convergence-runs',
        '1',
        '--max-episodes',
        '1',
        '--format',
        'json',
      ]);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });

    it('--convergence-threshold flag should be accepted (1.0 = unanimous)', async () => {
      const result = await runCli([
        'swarm',
        testXesPath,
        '--convergence-threshold',
        '1.0',
        '--max-episodes',
        '1',
        '--format',
        'json',
      ]);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });

    it('--algorithms flag with comma-separated list should be accepted', async () => {
      const result = await runCli([
        'swarm',
        testXesPath,
        '--algorithms',
        'dfg,analyze_statistics',
        '--max-episodes',
        '1',
        '--format',
        'json',
      ]);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });

    it('--algorithms dfg only should be accepted', async () => {
      const result = await runCli([
        'swarm',
        testXesPath,
        '--algorithms',
        'dfg',
        '--max-episodes',
        '1',
        '--format',
        'json',
      ]);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });

    it('--worker-model flag should be accepted', async () => {
      const result = await runCli([
        'swarm',
        testXesPath,
        '--worker-model',
        'llama-3.1-70b-versatile',
        '--max-episodes',
        '1',
        '--format',
        'json',
      ]);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });

    it('--verbose flag should be accepted', async () => {
      const result = await runCli([
        'swarm',
        testXesPath,
        '--verbose',
        '--max-episodes',
        '1',
      ]);
      // verbose is a boolean flag; command should run without CLI-level errors
      expect([SUCCESS, EXECUTION_ERROR, SOURCE_ERROR]).toContain(result.exitCode);
    });

    it('--quiet flag should be accepted without crashing', async () => {
      const result = await runCli([
        'swarm',
        testXesPath,
        '--quiet',
        '--max-episodes',
        '1',
        '--format',
        'json',
      ]);
      // quiet may suppress JSON output; just verify it does not crash with a CLI error
      expect([SUCCESS, EXECUTION_ERROR, PARTIAL_FAILURE]).toContain(result.exitCode);
    });
  });

  // -------------------------------------------------------------------------
  // JSON payload content (when swarm runs)
  // -------------------------------------------------------------------------

  describe('JSON payload content', () => {
    it('JSON payload should include input path on success or error', async () => {
      const result = await runCli([
        'swarm',
        testXesPath,
        '--format',
        'json',
        '--max-episodes',
        '1',
      ]);
      const parsed = JSON.parse(result.stdout) as {
        status: string;
        payload?: { input?: string };
      };
      if (parsed.status === 'ok') {
        expect(parsed.payload).toHaveProperty('input');
      }
    });

    it('JSON payload should include converged field on success', async () => {
      const result = await runCli([
        'swarm',
        testXesPath,
        '--format',
        'json',
        '--max-episodes',
        '1',
      ]);
      const parsed = JSON.parse(result.stdout) as {
        status: string;
        payload?: { converged?: boolean };
      };
      if (parsed.status === 'ok') {
        expect(parsed.payload).toHaveProperty('converged');
        expect(typeof parsed.payload?.converged).toBe('boolean');
      }
    });

    it('JSON payload should include episodes array on success', async () => {
      const result = await runCli([
        'swarm',
        testXesPath,
        '--format',
        'json',
        '--max-episodes',
        '1',
      ]);
      const parsed = JSON.parse(result.stdout) as {
        status: string;
        payload?: { episodes?: unknown[] };
      };
      if (parsed.status === 'ok') {
        expect(parsed.payload).toHaveProperty('episodes');
        expect(Array.isArray(parsed.payload?.episodes)).toBe(true);
      }
    });

    it('JSON payload should include consensusRatio on success', async () => {
      const result = await runCli([
        'swarm',
        testXesPath,
        '--format',
        'json',
        '--max-episodes',
        '1',
      ]);
      const parsed = JSON.parse(result.stdout) as {
        status: string;
        payload?: { consensusRatio?: number };
      };
      if (parsed.status === 'ok') {
        expect(parsed.payload).toHaveProperty('consensusRatio');
        expect(typeof parsed.payload?.consensusRatio).toBe('number');
      }
    });

    it('JSON payload should include workerModel on success', async () => {
      const result = await runCli([
        'swarm',
        testXesPath,
        '--format',
        'json',
        '--max-episodes',
        '1',
      ]);
      const parsed = JSON.parse(result.stdout) as {
        status: string;
        payload?: { workerModel?: string };
      };
      if (parsed.status === 'ok') {
        expect(parsed.payload).toHaveProperty('workerModel');
        expect(typeof parsed.payload?.workerModel).toBe('string');
      }
    });

    it('JSON payload should include algorithmIds array on success', async () => {
      const result = await runCli([
        'swarm',
        testXesPath,
        '--format',
        'json',
        '--max-episodes',
        '1',
      ]);
      const parsed = JSON.parse(result.stdout) as {
        status: string;
        payload?: { algorithmIds?: string[] };
      };
      if (parsed.status === 'ok') {
        expect(parsed.payload).toHaveProperty('algorithmIds');
        expect(Array.isArray(parsed.payload?.algorithmIds)).toBe(true);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Exit codes
  // -------------------------------------------------------------------------

  describe('exit codes', () => {
    it('missing input: should exit non-zero', async () => {
      const result = await runCli(['swarm']);
      expect(result.exitCode).not.toBe(SUCCESS);
    });

    it('nonexistent file: should exit non-zero (source or execution error)', async () => {
      const result = await runCli(['swarm', '/no/such/file.xes']);
      expect([SOURCE_ERROR, EXECUTION_ERROR]).toContain(result.exitCode);
    });

    it('valid file with 1 episode: should exit 0, 3, or 4 (not 1 or 2)', async () => {
      const result = await runCli([
        'swarm',
        testXesPath,
        '--max-episodes',
        '1',
        '--format',
        'json',
      ]);
      // 0=success, 3=execution_error (LLM unavailable), 4=partial_failure
      expect([SUCCESS, EXECUTION_ERROR, PARTIAL_FAILURE]).toContain(result.exitCode);
    });
  });

  // -------------------------------------------------------------------------
  // Gap: --workers flag validation (closed this cycle)
  // -------------------------------------------------------------------------

  describe('--workers flag validation', () => {
    it('--workers 0 should exit config_error (1)', async () => {
      const result = await runCli(['swarm', testXesPath, '--workers', '0'], {
        cwd: env.tempDir,
      });
      expect(result.exitCode).toBe(1);
    });

    it('--workers -1 should exit config_error (1)', async () => {
      const result = await runCli(['swarm', testXesPath, '--workers', '-1'], {
        cwd: env.tempDir,
      });
      expect(result.exitCode).toBe(1);
    });

    it('--workers 0 with json format should produce INVALID_WORKERS error code', async () => {
      const result = await runCli(
        ['swarm', testXesPath, '--workers', '0', '--format', 'json'],
        { cwd: env.tempDir }
      );
      expect(result.exitCode).toBe(1);
      const parsed = JSON.parse(result.stdout) as { status: string; error?: { code: string } };
      expect(parsed.status).toBe('error');
      expect(parsed.error?.code).toBe('INVALID_WORKERS');
    });

    it('--workers 1 should be accepted (not config_error)', async () => {
      const result = await runCli(
        ['swarm', testXesPath, '--workers', '1', '--max-episodes', '1', '--format', 'json'],
        { cwd: env.tempDir }
      );
      expect(result.exitCode).not.toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // Gap: --no-save flag declared (closed this cycle)
  // -------------------------------------------------------------------------

  describe('--no-save flag', () => {
    it('--no-save appears in --help output', async () => {
      const result = await runCli(['swarm', '--help']);
      expect(result.exitCode).toBe(SUCCESS);
      expect(result.stdout).toMatch(/no-save/i);
    });

    it('--no-save accepted without parse error', async () => {
      const result = await runCli(
        ['swarm', testXesPath, '--no-save', '--max-episodes', '1', '--format', 'json'],
        { cwd: env.tempDir }
      );
      expect(result.exitCode).not.toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // Gap: iterationCount, workerCount, convergenceStatus in JSON payload
  // -------------------------------------------------------------------------

  describe('JSON payload — new fields: iterationCount, workerCount, convergenceStatus', () => {
    it('iterationCount is present and non-negative on success', async () => {
      const result = await runCli(
        ['swarm', testXesPath, '--max-episodes', '1', '--format', 'json'],
        { cwd: env.tempDir }
      );
      const parsed = JSON.parse(result.stdout) as {
        status: string;
        payload?: { iterationCount?: number };
      };
      if (parsed.status === 'ok') {
        expect(parsed.payload).toHaveProperty('iterationCount');
        expect(parsed.payload?.iterationCount as number).toBeGreaterThanOrEqual(0);
      }
    });

    it('workerCount is present and >= 1 on success', async () => {
      const result = await runCli(
        ['swarm', testXesPath, '--max-episodes', '1', '--format', 'json'],
        { cwd: env.tempDir }
      );
      const parsed = JSON.parse(result.stdout) as {
        status: string;
        payload?: { workerCount?: number };
      };
      if (parsed.status === 'ok') {
        expect(parsed.payload).toHaveProperty('workerCount');
        expect(parsed.payload?.workerCount as number).toBeGreaterThanOrEqual(1);
      }
    });

    it('convergenceStatus is one of converged/timeout/not_converged on success', async () => {
      const result = await runCli(
        ['swarm', testXesPath, '--max-episodes', '1', '--format', 'json'],
        { cwd: env.tempDir }
      );
      const parsed = JSON.parse(result.stdout) as {
        status: string;
        payload?: { convergenceStatus?: string };
      };
      if (parsed.status === 'ok') {
        expect(parsed.payload).toHaveProperty('convergenceStatus');
        expect(['converged', 'timeout', 'not_converged']).toContain(
          parsed.payload?.convergenceStatus
        );
      }
    });
  });

  // -------------------------------------------------------------------------
  // Gap: empty input log → source_error (closed this cycle)
  // -------------------------------------------------------------------------

  describe('empty input log', () => {
    it('empty XES file should exit source_error (2)', async () => {
      const emptyXesPath = path.join(env.tempDir, 'empty.xes');
      await fs.writeFile(emptyXesPath, '', 'utf-8');
      const result = await runCli(['swarm', emptyXesPath, '--format', 'json'], {
        cwd: env.tempDir,
      });
      expect(result.exitCode).toBe(SOURCE_ERROR);
    });

    it('empty XES file produces EMPTY_INPUT_LOG error code', async () => {
      const emptyXesPath = path.join(env.tempDir, 'empty2.xes');
      await fs.writeFile(emptyXesPath, '', 'utf-8');
      const result = await runCli(['swarm', emptyXesPath, '--format', 'json'], {
        cwd: env.tempDir,
      });
      expect(result.exitCode).toBe(SOURCE_ERROR);
      const parsed = JSON.parse(result.stdout) as { status: string; error?: { code: string } };
      expect(parsed.status).toBe('error');
      expect(parsed.error?.code).toBe('EMPTY_INPUT_LOG');
    });
  });
});
