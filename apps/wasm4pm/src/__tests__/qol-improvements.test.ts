import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runCli, EXIT_CODES, createCliTestEnv } from '@wasm4pm/testing';
import * as path from 'path';
import * as fs from 'fs/promises';

describe('Quality-of-Life (QoL) and DX Improvements', () => {
  let env: Awaited<ReturnType<typeof createCliTestEnv>>;
  let testXesPath: string;

  beforeEach(async () => {
    env = await createCliTestEnv(JSON.stringify({
      schemaVersion: 1,
      version: "26.6.5",
      algorithm: {
        name: "dfg",
        parameters: {}
      },
      execution: {
        profile: "fast",
        timeout: 60000
      },
      ml: {
        enabled: false,
        tasks: []
      },
      prediction: {
        enabled: false,
        tasks: []
      }
    }));
    testXesPath = path.join(env.tempDir, 'test.xes');
    let fixtureSource = '';
    const candidates = [
      path.resolve(process.cwd(), 'test/fixtures/small.xes'),
      path.resolve(process.cwd(), '../../test/fixtures/small.xes'),
      path.resolve(__dirname, '../../test/fixtures/small.xes'),
      path.resolve(__dirname, '../../../test/fixtures/small.xes'),
      path.resolve(__dirname, '../../../../test/fixtures/small.xes'),
    ];
    for (const c of candidates) {
      try {
        await fs.access(c);
        fixtureSource = c;
        break;
      } catch {}
    }
    try {
      if (fixtureSource) {
        await fs.copyFile(fixtureSource, testXesPath);
      } else {
        throw new Error('No fixture source found');
      }
    } catch (error) {
      const minimalXes = `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0" xmlns="http://www.xes-standard.org/">
  <trace>
    <string key="concept:name" value="case-1"/>
    <event>
      <string key="concept:name" value="Start"/>
      <date key="time:timestamp" value="2026-04-16T10:00:00Z"/>
    </event>
    <event>
      <string key="concept:name" value="End"/>
      <date key="time:timestamp" value="2026-04-16T10:01:00Z"/>
    </event>
  </trace>
</log>`;
      await fs.writeFile(testXesPath, minimalXes, 'utf-8');
    }
  });

  afterEach(() => {
    env?.cleanup?.();
  });

  describe('QoL-001: Algorithm selection tier rationale & recommendation optimization', () => {
    it('should display per-tier rationales in algorithms output', async () => {
      const result = await runCli(['algorithms'], { env: env.env });
      expect(result.exitCode, `stdout: ${result.stdout}\nstderr: ${result.stderr}`).toBe(EXIT_CODES.success);
      expect(result.stdout).toContain('Rationale: Best for rapid, interactive exploration of large logs');
      expect(result.stdout).toContain('Rationale: Best for general-purpose batch analysis');
    });

    it('should support recommend-for time optimization', async () => {
      const result = await runCli(['algorithms', '--recommend', testXesPath, '--recommend-for', 'time'], { env: env.env });
      expect(result.exitCode, `stdout: ${result.stdout}\nstderr: ${result.stderr}`).toBe(EXIT_CODES.success);
      expect(result.stdout).toContain('Recommended: DFG');
      expect(result.stdout).toContain('Optimized for speed');
    });

    it('should support recommend-for size optimization', async () => {
      const result = await runCli(['algorithms', '--recommend', testXesPath, '--recommend-for', 'size'], { env: env.env });
      expect(result.exitCode, `stdout: ${result.stdout}\nstderr: ${result.stderr}`).toBe(EXIT_CODES.success);
      expect(result.stdout).toContain('Recommended: Process Skeleton');
      expect(result.stdout).toContain('Optimized for minimal footprint');
    });
  });

  describe('QoL-002 & QoL-005 & QoL-009: Conformance check enhancements', () => {
    it('should explain fitness threshold and context', async () => {
      const result = await runCli(['conformance', '-i', testXesPath, '--explain-fitness', '--threshold', '0.0'], { env: env.env });
      expect(result.exitCode, `stdout: ${result.stdout}\nstderr: ${result.stderr}`).toBe(EXIT_CODES.success);
      expect(result.stdout).toContain('Threshold context: Fitness ≥0.85 meets the academic standard');
      expect(result.stdout).toContain('Fitness Threshold Guide:');
      expect(result.stdout).toContain('Van der Aalst Academic Standard');
    });

    it('should explain confidence interval (Agresti-Coull)', async () => {
      const result = await runCli(['conformance', '-i', testXesPath, '--explain-ci', '--threshold', '0.0'], { env: env.env });
      expect(result.exitCode, `stdout: ${result.stdout}\nstderr: ${result.stderr}`).toBe(EXIT_CODES.success);
      expect(result.stdout).toContain('CI Diagnostic:');
      expect(result.stdout).toContain('Statistical Confidence Interval (Agresti-Coull) Guide:');
    });

    it('should support deviations diagnostics report and remediation', async () => {
      // Create a deviating model to trigger deviations
      // We will just run with defaults, if no deviations, it won't show remediation but let's verify arg exists
      const result = await runCli(['conformance', '-i', testXesPath, '--diagnose-deviations', '--threshold', '0.0'], { env: env.env });
      expect(result.exitCode, `stdout: ${result.stdout}\nstderr: ${result.stderr}`).toBe(EXIT_CODES.success);
    });
  });

  describe('QoL-003: Post-run hints, guide-next-steps & wpm workflow', () => {
    it('should support wpm workflow reference command', async () => {
      const result = await runCli(['workflow'], { env: env.env });
      expect(result.exitCode, `stdout: ${result.stdout}\nstderr: ${result.stderr}`).toBe(EXIT_CODES.success);
      expect(result.stdout).toContain('wpm Workflows & Pipelines Reference');
      expect(result.stdout).toContain('Built-in Pipeline Presets');
      expect(result.stdout).toContain('quick');
      expect(result.stdout).toContain('full');
      expect(result.stdout).toContain('compliance');
    });

    it('should output guided next steps in wpm run with --guide-next-steps', async () => {
      const result = await runCli(['run', testXesPath, '--guide-next-steps', '--config', env.configPath], { env: env.env });
      expect(result.exitCode, `stdout: ${result.stdout}\nstderr: ${result.stderr}`).toBe(EXIT_CODES.success);
      expect(result.stdout).toContain('Guided Next Steps:');
    });

    it('should output guided next steps in wpm quality with --guide-next-steps', async () => {
      const result = await runCli(['quality', '-i', testXesPath, '--guide-next-steps'], { env: env.env });
      expect(result.exitCode, `stdout: ${result.stdout}\nstderr: ${result.stderr}`).toBe(EXIT_CODES.success);
      expect(result.stdout).toContain('Guided Next Steps:');
    });
  });

  describe('QoL-004: CLI Error Messages fuzzy matching & convention notes', () => {
    it('should offer convention note when dashes are used instead of underscores', async () => {
      const result = await runCli(['run', testXesPath, '--algorithm', 'heuristic-mine'], { env: env.env });
      expect(result.exitCode, `stdout: ${result.stdout}\nstderr: ${result.stderr}`).toBe(EXIT_CODES.source_error);
      expect(result.stdout || result.stderr).toContain("use underscores ('_') instead of dashes ('-')");
    });
  });

  describe('QoL-006: CLI parameter validation & show-algo-params', () => {
    it('should support show-algo-params option in wpm run', async () => {
      const result = await runCli(['run', '--show-algo-params', 'heuristic_miner'], { env: env.env });
      expect(result.exitCode, `stdout: ${result.stdout}\nstderr: ${result.stderr}`).toBe(EXIT_CODES.success);
      pRangeOrOptionsCheck(result.stdout);
    });

    it('should fail with out of bounds parameter range', async () => {
      const result = await runCli(['run', testXesPath, '--algorithm', 'heuristic_miner', '--parameters', '{"dependency_threshold": 1.5}'], { env: env.env });
      expect(result.exitCode, `stdout: ${result.stdout}\nstderr: ${result.stderr}`).toBe(EXIT_CODES.config_error);
      expect(result.stderr || result.stdout).toContain('above maximum');
    });
  });

  describe('QoL-007: Flat CSV export format', () => {
    it('should export discovery results as flat CSV', async () => {
      const result = await runCli(['run', testXesPath, '--format', 'csv', '--config', env.configPath], { env: env.env });
      expect(result.exitCode, `stdout: ${result.stdout}\nstderr: ${result.stderr}`).toBe(EXIT_CODES.success);
      expect(result.stdout).toContain('algorithm,input,elapsed_ms,nodes,edges');
    });

    it('should export comparison results as flat CSV', async () => {
      const result = await runCli(['compare', 'dfg,heuristic', '-i', testXesPath, '--format', 'csv'], { env: env.env });
      expect(result.exitCode, `stdout: ${result.stdout}\nstderr: ${result.stderr}`).toBe(EXIT_CODES.success);
      expect(result.stdout).toContain('algorithm,nodes,edges,elapsed_ms,quality_tier');
    });
  });

  describe('QoL-008: Van der Aalst quality tradeoffs', () => {
    it('should display dimension ranking and deep dive tradeoff guide', async () => {
      const result = await runCli(['quality', '-i', testXesPath, '--explain-quality-dims'], { env: env.env });
      expect(result.exitCode, `stdout: ${result.stdout}\nstderr: ${result.stderr}`).toBe(EXIT_CODES.success);
      expect(result.stdout).toContain('Relative Importance & Tradeoffs:');
      expect(result.stdout).toContain('FITNESS (critical');
      expect(result.stdout).toContain('Van der Aalst Quality Tradeoffs Deep Dive:');
    });
  });

  describe('QoL-010: Timeout estimation validation', () => {
    it('should clamp timeout outside range [1, 3600]', async () => {
      const result = await runCli(['run', testXesPath, '--timeout', '5000', '--config', env.configPath], { env: env.env });
      expect(result.exitCode, `stdout: ${result.stdout}\nstderr: ${result.stderr}`).toBe(EXIT_CODES.success);
      expect(result.stderr).toContain('outside valid range');
      expect(result.stderr).toContain('Clamped to 3600s');
    });
  });

  describe('QoL-011: Recommendation wizard', () => {
    it('should reject non-TTY terminal execution', async () => {
      const result = await runCli(['select-algorithm'], { env: env.env });
      expect(result.exitCode, `stdout: ${result.stdout}\nstderr: ${result.stderr}`).toBe(EXIT_CODES.config_error);
      expect(result.stdout || result.stderr).toContain('wizard requires a TTY terminal');
    });
  });

  describe('QoL-012: Exit code 4 partial success explanation', () => {
    it('should mention exit code 4 in help and output exit code explanation', async () => {
      const result = await runCli(['exit-codes'], { env: env.env });
      expect(result.exitCode, `stdout: ${result.stdout}\nstderr: ${result.stderr}`).toBe(EXIT_CODES.success);
      expect(result.stdout).toContain('4');
      expect(result.stdout).toContain('Partial Failure');
      expect(result.stdout).toContain('Batch comparison gate');
    });
  });

  describe('QoL-013: Global color and emoji suppression', () => {
    it('should suppress colors and emoji with --no-color and --no-emoji', async () => {
      const result = await runCli(['run', testXesPath, '--no-color', '--no-emoji', '--config', env.configPath], { env: env.env });
      expect(result.exitCode, `stdout: ${result.stdout}\nstderr: ${result.stderr}`).toBe(EXIT_CODES.success);
      // Verify no ANSI colors
      expect(result.stdout).not.toMatch(/\x1b\[[0-9;]*[a-zA-Z]/);
      // Verify no emoji like 🎯 or 💡
      expect(result.stdout).not.toContain('🎯');
      expect(result.stdout).not.toContain('💡');
    });
  });
});

function pRangeOrOptionsCheck(stdout: string) {
  expect(stdout).toContain('Algorithm: Heuristic Miner');
  expect(stdout).toContain('Parameters:');
}
