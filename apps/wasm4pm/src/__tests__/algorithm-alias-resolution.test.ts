import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runCli, EXIT_CODES, createCliTestEnv } from '@wasm4pm/testing';
import * as path from 'path';
import * as fs from 'fs/promises';

function parseEnvelope(result: { stdout: string }): Record<string, unknown> {
  return JSON.parse(result.stdout) as Record<string, unknown>;
}

describe('wpm run — algorithm alias resolution and config defaults', () => {
  let env: Awaited<ReturnType<typeof createCliTestEnv>>;
  let testXesPath: string;

  beforeEach(async () => {
    env = await createCliTestEnv();
    testXesPath = path.join(env.tempDir, 'test.xes');
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
  });

  afterEach(() => {
    env?.cleanup?.();
  });

  it('resolves -a inductive to inductive_miner (not ALGORITHM_NOT_FOUND)', async () => {
    const result = await runCli(
      ['run', testXesPath, '-a', 'inductive', '--format', 'json', '--no-save'],
      { cwd: env.tempDir }
    );
    expect(result.exitCode).not.toBe(EXIT_CODES.config_error);
    expect(`${result.stdout}${result.stderr}`).not.toMatch(/Algorithm 'inductive' not found/);
  });

  it('resolves -a heuristic to heuristic_miner (not ALGORITHM_NOT_FOUND)', async () => {
    const result = await runCli(
      ['run', testXesPath, '-a', 'heuristic', '--format', 'json', '--no-save'],
      { cwd: env.tempDir }
    );
    expect(result.exitCode).not.toBe(EXIT_CODES.config_error);
    expect(`${result.stdout}${result.stderr}`).not.toMatch(/Algorithm 'heuristic' not found/);
    expect(`${result.stdout}${result.stderr}`).not.toMatch(/Unsupported algorithm: heuristic/);
  });

  it('uses config.algorithm.name when --algorithm is omitted', async () => {
    await fs.writeFile(
      path.join(env.tempDir, 'wasm4pm.json'),
      JSON.stringify(
        {
          schema_version: 1,
          version: '26.5.21',
          source: { kind: 'file' },
          algorithm: { name: 'dfg', parameters: {} },
          execution: { profile: 'stream', timeout: 300 },
        },
        null,
        2
      ),
      'utf-8'
    );

    const result = await runCli(
      ['run', testXesPath, '--format', 'json', '--no-save'],
      { cwd: env.tempDir }
    );

    expect(result.exitCode).not.toBe(EXIT_CODES.config_error);
    if (result.exitCode === EXIT_CODES.success && result.stdout.trim()) {
      const envelope = parseEnvelope(result);
      const payload = (envelope.payload ?? {}) as Record<string, unknown>;
      expect(payload.algorithm).toBe('dfg');
    }
  });
});
