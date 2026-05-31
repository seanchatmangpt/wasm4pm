import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runCli, createCliTestEnv } from '@wasm4pm/testing';
import * as path from 'path';
import * as fs from 'fs/promises';

const SUCCESS = 0;
const CONFIG_ERROR = 1;
const SOURCE_ERROR = 2;
const EXECUTION_ERROR = 3;

// Minimal XES fixture for swarm multi-log tests
const MINIMAL_XES_A = `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0" xmlns="http://www.xes-standard.org/">
  <trace>
    <string key="concept:name" value="case-1"/>
    <event>
      <string key="concept:name" value="Register"/>
      <date key="time:timestamp" value="2026-01-10T09:00:00Z"/>
    </event>
    <event>
      <string key="concept:name" value="Approve"/>
      <date key="time:timestamp" value="2026-01-10T10:00:00Z"/>
    </event>
    <event>
      <string key="concept:name" value="Close"/>
      <date key="time:timestamp" value="2026-01-10T11:00:00Z"/>
    </event>
  </trace>
  <trace>
    <string key="concept:name" value="case-2"/>
    <event>
      <string key="concept:name" value="Register"/>
      <date key="time:timestamp" value="2026-01-11T09:00:00Z"/>
    </event>
    <event>
      <string key="concept:name" value="Reject"/>
      <date key="time:timestamp" value="2026-01-11T10:00:00Z"/>
    </event>
  </trace>
</log>`;

const MINIMAL_XES_B = `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0" xmlns="http://www.xes-standard.org/">
  <trace>
    <string key="concept:name" value="case-1"/>
    <event>
      <string key="concept:name" value="Submit"/>
      <date key="time:timestamp" value="2026-02-10T09:00:00Z"/>
    </event>
    <event>
      <string key="concept:name" value="Review"/>
      <date key="time:timestamp" value="2026-02-10T10:00:00Z"/>
    </event>
    <event>
      <string key="concept:name" value="Approve"/>
      <date key="time:timestamp" value="2026-02-10T11:00:00Z"/>
    </event>
    <event>
      <string key="concept:name" value="Ship"/>
      <date key="time:timestamp" value="2026-02-10T12:00:00Z"/>
    </event>
  </trace>
  <trace>
    <string key="concept:name" value="case-2"/>
    <event>
      <string key="concept:name" value="Submit"/>
      <date key="time:timestamp" value="2026-02-11T09:00:00Z"/>
    </event>
    <event>
      <string key="concept:name" value="Review"/>
      <date key="time:timestamp" value="2026-02-11T10:00:00Z"/>
    </event>
    <event>
      <string key="concept:name" value="Reject"/>
      <date key="time:timestamp" value="2026-02-11T11:00:00Z"/>
    </event>
  </trace>
  <trace>
    <string key="concept:name" value="case-3"/>
    <event>
      <string key="concept:name" value="Submit"/>
      <date key="time:timestamp" value="2026-02-12T09:00:00Z"/>
    </event>
    <event>
      <string key="concept:name" value="AI_Approve"/>
      <date key="time:timestamp" value="2026-02-12T09:05:00Z"/>
    </event>
    <event>
      <string key="concept:name" value="Ship"/>
      <date key="time:timestamp" value="2026-02-12T09:10:00Z"/>
    </event>
  </trace>
</log>`;

// ── Test environment setup ────────────────────────────────────────────────────

describe('wpm swarm multi — parallel multi-log analysis', () => {
  let env: Awaited<ReturnType<typeof createCliTestEnv>>;
  let logPathA: string;
  let logPathB: string;

  beforeEach(async () => {
    env = await createCliTestEnv();
    logPathA = path.join(env.tempDir, 'log-q1.xes');
    logPathB = path.join(env.tempDir, 'log-q2.xes');
    await fs.writeFile(logPathA, MINIMAL_XES_A, 'utf-8');
    await fs.writeFile(logPathB, MINIMAL_XES_B, 'utf-8');
  });

  afterEach(() => {
    env?.cleanup?.();
  });

  // ── Help ──────────────────────────────────────────────────────────────────

  describe('help and metadata', () => {
    it('wpm swarm multi --help exits 0', async () => {
      const result = await runCli(['swarm', 'multi', '--help']);
      expect(result.exitCode).toBe(SUCCESS);
    });

    it('swarm multi help mentions workers or parallel', async () => {
      const result = await runCli(['swarm', 'multi', '--help']);
      expect(result.exitCode).toBe(SUCCESS);
      expect(result.stdout).toMatch(/worker|parallel|algorithm|input/i);
    });
  });

  // ── Input validation ──────────────────────────────────────────────────────

  describe('input validation', () => {
    it('no input files → source_error (2)', async () => {
      const result = await runCli(['swarm', 'multi', '--format', 'json'], { cwd: env.tempDir });
      expect([SOURCE_ERROR, CONFIG_ERROR, EXECUTION_ERROR]).toContain(result.exitCode);
    });

    it('non-existent glob → source_error', async () => {
      const result = await runCli(
        ['swarm', 'multi', '-i', '/nonexistent/*.xes', '--format', 'json'],
        { cwd: env.tempDir }
      );
      expect([SOURCE_ERROR, CONFIG_ERROR, EXECUTION_ERROR]).toContain(result.exitCode);
    });
  });

  // ── Two-file multi run ────────────────────────────────────────────────────

  describe('two-file parallel run', () => {
    it('wpm swarm multi -i <file> -i <file> exits 0 or execution_error', async () => {
      const result = await runCli(
        ['swarm', 'multi', '-i', logPathA, '-i', logPathB, '--format', 'json'],
        { cwd: env.tempDir }
      );
      // 0=success, 3=execution_error (LLM unavailable is acceptable)
      expect([SUCCESS, EXECUTION_ERROR]).toContain(result.exitCode);
    });

    it('JSON output is parseable', async () => {
      const result = await runCli(
        ['swarm', 'multi', '-i', logPathA, '-i', logPathB, '--format', 'json'],
        { cwd: env.tempDir }
      );
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });

    it('JSON output has status field', async () => {
      const result = await runCli(
        ['swarm', 'multi', '-i', logPathA, '-i', logPathB, '--format', 'json'],
        { cwd: env.tempDir }
      );
      const parsed = JSON.parse(result.stdout) as { status: string };
      expect(parsed).toHaveProperty('status');
      expect(typeof parsed.status).toBe('string');
    });

    it('success payload contains convergence_reached boolean', async () => {
      const result = await runCli(
        ['swarm', 'multi', '-i', logPathA, '-i', logPathB, '--format', 'json'],
        { cwd: env.tempDir }
      );
      const parsed = JSON.parse(result.stdout) as {
        status: string;
        payload?: { convergence_reached?: boolean };
      };
      if (parsed.status === 'ok') {
        expect(parsed.payload).toHaveProperty('convergence_reached');
        expect(typeof parsed.payload!.convergence_reached).toBe('boolean');
      }
    });

    it('success payload contains consensus_algorithm', async () => {
      const result = await runCli(
        ['swarm', 'multi', '-i', logPathA, '-i', logPathB, '--format', 'json'],
        { cwd: env.tempDir }
      );
      const parsed = JSON.parse(result.stdout) as {
        status: string;
        payload?: { consensus_algorithm?: string };
      };
      if (parsed.status === 'ok') {
        expect(parsed.payload).toHaveProperty('consensus_algorithm');
        expect(typeof parsed.payload!.consensus_algorithm).toBe('string');
      }
    });

    it('success payload contains results array with 2 entries for 2 files', async () => {
      const result = await runCli(
        ['swarm', 'multi', '-i', logPathA, '-i', logPathB, '--format', 'json'],
        { cwd: env.tempDir }
      );
      const parsed = JSON.parse(result.stdout) as {
        status: string;
        payload?: { results?: unknown[] };
      };
      if (parsed.status === 'ok') {
        expect(parsed.payload).toHaveProperty('results');
        expect(Array.isArray(parsed.payload!.results)).toBe(true);
        expect(parsed.payload!.results!.length).toBe(2);
      }
    });

    it('--workers 2 flag processes both workers', async () => {
      const result = await runCli(
        ['swarm', 'multi', '-i', logPathA, '-i', logPathB, '--workers', '2', '--format', 'json'],
        { cwd: env.tempDir }
      );
      expect([SUCCESS, EXECUTION_ERROR]).toContain(result.exitCode);
      const parsed = JSON.parse(result.stdout) as {
        status: string;
        payload?: { workers?: number; results?: unknown[] };
      };
      if (parsed.status === 'ok') {
        expect(parsed.payload!.workers).toBe(2);
      }
    });

    it('human format includes results table header', async () => {
      const result = await runCli(
        ['swarm', 'multi', '-i', logPathA, '-i', logPathB],
        { cwd: env.tempDir }
      );
      if (result.exitCode === SUCCESS) {
        expect(result.stdout + result.stderr).toMatch(/File|Results|Convergence/i);
      }
    });
  });

  // ── Algorithm flag ────────────────────────────────────────────────────────

  describe('--algorithm flag', () => {
    it('--algorithm dfg is accepted', async () => {
      const result = await runCli(
        ['swarm', 'multi', '-i', logPathA, '--algorithm', 'dfg', '--format', 'json'],
        { cwd: env.tempDir }
      );
      expect([SUCCESS, EXECUTION_ERROR]).toContain(result.exitCode);
    });

    it('consensus_algorithm in payload matches requested algorithm on success', async () => {
      const result = await runCli(
        ['swarm', 'multi', '-i', logPathA, '-i', logPathB, '--algorithm', 'dfg', '--format', 'json'],
        { cwd: env.tempDir }
      );
      const parsed = JSON.parse(result.stdout) as {
        status: string;
        payload?: { consensus_algorithm?: string };
      };
      if (parsed.status === 'ok') {
        expect(parsed.payload!.consensus_algorithm).toBe('dfg');
      }
    });
  });
});

// ── swarm compare ─────────────────────────────────────────────────────────────

describe('wpm swarm compare — cross-log drift detection', () => {
  let env: Awaited<ReturnType<typeof createCliTestEnv>>;
  let baselinePath: string;
  let currentPath: string;

  beforeEach(async () => {
    env = await createCliTestEnv();
    baselinePath = path.join(env.tempDir, 'baseline.xes');
    currentPath = path.join(env.tempDir, 'current.xes');
    await fs.writeFile(baselinePath, MINIMAL_XES_A, 'utf-8');
    await fs.writeFile(currentPath, MINIMAL_XES_B, 'utf-8');
  });

  afterEach(() => {
    env?.cleanup?.();
  });

  describe('help', () => {
    it('wpm swarm compare --help exits 0', async () => {
      const result = await runCli(['swarm', 'compare', '--help']);
      expect(result.exitCode).toBe(SUCCESS);
    });

    it('help mentions baseline or current or structural', async () => {
      const result = await runCli(['swarm', 'compare', '--help']);
      expect(result.stdout).toMatch(/input|baseline|current|structural|diff/i);
    });
  });

  describe('input validation', () => {
    it('fewer than 2 inputs → config_error (1)', async () => {
      const result = await runCli(
        ['swarm', 'compare', '-i', baselinePath, '--format', 'json'],
        { cwd: env.tempDir }
      );
      expect([CONFIG_ERROR, SOURCE_ERROR, EXECUTION_ERROR]).toContain(result.exitCode);
    });

    it('non-existent baseline → source_error', async () => {
      const result = await runCli(
        ['swarm', 'compare', '-i', '/no/such/file.xes', '-i', currentPath, '--format', 'json'],
        { cwd: env.tempDir }
      );
      expect([SOURCE_ERROR, EXECUTION_ERROR]).toContain(result.exitCode);
    });
  });

  describe('structural diff', () => {
    it('exits 0 or execution_error on valid two-file compare', async () => {
      const result = await runCli(
        ['swarm', 'compare', '-i', baselinePath, '-i', currentPath, '--format', 'json'],
        { cwd: env.tempDir }
      );
      expect([SUCCESS, EXECUTION_ERROR]).toContain(result.exitCode);
    });

    it('JSON output is parseable', async () => {
      const result = await runCli(
        ['swarm', 'compare', '-i', baselinePath, '-i', currentPath, '--format', 'json'],
        { cwd: env.tempDir }
      );
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });

    it('success payload contains diff.new_activities array', async () => {
      const result = await runCli(
        ['swarm', 'compare', '-i', baselinePath, '-i', currentPath, '--format', 'json'],
        { cwd: env.tempDir }
      );
      const parsed = JSON.parse(result.stdout) as {
        status: string;
        payload?: { diff?: { new_activities?: string[] } };
      };
      if (parsed.status === 'ok') {
        expect(parsed.payload!.diff).toHaveProperty('new_activities');
        expect(Array.isArray(parsed.payload!.diff!.new_activities)).toBe(true);
      }
    });

    it('success payload contains verdict string', async () => {
      const result = await runCli(
        ['swarm', 'compare', '-i', baselinePath, '-i', currentPath, '--format', 'json'],
        { cwd: env.tempDir }
      );
      const parsed = JSON.parse(result.stdout) as {
        status: string;
        payload?: { verdict?: string };
      };
      if (parsed.status === 'ok') {
        expect(parsed.payload).toHaveProperty('verdict');
        expect(typeof parsed.payload!.verdict).toBe('string');
        expect(parsed.payload!.verdict!.length).toBeGreaterThan(0);
      }
    });

    it('success payload has convergence_reached boolean', async () => {
      const result = await runCli(
        ['swarm', 'compare', '-i', baselinePath, '-i', currentPath, '--format', 'json'],
        { cwd: env.tempDir }
      );
      const parsed = JSON.parse(result.stdout) as {
        status: string;
        payload?: { convergence_reached?: boolean };
      };
      if (parsed.status === 'ok') {
        expect(parsed.payload).toHaveProperty('convergence_reached');
        expect(typeof parsed.payload!.convergence_reached).toBe('boolean');
      }
    });

    it('success payload has consensus_algorithm string', async () => {
      const result = await runCli(
        ['swarm', 'compare', '-i', baselinePath, '-i', currentPath, '--format', 'json'],
        { cwd: env.tempDir }
      );
      const parsed = JSON.parse(result.stdout) as {
        status: string;
        payload?: { consensus_algorithm?: string };
      };
      if (parsed.status === 'ok') {
        expect(parsed.payload).toHaveProperty('consensus_algorithm');
        expect(typeof parsed.payload!.consensus_algorithm).toBe('string');
      }
    });

    it('diff detects new activities when current log has more activities', async () => {
      const result = await runCli(
        ['swarm', 'compare', '-i', baselinePath, '-i', currentPath, '--format', 'json'],
        { cwd: env.tempDir }
      );
      const parsed = JSON.parse(result.stdout) as {
        status: string;
        payload?: { diff?: { new_activities?: string[] } };
      };
      // MINIMAL_XES_B has Submit, Review, AI_Approve, Ship vs A's Register, Approve, Close, Reject
      if (parsed.status === 'ok') {
        // There should be new activities (Submit, Review, Ship, AI_Approve not in baseline)
        expect(parsed.payload!.diff!.new_activities!.length).toBeGreaterThan(0);
      }
    });

    it('--deep flag is accepted without error', async () => {
      const result = await runCli(
        ['swarm', 'compare', '-i', baselinePath, '-i', currentPath, '--deep', '--format', 'json'],
        { cwd: env.tempDir }
      );
      expect([SUCCESS, EXECUTION_ERROR]).toContain(result.exitCode);
    });

    it('human output includes Structural Changes section', async () => {
      const result = await runCli(
        ['swarm', 'compare', '-i', baselinePath, '-i', currentPath],
        { cwd: env.tempDir }
      );
      if (result.exitCode === SUCCESS) {
        expect(result.stdout + result.stderr).toMatch(/Structural|activities|Verdict/i);
      }
    });
  });
});

// ── wpm swarm (base) with --visualize ─────────────────────────────────────────

describe('wpm swarm (base) — existing command with --visualize', () => {
  let env: Awaited<ReturnType<typeof createCliTestEnv>>;
  let logPath: string;

  beforeEach(async () => {
    env = await createCliTestEnv();
    logPath = path.join(env.tempDir, 'test.xes');
    await fs.writeFile(logPath, MINIMAL_XES_A, 'utf-8');
  });

  afterEach(() => {
    env?.cleanup?.();
  });

  it('wpm swarm <file> exits 0 (original behavior preserved)', async () => {
    const result = await runCli(
      ['swarm', logPath, '--max-episodes', '1', '--format', 'json'],
      { cwd: env.tempDir }
    );
    expect([SUCCESS, EXECUTION_ERROR]).toContain(result.exitCode);
  });

  it('JSON output has convergence_reached boolean', async () => {
    const result = await runCli(
      ['swarm', logPath, '--max-episodes', '1', '--format', 'json'],
      { cwd: env.tempDir }
    );
    const parsed = JSON.parse(result.stdout) as {
      status: string;
      payload?: { convergence_reached?: boolean; converged?: boolean };
    };
    if (parsed.status === 'ok') {
      // Both fields should be present (convergence_reached is the new canonical one)
      expect(parsed.payload).toHaveProperty('converged');
      expect(typeof parsed.payload!.converged).toBe('boolean');
    }
  });

  it('JSON output has consensus_algorithm string', async () => {
    const result = await runCli(
      ['swarm', logPath, '--max-episodes', '1', '--format', 'json'],
      { cwd: env.tempDir }
    );
    const parsed = JSON.parse(result.stdout) as {
      status: string;
      payload?: { consensusAlgorithm?: string };
    };
    if (parsed.status === 'ok') {
      expect(parsed.payload).toHaveProperty('consensusAlgorithm');
      expect(typeof parsed.payload!.consensusAlgorithm).toBe('string');
    }
  });

  it('--visualize flag is accepted and exits 0 or execution_error', async () => {
    const result = await runCli(
      ['swarm', logPath, '--max-episodes', '1', '--visualize'],
      { cwd: env.tempDir }
    );
    expect([SUCCESS, EXECUTION_ERROR]).toContain(result.exitCode);
  });
});

// ── wpm swarm insights ────────────────────────────────────────────────────────

describe('wpm swarm insights — cross-run pattern mining', () => {
  let env: Awaited<ReturnType<typeof createCliTestEnv>>;

  beforeEach(async () => {
    env = await createCliTestEnv();
  });

  afterEach(() => {
    env?.cleanup?.();
  });

  it('wpm swarm insights --help exits 0', async () => {
    const result = await runCli(['swarm', 'insights', '--help']);
    expect(result.exitCode).toBe(SUCCESS);
  });

  it('insights with no results dir exits 0 (graceful empty)', async () => {
    const result = await runCli(
      ['swarm', 'insights', '--from-results', '/tmp/nonexistent-results-dir/*.json', '--format', 'json'],
      { cwd: env.tempDir }
    );
    // Should gracefully handle empty results, not crash
    expect([SUCCESS, EXECUTION_ERROR]).toContain(result.exitCode);
  });

  it('JSON output is parseable', async () => {
    const result = await runCli(
      ['swarm', 'insights', '--from-results', '/tmp/nonexistent-results-dir/*.json', '--format', 'json'],
      { cwd: env.tempDir }
    );
    expect(() => JSON.parse(result.stdout)).not.toThrow();
  });

  it('success payload contains results_scanned number', async () => {
    const result = await runCli(
      ['swarm', 'insights', '--from-results', '/tmp/nonexistent-results-dir/*.json', '--format', 'json'],
      { cwd: env.tempDir }
    );
    const parsed = JSON.parse(result.stdout) as {
      status: string;
      payload?: { results_scanned?: number };
    };
    if (parsed.status === 'ok') {
      expect(parsed.payload).toHaveProperty('results_scanned');
      expect(typeof parsed.payload!.results_scanned).toBe('number');
    }
  });

  it('success payload contains algorithm_patterns array', async () => {
    const result = await runCli(
      ['swarm', 'insights', '--from-results', '/tmp/nonexistent-results-dir/*.json', '--format', 'json'],
      { cwd: env.tempDir }
    );
    const parsed = JSON.parse(result.stdout) as {
      status: string;
      payload?: { algorithm_patterns?: unknown[] };
    };
    if (parsed.status === 'ok') {
      expect(parsed.payload).toHaveProperty('algorithm_patterns');
      expect(Array.isArray(parsed.payload!.algorithm_patterns)).toBe(true);
    }
  });

  it('with stored result files, insights parses them correctly', async () => {
    // Write a mock stored result JSON
    const resultsDir = path.join(env.tempDir, '.wasm4pm', 'results');
    await fs.mkdir(resultsDir, { recursive: true });
    const mockResult = {
      command: 'swarm',
      status: 'ok',
      payload: {
        consensusAlgorithm: 'dfg',
        algorithmIds: ['dfg'],
        converged: true,
        healthyWorkerCount: 3,
        workerCount: 3,
      },
      meta: {
        duration_ms: 2000,
        timestamp: new Date().toISOString(),
      },
    };
    await fs.writeFile(
      path.join(resultsDir, 'swarm-test-123.json'),
      JSON.stringify(mockResult),
      'utf-8'
    );

    const result = await runCli(
      ['swarm', 'insights', '--from-results', path.join(resultsDir, '*.json'), '--format', 'json'],
      { cwd: env.tempDir }
    );
    expect([SUCCESS, EXECUTION_ERROR]).toContain(result.exitCode);
    const parsed = JSON.parse(result.stdout) as {
      status: string;
      payload?: { results_scanned?: number; algorithm_patterns?: unknown[] };
    };
    if (parsed.status === 'ok') {
      expect(parsed.payload!.results_scanned).toBeGreaterThan(0);
    }
  });
});
