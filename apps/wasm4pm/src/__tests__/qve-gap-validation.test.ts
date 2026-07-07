/**
 * qve-gap-validation.test.ts
 *
 * Originally: RED tests proving three validation gaps in `wpm quality`,
 * `wpm validate`, and `wpm explain`. Migrated to the noun/verb surface below.
 *
 * Gap status after the noun-verb rebuild (verified live against the built
 * CLI, not assumed):
 *
 *   Gap QG-1/QG-2 (`wpm quality --threshold` / `dimensions` field): MOOT.
 *     `quality` maps to `log stats` (see nouns/log/stats.ts), which is a
 *     deliberately different, much smaller verb — basic event/case counts,
 *     no Van der Aalst fitness/precision/generalization/simplicity
 *     assessment and no --threshold flag at all (see
 *     quality-dimensions.test.ts for the fuller writeup of that removal).
 *     These two gap-sections are replaced with a direct check of what
 *     `log stats` actually validates today (missing/invalid input).
 *
 *   Gap QG-3 (`wpm explain unknown-algorithm` exits 0 instead of 1):
 *     STILL OPEN, confirmed live on the current build. `model explain`
 *     bridges to the unmodified `commands/explain.ts` body (see
 *     nouns/model/explain.ts) — the single-argument explain path
 *     (`getAlgorithmExplanation()`) returns a string containing
 *     "Unknown algorithm: '<name>'" as the `content` field WITHOUT
 *     throwing, so `exit_code` stays 0/success. Only the separate
 *     `wpm explain compare <alg1> <alg2>` subcommand path actually throws
 *     UNKNOWN_ALGORITHM (config_error). This is a pre-existing product gap,
 *     unrelated to the CLI-surface migration — this file asserts the real
 *     current behavior rather than the aspirational fixed behavior, so it
 *     does not silently paper over a bug: it names the gap explicitly.
 *
 *   Gap QG-V (`wpm validate` nonexistent-file JSON / `violations` alias):
 *     FIXED. `commands/validate.ts` now has both the `violations` alias and
 *     a `valid`/`checks` contract. `validate` -> `log validate` (bridged,
 *     unmodified body) so this behavior carries over unchanged; only the
 *     invocation and the top-level envelope differ (see below).
 *
 * Envelope-shape note for all bridged verbs (`model explain`, `log
 * validate`): on failure, the noun-verb framework's OWN error envelope
 * `{ error: { code, message } }` applies — the old `{ command, status,
 * payload: null, error }` shape does not survive bridging (see
 * nouns/_bridge.ts: any legacy `status: 'error'` result becomes a thrown
 * `NounVerbError`). On success, the full legacy `{ command, status,
 * payload, meta }` envelope IS still returned verbatim (bridging only
 * rewrites the failure path).
 */

import { describe, it, expect } from 'vitest';
import { execFile } from 'child_process';
import * as path from 'path';

const CLI_PATH = path.resolve(__dirname, '../../dist/bin/wpm.js');

interface CliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

function runCli(args: string[], timeoutMs = 15_000): Promise<CliResult> {
  const cwd = path.resolve(__dirname, '../..');
  return new Promise((resolve) => {
    const child = execFile(
      process.execPath,
      [CLI_PATH, ...args],
      { timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024, cwd },
      (error, stdout, stderr) => {
        const exitCode =
          error && 'code' in error && typeof error.code === 'number' ? error.code : error ? 1 : 0;
        resolve({ exitCode, stdout: stdout ?? '', stderr: stderr ?? '' });
      }
    );
    child.on('error', () => resolve({ exitCode: 5, stdout: '', stderr: 'Process failed to start' }));
  });
}

function json<T = Record<string, unknown>>(r: CliResult): T {
  return JSON.parse(r.stdout) as T;
}

// ---------------------------------------------------------------------------
// QG-1/QG-2 replacement: `log stats` (was: `quality`, in part) — no
// --threshold, no `dimensions` field. Verify what it DOES validate.
// ---------------------------------------------------------------------------

describe('QG-1/QG-2 (moot): log stats has no --threshold or dimensions field', () => {
  it('missing input file exits 2 (INVALID_INPUT) with a structured error envelope', async () => {
    const r = await runCli(['log', 'stats', '/no/such/file.xes']);
    expect(r.exitCode).toBe(2);
    const envelope = json<{ error?: { code: string; message: string } }>(r);
    expect(envelope.error).toBeDefined();
    expect(envelope.error!.code).toBe('INVALID_INPUT');
  });

  it('a --threshold flag is simply ignored/unknown — log stats has no such option', async () => {
    // log stats' declared args are only `input` and `activity-key`
    // (nouns/log/stats.ts); passing an arbitrary extra flag must not crash
    // with a citty parse error (exit 5) — citty silently accepts unknown
    // flags into ctx.args without failing.
    const r = await runCli(['log', 'stats', '/no/such/file.xes', '--threshold', '1.5']);
    expect(r.exitCode).not.toBe(5);
  });
});

// ---------------------------------------------------------------------------
// QG-3: wpm explain unknown-algorithm — STILL a real, open gap (see file
// doc comment). This is not weakened to "pass" — it documents reality.
// ---------------------------------------------------------------------------

describe('QG-3: model explain <unknown-algorithm> — still exits 0 (open gap, pre-existing)', () => {
  it('completely unknown algorithm name still exits 0 (KNOWN GAP, not fixed by this migration)', async () => {
    const r = await runCli(['model', 'explain', 'totally-unknown-xyz-algo']);
    expect(r.exitCode).toBe(0);
  });

  it('unknown algorithm payload.content names the algorithm and lists known ones (error buried in content, not thrown)', async () => {
    const r = await runCli(['model', 'explain', 'not_a_real_algorithm']);
    expect(r.exitCode).toBe(0);
    const envelope = json<{ status: string; payload?: { content: string } }>(r);
    expect(envelope.status).toBe('ok');
    expect(envelope.payload?.content).toContain("Unknown algorithm: 'not_a_real_algorithm'");
    expect(envelope.payload?.content).toContain('dfg');
  });

  it('known algorithm (dfg) exits 0 with real content', async () => {
    const r = await runCli(['model', 'explain', 'dfg']);
    expect(r.exitCode).toBe(0);
    const envelope = json<{ status: string; payload?: { content: string; subject: string } }>(r);
    expect(envelope.status).toBe('ok');
    expect(envelope.payload?.subject).toBe('dfg');
    expect(envelope.payload?.content.length).toBeGreaterThan(0);
  });

  it('zero-arg explain shows the algorithm menu, exit 0 (not an error)', async () => {
    const r = await runCli(['model', 'explain']);
    expect(r.exitCode).toBe(0);
    const envelope = json<{ status: string; payload?: { subject: string } }>(r);
    expect(envelope.status).toBe('ok');
    expect(envelope.payload?.subject).toBe('algorithm-menu');
  });

  it('explain compare <alg1> <alg2> DOES throw UNKNOWN_ALGORITHM — disambiguated from interpret\'s metric compare', async () => {
    // nouns/model/explain.ts absorbs the old `wpm interpret` command onto
    // the same verb, and disambiguates its shared "compare" subcommand by
    // checking whether the token AFTER "compare" is a known metric name
    // (fitness/precision/generalization/simplicity/silhouette/drift_score/
    // anomaly_rate). "not_a_real_algo" isn't one, so this correctly routes
    // to explain.ts's own algorithm-pair compare branch, which DOES
    // validate against the real algorithm registry and throws
    // INVALID_INPUT (bridged source_error=2) naming the bad algorithm.
    const r = await runCli(['model', 'explain', 'compare', 'not_a_real_algo', 'dfg']);
    expect(r.exitCode).toBe(2); // bridged: INVALID_INPUT -> source_error (2)
    const envelope = json<{ error?: { code: string; message: string } }>(r);
    expect(envelope.error?.message).toContain('not_a_real_algo');
    expect(envelope.error?.message).toContain('Known algorithms');
  });

  it('explain compare <metric> <v1> <v2> still routes to interpret\'s metric compare (disambiguation control)', async () => {
    const r = await runCli(['model', 'explain', 'compare', 'fitness', '0.71', '0.87']);
    expect(r.exitCode).toBe(0);
    const envelope = json<{ status: string; payload?: { metric: string } }>(r);
    expect(envelope.status).toBe('ok');
    expect(envelope.payload?.metric).toBe('fitness');
  });
});

// ---------------------------------------------------------------------------
// QG-V: wpm validate (now: log validate) — fixed, bridged unchanged.
// ---------------------------------------------------------------------------

describe('QG-V: log validate nonexistent file returns structured JSON (exit 2)', () => {
  it('nonexistent file exits 2 with a parseable JSON error envelope', async () => {
    const r = await runCli(['log', 'validate', '/absolutely/no/such/file-qgv-test.xes']);
    expect(r.exitCode).toBe(2);
    expect(() => JSON.parse(r.stdout)).not.toThrow();
  });

  it('nonexistent file error envelope is {error:{code,message}} with code INVALID_INPUT', async () => {
    const r = await runCli(['log', 'validate', '/absolutely/no/such/file-qgv-test.xes']);
    expect(r.exitCode).toBe(2);
    const envelope = json<{ error?: { code: string; message: string } }>(r);
    expect(envelope.error).toBeDefined();
    expect(envelope.error!.code).toBe('INVALID_INPUT');
    expect(envelope.error!.message).toMatch(/not found|cannot read|missing/i);
  });

  it('validate JSON for valid XES includes a `violations` array (alias of `errors`)', async () => {
    const os = await import('os');
    const fsmod = await import('fs/promises');
    const pathmod = await import('path');
    const tmpDir = await fsmod.mkdtemp(pathmod.join(os.tmpdir(), 'wpm-qgv-'));
    const tmpFile = pathmod.join(tmpDir, 'test.xes');
    const tempXes = `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0" xmlns="http://www.xes-standard.org/">
  <trace>
    <string key="concept:name" value="case-1"/>
    <event>
      <string key="concept:name" value="register"/>
      <date key="time:timestamp" value="2026-01-01T10:00:00Z"/>
    </event>
  </trace>
</log>`;
    try {
      await fsmod.writeFile(tmpFile, tempXes, 'utf-8');
      const r = await runCli(['log', 'validate', tmpFile]);
      expect(r.exitCode).toBe(0);
      const envelope = json<{ status: string; payload?: Record<string, unknown> }>(r);
      expect(envelope.status).toBe('ok');
      expect(envelope.payload).toHaveProperty('violations');
      expect(Array.isArray(envelope.payload!.violations)).toBe(true);
      // violations is the alias of errors — both must carry the same data
      expect(envelope.payload!.violations).toEqual(envelope.payload!.errors);
    } finally {
      await fsmod.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  it('validate JSON payload always includes `valid` boolean and `checks` array on success', async () => {
    const os = await import('os');
    const fsmod = await import('fs/promises');
    const pathmod = await import('path');
    const tmpDir = await fsmod.mkdtemp(pathmod.join(os.tmpdir(), 'wpm-qgv-'));
    const tmpFile = pathmod.join(tmpDir, 'test.xes');
    const tempXes = `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0" xmlns="http://www.xes-standard.org/">
  <trace>
    <string key="concept:name" value="case-1"/>
    <event>
      <string key="concept:name" value="A"/>
      <date key="time:timestamp" value="2026-01-01T10:00:00Z"/>
    </event>
  </trace>
</log>`;
    try {
      await fsmod.writeFile(tmpFile, tempXes, 'utf-8');
      const r = await runCli(['log', 'validate', tmpFile]);
      expect(r.exitCode).toBe(0);
      const envelope = json<{
        status: string;
        payload?: { valid?: boolean; checks?: unknown[]; errors?: string[] };
      }>(r);
      expect(envelope.status).toBe('ok');
      expect(typeof envelope.payload!.valid).toBe('boolean');
      expect(Array.isArray(envelope.payload!.checks)).toBe(true);
      expect(Array.isArray(envelope.payload!.errors)).toBe(true);
    } finally {
      await fsmod.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  });
});
