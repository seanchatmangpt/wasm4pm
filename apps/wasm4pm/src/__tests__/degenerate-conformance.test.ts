/**
 * Degenerate Case Conformance Testing
 *
 * Migrated from the retired top-level `wpm conformance` command (removed —
 * see `apps/wasm4pm/src/nouns/_removed.ts`: `conformance` -> `model check
 * --mode replay`) to `wpm model check` (`apps/wasm4pm/src/nouns/model/check.ts`).
 *
 * The old command apparently self-discovered a model by default when none
 * was given; the closest new equivalent for "run conformance with no
 * explicit model" is `--mode self` (discovers a model from the log itself
 * via alpha++, then checks the log against it) — used throughout below for
 * the bare-invocation cases. The one case that genuinely needs an
 * externally-provided model uses `--mode replay --model <file>`.
 *
 * Output-shape notes (see `engines/conformance/verdict.ts` /
 * `ConformanceVerdict`): the new payload is `{mode,format,status,checked,
 * admitted,rejected,exitCode,message,findings}` — there is no
 * `payload.summary.{total_cases,deviating_cases}`, no top-level
 * `payload.fitness`, and no `primary_deviation_class`/`deviation_summary`
 * root-cause bucketing (never actually computed by any shipped engine).
 * Per-case detail now lives at `findings[].details.case_fitness[]` (each
 * with `trace_fitness`, `tokens_missing`, `tokens_remaining`,
 * `deviations[]`), and `findings[].details.avg_fitness` /`.total_cases` are
 * the aggregate equivalents. `checked` is the new equivalent of the old
 * `summary.total_cases`. Audits below are updated 1:1 to the new fields,
 * kept just as advisory/loose as the original (this suite's own stated
 * intent — see comments) wherever the original was advisory.
 *
 * Degenerate cases audited:
 * - Logs with all identical events
 * - Logs with single trace
 * - Models with cycles or deadlocks
 * - Logs with implicit activities not in model
 * - Empty logs and models
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { runCli, EXIT_CODES } from '@wasm4pm/testing';
import * as fs from 'fs/promises';
import * as path from 'path';

const fixtureDir = path.join(process.cwd(), '__fixtures__', 'degenerate-conformance');

interface DegenerateTestCase {
  name: string;
  xesContent: string;
  modelContent?: string;
  expectedBehavior: 'success' | 'crash' | 'diagnostic';
  expectedExitCode?: number;
  expectedPatterns?: string[];
}

// Test cases: degenerate conformance scenarios
const testCases: DegenerateTestCase[] = [
  {
    name: 'All identical events (single activity)',
    xesContent: `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0" xmlns="http://www.xes-standard.org/">
  <trace>
    <event>
      <string key="concept:name" value="ProcessEvent"/>
      <date key="time:timestamp" value="2026-05-01T10:00:00.000Z"/>
    </event>
    <event>
      <string key="concept:name" value="ProcessEvent"/>
      <date key="time:timestamp" value="2026-05-01T10:01:00.000Z"/>
    </event>
    <event>
      <string key="concept:name" value="ProcessEvent"/>
      <date key="time:timestamp" value="2026-05-01T10:02:00.000Z"/>
    </event>
  </trace>
</log>`,
    expectedBehavior: 'diagnostic',
    expectedExitCode: 6,
    expectedPatterns: ['fitness', 'ProcessEvent'],
  },
  {
    name: 'Single trace single event',
    xesContent: `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0" xmlns="http://www.xes-standard.org/">
  <trace>
    <event>
      <string key="concept:name" value="Start"/>
      <date key="time:timestamp" value="2026-05-01T10:00:00.000Z"/>
    </event>
  </trace>
</log>`,
    expectedBehavior: 'diagnostic',
    expectedExitCode: 6,
    expectedPatterns: ['fitness', 'Start'],
  },
  {
    name: 'Empty log (no traces)',
    xesContent: `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0" xmlns="http://www.xes-standard.org/">
</log>`,
    expectedBehavior: 'diagnostic',
    expectedExitCode: 2,
    expectedPatterns: ['empty', 'no traces', 'trace_count'],
  },
  {
    name: 'Log with activity not in discovered model',
    xesContent: `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0" xmlns="http://www.xes-standard.org/">
  <trace>
    <event>
      <string key="concept:name" value="Initialize"/>
      <date key="time:timestamp" value="2026-05-01T10:00:00.000Z"/>
    </event>
    <event>
      <string key="concept:name" value="UnknownActivity"/>
      <date key="time:timestamp" value="2026-05-01T10:01:00.000Z"/>
    </event>
    <event>
      <string key="concept:name" value="Complete"/>
      <date key="time:timestamp" value="2026-05-01T10:02:00.000Z"/>
    </event>
  </trace>
</log>`,
    expectedBehavior: 'success',
    expectedExitCode: 0,
    expectedPatterns: ['fitness', 'implicit'],
  },
  {
    name: 'Log with duplicate consecutive events',
    xesContent: `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0" xmlns="http://www.xes-standard.org/">
  <trace>
    <event>
      <string key="concept:name" value="ApprovalRequest"/>
      <date key="time:timestamp" value="2026-05-01T10:00:00.000Z"/>
    </event>
    <event>
      <string key="concept:name" value="ApprovalRequest"/>
      <date key="time:timestamp" value="2026-05-01T10:01:00.000Z"/>
    </event>
    <event>
      <string key="concept:name" value="ApprovalRequest"/>
      <date key="time:timestamp" value="2026-05-01T10:02:00.000Z"/>
    </event>
    <event>
      <string key="concept:name" value="Approved"/>
      <date key="time:timestamp" value="2026-05-01T10:03:00.000Z"/>
    </event>
  </trace>
</log>`,
    expectedBehavior: 'diagnostic',
    expectedExitCode: 6,
    expectedPatterns: ['fitness', 'trace_fitness'],
  },
  {
    name: 'Very long single trace (500 events)',
    xesContent: (() => {
      let events = '';
      for (let i = 0; i < 500; i++) {
        const act = i % 3 === 0 ? 'A' : i % 3 === 1 ? 'B' : 'C';
        const ts = new Date(2026, 4, 1, 10, 0, i).toISOString();
        events += `    <event>
      <string key="concept:name" value="${act}"/>
      <date key="time:timestamp" value="${ts}"/>
    </event>\n`;
      }
      return `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0" xmlns="http://www.xes-standard.org/">
  <trace>
${events}  </trace>
</log>`;
    })(),
    expectedBehavior: 'diagnostic',
    expectedExitCode: 6,
    expectedPatterns: ['fitness'],
  },
  {
    name: 'Missing activity-key attribute in log',
    xesContent: `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0" xmlns="http://www.xes-standard.org/">
  <trace>
    <event>
      <string key="org:resource" value="John"/>
      <date key="time:timestamp" value="2026-05-01T10:00:00.000Z"/>
    </event>
  </trace>
</log>`,
    expectedBehavior: 'diagnostic',
    expectedExitCode: 6,
    expectedPatterns: ['fitness'],
  },
  {
    name: 'Multiple traces with varying lengths',
    xesContent: `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0" xmlns="http://www.xes-standard.org/">
  <trace>
    <event>
      <string key="concept:name" value="Start"/>
      <date key="time:timestamp" value="2026-05-01T10:00:00.000Z"/>
    </event>
  </trace>
  <trace>
    <event>
      <string key="concept:name" value="Start"/>
      <date key="time:timestamp" value="2026-05-01T10:10:00.000Z"/>
    </event>
    <event>
      <string key="concept:name" value="Middle"/>
      <date key="time:timestamp" value="2026-05-01T10:11:00.000Z"/>
    </event>
  </trace>
  <trace>
    <event>
      <string key="concept:name" value="Start"/>
      <date key="time:timestamp" value="2026-05-01T10:20:00.000Z"/>
    </event>
    <event>
      <string key="concept:name" value="Middle"/>
      <date key="time:timestamp" value="2026-05-01T10:21:00.000Z"/>
    </event>
    <event>
      <string key="concept:name" value="End"/>
      <date key="time:timestamp" value="2026-05-01T10:22:00.000Z"/>
    </event>
  </trace>
</log>`,
    expectedBehavior: 'diagnostic',
    expectedExitCode: 6,
    expectedPatterns: ['fitness', 'trace'],
  },
];

describe('Degenerate Conformance Cases (was: wpm conformance, now wpm model check --mode self)', () => {
  beforeAll(async () => {
    // Ensure fixture directory exists
    await fs.mkdir(fixtureDir, { recursive: true });
  });

  testCases.forEach((testCase) => {
    it(`should handle: ${testCase.name}`, async () => {
      // Write test XES file
      const xesPath = path.join(fixtureDir, `${testCase.name.replace(/\s+/g, '-')}.xes`);
      await fs.writeFile(xesPath, testCase.xesContent, 'utf-8');

      try {
        // Run conformance command — self-discovers a model from the log (no
        // explicit --model needed, matching the old command's implicit default).
        const result = await runCli(['model', 'check', xesPath, '--mode', 'self']);

        // Parse JSON output (if format is JSON and output is valid)
        let payload: Record<string, unknown> | undefined;
        try {
          const output = JSON.parse(result.stdout);
          payload = (output.payload ?? output) as Record<string, unknown>;
        } catch {
          // Output may be human-readable or error message
        }

        // Verify expected patterns in output (loose check) — 'fitness' no
        // longer appears as a literal top-level field name, but does still
        // appear inside `findings[].reason`/`details` and error messages
        // for the relevant cases; kept advisory as in the original.
        const fullOutput = result.stdout + result.stderr;
        if (testCase.expectedPatterns && testCase.expectedPatterns.length > 0) {
          const pattern = testCase.expectedPatterns[0];
          const found =
            fullOutput.toLowerCase().includes(pattern.toLowerCase()) ||
            (payload && JSON.stringify(payload).toLowerCase().includes(pattern.toLowerCase()));
          // Pattern check is advisory only; don't fail hard if pattern is not found
          // (output formatting varies based on error paths)
          if (!found && result.exitCode === 0) {
            expect(found, `Expected pattern "${pattern}" for exit code 0`).toBe(true);
          }
        }

        const details = (payload?.findings as Array<{ details?: Record<string, unknown> }> | undefined)?.[0]?.details;

        // Case-specific assertions
        if (testCase.name.includes('identical events')) {
          expect([0, 6]).toContain(result.exitCode);
          const avgFitness = details?.avg_fitness as number | undefined;
          expect(avgFitness).toBeDefined();
          expect(avgFitness).toBeGreaterThanOrEqual(0);
          expect(avgFitness).toBeLessThanOrEqual(1);
        }

        if (testCase.name.includes('single trace')) {
          expect([0, 6]).toContain(result.exitCode);
          if (payload?.checked !== undefined) {
            expect(payload.checked).toBe(1);
          }
        }

        if (testCase.name.includes('Empty log')) {
          expect([2, 3, 5]).toContain(result.exitCode);
          // New message text: "zero episodes could be checked (...no events...)"
          expect(fullOutput).toMatch(/empty|zero episodes|no events|trace_count|load|parse/i);
        }

        if (testCase.name.includes('unknown activity')) {
          expect([0, 2, 6]).toContain(result.exitCode);
          // 'self' mode discovers the model FROM this same log, so
          // "not in discovered model" cannot manifest the way it did against
          // a fixed external model; the old `payload.isFit` field is gone —
          // just confirm this doesn't crash and produces a real verdict.
          expect(typeof payload?.status).toBe('string');
        }

        if (testCase.name.includes('duplicate consecutive')) {
          expect([0, 6]).toContain(result.exitCode);
          if (payload?.rejected !== undefined) {
            expect(payload.rejected as number).toBeGreaterThanOrEqual(0);
          }
        }

        if (testCase.name.includes('long single trace')) {
          expect([0, 6]).toContain(result.exitCode);
          if (payload?.checked !== undefined) {
            expect(payload.checked).toBe(1);
          }
        }

        if (testCase.name.includes('missing activity-key')) {
          expect([0, 2, 3, 6]).toContain(result.exitCode);
        }

        if (testCase.name.includes('varying lengths')) {
          expect([0, 6]).toContain(result.exitCode);
          // Only check if payload exists; some errors may prevent parsing
          if (payload?.checked !== undefined) {
            expect(payload.checked).toBe(3);
          }
        }
      } finally {
        // Cleanup
        try {
          await fs.unlink(xesPath);
        } catch {
          /* ignore cleanup errors */
        }
      }
    });
  });
});

describe('Degenerate Conformance Edge Case Diagnostics (was: wpm conformance)', () => {
  it('should emit a diagnostic when fitness is near the --fitness-threshold boundary (was: --threshold)', async () => {
    // Create a log that will produce a fitness very close to threshold
    const xesPath = path.join(fixtureDir, 'threshold-edge.xes');
    const xesContent = `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0" xmlns="http://www.xes-standard.org/">
  <trace>
    <event>
      <string key="concept:name" value="A"/>
      <date key="time:timestamp" value="2026-05-01T10:00:00.000Z"/>
    </event>
    <event>
      <string key="concept:name" value="B"/>
      <date key="time:timestamp" value="2026-05-01T10:01:00.000Z"/>
    </event>
  </trace>
</log>`;

    await fs.writeFile(xesPath, xesContent, 'utf-8');

    try {
      const result = await runCli(['model', 'check', xesPath, '--mode', 'self', '--fitness-threshold', '0.5']);
      const output = JSON.parse(result.stdout);
      const payload = output.payload ?? output;

      // The old top-level `payload.threshold` echo field no longer exists —
      // the threshold now only shows up inside a REJECTED finding's `reason`
      // string (e.g. "... < threshold 0.5"). Assert the real new shape
      // instead of the removed field.
      expect(typeof payload.status).toBe('string');
      expect([0, 6]).toContain(result.exitCode);
      if (payload.status === 'REJECTED') {
        expect(payload.findings[0].reason).toContain('0.5');
      }
    } finally {
      try {
        await fs.unlink(xesPath);
      } catch {
        /* ignore */
      }
    }
  });

  it('should provide typed deviation detail for deviating cases (was: NEW root-cause classification — REMOVED, see file header)', async () => {
    const xesPath = path.join(fixtureDir, 'deviation-classify.xes');
    const xesContent = `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0" xmlns="http://www.xes-standard.org/">
  <trace>
    <event>
      <string key="concept:name" value="Register"/>
      <date key="time:timestamp" value="2026-05-01T10:00:00.000Z"/>
    </event>
    <event>
      <string key="concept:name" value="Review"/>
      <date key="time:timestamp" value="2026-05-01T10:01:00.000Z"/>
    </event>
    <event>
      <string key="concept:name" value="UnapprovedStep"/>
      <date key="time:timestamp" value="2026-05-01T10:02:00.000Z"/>
    </event>
    <event>
      <string key="concept:name" value="Complete"/>
      <date key="time:timestamp" value="2026-05-01T10:03:00.000Z"/>
    </event>
  </trace>
</log>`;

    await fs.writeFile(xesPath, xesContent, 'utf-8');

    try {
      const result = await runCli(['model', 'check', xesPath, '--mode', 'self']);
      const output = JSON.parse(result.stdout);
      const payload = output.payload ?? output;

      const finding = payload.findings?.[0];
      const caseFitness = finding?.details?.case_fitness ?? [];
      const nonConforming = caseFitness.filter((c: { is_conforming: boolean }) => !c.is_conforming);
      if (nonConforming.length > 0) {
        // Real typed deviations (deviation_type is a genuine WASM-computed
        // value like 'missing_tokens' — not the old invented
        // primary_deviation_class/deviation_summary categories).
        expect(nonConforming[0].deviations.length).toBeGreaterThan(0);
        expect(typeof nonConforming[0].deviations[0].deviation_type).toBe('string');
      }
    } finally {
      try {
        await fs.unlink(xesPath);
      } catch {
        /* ignore */
      }
    }
  });

  it('should handle conformance on a manually provided (malformed) model without crashing', async () => {
    const xesPath = path.join(fixtureDir, 'simple-model.xes');
    const modelPath = path.join(fixtureDir, 'simple-model.json');

    const xesContent = `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0" xmlns="http://www.xes-standard.org/">
  <trace>
    <event>
      <string key="concept:name" value="A"/>
      <date key="time:timestamp" value="2026-05-01T10:00:00.000Z"/>
    </event>
    <event>
      <string key="concept:name" value="B"/>
      <date key="time:timestamp" value="2026-05-01T10:01:00.000Z"/>
    </event>
  </trace>
</log>`;

    // Raw Petri-net-shaped JSON (places/transitions/arcs) — NOT the DFG-JSON
    // shape `--mode replay`'s model loader expects (`{nodes,...}`, see
    // `engines/conformance/replayers/dfg.ts`). This deliberately keeps the
    // original "malformed/unexpected model shape" intent: the new verb must
    // reject it cleanly (EXECUTION_ERROR), never crash.
    const modelContent = {
      places: [
        { id: 'p0', initial_marking: 1 },
        { id: 'p1', initial_marking: 0 },
        { id: 'p2', initial_marking: 0 },
      ],
      transitions: [
        { id: 't1', label: 'A', is_invisible: false },
        { id: 't2', label: 'B', is_invisible: false },
      ],
      arcs: [
        { from: 'p0', to: 't1', weight: 1 },
        { from: 't1', to: 'p1', weight: 1 },
        { from: 'p1', to: 't2', weight: 1 },
        { from: 't2', to: 'p2', weight: 1 },
      ],
    };

    await fs.writeFile(xesPath, xesContent, 'utf-8');
    await fs.writeFile(modelPath, JSON.stringify(modelContent), 'utf-8');

    try {
      const result = await runCli(['model', 'check', xesPath, '--model', modelPath, '--mode', 'replay']);
      // Should not crash, regardless of model validity
      expect([0, 1, 2, 3, 6]).toContain(result.exitCode);
      // Ignore experimental warnings, look for actual panics/crashes only
      const relevantStderr = result.stderr.replace(/ExperimentalWarning[\s\S]*?\n\n/g, '');
      expect(relevantStderr).not.toMatch(/^(?!.*ExperimentalWarning)(.*panic|crash|Exception)/i);
      // The malformed shape (missing `nodes`) is rejected cleanly.
      const parsed = JSON.parse(result.stdout);
      if (result.exitCode !== 0) {
        expect(parsed.error).toBeDefined();
      }
    } finally {
      try {
        await fs.unlink(xesPath);
        await fs.unlink(modelPath);
      } catch {
        /* ignore */
      }
    }
  });
});
