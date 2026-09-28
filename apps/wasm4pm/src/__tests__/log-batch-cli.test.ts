/**
 * log-batch-cli.test.ts
 *
 * Real-boundary CLI tests for `wpm log batch <dir>` (the noun/verb form of the
 * retired `wpm batch`). Nothing is mocked: each test spawns the built CLI,
 * which loads the real WASM module and runs the kernel's `BatchRunner`.
 *
 * Also covers `findXesLogs` (pure file discovery) directly.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runCli, EXIT_CODES } from '@wasm4pm/testing';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { findXesLogs } from '../nouns/log/batch.js';

const xes = (activities: string[]): string => `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0" xmlns="http://www.xes.org/">
  <trace>
    <string key="concept:name" value="case_1"/>
${activities
  .map(
    (a, i) => `    <event>
      <string key="concept:name" value="${a}"/>
      <date key="time:timestamp" value="2024-01-01T00:0${i}:00Z"/>
    </event>`
  )
  .join('\n')}
  </trace>
  <trace>
    <string key="concept:name" value="case_2"/>
${activities
  .map(
    (a, i) => `    <event>
      <string key="concept:name" value="${a}"/>
      <date key="time:timestamp" value="2024-01-02T00:0${i}:00Z"/>
    </event>`
  )
  .join('\n')}
  </trace>
</log>`;

interface BatchOut {
  status: string;
  algorithm: string;
  logCount: number;
  success_count: number;
  failure_count: number;
  exitCode?: number;
  summary: { totalLogs: number; successful: number; failed: number; successRate: number };
  per_file_results: Array<{ log: string; status: string; output_hash?: string; error?: string }>;
}

describe('findXesLogs', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wpm-find-xes-'));
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('finds .xes recursively, sorted, skipping dot-dirs, node_modules and other extensions', async () => {
    await fs.mkdir(path.join(dir, 'sub'));
    await fs.mkdir(path.join(dir, '.hidden'));
    await fs.mkdir(path.join(dir, 'node_modules'));
    await fs.writeFile(path.join(dir, 'b.xes'), 'x');
    await fs.writeFile(path.join(dir, 'a.xes'), 'x');
    await fs.writeFile(path.join(dir, 'sub', 'c.xes'), 'x');
    await fs.writeFile(path.join(dir, 'notes.json'), '{}');
    await fs.writeFile(path.join(dir, '.hidden', 'd.xes'), 'x');
    await fs.writeFile(path.join(dir, 'node_modules', 'e.xes'), 'x');

    const found = await findXesLogs(dir);
    expect(found.map((f) => path.relative(dir, f))).toEqual(['a.xes', 'b.xes', path.join('sub', 'c.xes')]);
  });
});

describe('wpm log batch', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wpm-log-batch-'));
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('discovers a model for every XES log in the directory (real WASM) and exits 0', async () => {
    await fs.writeFile(path.join(dir, 'one.xes'), xes(['Start', 'Process', 'End']));
    await fs.writeFile(path.join(dir, 'two.xes'), xes(['Start', 'Review', 'End']));

    const result = await runCli(['log', 'batch', dir, '--algorithm', 'dfg', '--workers', '2'], {
      cwd: dir,
      timeout: 60000,
    });
    expect(result.exitCode, result.stderr).toBe(EXIT_CODES.success);

    const out = JSON.parse(result.stdout) as BatchOut;
    expect(out.status).toBe('completed');
    expect(out.algorithm).toBe('dfg');
    expect(out.logCount).toBe(2);
    expect(out.success_count).toBe(2);
    expect(out.failure_count).toBe(0);
    expect(out.summary.totalLogs).toBe(2);
    expect(out.summary.successRate).toBe(1);
    expect(out.exitCode).toBeUndefined();
    expect(out.per_file_results.map((r) => path.basename(r.log)).sort()).toEqual(['one.xes', 'two.xes']);
    expect(out.per_file_results.every((r) => r.status === 'success')).toBe(true);
    // Different logs discover different models: distinct output hashes.
    const hashes = out.per_file_results.map((r) => r.output_hash);
    expect(hashes.every((h) => typeof h === 'string' && h.length > 0)).toBe(true);
    expect(new Set(hashes).size).toBe(2);
  }, 90000);

  it('reports a corrupt log per file and exits partial_failure without aborting the rest', async () => {
    await fs.writeFile(path.join(dir, 'good.xes'), xes(['A', 'B']));
    await fs.writeFile(path.join(dir, 'bad.xes'), 'not-xml-at-all {{ broken');

    const result = await runCli(['log', 'batch', dir, '--algorithm', 'dfg'], { cwd: dir, timeout: 60000 });
    expect(result.exitCode).toBe(EXIT_CODES.partial_failure);

    const out = JSON.parse(result.stdout) as BatchOut;
    expect(out.status).toBe('completed');
    expect(out.success_count).toBe(1);
    expect(out.failure_count).toBe(1);
    expect(out.exitCode).toBe(EXIT_CODES.partial_failure);
    const bad = out.per_file_results.find((r) => path.basename(r.log) === 'bad.xes');
    expect(bad?.status).toBe('failed');
    expect(bad?.error).toBeTruthy();
  }, 90000);

  it('emits a BLAKE3 outcome receipt with non-empty hashes (dispatcher-level, Absolute Rule 6)', async () => {
    await fs.writeFile(path.join(dir, 'one.xes'), xes(['A', 'B']));
    const result = await runCli(['log', 'batch', dir, '--algorithm', 'dfg'], {
      cwd: dir,
      timeout: 60000,
      env: { WASM4PM_HOME: path.join(dir, 'home') },
    });
    expect(result.exitCode, result.stderr).toBe(EXIT_CODES.success);
    const latest = await fs.readFile(path.join(dir, 'home', 'receipts', 'latest.json'), 'utf-8');
    const receipt = JSON.parse(latest) as { input_hash: string; output_hash: string; command: string; status: string };
    expect(receipt.input_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(receipt.output_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(receipt.command).toBe('log batch');
    expect(receipt.status).toBe('success');
  }, 90000);

  it('refuses an unknown algorithm with a typed error instead of substituting a default', async () => {
    await fs.writeFile(path.join(dir, 'one.xes'), xes(['A', 'B']));
    const result = await runCli(['log', 'batch', dir, '--algorithm', 'no_such_algo'], { cwd: dir });
    expect(result.exitCode).not.toBe(EXIT_CODES.success);
    const out = JSON.parse(result.stdout) as { error?: { message: string } };
    expect(out.error?.message).toMatch(/no_such_algo/);
  });

  it('refuses a non-positive --workers value', async () => {
    await fs.writeFile(path.join(dir, 'one.xes'), xes(['A', 'B']));
    for (const bad of ['0', '-2', 'abc', '1.5']) {
      const result = await runCli(['log', 'batch', dir, '--workers', bad], { cwd: dir });
      expect(result.exitCode, `--workers ${bad}`).not.toBe(EXIT_CODES.success);
      const out = JSON.parse(result.stdout) as { error?: { message: string } };
      expect(out.error?.message).toMatch(/--workers must be a positive integer/);
    }
  });

  it('refuses a missing directory and an empty directory', async () => {
    const missing = await runCli(['log', 'batch', path.join(dir, 'nope')], { cwd: dir });
    expect(missing.exitCode).not.toBe(EXIT_CODES.success);
    expect((JSON.parse(missing.stdout) as { error?: { message: string } }).error?.message).toMatch(
      /Directory not found/
    );

    const empty = await runCli(['log', 'batch', dir], { cwd: dir });
    expect(empty.exitCode).not.toBe(EXIT_CODES.success);
    expect((JSON.parse(empty.stdout) as { error?: { message: string } }).error?.message).toMatch(
      /No \.xes files found/
    );
  });
});
