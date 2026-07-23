/**
 * E2E integration tests, migrated from the old top-level `wpm conformance`
 * command onto `wpm model check` (nouns/_removed.ts:
 * `{ old: 'conformance', replacement: 'model check --mode replay' }`).
 *
 * The old `conformance` command reported a continuous fitness/precision
 * score (with `--method token-replay|alignment`); `model check`'s
 * conformance engine is intentionally fail-closed instead (see
 * `engines/conformance/verdict.ts`): a check produces a discrete
 * `status: ADMITTED | REJECTED | INDETERMINATE` verdict over grouped
 * episodes, not a top-level continuous `fitness`/`precision` score, and
 * has no `--method` selector (--mode selects the whole checking strategy).
 * Per-episode continuous fitness numbers still exist, nested under
 * `findings[].details.case_fitness[].trace_fitness` (verified live below)
 * — this test asserts the new top-level verdict contract plus that nested
 * numeric detail, rather than a `fitness`/`precision` pair that no longer
 * exists.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFile } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import { tmpdir } from 'os';

const MINIMAL_XES = `<?xml version="1.0" encoding="UTF-8"?>
<log xmlns="http://www.xes-standard.org/" xes.version="1.0" xes.features="nested-attributes">
  <extension name="Concept" prefix="concept" uri="http://www.xes-standard.org/concept.xesext"/>
  <extension name="Time" prefix="time" uri="http://www.xes-standard.org/time.xesext"/>
  <extension name="Organizational" prefix="org" uri="http://www.xes-standard.org/org.xesext"/>
  <trace>
    <string key="concept:name" value="case_1"/>
    <event><string key="concept:name" value="register"/><date key="time:timestamp" value="2024-01-01T09:00:00Z"/><string key="org:resource" value="Alice"/></event>
    <event><string key="concept:name" value="examine"/><date key="time:timestamp" value="2024-01-01T09:05:00Z"/><string key="org:resource" value="Bob"/></event>
    <event><string key="concept:name" value="decide"/><date key="time:timestamp" value="2024-01-01T09:10:00Z"/><string key="org:resource" value="Charlie"/></event>
  </trace>
  <trace>
    <string key="concept:name" value="case_2"/>
    <event><string key="concept:name" value="register"/><date key="time:timestamp" value="2024-01-01T10:00:00Z"/><string key="org:resource" value="Bob"/></event>
    <event><string key="concept:name" value="decide"/><date key="time:timestamp" value="2024-01-01T10:10:00Z"/><string key="org:resource" value="Charlie"/></event>
  </trace>
</log>`;

interface TestEnv { tempDir: string; xesPath: string; cleanup: () => Promise<void>; }
interface CliResult { exitCode: number; stdout: string; stderr: string; }

async function createTestEnv(): Promise<TestEnv> {
  const tempDir = await fs.mkdtemp(path.join(tmpdir(), 'wpm-test-'));
  const xesPath = path.join(tempDir, 'test.xes');
  await fs.writeFile(xesPath, MINIMAL_XES, 'utf-8');
  return { tempDir, xesPath, cleanup: async () => { try { await fs.rm(tempDir, { recursive: true, force: true }); } catch {} } };
}

function runCli(args: string[], timeoutMs = 30000): Promise<CliResult> {
  const cliPath = path.resolve(__dirname, '../../dist/bin/wpm.js');
  const cwd = path.resolve(__dirname, '../..');
  return new Promise((resolve) => {
    const child = execFile(process.execPath, [cliPath, ...args], { timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024, cwd },
      (error, stdout, stderr) => {
        const exitCode = error && 'code' in error && typeof error.code === 'number' ? error.code : error ? 1 : 0;
        resolve({ exitCode, stdout: stdout ?? '', stderr: stderr ?? '' });
      });
    child.on('error', () => resolve({ exitCode: 5, stdout: '', stderr: 'Process failed to start' }));
  });
}

describe('model check (was: wpm conformance) — fail-closed verdict output and error handling', () => {
  let env: TestEnv;
  beforeEach(async () => { env = await createTestEnv(); });
  afterEach(async () => { await env.cleanup(); });

  it('model check --mode self returns a fail-closed verdict with per-episode fitness detail in [0,1]', async () => {
    const result = await runCli(['model', 'check', env.xesPath, '--mode', 'self', '--fitness-threshold', '0.5']);
    expect(result.exitCode === 0 || result.exitCode === 6).toBe(true);

    let parsed: Record<string, unknown> = {};
    expect(() => { parsed = JSON.parse(result.stdout); }).not.toThrow();
    for (const field of ['status', 'mode', 'checked', 'admitted', 'rejected', 'findings']) {
      expect(parsed).toHaveProperty(field);
    }
    expect(['ADMITTED', 'REJECTED', 'INDETERMINATE']).toContain(parsed.status);
    expect(parsed.checked as number).toBeGreaterThanOrEqual(0);

    // Per-trace fitness is still a continuous [0,1] number, just nested
    // under each rejected episode's finding rather than top-level.
    const findings = parsed.findings as Array<{ details?: { case_fitness?: Array<{ trace_fitness: number }> } }>;
    for (const finding of findings) {
      for (const cf of finding.details?.case_fitness ?? []) {
        expect(cf.trace_fitness).toBeGreaterThanOrEqual(0.0);
        expect(cf.trace_fitness).toBeLessThanOrEqual(1.0);
      }
    }
  });

  it('returns source_error (2) for a missing log file or an unparseable model file', async () => {
    const missing = await runCli(['model', 'check', 'nonexistent.xes', '--mode', 'self']);
    expect(missing.exitCode).toBe(2);

    const invalidModel = path.join(env.tempDir, 'invalid.json');
    await fs.writeFile(invalidModel, '{ invalid json }', 'utf-8');
    const badModel = await runCli(['model', 'check', env.xesPath, '--mode', 'replay', '--model', invalidModel]);
    expect(badModel.exitCode).toBe(2);
  });

  it('returns a nonzero exit code for a malformed (non-XES/OCEL/CSV) log', async () => {
    const malformed = path.join(env.tempDir, 'malformed.xes');
    await fs.writeFile(malformed, 'not valid xes', 'utf-8');
    const result = await runCli(['model', 'check', malformed, '--mode', 'self']);
    expect(result.exitCode).not.toBe(0);
  });
});
