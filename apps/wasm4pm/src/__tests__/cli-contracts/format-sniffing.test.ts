/**
 * Defect #4 regression: "extension-based format detection with misleading
 * errors."
 *
 * `engines/conformance/readers/detect.ts`'s `detectFormat()` sniffs file
 * *content*, never the extension. This test copies a real OCEL 2.0 fixture
 * to a deliberately misleading filename (no `.ocel.json`, no `.json` at
 * all — a bare `.data` extension that an extension-based detector would
 * likely reject or misroute to XES/plain-text) and asserts the CLI still
 * detects and processes it as OCEL.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { runCli, tryParseJson, fixture, CLI_PATH } from './_helpers.js';

const OCEL_V2_SOURCE = fixture('fixtures/world/ocel-v2.json');

interface DiscoverResult {
  algorithm?: string;
  format?: string;
  isObjectCentric?: boolean;
}
interface CheckResult {
  format?: string;
  sourceFormat?: string;
}

beforeAll(() => {
  expect(fs.existsSync(CLI_PATH), `Built CLI missing at ${CLI_PATH} — run "pnpm --filter @wasm4pm/cli build" first`).toBe(true);
  expect(fs.existsSync(OCEL_V2_SOURCE)).toBe(true);
});

function copyToMisleadingName(ext: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wpm-format-sniff-'));
  const dest = path.join(dir, `mystery-file${ext}`);
  fs.copyFileSync(OCEL_V2_SOURCE, dest);
  return dest;
}

describe('defect #4 regression — content sniffing, not extension, decides format', () => {
  it('a real OCEL 2.0 log with a ".data" extension (no .json, no .ocel.json) is detected as ocel-v2 by "model discover"', async () => {
    const misnamed = copyToMisleadingName('.data');
    const r = await runCli(['model', 'discover', misnamed, '-a', 'ocel_dfg']);
    expect(r.exitCode, `stderr: ${r.stderr}\nstdout: ${r.stdout}`).toBe(0);
    const parsed = tryParseJson(r.stdout) as DiscoverResult | undefined;
    expect(parsed?.format).toBe('ocel-v2');
    expect(parsed?.isObjectCentric).toBe(true);
    expect(parsed?.algorithm).toBe('ocel_dfg');
  });

  it('the same file with a ".txt" extension is still detected as ocel-v2, not rejected as invalid XES/plain-text', async () => {
    const misnamed = copyToMisleadingName('.txt');
    const r = await runCli(['model', 'discover', misnamed, '-a', 'ocel_dfg_per_type']);
    expect(r.exitCode, `stderr: ${r.stderr}\nstdout: ${r.stdout}`).toBe(0);
    const parsed = tryParseJson(r.stdout) as DiscoverResult | undefined;
    expect(parsed?.format).toBe('ocel-v2');
  });

  it('a misnamed OCEL file is also correctly sniffed by "model check --mode oracle" (not just discover)', async () => {
    const misnamed = copyToMisleadingName('.bin');
    const r = await runCli(['model', 'check', misnamed, '--mode', 'oracle', '--model', 'dummy-handle']);
    const parsed = tryParseJson(r.stdout) as CheckResult | undefined;
    expect(parsed, `stdout must be JSON: ${r.stdout.slice(0, 300)}`).toBeDefined();
    expect(parsed?.format ?? parsed?.sourceFormat).toBe('ocel-v2');
  });

  it('an XES file with a misleading ".json" extension is still detected as xes, not OCEL', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wpm-format-sniff-'));
    const dest = path.join(dir, 'not-actually-json.json');
    fs.copyFileSync(fixture('examples/fixtures/sepsis.xes'), dest);
    const r = await runCli(['model', 'discover', dest, '-a', 'heuristic_miner']);
    expect(r.exitCode, `stderr: ${r.stderr}\nstdout: ${r.stdout}`).toBe(0);
    const parsed = tryParseJson(r.stdout) as DiscoverResult | undefined;
    expect(parsed?.format).toBe('xes');
    expect(parsed?.isObjectCentric).toBe(false);
  });
});
