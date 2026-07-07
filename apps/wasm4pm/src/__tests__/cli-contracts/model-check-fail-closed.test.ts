/**
 * Defect #2 regression: "`oracle conform` vacuously admits anything —
 * episode grouping only reads OCEL-v2 `relationships[]`, exported traces
 * use v1 `ocel:omap`."
 *
 * Executes the BUILT CLI (`wpm model check`) against three classes of bad
 * input and asserts the verdict is fail-closed:
 *
 *   1. an empty file
 *   2. a garbage (non-parseable) JSON file
 *   3. a synthetic tampered/non-conforming trace (fixtures/conformance/
 *      ggen_invalid.xes — a real fixture with a documented lifecycle
 *      violation, replayed against its accompanying Petri net model)
 *
 * For all three: the JSON result must never report `status: "ADMITTED"`,
 * and where a verdict was actually computed (not a hard parse/format
 * error), `findings`/violation detail must be present. Exit-code
 * assertions are also checked; see the per-test comments where a case
 * currently exposes a real gap rather than a test bug.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'node:fs';
import { runCli, tryParseJson, fixture, writeTempFile, CLI_PATH } from './_helpers.js';

const GGEN_INVALID_XES = fixture('fixtures/conformance/ggen_invalid.xes');
const GGEN_MODEL = fixture('fixtures/models/living_diagnostic_clear_v1.pnml');

interface Verdict {
  status?: string;
  checked?: number;
  admitted?: number;
  rejected?: number;
  findings?: unknown[];
  exitCode?: number;
}
interface ErrorEnvelope {
  error?: { code?: string; message?: string };
}

beforeAll(() => {
  expect(fs.existsSync(CLI_PATH), `Built CLI missing at ${CLI_PATH} — run "pnpm --filter @wasm4pm/cli build" first`).toBe(true);
  expect(fs.existsSync(GGEN_INVALID_XES)).toBe(true);
  expect(fs.existsSync(GGEN_MODEL)).toBe(true);
});

describe('defect #2 regression — model check is fail-closed, never a false Admitted', () => {
  describe('empty file', () => {
    const emptyFile = writeTempFile('empty.xes', '');

    it('exits non-zero', async () => {
      const r = await runCli(['model', 'check', emptyFile, '--mode', 'replay', '--model', GGEN_MODEL]);
      expect(r.exitCode).not.toBe(0);
    });

    it('stdout is JSON and never reports status ADMITTED', async () => {
      const r = await runCli(['model', 'check', emptyFile, '--mode', 'replay', '--model', GGEN_MODEL]);
      const parsed = tryParseJson(r.stdout) as (Verdict & ErrorEnvelope) | undefined;
      expect(parsed, `stdout must be JSON: ${r.stdout.slice(0, 300)}`).toBeDefined();
      expect(parsed?.status).not.toBe('ADMITTED');
    });
  });

  describe('garbage JSON file', () => {
    const garbageFile = writeTempFile('garbage.json', 'not valid json at all {{{{');

    it('exits non-zero', async () => {
      const r = await runCli(['model', 'check', garbageFile, '--mode', 'replay', '--model', GGEN_MODEL]);
      expect(r.exitCode).not.toBe(0);
    });

    it('stdout is JSON and never reports status ADMITTED', async () => {
      const r = await runCli(['model', 'check', garbageFile, '--mode', 'replay', '--model', GGEN_MODEL]);
      const parsed = tryParseJson(r.stdout) as (Verdict & ErrorEnvelope) | undefined;
      expect(parsed).toBeDefined();
      expect(parsed?.status).not.toBe('ADMITTED');
    });
  });

  describe('zero-episode OCEL log — the literal historical "vacuous admit" bug', () => {
    // A structurally valid OCEL 2.0 log with no events at all: episode
    // grouping can check zero episodes. The pre-fix bug: an empty
    // Object.entries({}) loop never sets hasViolations, so this silently
    // came back ADMITTED. verdict.ts's fix: checked === 0 => INDETERMINATE.
    const zeroEpisodeOcel = writeTempFile(
      'zero-episode.ocel.json',
      JSON.stringify({ eventTypes: [], objectTypes: [], events: [], objects: [] })
    );

    it('reports status INDETERMINATE, never ADMITTED', async () => {
      const r = await runCli(['model', 'check', zeroEpisodeOcel, '--mode', 'oracle', '--model', 'dummy-handle']);
      const parsed = tryParseJson(r.stdout) as Verdict | undefined;
      expect(parsed, `stdout must be JSON: ${r.stdout.slice(0, 300)}`).toBeDefined();
      expect(parsed?.status).not.toBe('ADMITTED');
      expect(parsed?.status).toBe('INDETERMINATE');
      expect(parsed?.checked).toBe(0);
    });

    // `checkVerb`'s handler returns the verdict object as a normal
    // (non-throwing) result for INDETERMINATE/REJECTED; wpm's
    // `resolveResultExitCode` (apps/wasm4pm/src/cli.ts, wired through
    // `packages/noun-verb/src/cli.ts`'s success path) reads the verdict's
    // own `exitCode: 2` field and uses it as the real process exit code,
    // so a caller checking `$?` alone now sees the INDETERMINATE outcome.
    it('exits non-zero for a zero-episode (INDETERMINATE) check', async () => {
      const r = await runCli(['model', 'check', zeroEpisodeOcel, '--mode', 'oracle', '--model', 'dummy-handle']);
      expect(r.exitCode).not.toBe(0);
      expect(r.exitCode).toBe(2);
    });
  });

  describe('tampered/non-conforming trace (fixtures/conformance/ggen_invalid.xes)', () => {
    it('reports status REJECTED with findings, never ADMITTED', async () => {
      const r = await runCli([
        'model', 'check', GGEN_INVALID_XES,
        '--mode', 'replay',
        '--model', GGEN_MODEL,
        '--fitness-threshold', '0.9',
      ]);
      const parsed = tryParseJson(r.stdout) as Verdict | undefined;
      expect(parsed, `stdout must be JSON: ${r.stdout.slice(0, 300)}`).toBeDefined();
      expect(parsed?.status).not.toBe('ADMITTED');
      expect(parsed?.status).toBe('REJECTED');
      expect(parsed?.rejected).toBeGreaterThan(0);
      expect(Array.isArray(parsed?.findings) && (parsed!.findings as unknown[]).length).toBeGreaterThan(0);
    });

    // Same fix as the zero-episode case above: a REJECTED verdict is a
    // normal (non-throwing) handler return, but `resolveResultExitCode`
    // now surfaces its `exitCode: 6` field as the actual process exit code.
    it('exits non-zero for a REJECTED (non-conforming) trace', async () => {
      const r = await runCli([
        'model', 'check', GGEN_INVALID_XES,
        '--mode', 'replay',
        '--model', GGEN_MODEL,
        '--fitness-threshold', '0.9',
      ]);
      expect(r.exitCode).not.toBe(0);
      expect(r.exitCode).toBe(6);
    });
  });
});
