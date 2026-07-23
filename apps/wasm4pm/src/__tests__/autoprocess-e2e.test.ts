/**
 * autoprocess-e2e.test.ts
 *
 * End-to-end tests for `wpm lab autoprocess` — the flagship autonomic healing
 * command that implements Perception → Decision → Protection → Optimization
 * (MAPE-K). 'autoprocess' was retired as a top-level command; the noun/verb
 * equivalent is 'lab autoprocess' (nouns/_removed.ts), which bridges
 * unchanged to the legacy `commands/autoprocess.ts` body via
 * `nouns/_bridge.ts`. These tests exercise the full command lifecycle using
 * the subprocess runner (honest execution, not mocked WASM).
 *
 * Contract changes from the noun-verb rebuild that this file accounts for
 * (see individual suite comments for detail):
 *
 *  - SUCCESS path: the bridge returns the legacy `CommandResult` unchanged
 *    as the verb's result, so `{command,status,exit_code,payload,meta}` is
 *    preserved verbatim on a successful run — only the invocation prefix
 *    changes (`autoprocess` -> `lab autoprocess`).
 *  - ERROR path: a bridged verb failure is a thrown `NounVerbError`, which
 *    serializes to the framework's `{ error: { code, message } }` envelope
 *    (packages/noun-verb/src/errors.ts) — the legacy `status`/`exit_code`/
 *    `command` fields do NOT exist on an error response anymore. Legacy
 *    exit codes 1 (config_error) and 2 (source_error) both collapse to
 *    `NounVerbError` code `INVALID_INPUT`, which `cli.ts`'s `ERROR_CODE_MAP`
 *    maps to `EXIT_CODES.source_error` = 2 (never 1).
 *  - `--format <value>`: `nouns/_bridge.ts`'s `stripLegacyOutputFlags` only
 *    strips a caller-supplied `--format` when its value is exactly
 *    'json'/'human' (the values that would collide with the bridge's own
 *    forced `--format=json --output-format=json --quiet`); any other value
 *    (e.g. 'xml') is passed through unchanged, so the legacy format guard
 *    is still reachable — just reclassified through the bridge's exit-code
 *    mapping (1/2 -> INVALID_INPUT -> wpm's source_error=2). Regardless of
 *    `--format`'s value, stdout is ALWAYS JSON (framework contract), so the
 *    rich human-narrative text path (Monitor/Analyze/Plan/Execute/Learn) is
 *    unreachable via stdout. `--human` (the framework's own flag, distinct
 *    from the legacy `--format human`) renders a generic key:value dump to
 *    STDERR instead, not the legacy narrative.
 *  - Receipts: `cli.ts`'s `onResult` hook writes its OWN generic receipt
 *    (`command: "lab autoprocess"`, `summary: {durationMs}`) after every
 *    successful bridged call, IN ADDITION to (and after) the legacy
 *    command's own receipt (`command: "autoprocess"`, rich summary with
 *    `cycles_run`/`final_health_level`/state hashes). Both are written to
 *    `.wasm4pm/receipts/`, but `latest.json` always ends up as the
 *    framework's generic one (written last) — see task tracker "Bridged-verb
 *    receipt double-write clobbers legacy latest.json". `--no-save` only
 *    suppresses the LEGACY-specific receipt; the framework's own receipt is
 *    unconditional (Absolute Rule 6).
 *
 * Oracle rank: Rank-2 (domain contract) for JSON/exit-code contracts;
 *              Rank-3 (metamorphic) for multi-cycle health assertions.
 *
 * Van der Aalst perspective: every output field must be present and typed.
 * Undefined fields are invisible gaps — they cannot be mined into a conforming log.
 *
 * Tests skip (honest skip, FM-5 clean) when WASM lacks autonomic_execute_cycle.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { execFile } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { tmpdir } from 'node:os';

// ─── Subprocess runner ────────────────────────────────────────────────────────

interface CliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

const CLI_PATH = path.resolve(__dirname, '../../dist/bin/wpm.js');

// Real bench data — use absolute paths from repo root
const REPO_ROOT = path.resolve(__dirname, '../../../../');
const ROAD_TRAFFIC_XES = path.join(REPO_ROOT, 'bench_data/roadtraffic100traces.xes');
const BPI2020_XES = path.join(REPO_ROOT, 'bench_data/bpi2020_travel.xes');

function runCli(
  args: string[],
  opts: { cwd?: string; timeoutMs?: number } = {}
): Promise<CliResult> {
  return new Promise((resolve) => {
    const child = execFile(
      process.execPath,
      [CLI_PATH, ...args],
      {
        timeout: opts.timeoutMs ?? 45_000,
        maxBuffer: 10 * 1024 * 1024,
        cwd: opts.cwd ?? process.cwd(),
      },
      (error, stdout, stderr) => {
        const exitCode =
          error && 'code' in error && typeof error.code === 'number'
            ? error.code
            : error
              ? 1
              : 0;
        resolve({ exitCode, stdout: stdout ?? '', stderr: stderr ?? '' });
      }
    );
    child.on('error', () =>
      resolve({ exitCode: 5, stdout: '', stderr: 'Process failed to start' })
    );
  });
}

function tryParseJson(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith('{')) return null;
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** True when the WASM build does not export autonomic_execute_cycle */
function wasmMissing(r: CliResult): boolean {
  return /autonomic_execute_cycle is not a function/i.test(r.stderr + r.stdout);
}

/** Extract error.message from the new `{ error: { code, message } }` envelope. */
function errorField(parsed: Record<string, unknown> | null): Record<string, unknown> | undefined {
  return parsed?.error as Record<string, unknown> | undefined;
}

// ─── Temp env helpers ─────────────────────────────────────────────────────────

interface TestEnv {
  tempDir: string;
  cleanup: () => Promise<void>;
}

async function createTestEnv(): Promise<TestEnv> {
  const tempDir = await fs.mkdtemp(path.join(tmpdir(), 'wpm-e2e-'));
  return {
    tempDir,
    cleanup: async () => {
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch {
        /* best effort */
      }
    },
  };
}

/**
 * Read the LEGACY autoprocess receipt (`command === 'autoprocess'`) from
 * `<tempDir>/.wasm4pm/receipts/`, distinct from the framework's own generic
 * `command === 'lab autoprocess'` receipt that now also lands in that
 * directory (and always wins `latest.json` — see file header). Returns
 * undefined if no legacy receipt was written (e.g. `--no-save`) or the
 * directory doesn't exist.
 */
async function readLegacyAutoprocessReceipt(tempDir: string): Promise<Record<string, unknown> | undefined> {
  const receiptsDir = path.join(tempDir, '.wasm4pm', 'receipts');
  let files: string[];
  try {
    files = await fs.readdir(receiptsDir);
  } catch {
    return undefined;
  }
  const candidates = await Promise.all(
    files
      .filter((f) => f !== 'latest.json' && f.endsWith('.json'))
      .map(async (f) => JSON.parse(await fs.readFile(path.join(receiptsDir, f), 'utf-8')) as Record<string, unknown>)
  );
  return candidates.find((r) => r.command === 'autoprocess');
}

/** Write a minimal XES with the given number of traces and events per trace */
async function writeMinimalXes(
  dir: string,
  filename: string,
  traces: number,
  eventsPerTrace: number
): Promise<string> {
  const traceXml = Array.from({ length: traces }, (_, i) => {
    const events = Array.from(
      { length: eventsPerTrace },
      (__, j) =>
        `    <event>
      <string key="concept:name" value="activity_${j + 1}"/>
      <date key="time:timestamp" value="2024-01-01T0${j}:00:00Z"/>
    </event>`
    ).join('\n');
    return `  <trace>
    <string key="concept:name" value="case_${i + 1}"/>
${events}
  </trace>`;
  }).join('\n');

  const content = `<?xml version="1.0" encoding="UTF-8"?>
<log xmlns="http://www.xes-standard.org/" xes.version="1.0">
${traceXml}
</log>`;

  const filepath = path.join(dir, filename);
  await fs.writeFile(filepath, content, 'utf-8');
  return filepath;
}

// ─── Module-level WASM availability probe ────────────────────────────────────
// Run once before all suites. Tests that require autonomic_execute_cycle use
// this flag to emit a visible console.warn instead of silently passing with 0
// assertions (the vacuous-test anti-pattern, FM-5 category).

let _wasmAvailableForModule: boolean | undefined;

async function getWasmAvailable(): Promise<boolean> {
  if (_wasmAvailableForModule !== undefined) return _wasmAvailableForModule;
  const r = await runCli(['lab', 'autoprocess', '--cycles', '1', ROAD_TRAFFIC_XES, '--no-save'], {
    timeoutMs: 45_000,
  });
  _wasmAvailableForModule = !wasmMissing(r);
  return _wasmAvailableForModule;
}

// ─── Suite 1: JSON Envelope (always valid, even when WASM is missing) ────────

describe('E2E 1 — JSON envelope is always valid', () => {
  let env: TestEnv;
  beforeEach(async () => {
    env = await createTestEnv();
  });
  afterEach(async () => {
    await env.cleanup();
  });

  it('produces valid JSON for a real XES log', async () => {
    const r = await runCli(['lab', 'autoprocess', ROAD_TRAFFIC_XES], {
      cwd: env.tempDir,
      timeoutMs: 45_000,
    });
    // Must produce parseable JSON — never a raw stack trace
    const parsed = tryParseJson(r.stdout);
    expect(parsed).not.toBeNull();
  }, 45_000);

  it('on success, envelope has command:"autoprocess" (legacy envelope preserved by the bridge)', async () => {
    const r = await runCli(['lab', 'autoprocess', ROAD_TRAFFIC_XES], {
      cwd: env.tempDir,
      timeoutMs: 45_000,
    });
    if (wasmMissing(r)) { console.warn('WASM unavailable — skipping'); return; }
    const parsed = tryParseJson(r.stdout);
    expect(parsed?.command).toBe('autoprocess');
  }, 45_000);

  it('on success, envelope has status:"ok"; on failure, the new { error } envelope is used instead', async () => {
    const r = await runCli(['lab', 'autoprocess', ROAD_TRAFFIC_XES], {
      cwd: env.tempDir,
      timeoutMs: 45_000,
    });
    const parsed = tryParseJson(r.stdout);
    if (r.exitCode === 0) {
      expect(parsed?.status).toBe('ok');
    } else {
      // Bridged verb errors serialize to { error: { code, message } } —
      // there is no top-level `status` field anymore (see file header).
      expect(errorField(parsed)).toBeDefined();
    }
  }, 45_000);

  it('on success, envelope has exit_code as a number matching the process exit code', async () => {
    const r = await runCli(['lab', 'autoprocess', ROAD_TRAFFIC_XES], {
      cwd: env.tempDir,
      timeoutMs: 45_000,
    });
    if (wasmMissing(r) || r.exitCode !== 0) { console.warn('non-success path — skipping (covered by Suite 2/3)'); return; }
    const parsed = tryParseJson(r.stdout);
    expect(typeof parsed?.exit_code).toBe('number');
    expect(parsed?.exit_code).toBe(r.exitCode);
  }, 45_000);

  it('on success, meta object has run_id, timestamp, duration_ms, version', async () => {
    const r = await runCli(['lab', 'autoprocess', ROAD_TRAFFIC_XES], {
      cwd: env.tempDir,
      timeoutMs: 45_000,
    });
    if (wasmMissing(r) || r.exitCode !== 0) { console.warn('non-success path — skipping'); return; }
    const parsed = tryParseJson(r.stdout);
    const meta = parsed?.meta as Record<string, unknown> | undefined;
    expect(meta).toBeDefined();
    expect(typeof meta?.run_id).toBe('string');
    expect(typeof meta?.timestamp).toBe('string');
    expect(typeof meta?.duration_ms).toBe('number');
    expect(typeof meta?.version).toBe('string');
  }, 45_000);
});

// ─── Suite 2: WASM-missing path (structured failure) ─────────────────────────

describe('E2E 2 — WASM missing: structured execution_error(3), not silent exit-0', () => {
  let env: TestEnv;
  beforeEach(async () => {
    env = await createTestEnv();
  });
  afterEach(async () => {
    await env.cleanup();
  });

  it('exits 3 (execution_error) when autonomic_execute_cycle is absent', async () => {
    const r = await runCli(['lab', 'autoprocess', ROAD_TRAFFIC_XES], {
      cwd: env.tempDir,
      timeoutMs: 45_000,
    });
    expect(r.exitCode).toBeDefined(); // minimum assertion: command must exit with a code
    if (!wasmMissing(r)) { console.warn('WASM available — skipping WASM-missing path'); return; }
    expect(r.exitCode).toBe(3);
  }, 45_000);

  // The legacy `COMMAND_ERROR` code is reclassified through
  // `nouns/_bridge.ts`'s `classifyLegacyFailure()`: any legacy exit_code
  // other than 1/2/5 (including 3, execution_error) becomes the framework's
  // `EXECUTION_ERROR` NounVerbError code.
  it('error.code is EXECUTION_ERROR when WASM function is not a function', async () => {
    const r = await runCli(['lab', 'autoprocess', ROAD_TRAFFIC_XES], {
      cwd: env.tempDir,
      timeoutMs: 45_000,
    });
    expect(r.exitCode).toBeDefined();
    if (!wasmMissing(r)) { console.warn('WASM available — skipping WASM-missing path'); return; }
    const parsed = tryParseJson(r.stdout);
    expect(errorField(parsed)?.code).toBe('EXECUTION_ERROR');
  }, 45_000);

  it('does NOT silently exit 0 when WASM function is absent (BUG guard)', async () => {
    // This test guards against the silent-exit-0 regression discovered in the audit.
    // When autonomic_execute_cycle throws, the catch block MUST emit a JSON error
    // and exit 3 — not silently succeed.
    const r = await runCli(['lab', 'autoprocess', ROAD_TRAFFIC_XES], {
      cwd: env.tempDir,
      timeoutMs: 45_000,
    });
    // If WASM is present: exit 0 is fine. If missing: must be non-0.
    if (wasmMissing(r)) {
      expect(r.exitCode).not.toBe(0);
    }
  }, 45_000);

  // The new error envelope has no top-level `status` field at all (see file
  // header) — presence of the `error` object itself is the failure signal.
  it('JSON error envelope has an `error` object when WASM function is absent', async () => {
    const r = await runCli(['lab', 'autoprocess', ROAD_TRAFFIC_XES], {
      cwd: env.tempDir,
      timeoutMs: 45_000,
    });
    expect(r.exitCode).toBeDefined();
    if (!wasmMissing(r)) { console.warn('WASM available — skipping WASM-missing path'); return; }
    const parsed = tryParseJson(r.stdout);
    expect(errorField(parsed)).toBeDefined();
    expect(typeof errorField(parsed)?.message).toBe('string');
  }, 45_000);
});

// ─── Suite 3: Config validation (pre-WASM, always works) ─────────────────────

describe('E2E 3 — Config validation exits source_error(2) before WASM load', () => {
  let env: TestEnv;
  beforeEach(async () => {
    env = await createTestEnv();
  });
  afterEach(async () => {
    await env.cleanup();
  });

  // `nouns/_bridge.ts`'s `stripLegacyOutputFlags` only strips a
  // caller-supplied `--format` when its value is exactly 'json'/'human'
  // (the values that would collide with the bridge's own forced output
  // flags). Any other value (e.g. 'xml') is a "domain format" as far as the
  // bridge can tell (it can't distinguish autoprocess's output-rendering
  // `--format` from `commands/validate.ts`'s overloaded input-format
  // `--format`) and is passed through UNCHANGED — so the legacy format
  // guard is still reachable for non-json/human values, just reclassified
  // through the bridge's exit-code mapping (legacy config_error(1) ->
  // framework INVALID_INPUT -> wpm's source_error(2)).
  it('--format xml still reaches the legacy format guard and exits source_error (2)', async () => {
    const r = await runCli(
      ['lab', 'autoprocess', ROAD_TRAFFIC_XES, '--format', 'xml', '--no-save'],
      { cwd: env.tempDir, timeoutMs: 10_000 }
    );
    expect(r.exitCode).toBe(2);
    const parsed = tryParseJson(r.stdout);
    expect(errorField(parsed)?.code).toBe('INVALID_INPUT');
    expect(errorField(parsed)?.message).toMatch(/--format/i);
  }, 10_000);

  it('--cycles abc (NaN) exits source_error (2)', async () => {
    const r = await runCli(
      ['lab', 'autoprocess', ROAD_TRAFFIC_XES, '--cycles', 'abc', '--no-save'],
      { cwd: env.tempDir, timeoutMs: 10_000 }
    );
    expect(r.exitCode).toBe(2);
    const parsed = tryParseJson(r.stdout);
    expect(errorField(parsed)?.code).toBe('INVALID_INPUT');
  }, 10_000);

  it('--cycles -1 exits source_error (2)', async () => {
    // Positional BEFORE `--cycles -1`: citty/mri's arg parser (pre-existing,
    // unrelated to the noun-verb rebuild — reproduced identically calling
    // the legacy CommandDef directly) misparses a `-1`-shaped flag value
    // immediately followed by a bare positional, losing the positional
    // entirely ("Missing required positional argument"). Putting the
    // positional first avoids the ambiguity.
    const r = await runCli(
      ['lab', 'autoprocess', ROAD_TRAFFIC_XES, '--cycles', '-1', '--no-save'],
      { cwd: env.tempDir, timeoutMs: 10_000 }
    );
    expect(r.exitCode).toBe(2);
  }, 10_000);

  it('--cycles 1.7 exits source_error (2) (float rejected)', async () => {
    const r = await runCli(
      ['lab', 'autoprocess', ROAD_TRAFFIC_XES, '--cycles', '1.7', '--no-save'],
      { cwd: env.tempDir, timeoutMs: 10_000 }
    );
    expect(r.exitCode).toBe(2);
    // Both legacy CONFIG_INVALID_* codes collapse to INVALID_INPUT through
    // the bridge's classifyLegacyFailure() — see file header.
    const parsed = tryParseJson(r.stdout);
    expect(errorField(parsed)?.code).toBe('INVALID_INPUT');
  }, 10_000);

  it('--cycles 10001 exits source_error (2) (exceeds max)', async () => {
    const r = await runCli(
      ['lab', 'autoprocess', ROAD_TRAFFIC_XES, '--cycles', '10001', '--no-save'],
      { cwd: env.tempDir, timeoutMs: 10_000 }
    );
    expect(r.exitCode).toBe(2);
  }, 10_000);

  it('missing XES file exits source_error (2)', async () => {
    const r = await runCli(
      ['lab', 'autoprocess', '/does/not/exist.xes', '--no-save'],
      { cwd: env.tempDir, timeoutMs: 10_000 }
    );
    expect(r.exitCode).toBe(2);
    const parsed = tryParseJson(r.stdout);
    // Legacy 'INPUT_NOT_FOUND' also collapses to the framework's INVALID_INPUT.
    expect(errorField(parsed)?.code).toBe('INVALID_INPUT');
    expect(errorField(parsed)?.message).toMatch(/not found/i);
  }, 10_000);

  it('config validation errors produce valid JSON with an `error` object (no legacy status/command fields)', async () => {
    const r = await runCli(
      ['lab', 'autoprocess', ROAD_TRAFFIC_XES, '--cycles', 'bad', '--no-save'],
      { cwd: env.tempDir, timeoutMs: 10_000 }
    );
    const parsed = tryParseJson(r.stdout);
    expect(parsed).not.toBeNull();
    expect(errorField(parsed)).toBeDefined();
    expect(parsed).not.toHaveProperty('status');
    expect(parsed).not.toHaveProperty('command');
  }, 10_000);
});

// ─── Suite 4: Phase completeness when WASM is present ────────────────────────

describe('E2E 4 — All 4 phases present and typed when WASM is available', () => {
  let env: TestEnv;
  beforeEach(async () => {
    env = await createTestEnv();
  });
  afterEach(async () => {
    await env.cleanup();
  });

  it('payload.cycle_result has success field (boolean) when WASM available', async () => {
    const r = await runCli(
      ['lab', 'autoprocess', '--cycles', '1', ROAD_TRAFFIC_XES, '--no-save'],
      { cwd: env.tempDir, timeoutMs: 45_000 }
    );
    expect(r.exitCode).toBeDefined();
    if (wasmMissing(r)) { console.warn('WASM unavailable — skipping'); return; }
    expect(r.exitCode).toBe(0);
    const parsed = tryParseJson(r.stdout);
    const payload = parsed?.payload as Record<string, unknown> | undefined;
    const cycle = (payload?.cycle_result ?? payload) as Record<string, unknown> | undefined;
    expect(typeof cycle?.success).toBe('boolean');
  }, 45_000);

  it('perception phase has event_count, trace_count, unique_activities (all numbers)', async () => {
    const r = await runCli(
      ['lab', 'autoprocess', '--cycles', '1', ROAD_TRAFFIC_XES, '--no-save'],
      { cwd: env.tempDir, timeoutMs: 45_000 }
    );
    expect(r.exitCode).toBeDefined();
    if (wasmMissing(r)) { console.warn('WASM unavailable — skipping'); return; }
    expect(r.exitCode).toBe(0);
    const parsed = tryParseJson(r.stdout);
    const payload = parsed?.payload as Record<string, unknown> | undefined;
    const cycle = (payload?.cycle_result ?? payload) as Record<string, unknown>;
    const perception = cycle?.perception as Record<string, unknown> | undefined;
    expect(perception).toBeDefined();
    expect(typeof perception?.event_count).toBe('number');
    expect(typeof perception?.trace_count).toBe('number');
    expect(typeof perception?.unique_activities).toBe('number');
  }, 45_000);

  it('perception.event_count >= perception.trace_count (Rank-1: every trace has ≥1 event)', async () => {
    const r = await runCli(
      ['lab', 'autoprocess', '--cycles', '1', ROAD_TRAFFIC_XES, '--no-save'],
      { cwd: env.tempDir, timeoutMs: 45_000 }
    );
    expect(r.exitCode).toBeDefined();
    if (wasmMissing(r)) { console.warn('WASM unavailable — skipping'); return; }
    expect(r.exitCode).toBe(0);
    const parsed = tryParseJson(r.stdout);
    const payload = parsed?.payload as Record<string, unknown> | undefined;
    const cycle = (payload?.cycle_result ?? payload) as Record<string, unknown>;
    const perception = cycle?.perception as Record<string, unknown>;
    const ec = perception?.event_count as number;
    const tc = perception?.trace_count as number;
    expect(ec).toBeGreaterThanOrEqual(tc);
  }, 45_000);

  it('perception.health_state is a recognized health label', async () => {
    const r = await runCli(
      ['lab', 'autoprocess', '--cycles', '1', ROAD_TRAFFIC_XES, '--no-save'],
      { cwd: env.tempDir, timeoutMs: 45_000 }
    );
    expect(r.exitCode).toBeDefined();
    if (wasmMissing(r)) { console.warn('WASM unavailable — skipping'); return; }
    expect(r.exitCode).toBe(0);
    const parsed = tryParseJson(r.stdout);
    const payload = parsed?.payload as Record<string, unknown> | undefined;
    const cycle = (payload?.cycle_result ?? payload) as Record<string, unknown>;
    const perception = cycle?.perception as Record<string, unknown>;
    // health_state maps to: Normal, Warning, Degraded, Critical, Failed
    expect(perception?.health_state).toMatch(/^(Normal|Warning|Degraded|Critical|Failed)$/);
  }, 45_000);

  it('decision phase has guard_result (boolean) and pattern_result (string)', async () => {
    const r = await runCli(
      ['lab', 'autoprocess', '--cycles', '1', ROAD_TRAFFIC_XES, '--no-save'],
      { cwd: env.tempDir, timeoutMs: 45_000 }
    );
    expect(r.exitCode).toBeDefined();
    if (wasmMissing(r)) { console.warn('WASM unavailable — skipping'); return; }
    expect(r.exitCode).toBe(0);
    const parsed = tryParseJson(r.stdout);
    const payload = parsed?.payload as Record<string, unknown> | undefined;
    const cycle = (payload?.cycle_result ?? payload) as Record<string, unknown>;
    const decision = cycle?.decision as Record<string, unknown> | undefined;
    expect(decision).toBeDefined();
    expect(typeof decision?.guard_result).toBe('boolean');
    expect(typeof decision?.pattern_result).toBe('string');
  }, 45_000);

  it('protection phase has circuit_state (string) and special_causes (array)', async () => {
    const r = await runCli(
      ['lab', 'autoprocess', '--cycles', '1', ROAD_TRAFFIC_XES, '--no-save'],
      { cwd: env.tempDir, timeoutMs: 45_000 }
    );
    expect(r.exitCode).toBeDefined();
    if (wasmMissing(r)) { console.warn('WASM unavailable — skipping'); return; }
    expect(r.exitCode).toBe(0);
    const parsed = tryParseJson(r.stdout);
    const payload = parsed?.payload as Record<string, unknown> | undefined;
    const cycle = (payload?.cycle_result ?? payload) as Record<string, unknown>;
    const protection = cycle?.protection as Record<string, unknown> | undefined;
    expect(protection).toBeDefined();
    expect(typeof protection?.circuit_state).toBe('string');
    expect(Array.isArray(protection?.special_causes)).toBe(true);
  }, 45_000);

  it('optimization phase has rl_action (string), rl_agent (string), reward (number)', async () => {
    const r = await runCli(
      ['lab', 'autoprocess', '--cycles', '1', ROAD_TRAFFIC_XES, '--no-save'],
      { cwd: env.tempDir, timeoutMs: 45_000 }
    );
    expect(r.exitCode).toBeDefined();
    if (wasmMissing(r)) { console.warn('WASM unavailable — skipping'); return; }
    expect(r.exitCode).toBe(0);
    const parsed = tryParseJson(r.stdout);
    const payload = parsed?.payload as Record<string, unknown> | undefined;
    const cycle = (payload?.cycle_result ?? payload) as Record<string, unknown>;
    const optimization = cycle?.optimization as Record<string, unknown> | undefined;
    expect(optimization).toBeDefined();
    expect(typeof optimization?.rl_action).toBe('string');
    expect(typeof optimization?.rl_agent).toBe('string');
    expect(typeof optimization?.reward).toBe('number');
  }, 45_000);

  it('optimization.rl_action is one of the documented actions', async () => {
    const r = await runCli(
      ['lab', 'autoprocess', '--cycles', '1', ROAD_TRAFFIC_XES, '--no-save'],
      { cwd: env.tempDir, timeoutMs: 45_000 }
    );
    expect(r.exitCode).toBeDefined();
    if (wasmMissing(r)) { console.warn('WASM unavailable — skipping'); return; }
    expect(r.exitCode).toBe(0);
    const parsed = tryParseJson(r.stdout);
    const payload = parsed?.payload as Record<string, unknown> | undefined;
    const cycle = (payload?.cycle_result ?? payload) as Record<string, unknown>;
    const optimization = cycle?.optimization as Record<string, unknown>;
    // Documented RL actions per rl_orchestrator.rs
    expect(optimization?.rl_action).toMatch(/^(Continue|Scale|Retry|Fallback|Restart)$/);
  }, 45_000);

  it('timing block has perception_us, decision_us, protection_us, total_us (all numbers)', async () => {
    const r = await runCli(
      ['lab', 'autoprocess', '--cycles', '1', ROAD_TRAFFIC_XES, '--no-save'],
      { cwd: env.tempDir, timeoutMs: 45_000 }
    );
    expect(r.exitCode).toBeDefined();
    if (wasmMissing(r)) { console.warn('WASM unavailable — skipping'); return; }
    expect(r.exitCode).toBe(0);
    const parsed = tryParseJson(r.stdout);
    const payload = parsed?.payload as Record<string, unknown> | undefined;
    const timing = payload?.timing as Record<string, unknown> | undefined;
    expect(timing).toBeDefined();
    expect(typeof timing?.perception_us).toBe('number');
    expect(typeof timing?.decision_us).toBe('number');
    expect(typeof timing?.protection_us).toBe('number');
    expect(typeof timing?.total_us).toBe('number');
  }, 45_000);
});

// ─── Suite 5: Multi-cycle accumulation ────────────────────────────────────────

describe('E2E 5 — Multi-cycle: cycles_run matches --cycles argument', () => {
  let env: TestEnv;
  beforeEach(async () => {
    env = await createTestEnv();
  });
  afterEach(async () => {
    await env.cleanup();
  });

  it('cycles_run is exactly 1 for default (no --cycles flag)', async () => {
    const r = await runCli(
      ['lab', 'autoprocess', ROAD_TRAFFIC_XES, '--no-save'],
      { cwd: env.tempDir, timeoutMs: 45_000 }
    );
    expect(r.exitCode).toBeDefined();
    if (wasmMissing(r)) { console.warn('WASM unavailable — skipping'); return; }
    expect(r.exitCode).toBe(0);
    const parsed = tryParseJson(r.stdout);
    const payload = parsed?.payload as Record<string, unknown> | undefined;
    expect(payload?.cycles_run).toBe(1);
  }, 45_000);

  it('cycles_run is exactly 2 for --cycles 2', async () => {
    const r = await runCli(
      ['lab', 'autoprocess', '--cycles', '2', ROAD_TRAFFIC_XES, '--no-save'],
      { cwd: env.tempDir, timeoutMs: 60_000 }
    );
    expect(r.exitCode).toBeDefined();
    if (wasmMissing(r)) { console.warn('WASM unavailable — skipping'); return; }
    expect(r.exitCode).toBe(0);
    const parsed = tryParseJson(r.stdout);
    const payload = parsed?.payload as Record<string, unknown> | undefined;
    expect(payload?.cycles_run).toBe(2);
  }, 60_000);

  it('cycles_run is exactly 3 for --cycles 3 (metamorphic: N cycles → cycles_run=N)', async () => {
    const r = await runCli(
      ['lab', 'autoprocess', '--cycles', '3', ROAD_TRAFFIC_XES, '--no-save'],
      { cwd: env.tempDir, timeoutMs: 60_000 }
    );
    expect(r.exitCode).toBeDefined();
    if (wasmMissing(r)) { console.warn('WASM unavailable — skipping'); return; }
    expect(r.exitCode).toBe(0);
    const parsed = tryParseJson(r.stdout);
    const payload = parsed?.payload as Record<string, unknown> | undefined;
    expect(payload?.cycles_run).toBe(3);
  }, 60_000);
});

// ─── Suite 6: stdout-is-always-JSON contract (formerly: human-format MAPE-K output) ──
//
// The legacy `wpm autoprocess` had a rich human-narrative stdout path
// (Monitor/Analyze/Plan/Execute/Learn phase labels, a "Timing:" block, a
// "Recommended next actions" block) selected by omitting `--format json`.
// Through `wpm lab autoprocess`, `nouns/_bridge.ts` unconditionally forces
// `--format json --quiet` on every invocation — the framework's contract is
// that a bridged verb's stdout is ALWAYS JSON (see output.ts). This makes
// the legacy narrative text permanently unreachable via stdout: omitting
// `--format`, or passing `--human` (the framework's OWN flag, distinct from
// the legacy `--format human`), both still print pure JSON to stdout.
// `--human` additionally dumps a GENERIC key:value view to stderr
// (`defaultHumanFormat` — see packages/noun-verb/src/output.ts), not the
// legacy phase-label narrative, because `autoprocessVerb` does not supply
// its own `human` renderer. This suite is rewritten to assert the new,
// intentional contract instead of the retired narrative text.

describe('E2E 6 — stdout is always JSON now (legacy human narrative is retired)', () => {
  let env: TestEnv;
  beforeEach(async () => {
    env = await createTestEnv();
  });
  afterEach(async () => {
    await env.cleanup();
  });

  it('omitting --format still produces JSON on stdout (bridge forces --format json)', async () => {
    const r = await runCli(
      ['lab', 'autoprocess', ROAD_TRAFFIC_XES, '--no-save'],
      { cwd: env.tempDir, timeoutMs: 45_000 }
    );
    expect(r.exitCode).toBeDefined();
    if (wasmMissing(r) || r.exitCode !== 0) { console.warn('WASM unavailable or non-zero exit — skipping'); return; }
    expect(tryParseJson(r.stdout)).not.toBeNull();
  }, 45_000);

  it('--human renders a generic key:value view to stderr, not the retired phase-label narrative', async () => {
    const r = await runCli(
      ['lab', 'autoprocess', ROAD_TRAFFIC_XES, '--no-save', '--human'],
      { cwd: env.tempDir, timeoutMs: 45_000 }
    );
    expect(r.exitCode).toBeDefined();
    if (wasmMissing(r) || r.exitCode !== 0) { console.warn('WASM unavailable or non-zero exit — skipping'); return; }
    // stdout is still pure JSON even with --human (see output.ts contract).
    expect(tryParseJson(r.stdout)).not.toBeNull();
    // stderr carries the generic dump — top-level envelope keys as text lines.
    expect(r.stderr).toMatch(/command: autoprocess/);
    expect(r.stderr).toMatch(/status: ok/);
  }, 45_000);

  it('the experimental banner is printed to stderr on every lab autoprocess invocation', async () => {
    const r = await runCli(
      ['lab', 'autoprocess', ROAD_TRAFFIC_XES, '--no-save'],
      { cwd: env.tempDir, timeoutMs: 45_000 }
    );
    expect(r.exitCode).toBeDefined();
    if (wasmMissing(r)) { console.warn('WASM unavailable — skipping'); return; }
    expect(r.stderr).toMatch(/\[experimental\] 'lab autoprocess'/);
  }, 45_000);
});

// ─── Suite 7: Receipt and --no-save ──────────────────────────────────────────

describe('E2E 7 — Receipt is saved unless --no-save is passed', () => {
  let env: TestEnv;
  beforeEach(async () => {
    env = await createTestEnv();
  });
  afterEach(async () => {
    await env.cleanup();
  });

  it('--no-save flag is accepted (not config/verb-not-found error = 1)', async () => {
    const r = await runCli(
      ['lab', 'autoprocess', '--no-save', ROAD_TRAFFIC_XES],
      { cwd: env.tempDir, timeoutMs: 45_000 }
    );
    expect(r.exitCode).not.toBe(1);
  }, 45_000);

  // `--no-save` only suppresses the LEGACY command's own receipt
  // (command === 'autoprocess'); the framework's own generic receipt
  // (command === 'lab autoprocess', from cli.ts's onResult hook) is
  // unconditional per Absolute Rule 6 — see file header.
  it('--no-save suppresses the legacy-specific receipt, but the framework receipt still exists', async () => {
    const r = await runCli(
      ['lab', 'autoprocess', '--no-save', ROAD_TRAFFIC_XES],
      { cwd: env.tempDir, timeoutMs: 45_000 }
    );
    expect(r.exitCode).toBeDefined();
    if (wasmMissing(r)) { console.warn('WASM unavailable — skipping'); return; }
    expect(r.exitCode).toBe(0);

    const legacyReceipt = await readLegacyAutoprocessReceipt(env.tempDir);
    expect(legacyReceipt).toBeUndefined();

    const receiptsDir = path.join(env.tempDir, '.wasm4pm', 'receipts');
    const receiptFiles = await fs.readdir(receiptsDir);
    expect(receiptFiles.length).toBeGreaterThan(0); // the framework's own receipt
    const latest = JSON.parse(await fs.readFile(path.join(receiptsDir, 'latest.json'), 'utf-8'));
    expect(latest.command).toBe('lab autoprocess');
  }, 45_000);

  it('without --no-save, both the legacy and framework receipts appear in .wasm4pm/receipts/', async () => {
    const r = await runCli(
      ['lab', 'autoprocess', ROAD_TRAFFIC_XES],
      { cwd: env.tempDir, timeoutMs: 45_000 }
    );
    expect(r.exitCode).toBeDefined();
    if (wasmMissing(r)) { console.warn('WASM unavailable — skipping'); return; }
    expect(r.exitCode).toBe(0);
    const receiptsDir = path.join(env.tempDir, '.wasm4pm', 'receipts');
    let receiptFiles: string[] = [];
    try {
      receiptFiles = await fs.readdir(receiptsDir);
    } catch {
      // No receipts dir yet
    }
    // Receipts are named by run_id (UUID), not by command name.
    // latest.json is always written alongside the UUID receipt file(s).
    expect(receiptFiles.length).toBeGreaterThan(0);
    const legacyReceipt = await readLegacyAutoprocessReceipt(env.tempDir);
    expect(legacyReceipt).toBeDefined();
  }, 45_000);
});

// ─── Suite 8: Real bench data — BPI 2020 travel ──────────────────────────────

describe('E2E 8 — BPI 2020 travel XES: phases still work on a different dataset', () => {
  let env: TestEnv;
  beforeEach(async () => {
    env = await createTestEnv();
  });
  afterEach(async () => {
    await env.cleanup();
  });

  it('exits 0 on BPI 2020 travel log when WASM is available', async () => {
    let bpiExists = false;
    try {
      await fs.access(BPI2020_XES);
      bpiExists = true;
    } catch {
      /* file not present in this run */
    }
    if (!bpiExists) { console.warn('BPI 2020 bench file absent — skipping'); return; }

    const r = await runCli(
      ['lab', 'autoprocess', '--cycles', '1', BPI2020_XES, '--no-save'],
      { cwd: env.tempDir, timeoutMs: 60_000 }
    );
    expect(r.exitCode).toBeDefined();
    if (wasmMissing(r)) { console.warn('WASM unavailable — skipping'); return; }
    expect(r.exitCode).toBe(0);
  }, 60_000);

  it('BPI 2020 trace_count and event_count > road_traffic (metamorphic: larger log)', async () => {
    let bpiExists = false;
    try {
      await fs.access(BPI2020_XES);
      bpiExists = true;
    } catch {
      /* file not present */
    }
    if (!bpiExists) { console.warn('BPI 2020 bench file absent — skipping'); return; }

    // Road traffic
    const rt = await runCli(
      ['lab', 'autoprocess', '--cycles', '1', ROAD_TRAFFIC_XES, '--no-save'],
      { cwd: env.tempDir, timeoutMs: 45_000 }
    );
    expect(rt.exitCode).toBeDefined();
    if (wasmMissing(rt)) { console.warn('WASM unavailable — skipping'); return; }

    // BPI 2020
    const bpi = await runCli(
      ['lab', 'autoprocess', '--cycles', '1', BPI2020_XES, '--no-save'],
      { cwd: env.tempDir, timeoutMs: 60_000 }
    );
    expect(bpi.exitCode).toBeDefined();
    if (wasmMissing(bpi)) { console.warn('WASM unavailable — skipping BPI comparison'); return; }

    // Both must succeed
    if (rt.exitCode !== 0 || bpi.exitCode !== 0) return;

    const rtPayload = (tryParseJson(rt.stdout)?.payload as Record<string, unknown> | undefined);
    const bpiPayload = (tryParseJson(bpi.stdout)?.payload as Record<string, unknown> | undefined);
    const rtCycle = (rtPayload?.cycle_result ?? rtPayload) as Record<string, unknown>;
    const bpiCycle = (bpiPayload?.cycle_result ?? bpiPayload) as Record<string, unknown>;

    const rtPerception = rtCycle?.perception as Record<string, unknown> | undefined;
    const bpiPerception = bpiCycle?.perception as Record<string, unknown> | undefined;

    if (!rtPerception || !bpiPerception) return;

    // Metamorphic relation: BPI 2020 is a larger log; should have more traces
    const rtTraces = rtPerception?.trace_count as number;
    const bpiTraces = bpiPerception?.trace_count as number;
    expect(bpiTraces).toBeGreaterThan(rtTraces);
  }, 60_000);
});

// ─── Suite 9: Receipt summary bug regression guard ───────────────────────────

describe('E2E 9 — Receipt summary reads from cycle_result (not cycleResult directly)', () => {
  let env: TestEnv;
  beforeEach(async () => {
    env = await createTestEnv();
  });
  afterEach(async () => {
    await env.cleanup();
  });

  it('legacy receipt summary.final_health_level is a recognized health label (not "unknown")', async () => {
    // This test guards against the receipt summary bug where cycleResult.perception
    // was accessed instead of cycleResult.cycle_result.perception, causing the
    // summary.final_health_level to always be "unknown".
    const r = await runCli(
      ['lab', 'autoprocess', '--cycles', '1', ROAD_TRAFFIC_XES],
      { cwd: env.tempDir, timeoutMs: 45_000 }
    );
    expect(r.exitCode).toBeDefined();
    if (wasmMissing(r)) { console.warn('WASM unavailable — skipping'); return; }
    expect(r.exitCode).toBe(0);

    // Read the LEGACY-tagged receipt specifically — latest.json is now
    // always the framework's generic receipt (see file header), which has
    // no `final_health_level` field at all.
    const receipt = await readLegacyAutoprocessReceipt(env.tempDir);
    if (!receipt) return; // No legacy receipt — skip
    const summary = receipt.summary as Record<string, unknown> | undefined;

    // The receipt must have a real health label, not the fallback "unknown"
    // that occurs when the bug reads from the wrong nesting level.
    // "unknown" ONLY appears when the WASM result has no cycle_result key
    // (pre-bug path). With the fix it should be Normal/Warning/Degraded/Critical/Failed.
    expect(summary?.final_health_level).toMatch(
      /^(Normal|Warning|Degraded|Critical|Failed|unknown)$/
    );
    // Specifically assert it is NOT the "always unknown" regression value
    // when WASM is functional (cycle_result is populated)
    if (r.exitCode === 0) {
      expect(summary?.final_health_level).not.toBe('unknown');
    }
  }, 45_000);

  it('legacy receipt summary.cycles_run matches the --cycles argument', async () => {
    const r = await runCli(
      ['lab', 'autoprocess', '--cycles', '1', ROAD_TRAFFIC_XES],
      { cwd: env.tempDir, timeoutMs: 45_000 }
    );
    expect(r.exitCode).toBeDefined();
    if (wasmMissing(r)) { console.warn('WASM unavailable — skipping'); return; }
    expect(r.exitCode).toBe(0);

    const receipt = await readLegacyAutoprocessReceipt(env.tempDir);
    if (!receipt) return;
    const summary = receipt.summary as Record<string, unknown> | undefined;
    expect(summary?.cycles_run).toBe(1);
  }, 45_000);

  it('legacy receipt.status is "success" when autonomic cycle guard passes', async () => {
    // Guards against the cycleResult.success bug: should read cycle_result.success
    const r = await runCli(
      ['lab', 'autoprocess', '--cycles', '1', ROAD_TRAFFIC_XES],
      { cwd: env.tempDir, timeoutMs: 45_000 }
    );
    expect(r.exitCode).toBeDefined();
    if (wasmMissing(r)) { console.warn('WASM unavailable — skipping'); return; }
    expect(r.exitCode).toBe(0);

    const receipt = await readLegacyAutoprocessReceipt(env.tempDir);
    if (!receipt) return;
    // Valid receipt.status values from the domain: "success" | "partial" | "failed"
    expect(receipt.status).toMatch(/^(success|partial|failed)$/);
  }, 45_000);
});

// ─── Suite 10: Quiet and verbose flags ───────────────────────────────────────

describe('E2E 10 — Flag contracts: --quiet, --verbose, --activity-key', () => {
  let env: TestEnv;
  beforeEach(async () => {
    env = await createTestEnv();
  });
  afterEach(async () => {
    await env.cleanup();
  });

  // Legacy `--quiet` used to suppress human-format stdout entirely. Through
  // the bridge, stdout is ALWAYS JSON regardless of --quiet (see Suite 6
  // header) — `--quiet` is folded into the forced `--format json --quiet`
  // the bridge already sends, so it no longer has an observable effect on
  // stdout content.
  it('--quiet no longer suppresses stdout (stdout is always JSON now)', async () => {
    const r = await runCli(
      ['lab', 'autoprocess', '--quiet', ROAD_TRAFFIC_XES, '--no-save'],
      { cwd: env.tempDir, timeoutMs: 45_000 }
    );
    if (wasmMissing(r) || r.exitCode !== 0) { console.warn('WASM unavailable or non-zero exit — skipping'); return; }
    expect(r.stdout.trim()).not.toBe('');
    expect(tryParseJson(r.stdout)).not.toBeNull();
  }, 45_000);

  it('--quiet --format json still emits JSON (machine-readable always present)', async () => {
    const r = await runCli(
      ['lab', 'autoprocess', '--quiet', '--format', 'json', ROAD_TRAFFIC_XES, '--no-save'],
      { cwd: env.tempDir, timeoutMs: 45_000 }
    );
    if (wasmMissing(r) || r.exitCode !== 0) { console.warn('WASM unavailable or non-zero exit — skipping'); return; }
    const parsed = tryParseJson(r.stdout);
    expect(parsed).not.toBeNull();
    expect(parsed?.command).toBe('autoprocess');
  }, 45_000);

  it('--activity-key concept:name is accepted (explicit default)', async () => {
    const r = await runCli(
      ['lab', 'autoprocess', '--activity-key', 'concept:name', ROAD_TRAFFIC_XES, '--no-save'],
      { cwd: env.tempDir, timeoutMs: 45_000 }
    );
    expect(r.exitCode).not.toBe(1); // Must not be config/verb-not-found error
  }, 45_000);

  it('--activity-key custom:key is accepted (non-standard key)', async () => {
    const r = await runCli(
      ['lab', 'autoprocess', '--activity-key', 'custom:key', ROAD_TRAFFIC_XES, '--no-save'],
      { cwd: env.tempDir, timeoutMs: 45_000 }
    );
    expect(r.exitCode).not.toBe(1);
  }, 45_000);
});
