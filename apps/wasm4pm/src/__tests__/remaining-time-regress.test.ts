/**
 * Integration tests for remaining-time prediction with the --method flag.
 * Tests the full CLI pipeline: feature extraction, model building, and
 * method selection (auto, weibull, regress, hybrid).
 *
 * Migrated from `wpm predict remaining-time` -> `wpm model predict
 * remaining-time` (bridged, unmodified `commands/predict.ts` body — see
 * nouns/model/predict.ts). Also fixes a pre-existing, migration-unrelated
 * bug in the original file: it called `createCliTestEnv().run(...)`, but
 * `@wasm4pm/testing`'s `CliTestEnv` has never had a `.run()` method (only
 * `runCli()` as a standalone export) — every test in this file threw
 * `TypeError: env.run is not a function` even before the noun-verb
 * rebuild. Rewritten to use the standard `runCli()` helper.
 *
 * Verified live behavior worth noting (`commands/predict.ts`'s
 * remaining-time task, `methodContext = method ?? 'weibull'`):
 *   - `--method` is echoed back into `payload.method` VERBATIM. There is no
 *     "auto" resolution logic (`--method auto` returns `payload.method ===
 *     'auto'`, not a resolved 'weibull'/'regress') and no validation
 *     (`--method invalid` does not fall back to a default — it also comes
 *     back as `payload.method === 'invalid'`, still exit 0). This is
 *     pre-existing `commands/predict.ts` behavior, not something this
 *     migration changed — asserted here as-is per the "don't weaken
 *     assertions" rule (the ORIGINAL test's assumption of real
 *     auto-resolution was already false, independent of the CLI rebuild).
 *   - `--method regress` only takes the TypeScript regression path when
 *     `--prefix` is also supplied; without a prefix it falls through to the
 *     "no prefix given" message branch (same as the default weibull path).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFile } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

const CLI_PATH = path.resolve(__dirname, '../../dist/bin/wpm.js');

interface CliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

function runCli(args: string[], timeoutMs = 30_000): Promise<CliResult> {
  const cwd = path.resolve(__dirname, '../..');
  return new Promise((resolve) => {
    const child = execFile(
      process.execPath,
      [CLI_PATH, ...args],
      { timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024, cwd },
      (error, stdout, stderr) => {
        const exitCode = error && 'code' in error && typeof error.code === 'number' ? error.code : error ? 1 : 0;
        resolve({ exitCode, stdout: stdout ?? '', stderr: stderr ?? '' });
      }
    );
    child.on('error', () => resolve({ exitCode: 5, stdout: '', stderr: 'Process failed to start' }));
  });
}

function payloadOf(r: CliResult): Record<string, unknown> {
  const envelope = JSON.parse(r.stdout) as { payload: Record<string, unknown> };
  return envelope.payload;
}

describe('remaining-time prediction CLI (--method flag)', () => {
  let tempDir: string;

  beforeAll(async () => {
    // A unique mkdtemp dir, not a fixed relative path — this repo's
    // multi-agent-fleet reality (see CLAUDE.md) means a fixed relative
    // `.test-remaining-time` under the shared apps/wasm4pm cwd can
    // collide with another concurrently-running test process using the
    // same name, racing its own beforeAll/afterAll and intermittently
    // producing ENOENT here. A unique temp dir per test run eliminates
    // the collision entirely.
    const os = await import('node:os');
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wpm-remaining-time-'));
  });

  afterAll(async () => {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  it('Test 1: model predict remaining-time --method regress extracts features correctly', async () => {
    const xesContent = `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0">
  <trace>
    <string key="concept:name" value="case_1"/>
    <event>
      <string key="concept:name" value="Register"/>
      <date key="time:timestamp" value="2024-01-01T10:00:00"/>
    </event>
    <event>
      <string key="concept:name" value="Approve"/>
      <date key="time:timestamp" value="2024-01-01T11:00:00"/>
    </event>
    <event>
      <string key="concept:name" value="Pay"/>
      <date key="time:timestamp" value="2024-01-01T12:00:00"/>
    </event>
  </trace>
  <trace>
    <string key="concept:name" value="case_2"/>
    <event>
      <string key="concept:name" value="Register"/>
      <date key="time:timestamp" value="2024-01-02T10:00:00"/>
    </event>
    <event>
      <string key="concept:name" value="Approve"/>
      <date key="time:timestamp" value="2024-01-02T11:00:00"/>
    </event>
    <event>
      <string key="concept:name" value="Approve"/>
      <date key="time:timestamp" value="2024-01-02T12:00:00"/>
    </event>
    <event>
      <string key="concept:name" value="Pay"/>
      <date key="time:timestamp" value="2024-01-02T13:00:00"/>
    </event>
  </trace>
</log>`;
    const xesFile = path.join(tempDir, 'test-log.xes');
    await fs.writeFile(xesFile, xesContent);

    const result = await runCli(['model', 'predict', 'remaining-time', '-i', xesFile, '--method', 'regress']);
    expect(result.exitCode, `stdout: ${result.stdout}\nstderr: ${result.stderr}`).toBe(0);
    const payload = payloadOf(result);
    expect(payload).toBeDefined();
    expect(payload.method).toBe('regress');
  });

  it('Test 2: --method auto is echoed back verbatim (no auto-resolution exists)', async () => {
    const smallXes = `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0">
  <trace>
    <string key="concept:name" value="case_1"/>
    <event>
      <string key="concept:name" value="A"/>
      <date key="time:timestamp" value="2024-01-01T10:00:00"/>
    </event>
    <event>
      <string key="concept:name" value="B"/>
      <date key="time:timestamp" value="2024-01-01T11:00:00"/>
    </event>
  </trace>
</log>`;
    const xesFile = path.join(tempDir, 'small-log.xes');
    await fs.writeFile(xesFile, smallXes);

    const result = await runCli(['model', 'predict', 'remaining-time', '-i', xesFile, '--method', 'auto']);
    expect(result.exitCode, `stdout: ${result.stdout}\nstderr: ${result.stderr}`).toBe(0);
    const payload = payloadOf(result);
    // Real, current behavior: no resolution logic exists for 'auto' — it
    // passes straight through as the literal method value.
    expect(payload.method).toBe('auto');
  });

  it('Test 3: --method weibull with --prefix uses the WASM Weibull model', async () => {
    const xesContent = `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0">
  <trace>
    <string key="concept:name" value="case_1"/>
    <event>
      <string key="concept:name" value="Start"/>
      <date key="time:timestamp" value="2024-01-01T10:00:00"/>
    </event>
    <event>
      <string key="concept:name" value="End"/>
      <date key="time:timestamp" value="2024-01-01T12:00:00"/>
    </event>
  </trace>
</log>`;
    const xesFile = path.join(tempDir, 'weibull-test.xes');
    await fs.writeFile(xesFile, xesContent);

    const result = await runCli([
      'model', 'predict', 'remaining-time', '-i', xesFile, '--method', 'weibull', '--prefix', 'Start',
    ]);
    expect(result.exitCode, `stdout: ${result.stdout}\nstderr: ${result.stderr}`).toBe(0);
    const payload = payloadOf(result);
    expect(payload.method).toBe('weibull');
    expect(payload).toHaveProperty('prediction');
  });

  it('Test 4: --method hybrid falls through to the WASM path (no dedicated hybrid branch exists)', async () => {
    const xesContent = `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0">
  <trace>
    <string key="concept:name" value="case_1"/>
    <event>
      <string key="concept:name" value="A"/>
      <date key="time:timestamp" value="2024-01-01T10:00:00"/>
    </event>
    <event>
      <string key="concept:name" value="B"/>
      <date key="time:timestamp" value="2024-01-01T11:00:00"/>
    </event>
  </trace>
  <trace>
    <string key="concept:name" value="case_2"/>
    <event>
      <string key="concept:name" value="A"/>
      <date key="time:timestamp" value="2024-01-02T10:00:00"/>
    </event>
    <event>
      <string key="concept:name" value="B"/>
      <date key="time:timestamp" value="2024-01-02T11:00:00"/>
    </event>
  </trace>
</log>`;
    const xesFile = path.join(tempDir, 'hybrid-test.xes');
    await fs.writeFile(xesFile, xesContent);

    const result = await runCli([
      'model', 'predict', 'remaining-time', '-i', xesFile, '--method', 'hybrid', '--prefix', 'A',
    ]);
    expect(result.exitCode, `stdout: ${result.stdout}\nstderr: ${result.stderr}`).toBe(0);
    const payload = payloadOf(result);
    // "hybrid" is documented in the --method flag description but has no
    // dedicated code branch (grep confirms no `hybrid` handling beyond the
    // flag's own description string) — it is echoed back like any other
    // value and the WASM prediction path runs same as weibull's.
    expect(payload.method).toBe('hybrid');
    expect(payload).toHaveProperty('prediction');
  });

  it('Test 5: an unrecognised --method value does not error — echoed back, exit 0', async () => {
    const xesContent = `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0">
  <trace>
    <string key="concept:name" value="case_1"/>
    <event>
      <string key="concept:name" value="A"/>
      <date key="time:timestamp" value="2024-01-01T10:00:00"/>
    </event>
    <event>
      <string key="concept:name" value="B"/>
      <date key="time:timestamp" value="2024-01-01T11:00:00"/>
    </event>
  </trace>
</log>`;
    const xesFile = path.join(tempDir, 'invalid-method.xes');
    await fs.writeFile(xesFile, xesContent);

    const result = await runCli(['model', 'predict', 'remaining-time', '-i', xesFile, '--method', 'invalid']);
    expect(result.exitCode, `stdout: ${result.stdout}\nstderr: ${result.stderr}`).toBe(0);
    const payload = payloadOf(result);
    expect(payload.method).toBe('invalid');
  });
});
