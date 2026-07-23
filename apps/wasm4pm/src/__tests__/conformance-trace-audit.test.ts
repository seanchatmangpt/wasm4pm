/**
 * conformance-trace-audit.test.ts — §8 Trace Classification Audit
 *
 * Migrated from the retired `wpm conformance` top-level command to
 * `wpm model check --mode self` (`apps/wasm4pm/src/nouns/model/check.ts`),
 * per `apps/wasm4pm/src/nouns/_removed.ts`.
 *
 * **Purpose:** Verify that conformance output provides complete trace-level
 * coverage: every episode/case is classified, per-case fitness/token counts
 * are present, and deviation records are typed and complete (not truncated).
 *
 * IMPORTANT — output-shape change from the old suite (read before editing):
 * The old `conformance` command emitted a bespoke report shape
 * (`schema`, `summary.{total_cases,conforming_cases,deviating_cases,
 * conformance_rate}`, `diagnostics.{traced,remaining,missing}`,
 * `deviating_traces[]` with a NEW root-cause `primary_deviation_class` /
 * `deviation_summary` classification that was never actually computed by any
 * shipped engine). The new `ConformanceVerdict` contract
 * (`apps/wasm4pm/src/engines/conformance/verdict.ts`) is intentionally
 * simpler and does NOT include that report shape or the root-cause
 * classification — there is no `missing_activity`/`extra_activity`/
 * `late_activity`/`reordered_activities` bucketing anywhere in the new
 * engine. This file asserts against the real fields the new engine
 * produces instead: top-level `{mode,status,checked,admitted,rejected,
 * findings}` and, per finding, `details.case_fitness[]` (each with
 * `case_id`, `is_conforming`, `trace_fitness`, `tokens_missing`,
 * `tokens_remaining`, `deviations[]`) plus `details.avg_fitness` /
 * `details.total_cases` / `details.conforming_cases` — the real aggregate
 * numbers `check_token_based_replay` returns, not invented ones.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { runCli, tryParseJson, CLI_PATH } from './cli-contracts/_helpers.js';
import * as nodeFs from 'node:fs';

// ─── Helper: Create minimal XES for testing ───────────────────────────────

async function createTestXes(traceCount: number, variant: 'conforming' | 'mixed'): Promise<string> {
  const tmpPath = join(tmpdir(), `test-${Date.now()}-${Math.random().toString(36).slice(2)}.xes`);

  let traces = '';
  if (variant === 'conforming') {
    for (let i = 0; i < traceCount; i++) {
      traces += `
    <trace>
      <string key="concept:name" value="trace-${i}"/>
      <event>
        <string key="concept:name" value="register"/>
      </event>
      <event>
        <string key="concept:name" value="approve"/>
      </event>
      <event>
        <string key="concept:name" value="complete"/>
      </event>
    </trace>`;
    }
  } else {
    // mixed: some conforming, some deviating (skip approve)
    for (let i = 0; i < traceCount; i++) {
      const isDeviating = i % 3 === 0; // Every 3rd is deviating
      traces += `
    <trace>
      <string key="concept:name" value="trace-${i}"/>
      <event>
        <string key="concept:name" value="register"/>
      </event>
      ${isDeviating ? '' : '<event><string key="concept:name" value="approve"/></event>'}
      <event>
        <string key="concept:name" value="complete"/>
      </event>
    </trace>`;
    }
  }

  const xes = `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0" xmlns="http://www.xes-standard.org/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <extension name="Concept" prefix="concept" uri="http://www.xes-standard.org/concept.xesext"/>
  <string key="source" value="test"/>
  ${traces}
</log>`;

  await fs.writeFile(tmpPath, xes, 'utf-8');
  return tmpPath;
}

interface CaseFitness {
  case_id: string;
  is_conforming: boolean;
  trace_fitness: number;
  tokens_missing: number;
  tokens_remaining: number;
  deviations: Array<{ event_index: number; activity: string; deviation_type: string }>;
}
interface CheckDetails {
  case_fitness: CaseFitness[];
  avg_fitness: number;
  conforming_cases: number;
  total_cases: number;
}
interface CheckVerdict {
  mode?: string;
  status?: string;
  checked?: number;
  admitted?: number;
  rejected?: number;
  exitCode?: number;
  findings?: Array<{ episodeId: string; conforms: boolean; reason?: string; details?: CheckDetails }>;
}

/** Run `model check --mode self` (self-discovers a model from the log — no --model needed). */
async function checkSelf(xesPath: string, fitnessThreshold?: number) {
  const args = ['model', 'check', xesPath, '--mode', 'self'];
  if (fitnessThreshold !== undefined) args.push('--fitness-threshold', String(fitnessThreshold));
  return runCli(args);
}

// ─── Test Suite ───────────────────────────────────────────────────────────

describe('§8 Conformance Trace Audit — Coverage & Classification (was: wpm conformance)', () => {
  it('sanity: built CLI exists', () => {
    expect(nodeFs.existsSync(CLI_PATH)).toBe(true);
  });

  describe('CF-1: Trace/episode classification coverage', () => {
    it('checked equals the number of traces in the log, even when > 20', async () => {
      const xesPath = await createTestXes(50, 'mixed');
      try {
        const result = await checkSelf(xesPath, 1.0); // default threshold, forces REJECTED for mixed log
        const payload = tryParseJson(result.stdout) as CheckVerdict | undefined;
        expect(payload, `stdout must be JSON: ${result.stdout.slice(0, 300)}`).toBeDefined();

        // ASSERTION CF-1 (adapted): every one of the 50 traces is checked —
        // no silent 20-trace cap like the old report's `deviating_traces`.
        expect(payload!.checked).toBe(50);

        // ASSERTION CF-5 (coverage invariant): admitted + rejected == checked, always.
        expect((payload!.admitted ?? 0) + (payload!.rejected ?? 0)).toBe(payload!.checked);

        // The finding details carry the real per-case aggregate: total_cases
        // must also equal 50 (no truncation at the case_fitness level either).
        const details = payload!.findings?.[0]?.details;
        expect(details?.total_cases).toBe(50);
      } finally {
        await fs.unlink(xesPath).catch(() => {});
      }
    });

    it('conforming_cases + non-conforming cases == total_cases (no case left unclassified)', async () => {
      const xesPath = await createTestXes(30, 'mixed');
      try {
        const result = await checkSelf(xesPath, 1.0);
        const payload = tryParseJson(result.stdout) as CheckVerdict | undefined;
        const details = payload!.findings?.[0]?.details;
        expect(details).toBeDefined();

        const nonConforming = details!.case_fitness.filter((c) => !c.is_conforming).length;
        expect(details!.conforming_cases + nonConforming).toBe(details!.total_cases);
        expect(details!.case_fitness.length).toBe(30);
      } finally {
        await fs.unlink(xesPath).catch(() => {});
      }
    });
  });

  describe('CF-2: Deviation typing (was: NEW root-cause classification — REMOVED, see file header)', () => {
    // The old suite asserted a `primary_deviation_class` /
    // `deviation_summary` root-cause bucketing that no shipped engine ever
    // computed. The new engine emits a real, narrower `deviation_type` per
    // deviation event instead (from the token-based-replay WASM primitive) —
    // assert against that real value set, not the removed invented one.
    it('every deviation on a non-conforming case has a real deviation_type, event_index, and activity', async () => {
      const xesPath = await createTestXes(10, 'mixed');
      try {
        const result = await checkSelf(xesPath, 1.0);
        const payload = tryParseJson(result.stdout) as CheckVerdict | undefined;
        const details = payload!.findings?.[0]?.details;
        expect(details).toBeDefined();

        const nonConforming = details!.case_fitness.filter((c) => !c.is_conforming);
        expect(nonConforming.length).toBeGreaterThan(0); // the 'mixed' fixture always has deviating cases

        for (const c of nonConforming) {
          expect(c.deviations.length).toBeGreaterThan(0);
          for (const dev of c.deviations) {
            expect(typeof dev.event_index).toBe('number');
            expect(typeof dev.activity).toBe('string');
            expect(typeof dev.deviation_type).toBe('string');
            expect(dev.deviation_type.length).toBeGreaterThan(0);
          }
        }
      } finally {
        await fs.unlink(xesPath).catch(() => {});
      }
    });
  });

  describe('CF-3: Complete per-case deviation metrics (not truncated)', () => {
    it('reports full case_fitness detail for every case, not just the first few', async () => {
      const xesPath = await createTestXes(20, 'mixed');
      try {
        const result = await checkSelf(xesPath, 1.0);
        const payload = tryParseJson(result.stdout) as CheckVerdict | undefined;
        const details = payload!.findings?.[0]?.details;
        expect(details!.case_fitness.length).toBe(20); // ASSERTION CF-3: all 20 cases present, none dropped

        for (const c of details!.case_fitness) {
          expect(typeof c.trace_fitness).toBe('number');
          expect(c.trace_fitness).toBeGreaterThanOrEqual(0);
          expect(c.trace_fitness).toBeLessThanOrEqual(1);
          expect(typeof c.tokens_missing).toBe('number');
          expect(typeof c.tokens_remaining).toBe('number');
        }
      } finally {
        await fs.unlink(xesPath).catch(() => {});
      }
    });
  });

  describe('CF-4: Aggregate metrics account for all observed behavior', () => {
    it('avg_fitness is bounded [0,1] and reflects the per-case fitness values', async () => {
      const xesPath = await createTestXes(10, 'mixed');
      try {
        const result = await checkSelf(xesPath, 1.0);
        const payload = tryParseJson(result.stdout) as CheckVerdict | undefined;
        const details = payload!.findings?.[0]?.details;
        expect(details!.avg_fitness).toBeGreaterThanOrEqual(0);
        expect(details!.avg_fitness).toBeLessThanOrEqual(1);

        const computedAvg =
          details!.case_fitness.reduce((sum, c) => sum + c.trace_fitness, 0) / details!.case_fitness.length;
        expect(Math.abs(details!.avg_fitness - computedAvg)).toBeLessThan(0.01);
      } finally {
        await fs.unlink(xesPath).catch(() => {});
      }
    });

    it('a fully-conforming log at --fitness-threshold 0 is ADMITTED with rejected=0', async () => {
      // Real fitness values are computed by the WASM token-replay engine and
      // are not guaranteed to be exactly 1.0 for a self-discovered model, so
      // this uses threshold 0 (any nonnegative fitness admits) to
      // deterministically exercise the ADMITTED path rather than asserting
      // an exact fitness number the discovery algorithm doesn't promise.
      const xesPath = await createTestXes(10, 'conforming');
      try {
        const result = await checkSelf(xesPath, 0);
        const payload = tryParseJson(result.stdout) as CheckVerdict | undefined;
        expect(payload?.status).toBe('ADMITTED');
        expect(payload?.rejected).toBe(0);
        expect(payload?.admitted).toBe(payload?.checked);
        expect(payload?.findings).toEqual([]); // ADMITTED verdicts carry no findings, by design (verdict.ts)
      } finally {
        await fs.unlink(xesPath).catch(() => {});
      }
    });

    it('a conforming case reports zero deviations', async () => {
      const xesPath = await createTestXes(20, 'conforming');
      try {
        const result = await checkSelf(xesPath, 1.0);
        const payload = tryParseJson(result.stdout) as CheckVerdict | undefined;
        const details = payload!.findings?.[0]?.details;
        const conformingCases = details!.case_fitness.filter((c) => c.is_conforming);
        expect(conformingCases.length).toBeGreaterThan(0);
        for (const c of conformingCases) {
          expect(c.deviations).toEqual([]);
        }
      } finally {
        await fs.unlink(xesPath).catch(() => {});
      }
    });
  });

  describe('CF-5: Coverage invariant holds across log sizes', () => {
    it('checked === admitted + rejected for several log sizes', async () => {
      for (const size of [5, 8, 10]) {
        const xesPath = await createTestXes(size, 'mixed');
        try {
          const result = await checkSelf(xesPath, 1.0);
          const payload = tryParseJson(result.stdout) as CheckVerdict | undefined;
          expect(payload?.checked).toBe(size);
          expect((payload?.admitted ?? 0) + (payload?.rejected ?? 0)).toBe(size);
        } finally {
          await fs.unlink(xesPath).catch(() => {});
        }
      }
    });
  });
});

describe('Conformance output schema (was: {schema,summary,diagnostics,deviating_traces} — now the plain ConformanceVerdict fields)', () => {
  it('includes the real ConformanceVerdict fields, not the old report shape, and no {command,status,payload} wrapper', async () => {
    const xesPath = await createTestXes(5, 'mixed');
    try {
      const result = await checkSelf(xesPath, 1.0);
      const payload = tryParseJson(result.stdout) as Record<string, unknown> | undefined;
      expect(payload).toBeDefined();

      // Old fields are gone — assert their absence so a regression back to
      // the old shape (or a half-migrated hybrid) would fail this test.
      expect(payload).not.toHaveProperty('schema');
      expect(payload).not.toHaveProperty('summary');
      expect(payload).not.toHaveProperty('deviating_traces');
      expect(payload).not.toHaveProperty('command');
      expect(payload).not.toHaveProperty('payload');

      // Real fields present.
      expect(payload).toHaveProperty('mode', 'self');
      expect(payload).toHaveProperty('status');
      expect(payload).toHaveProperty('checked');
      expect(payload).toHaveProperty('admitted');
      expect(payload).toHaveProperty('rejected');
      expect(payload).toHaveProperty('exitCode');
      expect(payload).toHaveProperty('findings');
      expect(Array.isArray((payload as { findings: unknown }).findings)).toBe(true);
    } finally {
      await fs.unlink(xesPath).catch(() => {});
    }
  });
});
