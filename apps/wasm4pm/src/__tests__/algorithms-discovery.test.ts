import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Writable } from 'stream';
import { runCli, EXIT_CODES } from '@wasm4pm/testing';

describe('Gap-7: Algorithm Registry Discovery Command', () => {
  let originalStdout: typeof process.stdout;
  let originalStderr: typeof process.stderr;
  let stdoutOutput: string;
  let stderrOutput: string;

  beforeEach(() => {
    stdoutOutput = '';
    stderrOutput = '';

    const stdoutStream = new Writable({
      write(chunk, _enc, cb) {
        stdoutOutput += chunk.toString();
        cb();
      },
    });
    const stderrStream = new Writable({
      write(chunk, _enc, cb) {
        stderrOutput += chunk.toString();
        cb();
      },
    });

    originalStdout = process.stdout;
    originalStderr = process.stderr;
    (process.stdout as any) = stdoutStream;
    (process.stderr as any) = stderrStream;
  });

  afterEach(() => {
    process.stdout = originalStdout;
    process.stderr = originalStderr;
  });

  it('should list all algorithms in human format', async () => {
    const result = await runCli(['algorithms']);
    expect(result.exitCode).toBe(EXIT_CODES.success);
    expect(stdoutOutput).toContain('Algorithm Registry');
    expect(stdoutOutput).toContain('dfg');
    expect(stdoutOutput).toContain('heuristic_miner');
  });

  it('should filter algorithms by search pattern', async () => {
    const result = await runCli(['algorithms', '--search', 'genetic']);
    expect(result.exitCode).toBe(EXIT_CODES.success);
    expect(stdoutOutput).toContain('genetic_algorithm');
    expect(stdoutOutput).not.toContain('dfg');
  });

  it('should output JSON format with correct structure', async () => {
    const result = await runCli(['algorithms', '--format', 'json']);
    expect(result.exitCode).toBe(EXIT_CODES.success);
    const output = JSON.parse(stdoutOutput);
    expect(Array.isArray(output)).toBe(true);
    expect(output.length).toBeGreaterThan(0);
    const algo = output[0];
    expect(algo).toHaveProperty('id');
    expect(algo).toHaveProperty('name');
    expect(algo).toHaveProperty('speed');
    expect(algo).toHaveProperty('quality');
    expect(algo).toHaveProperty('category');
    expect(algo).toHaveProperty('description');
    expect(algo).toHaveProperty('deploymentProfiles');
  });

  it('should return config error when search yields no results', async () => {
    const result = await runCli(['algorithms', '--search', 'nonexistent_algo_xyz']);
    expect(result.exitCode).toBe(EXIT_CODES.config_error);
    expect(stderrOutput).toContain('No algorithms match pattern');
  });

  it('should display algorithm metadata in human format', async () => {
    const result = await runCli(['algorithms', '--search', 'dfg']);
    expect(result.exitCode).toBe(EXIT_CODES.success);
    const lines = stdoutOutput.split('\n');
    // Should have header, separator, and algorithm rows
    expect(lines.some(line => line.includes('Speed'))).toBe(true);
    expect(lines.some(line => line.includes('Quality'))).toBe(true);
    expect(lines.some(line => line.includes('dfg'))).toBe(true);
  });

  it('should handle invalid format gracefully', async () => {
    const result = await runCli(['algorithms', '--format', 'invalid_format']);
    // Should still succeed and default to human format
    expect(result.exitCode).toBe(EXIT_CODES.success);
  });

  it('should include algorithm profiles in JSON output', async () => {
    const result = await runCli(['algorithms', '--search', 'genetic', '--format', 'json']);
    expect(result.exitCode).toBe(EXIT_CODES.success);
    const output = JSON.parse(stdoutOutput);
    expect(output.length).toBeGreaterThan(0);
    const algo = output[0];
    expect(Array.isArray(algo.deploymentProfiles)).toBe(true);
    expect(Array.isArray(algo.supportedProfiles)).toBe(true);
  });

  it('should include complexity in JSON output', async () => {
    const result = await runCli(['algorithms', '--format', 'json']);
    expect(result.exitCode).toBe(EXIT_CODES.success);
    const output = JSON.parse(stdoutOutput);
    expect(output[0]).toHaveProperty('complexity');
    // Verify valid complexity values
    const validComplexity = ['O(n)', 'O(n log n)', 'O(n²)', 'O(n³)', 'Exponential', 'NP-Hard'];
    expect(validComplexity).toContain(output[0].complexity);
  });

  it('should include robustness metrics in JSON output', async () => {
    const result = await runCli(['algorithms', '--format', 'json']);
    expect(result.exitCode).toBe(EXIT_CODES.success);
    const output = JSON.parse(stdoutOutput);
    expect(output[0]).toHaveProperty('robustToNoise');
    expect(output[0]).toHaveProperty('scalesWell');
    expect(typeof output[0].robustToNoise).toBe('boolean');
    expect(typeof output[0].scalesWell).toBe('boolean');
  });
});
