/**
 * Migrated from the old top-level `wpm conformance` surface (removed — see
 * `apps/wasm4pm/src/nouns/_removed.ts`: `conformance` -> `model check --mode
 * replay`) to the new noun/verb `wpm model check` command
 * (`apps/wasm4pm/src/nouns/model/check.ts`).
 *
 * Behavioral notes carried over from the old suite:
 * - A successful (non-throwing) result IS the JSON payload directly — no
 *   `{command,status,payload,meta}` wrapper. Stdout is ALWAYS JSON
 *   (`packages/noun-verb/src/output.ts`), whether the outcome is success or
 *   `{error:{code,message,action_template}}`.
 * - Several old flags have no new equivalent and are simply ignored by the
 *   new verb (unknown flags are not rejected — see `packages/noun-verb`
 *   citty wiring): `--format`, `--classify`, `--diagnosis`, `--strict-mode`,
 *   `--fail-fast`, `--save-report`, `--algorithm`, `--precision-mode`,
 *   `--timeout`, `--max-traces`, `--statistics`, `--method` (replaced by
 *   `--mode`), `--threshold` (renamed `--fitness-threshold`), `--object-types`
 *   (renamed singular `--object-type`), `--model-from`. These are exercised
 *   below only where the new contract has a direct replacement; the rest is
 *   noted as intentionally removed rather than silently dropped.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'node:fs';
import { runCli, tryParseJson, fixture, writeTempFile, CLI_PATH } from './cli-contracts/_helpers.js';

const RUNNING_EXAMPLE_XES = fixture('fixtures/shared/running-example.xes');
const GGEN_MODEL = fixture('fixtures/models/living_diagnostic_clear_v1.pnml');
const REAL_OCEL = fixture('fixtures/world/ocel-v2.json');

interface Verdict {
  mode?: string;
  format?: string;
  status?: string;
  checked?: number;
  admitted?: number;
  rejected?: number;
  exitCode?: number;
  findings?: unknown[];
}
interface ErrorEnvelope {
  error?: { code?: string; message?: string };
}

beforeAll(() => {
  expect(fs.existsSync(CLI_PATH), `Built CLI missing at ${CLI_PATH} — run "pnpm --filter @wasm4pm/cli build" first`).toBe(true);
  expect(fs.existsSync(RUNNING_EXAMPLE_XES)).toBe(true);
  expect(fs.existsSync(GGEN_MODEL)).toBe(true);
  expect(fs.existsSync(REAL_OCEL)).toBe(true);
});

describe('wpm model check — conformance checking (was: wpm conformance)', () => {
  describe('model check (basic)', () => {
    it('should require input log argument (exits source_error, JSON error envelope)', async () => {
      const r = await runCli(['model', 'check']);
      expect(r.exitCode).toBe(2); // source_error — INVALID_INPUT maps to source_error in wpm's ERROR_CODE_MAP
      const parsed = tryParseJson(r.stdout) as ErrorEnvelope | undefined;
      expect(parsed?.error?.code).toBe('INVALID_INPUT');
    });

    it('should accept a positional input path and detect its format', async () => {
      const r = await runCli(['model', 'check', RUNNING_EXAMPLE_XES, '--mode', 'self', '--fitness-threshold', '0.01']);
      const parsed = tryParseJson(r.stdout) as Verdict | undefined;
      expect(parsed, `stdout must be JSON: ${r.stdout.slice(0, 300)}`).toBeDefined();
      expect(parsed?.format).toBe('xes');
    });
  });

  describe('model check --model / --mode', () => {
    it('should require --model for --mode replay (INVALID_INPUT, exit source_error)', async () => {
      const r = await runCli(['model', 'check', RUNNING_EXAMPLE_XES, '--mode', 'replay']);
      expect(r.exitCode).toBe(2);
      const parsed = tryParseJson(r.stdout) as ErrorEnvelope | undefined;
      expect(parsed?.error?.code).toBe('INVALID_INPUT');
      expect(parsed?.error?.message).toMatch(/--model is required/i);
    });

    it('should return an execution error for a malformed PNML model file', async () => {
      const modelFile = writeTempFile('bad-model.pnml', '<model/>'); // missing <net> element
      const r = await runCli(['model', 'check', RUNNING_EXAMPLE_XES, '--model', modelFile, '--mode', 'replay']);
      expect(r.exitCode).toBe(3); // execution_error — PNML parse failure surfaces as EXECUTION_ERROR
      const parsed = tryParseJson(r.stdout) as ErrorEnvelope | undefined;
      expect(parsed?.error?.code).toBe('EXECUTION_ERROR');
      expect(parsed?.error?.message).toMatch(/pnml|net/i);
    });

    it('--mode self does not require --model (discovers from the log itself)', async () => {
      const r = await runCli(['model', 'check', RUNNING_EXAMPLE_XES, '--mode', 'self', '--fitness-threshold', '0.01']);
      const parsed = tryParseJson(r.stdout) as Verdict | undefined;
      expect(parsed?.mode).toBe('self');
      expect(typeof parsed?.status).toBe('string');
    });

    it('--mode oracle requires an OCEL log, not XES', async () => {
      const r = await runCli(['model', 'check', RUNNING_EXAMPLE_XES, '--mode', 'oracle', '--model', 'dummy-handle']);
      expect(r.exitCode).toBe(2);
      const parsed = tryParseJson(r.stdout) as ErrorEnvelope | undefined;
      expect(parsed?.error?.code).toBe('INVALID_INPUT');
      expect(parsed?.error?.message).toMatch(/oracle requires an OCEL/i);
    });

    it('--mode drift requires an XES/CSV log, not OCEL', async () => {
      const r = await runCli(['model', 'check', REAL_OCEL, '--mode', 'drift']);
      expect(r.exitCode).toBe(2);
      const parsed = tryParseJson(r.stdout) as ErrorEnvelope | undefined;
      expect(parsed?.error?.code).toBe('INVALID_INPUT');
      expect(parsed?.error?.message).toMatch(/drift requires an XES or CSV/i);
    });

    it('rejects an unknown --mode value', async () => {
      const r = await runCli(['model', 'check', RUNNING_EXAMPLE_XES, '--mode', 'bogus']);
      expect(r.exitCode).toBe(2);
      const parsed = tryParseJson(r.stdout) as ErrorEnvelope | undefined;
      expect(parsed?.error?.code).toBe('INVALID_INPUT');
      expect(parsed?.error?.message).toMatch(/unknown --mode/i);
    });
  });

  describe('model check help text — replaces old fitness/precision/diagnosis --help assertions', () => {
    it('should mention fitness in --fitness-threshold help', async () => {
      const r = await runCli(['model', 'check', '--help']);
      expect(r.stdout + r.stderr).toMatch(/fitness/i);
    });

    it('should describe the available conformance modes', async () => {
      const r = await runCli(['model', 'check', '--help']);
      const help = r.stdout + r.stderr;
      expect(help).toMatch(/replay/i);
      expect(help).toMatch(/oracle/i);
      expect(help).toMatch(/prefix/i);
      expect(help).toMatch(/drift/i);
    });
  });

  describe('model check findings — replaces old --classify / --diagnosis assertions', () => {
    // The old CLI had dedicated --classify/--diagnosis flags gating a subset of
    // output. The new contract always includes full per-episode `findings`
    // (with deviation-level detail) whenever the verdict is REJECTED — no flag
    // needed; there is nothing left to gate.
    it('REJECTED verdicts include per-episode findings with deviation diagnosis detail', async () => {
      const r = await runCli(['model', 'check', RUNNING_EXAMPLE_XES, '--mode', 'self', '--fitness-threshold', '0.999999']);
      const parsed = tryParseJson(r.stdout) as Verdict | undefined;
      expect(parsed?.status).toBe('REJECTED');
      expect(Array.isArray(parsed?.findings)).toBe(true);
      expect((parsed!.findings as unknown[]).length).toBeGreaterThan(0);
      const finding = (parsed!.findings as Record<string, unknown>[])[0];
      expect(finding).toHaveProperty('episodeId');
      expect(finding).toHaveProperty('conforms', false);
      expect(finding).toHaveProperty('details');
    });
  });

  describe('model check --fitness-threshold (was: --threshold)', () => {
    it('a non-numeric --fitness-threshold makes every episode NaN-compare false, so the log is always REJECTED, never ADMITTED', async () => {
      // fitness >= NaN is false in JS for any fitness value, so this is a
      // deterministic, well-defined (if surprising) fail-closed behavior —
      // not a config-time validation error like the old --threshold check.
      const r = await runCli(['model', 'check', RUNNING_EXAMPLE_XES, '--mode', 'self', '--fitness-threshold', 'not-a-number']);
      const parsed = tryParseJson(r.stdout) as Verdict | undefined;
      expect(parsed?.status).toBe('REJECTED');
      expect(r.exitCode).toBe(6); // conformance_fail
    });

    it('a very low --fitness-threshold (0) still requires --model for --mode replay', async () => {
      const r = await runCli(['model', 'check', RUNNING_EXAMPLE_XES, '--mode', 'replay', '--fitness-threshold', '0']);
      expect(r.exitCode).toBe(2);
    });
  });

  describe('model check --activity-key / --object-type (was: --object-types plural)', () => {
    it('accepts a custom --activity-key', async () => {
      const r = await runCli([
        'model', 'check', RUNNING_EXAMPLE_XES,
        '--mode', 'self', '--fitness-threshold', '0.01', '--activity-key', 'concept:name',
      ]);
      const parsed = tryParseJson(r.stdout) as Verdict | undefined;
      expect(parsed?.mode).toBe('self');
    });

    it('accepts --object-type for --mode oracle (episode grouping key) — grouping by "order" finds a real episode, unlike the default key', async () => {
      const r = await runCli(['model', 'check', REAL_OCEL, '--mode', 'oracle', '--model', GGEN_MODEL, '--object-type', 'order']);
      const parsed = tryParseJson(r.stdout) as Verdict | undefined;
      expect(parsed, `stdout must be JSON: ${r.stdout.slice(0, 300)}`).toBeDefined();
      expect(parsed?.mode).toBe('oracle');
      expect(parsed?.checked).toBeGreaterThan(0);
    });
  });

  describe('model check --human (was: --format json toggling human vs JSON)', () => {
    it('stdout stays pure JSON even with --human; the human view goes to stderr only', async () => {
      const r = await runCli(['model', 'check', RUNNING_EXAMPLE_XES, '--mode', 'self', '--fitness-threshold', '0.01', '--human']);
      expect(() => JSON.parse(r.stdout)).not.toThrow();
      expect(r.stderr).toMatch(/\[self]/);
    });
  });

  describe('model check JSON payload shape (was: {command,status,payload,meta} envelope assertions)', () => {
    it('a successful result is the plain verdict payload, not wrapped', async () => {
      const r = await runCli(['model', 'check', RUNNING_EXAMPLE_XES, '--mode', 'self', '--fitness-threshold', '0.01']);
      const json = tryParseJson(r.stdout) as Record<string, unknown> | undefined;
      expect(json).toBeDefined();
      expect(json).not.toHaveProperty('command');
      expect(json).not.toHaveProperty('payload');
      expect(json).toHaveProperty('mode');
      expect(json).toHaveProperty('status');
      expect(json).toHaveProperty('checked');
      expect(json).toHaveProperty('exitCode');
    });

    it('an error result is exactly {error:{code,message}}, never the old {command,status} shape', async () => {
      const r = await runCli(['model', 'check']);
      const json = tryParseJson(r.stdout) as Record<string, unknown> | undefined;
      expect(json).toEqual({ error: expect.objectContaining({ code: 'INVALID_INPUT', message: expect.any(String) }) });
    });
  });

  describe('model check --window-size (was: n/a — new drift-only flag)', () => {
    it('accepts a custom --window-size for --mode drift', async () => {
      const r = await runCli(['model', 'check', RUNNING_EXAMPLE_XES, '--mode', 'drift', '--window-size', '10']);
      const parsed = tryParseJson(r.stdout) as { windowSize?: number } | undefined;
      expect(parsed?.windowSize).toBe(10);
    });
  });

  describe('removed old flags are silently ignored, not rejected (intentional — no per-flag validation left)', () => {
    it('unknown legacy flags (--format, --classify, --strict-mode, --precision-mode) do not break dispatch', async () => {
      const r = await runCli([
        'model', 'check', RUNNING_EXAMPLE_XES,
        '--mode', 'self', '--fitness-threshold', '0.01',
        '--format', 'json', '--classify', '--strict-mode', '--precision-mode', 'fast',
      ]);
      // Ignored flags don't error; the verb runs normally on its recognized args.
      const parsed = tryParseJson(r.stdout) as Verdict | undefined;
      expect(parsed?.mode).toBe('self');
    });
  });
});
