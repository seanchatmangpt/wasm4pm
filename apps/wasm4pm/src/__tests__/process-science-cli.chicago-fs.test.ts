import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
  createCliTestEnv,
  EXIT_CODES,
  runCli,
  type CliTestEnv,
} from '@wasm4pm/testing';

const XES = `<?xml version="1.0" encoding="UTF-8" ?>
<log xes.version="1.0" xes.features="nested-attributes">
  <trace>
    <string key="concept:name" value="case-1" />
    <event><string key="concept:name" value="observe" /></event>
    <event><string key="concept:name" value="admit" /></event>
    <event><string key="concept:name" value="receipt" /></event>
  </trace>
</log>
`;

describe('wpm lab process-science — Chicago filesystem boundary', () => {
  let env: CliTestEnv;

  beforeEach(async () => {
    env = await createCliTestEnv();
  });

  afterEach(async () => {
    await env?.cleanup?.();
  });

  it('reads real XES bytes and persists a deterministic process-science projection', async () => {
    const input = path.join(env.tempDir, 'evidence.xes');
    const output = path.join(env.tempDir, 'process-science-output');
    const wasm4pmHome = path.join(env.tempDir, 'wasm4pm-home');
    await fs.writeFile(input, XES, 'utf8');

    const first = await runCli(
      ['lab', 'process-science', '--input', input, '--output', output],
      { cwd: env.tempDir, env: { WASM4PM_HOME: wasm4pmHome } }
    );

    expect(first.exitCode, first.stderr).toBe(EXIT_CODES.success);
    const artifactPath = path.join(output, 'process-science.json');
    expect(existsSync(artifactPath)).toBe(true);
    const firstBytes = await fs.readFile(artifactPath, 'utf8');
    const artifact = JSON.parse(firstBytes) as {
      schema: string;
      evidence: { blake3: string; bytes: number; traces: number; events: number };
      family_count: number;
      families: Array<{ family: string; operator: string; authority: string }>;
      calculus: string;
      actuation: string;
      receipt_hash: string;
    };

    expect(artifact.schema).toBe('wasm4pm.process-science.cli.v1');
    expect(artifact.evidence.traces).toBe(1);
    expect(artifact.evidence.events).toBe(3);
    expect(artifact.evidence.bytes).toBe(Buffer.byteLength(XES));
    expect(artifact.evidence.blake3).toMatch(/^[0-9a-f]{64}$/);
    expect(artifact.family_count).toBe(13);
    expect(artifact.families).toHaveLength(13);
    expect(artifact.families.map((entry) => entry.family)).toEqual(
      expect.arrayContaining([
        'classification',
        'clustering',
        'forecasting',
        'causal_inference',
        'etl',
        'reinforcement_learning',
        'process_science_end_to_end',
      ])
    );
    expect(artifact.families.every((entry) => entry.authority === 'CONSTRUCT_ONLY')).toBe(true);
    expect(artifact.calculus).toBe(
      'OBSERVE -> ADMIT -> INFER -> DISCRIMINATE -> SIMULATE -> CONSTRUCT -> GOVERN -> RECEIPT'
    );
    expect(artifact.actuation).toBe('REFUSED');
    expect(artifact.receipt_hash).toMatch(/^[0-9a-f]{64}$/);

    // Re-run against the same admitted bytes at a second real filesystem destination.
    // The process projection and its semantic receipt must be byte-for-byte deterministic.
    const output2 = path.join(env.tempDir, 'process-science-output-2');
    const second = await runCli(
      ['lab', 'process-science', '--input', input, '--output', output2],
      { cwd: env.tempDir, env: { WASM4PM_HOME: wasm4pmHome } }
    );
    expect(second.exitCode, second.stderr).toBe(EXIT_CODES.success);
    const secondBytes = await fs.readFile(path.join(output2, 'process-science.json'), 'utf8');
    expect(secondBytes).toBe(firstBytes);

    // Published CLI receipt manufacture is itself a filesystem consequence.
    const receiptDir = path.join(wasm4pmHome, 'receipts');
    const receipts = await fs.readdir(receiptDir);
    expect(receipts.filter((name) => name.endsWith('.json')).length).toBeGreaterThanOrEqual(3);
    expect(receipts).toContain('latest.json');
  });

  it('refuses an unreadable evidence path and does not manufacture an output projection', async () => {
    const missing = path.join(env.tempDir, 'missing.xes');
    const output = path.join(env.tempDir, 'must-not-exist');
    const wasm4pmHome = path.join(env.tempDir, 'wasm4pm-home');

    const result = await runCli(
      ['lab', 'process-science', '--input', missing, '--output', output],
      { cwd: env.tempDir, env: { WASM4PM_HOME: wasm4pmHome } }
    );

    expect(result.exitCode).toBe(EXIT_CODES.source_error);
    expect(`${result.stdout}\n${result.stderr}`).toContain('PROCESS_SCIENCE_INPUT_UNREADABLE');
    expect(existsSync(path.join(output, 'process-science.json'))).toBe(false);
  });

  it('refuses structurally empty XES evidence without creating the requested projection', async () => {
    const input = path.join(env.tempDir, 'empty.xes');
    const output = path.join(env.tempDir, 'must-not-exist-empty');
    const wasm4pmHome = path.join(env.tempDir, 'wasm4pm-home');
    await fs.writeFile(input, '<log></log>\n', 'utf8');

    const result = await runCli(
      ['lab', 'process-science', '--input', input, '--output', output],
      { cwd: env.tempDir, env: { WASM4PM_HOME: wasm4pmHome } }
    );

    expect(result.exitCode).toBe(EXIT_CODES.source_error);
    expect(`${result.stdout}\n${result.stderr}`).toContain('PROCESS_SCIENCE_XES_EVIDENCE_EMPTY');
    expect(existsSync(path.join(output, 'process-science.json'))).toBe(false);
  });
});
