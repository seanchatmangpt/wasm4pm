/**
 * Tests for `wpm pipeline` — workflow chaining.
 *
 * `pipeline` survived the noun-verb rebuild as a bare noun, but its old
 * subcommands were restructured (nouns/_removed.ts):
 *   `pipeline create` / `pipeline list` / `pipeline validate` -> `pipeline plan`
 *   (all three collapsed into one verb that BUILDS a typed step DAG from a
 *   `--preset`, a `--plan-file`, or `--auto` — it does not write files, list
 *   built-ins, or validate independently of building).
 *   `pipeline run` still exists but now takes `--preset <name>`/`--plan-file
 *   <path>`/`--auto` (no more bare positional preset name or plan-file path)
 *   and executes through `engines/orchestrator/execute.ts` in-process,
 *   chaining a BLAKE3 receipt per step — see `nouns/pipeline/run.ts` and
 *   `plan.ts`.
 *
 * Contract changes verified live and reflected below:
 *   - Only 3 built-in presets now: full (5 steps: validate, stats, discover,
 *     check, explain) | quick (2 steps: validate, discover) | compliance
 *     (3 steps: validate, discover, check). The old 4th "discovery" preset
 *     and the old full=6/quick=2 step counts no longer apply.
 *   - There is no verb to enumerate built-in presets without picking one
 *     and supplying `--input` (`buildPlan` requires `--input` for any
 *     preset) — `pipeline plan`/`pipeline list --format json` no longer
 *     exists as an "list all builtins" operation. Presets themselves are
 *     directly named in `engines/orchestrator/plan.ts`'s `PRESET_NAMES`.
 *   - `pipeline create` (write a `.pipeline.json` to disk) has no
 *     replacement at all — `plan`/`run` only ever consume a plan file
 *     (`--plan-file`), never produce one. This is a genuine feature
 *     removal, not a renamed command.
 *   - A verb result is the plain JSON payload directly — no `{payload:...}`
 *     wrapper (these are native, non-bridged verbs, unlike e.g. `evidence
 *     report`). `pipeline plan`'s result IS the `OrchestratorPlan` (+
 *     `executionOrder`); `pipeline run`'s result IS the `ExecutionReport`
 *     (`{planId, status, steps, chainHash}` — no more
 *     `pipeline_name`/`steps_completed`/`steps_failed`/`step_results`).
 *   - No `optional: true` step flag any more — `executePlan` is strictly
 *     fail-fast: the first step error stops the run (a later step may
 *     depend on the failed one's output) and the whole run reports
 *     `status: 'failed'` (or `'partial'` if at least one earlier step
 *     already succeeded before the failure).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runCli, EXIT_CODES } from '@wasm4pm/testing';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ─── Fixture setup ────────────────────────────────────────────────────────────

// Prefer the packages/testing fixture: verified clean (`log validate` reports
// `status: 'pass'`) — `data/small-example.xes` fails real schema validation
// (missing concept:name/time:timestamp on some events), which is the correct,
// intentional fail-closed behavior of `log validate` but not useful for
// exercising a successful multi-step run.
const FIXTURE_XES_TESTING = '/Users/sac/wasm4pm/packages/testing/__tests__/fixtures/sample.xes';
const FIXTURE_XES_ALT = '/Users/sac/wasm4pm/test/fixtures/small.xes';
const FIXTURE_XES = '/Users/sac/wasm4pm/data/small-example.xes';

function findFixtureXes(): string | undefined {
  for (const candidate of [FIXTURE_XES_TESTING, FIXTURE_XES_ALT, FIXTURE_XES]) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return undefined;
}

// ─── Test helpers ─────────────────────────────────────────────────────────────

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wpm-pipeline-test-'));
});

afterEach(() => {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch { /* ignore */ }
});

function writePlanFile(name: string, content: object): string {
  const filePath = path.join(tmpDir, `${name}.json`);
  fs.writeFileSync(filePath, JSON.stringify(content, null, 2));
  return filePath;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('wpm pipeline plan (was: wpm pipeline create/list/validate)', () => {
  it('--preset quick builds a 2-step DAG (validate -> discover)', async () => {
    const fixture = findFixtureXes();
    if (!fixture) {
      console.log('Skipping: no fixture XES file found');
      return;
    }
    const result = await runCli(['pipeline', 'plan', '--preset', 'quick', '--input', fixture]);
    expect(result.exitCode).toBe(EXIT_CODES.success);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.presetName).toBe('quick');
    expect(parsed.steps.length).toBe(2);
    expect(parsed.executionOrder).toEqual(['validate', 'discover']);
  });

  it('--preset full builds a 5-step DAG', async () => {
    const fixture = findFixtureXes();
    if (!fixture) return;
    const result = await runCli(['pipeline', 'plan', '--preset', 'full', '--input', fixture]);
    expect(result.exitCode).toBe(EXIT_CODES.success);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.steps.length).toBe(5);
  });

  it('--preset compliance builds a 3-step DAG', async () => {
    const fixture = findFixtureXes();
    if (!fixture) return;
    const result = await runCli(['pipeline', 'plan', '--preset', 'compliance', '--input', fixture]);
    expect(result.exitCode).toBe(EXIT_CODES.success);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.steps.length).toBe(3);
  });

  it('exits non-zero (source_error) for an unknown preset name', async () => {
    const result = await runCli(['pipeline', 'plan', '--preset', 'nonexistent-preset-12345', '--input', 'x.xes']);
    expect(result.exitCode).toBe(EXIT_CODES.source_error);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.error?.message).toMatch(/Unknown pipeline preset/i);
  });

  it('exits non-zero when a preset is given without --input', async () => {
    const result = await runCli(['pipeline', 'plan', '--preset', 'quick']);
    expect(result.exitCode).toBe(EXIT_CODES.source_error);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.error?.message).toMatch(/--input/i);
  });

  it('exits non-zero when neither preset, --plan-file, nor --auto is given', async () => {
    const result = await runCli(['pipeline', 'plan']);
    expect(result.exitCode).toBe(EXIT_CODES.source_error);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.error?.message).toMatch(/preset|plan-file|auto/i);
  });

  it('exits non-zero for a missing --plan-file', async () => {
    const result = await runCli(['pipeline', 'plan', '--plan-file', '/nonexistent/pipeline.json']);
    expect(result.exitCode).toBe(EXIT_CODES.source_error);
  });

  it('exits non-zero for invalid JSON in --plan-file', async () => {
    const badFile = path.join(tmpDir, 'bad.json');
    fs.writeFileSync(badFile, '{ not valid json ]');

    const result = await runCli(['pipeline', 'plan', '--plan-file', badFile]);
    expect(result.exitCode).toBe(EXIT_CODES.source_error);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.error?.message).toMatch(/not valid JSON/i);
  });

  it('exits non-zero for a --plan-file with an empty steps array', async () => {
    const planFile = writePlanFile('empty-steps', { steps: [] });
    const result = await runCli(['pipeline', 'plan', '--plan-file', planFile]);
    expect(result.exitCode).toBe(EXIT_CODES.source_error);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.error?.message).toMatch(/non-empty 'steps'/i);
  });

  it('exits non-zero for a --plan-file step missing noun/verb', async () => {
    const planFile = writePlanFile('bad-step', { steps: [{ args: {} }] });
    const result = await runCli(['pipeline', 'plan', '--plan-file', planFile]);
    expect(result.exitCode).toBe(EXIT_CODES.source_error);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.error?.message).toMatch(/noun.*verb/i);
  });

  it('builds a plan from a custom --plan-file (noun/verb steps)', async () => {
    const fixture = findFixtureXes();
    if (!fixture) return;
    const planFile = writePlanFile('custom-test', {
      steps: [
        { id: 'validate', noun: 'log', verb: 'validate', args: { input: fixture } },
        { id: 'discover', noun: 'model', verb: 'discover', args: { input: fixture }, dependsOn: ['validate'] },
      ],
    });

    const result = await runCli(['pipeline', 'plan', '--plan-file', planFile]);
    expect(result.exitCode).toBe(EXIT_CODES.success);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.source).toBe('file');
    expect(parsed.steps.length).toBe(2);
    expect(parsed.executionOrder).toEqual(['validate', 'discover']);
  });
});

describe('wpm pipeline run', () => {
  it('exits non-zero (source_error) for unknown preset name', async () => {
    const result = await runCli(['pipeline', 'run', '--preset', 'nonexistent-preset-12345', '--input', 'x.xes']);
    expect(result.exitCode).toBe(EXIT_CODES.source_error);
  });

  it('exits non-zero (source_error) for missing --plan-file', async () => {
    const result = await runCli(['pipeline', 'run', '--plan-file', '/nonexistent/pipeline.json']);
    expect(result.exitCode).toBe(EXIT_CODES.source_error);
  });

  it('runs the quick preset end to end and exits 0 with a clean fixture log', async () => {
    const fixture = findFixtureXes();
    if (!fixture) {
      console.log('Skipping: no fixture XES file found');
      return;
    }

    const result = await runCli(['pipeline', 'run', '--preset', 'quick', '--input', fixture], {
      timeout: 60_000,
    });
    // quick runs log validate + model discover — both should succeed with a valid log
    expect(result.exitCode).toBe(EXIT_CODES.success);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.status).toBe('ok');
  });

  it('emits an ExecutionReport with required fields (planId, status, steps, chainHash)', async () => {
    const fixture = findFixtureXes();
    if (!fixture) {
      console.log('Skipping: no fixture XES file found');
      return;
    }

    const result = await runCli(['pipeline', 'run', '--preset', 'quick', '--input', fixture], { timeout: 60_000 });

    // Even partial/full failure should still produce a well-formed report.
    expect([EXIT_CODES.success, EXIT_CODES.partial_failure, EXIT_CODES.execution_error]).toContain(result.exitCode);

    const parsed = JSON.parse(result.stdout);
    expect(typeof parsed.planId).toBe('string');
    expect(['ok', 'partial', 'failed']).toContain(parsed.status);
    expect(Array.isArray(parsed.steps)).toBe(true);
    expect(typeof parsed.chainHash).toBe('string');
    for (const step of parsed.steps) {
      expect(typeof step.stepId).toBe('string');
      expect(['ok', 'error']).toContain(step.status);
      expect(typeof step.durationMs).toBe('number');
      expect(typeof step.outputHash).toBe('string');
    }
  });

  it('runs a custom plan file end to end', async () => {
    const fixture = findFixtureXes();
    if (!fixture) {
      console.log('Skipping: no fixture XES file found');
      return;
    }

    const planFile = writePlanFile('custom-run', {
      steps: [
        { id: 'validate', noun: 'log', verb: 'validate', args: { input: fixture } },
        { id: 'discover', noun: 'model', verb: 'discover', args: { input: fixture }, dependsOn: ['validate'] },
      ],
    });

    const result = await runCli(['pipeline', 'run', '--plan-file', planFile], { timeout: 60_000 });

    expect(result.exitCode).toBe(EXIT_CODES.success);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.status).toBe('ok');
    expect(parsed.steps.map((s: { stepId: string }) => s.stepId)).toEqual(['validate', 'discover']);
  });

  it('is fail-fast: a step error stops the run rather than skipping to later steps (no more "optional" steps)', async () => {
    const planFile = writePlanFile('failing-step', {
      steps: [
        // `log validate` on a nonexistent file fails immediately.
        { id: 'bad-validate', noun: 'log', verb: 'validate', args: { input: '/nonexistent/log.xes' } },
        { id: 'discover', noun: 'model', verb: 'discover', args: { input: '/nonexistent/log.xes' }, dependsOn: ['bad-validate'] },
      ],
    });

    const result = await runCli(['pipeline', 'run', '--plan-file', planFile], { timeout: 60_000 });

    expect([EXIT_CODES.partial_failure, EXIT_CODES.execution_error]).toContain(result.exitCode);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.status).toBe('failed');
    // Only the first (failing) step ran — the dependent step never executed.
    expect(parsed.steps.length).toBe(1);
    expect(parsed.steps[0].status).toBe('error');
  });

  it('--auto builds and runs a quick validate -> discover plan for --input', async () => {
    const fixture = findFixtureXes();
    if (!fixture) {
      console.log('Skipping: no fixture XES file found');
      return;
    }
    const result = await runCli(['pipeline', 'run', '--auto', '--input', fixture], { timeout: 60_000 });
    expect(result.exitCode).toBe(EXIT_CODES.success);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.steps.map((s: { stepId: string }) => s.stepId)).toEqual(['validate', 'discover']);
  });
});
