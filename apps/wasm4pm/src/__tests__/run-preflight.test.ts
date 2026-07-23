/**
 * `wpm run --preflight` was retired along with `wpm run` itself (hard-break
 * table forwards `run` -> `model discover`). `model discover` has no
 * `--preflight` flag at all — it always validates format/algorithm
 * compatibility before touching WASM (that's the whole point of defect #1's
 * fix: `resolveAlgorithm()` + `assertFormatCompatible()` run up front,
 * unconditionally, not as an opt-in second pass). Confirmed live against the
 * built CLI: passing `--preflight` has no effect (citty ignores the
 * unrecognized flag) and the same validation still runs regardless.
 */
import { describe, it, expect } from 'vitest';
import { runCli, EXIT_CODES } from '@wasm4pm/testing';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('wpm model discover — mandatory format/algorithm validation (was: wpm run --preflight)', () => {
  it('rejects a missing file with source_error before any WASM init', async () => {
    const result = await runCli(['model', 'discover', '/nonexistent/missing.xes']);
    expect(result?.exitCode).toBe(EXIT_CODES.source_error);
    const parsed = JSON.parse(result.stdout) as { error?: { code?: string } };
    expect(parsed.error?.code).toBe('INVALID_INPUT');
  });

  it('rejects an unrecognized input format with source_error (unconditional — no --preflight flag needed)', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wpm-test-'));
    const badPath = path.join(tmpDir, 'no-such.txt');
    fs.writeFileSync(badPath, 'not a recognized log format');
    try {
      const result = await runCli(['model', 'discover', badPath]);
      expect(result?.exitCode).toBe(EXIT_CODES.source_error);
      const parsed = JSON.parse(result.stdout) as { error?: { message?: string } };
      expect(parsed.error?.message).toMatch(/Could not detect log format/i);
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it('validation runs the same whether or not the (now unrecognized) --preflight flag is passed', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wpm-test-'));
    const xesPath = path.join(tmpDir, 'test.xes');
    const minimalXes = `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0" xmlns="http://www.xes-standard.org/">
  <trace>
    <event>
      <string key="concept:name" value="A"/>
      <date key="time:timestamp" value="2024-01-01T00:00:00Z"/>
    </event>
  </trace>
</log>`;
    fs.writeFileSync(xesPath, minimalXes);

    try {
      const withoutFlag = await runCli(['model', 'discover', xesPath, '--algorithm', 'dfg']);
      const withFlag = await runCli(['model', 'discover', xesPath, '--algorithm', 'dfg', '--preflight']);
      expect(withoutFlag?.exitCode).toBe(0);
      expect(withFlag?.exitCode).toBe(0);
      // Both produce the same shape of successful discovery result — the
      // (unrecognized) --preflight flag makes no observable difference.
      const a = JSON.parse(withoutFlag.stdout) as Record<string, unknown>;
      const b = JSON.parse(withFlag.stdout) as Record<string, unknown>;
      expect(a.algorithm).toBe(b.algorithm);
      expect(a.modelType).toBe(b.modelType);
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });
});
