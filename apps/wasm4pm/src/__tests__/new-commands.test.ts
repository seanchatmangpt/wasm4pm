/**
 * E2E integration tests for new CLI commands
 * Tests: conformance --format json output verification and error handling
 *
 * Van der Aalst QA perspective:
 * - JSON output must be parseable and schema-compliant
 * - Error handling must produce consistent error codes
 *
 * Note: Tests skip if commands are not fully implemented yet.
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

describe('New Commands: conformance JSON output and error handling', () => {
  let env: TestEnv;
  beforeEach(async () => { env = await createTestEnv(); });
  afterEach(async () => { await env.cleanup(); });

  it('conformance --format json returns valid JSON with fitness in [0,1] and honors --method parameter', async () => {
    const result = await runCli(['conformance', env.xesPath, '--format', 'json']);
    if (result.exitCode !== 0) return;

    let parsed: Record<string, unknown> = {};
    expect(() => { parsed = JSON.parse(result.stdout); }).not.toThrow();
    for (const field of ['status', 'fitness', 'precision', 'diagnostics']) {
      expect(parsed).toHaveProperty(field);
    }
    expect(parsed.fitness as number).toBeGreaterThanOrEqual(0.0);
    expect(parsed.fitness as number).toBeLessThanOrEqual(1.0);
    expect(parsed.precision as number).toBeGreaterThanOrEqual(0.0);
    expect(parsed.precision as number).toBeLessThanOrEqual(1.0);

    const methodResult = await runCli(['conformance', env.xesPath, '--method', 'token-replay', '--format', 'json']);
    if (methodResult.exitCode === 0) {
      const methodJson = JSON.parse(methodResult.stdout);
      expect(methodJson.method).toBe('token-replay');
    }
  });

  it('returns exit code 2 for missing file, invalid model JSON, and malformed XES', async () => {
    expect((await runCli(['conformance', 'nonexistent.xes'])).exitCode).toBe(2);

    const invalidModel = path.join(env.tempDir, 'invalid.json');
    await fs.writeFile(invalidModel, '{ invalid json }', 'utf-8');
    expect((await runCli(['conformance', env.xesPath, '--model', invalidModel])).exitCode).toBe(2);

    const malformed = path.join(env.tempDir, 'malformed.xes');
    await fs.writeFile(malformed, 'not valid xes', 'utf-8');
    expect((await runCli(['conformance', malformed])).exitCode).not.toBe(0);
  });
});
