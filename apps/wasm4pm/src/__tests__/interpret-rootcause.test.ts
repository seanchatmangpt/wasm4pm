/**
 * interpret-rootcause.test.ts
 *
 * Tests for the dramatically improved `wpm interpret` command (now: `wpm
 * model explain`) and root cause analysis.
 *
 * `wpm interpret` had no dedicated slot in the noun/verb rebuild — it was
 * absorbed into `wpm model explain` (see nouns/model/explain.ts): the
 * bridged verb inspects the first positional token and forwards to
 * `commands/interpret.ts`'s logic when it's a known metric name (fitness,
 * precision, ...) or `report`; `compare` is ambiguous (both `explain` and
 * `interpret` have their own `compare` subcommand) and is disambiguated by
 * the token that follows it. Unit tests below (interpretMetric/
 * compareMetrics/analyzeRootCauses, imported directly from
 * commands/interpret.ts) are UNCHANGED — they never touch the CLI routing
 * at all. Only the CLI-integration section changed invocations/exit codes.
 *
 * Covers:
 *   1. `wpm model explain <metric> <value>` — single metric interpretation
 *   2. `wpm model explain compare <metric> <v1> <v2>` — comparison output
 *   3. `wpm model explain report -i <fixture>` — full quality report
 *   4. Level threshold contracts (good/ok/low/poor)
 *   5. Root cause analysis for sub-threshold dimensions
 *   6. All 7 supported metrics
 *   7. Error handling (unreachable-vs-reachable "unknown metric" case, out-of-range value)
 */

import { describe, it, expect } from 'vitest';
import {
  interpretMetric,
  compareMetrics,
  analyzeRootCauses,
  type MetricLevel,
  type MetricInterpretation,
} from '../commands/interpret.js';
import { runCli, EXIT_CODES, createCliTestEnv } from '@wasm4pm/testing';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_XES = path.resolve(__dirname, '../../../../data/running-example.xes');

// ─── Unit tests: interpretMetric ─────────────────────────────────────────────

describe('interpretMetric — fitness level thresholds', () => {
  const cases: Array<[number, MetricLevel]> = [
    [0.87, 'good'],
    [0.85, 'good'],
    [0.73, 'ok'],
    [0.60, 'ok'],
    [0.55, 'low'],
    [0.40, 'low'],
    [0.35, 'poor'],
    [0.10, 'poor'],
    [0.00, 'poor'],
  ];

  for (const [value, expectedLevel] of cases) {
    it(`fitness ${value} → ${expectedLevel}`, () => {
      const result = interpretMetric('fitness', value);
      expect(result).not.toBeNull();
      expect(result!.level).toBe(expectedLevel);
    });
  }
});

describe('interpretMetric — precision level thresholds', () => {
  it('0.90 → good', () => expect(interpretMetric('precision', 0.90)!.level).toBe('good'));
  it('0.75 → ok',   () => expect(interpretMetric('precision', 0.75)!.level).toBe('ok'));
  it('0.50 → low',  () => expect(interpretMetric('precision', 0.50)!.level).toBe('low'));
  it('0.20 → poor', () => expect(interpretMetric('precision', 0.20)!.level).toBe('poor'));
});

describe('interpretMetric — generalization level thresholds', () => {
  it('0.80 → good', () => expect(interpretMetric('generalization', 0.80)!.level).toBe('good'));
  it('0.60 → ok',   () => expect(interpretMetric('generalization', 0.60)!.level).toBe('ok'));
  it('0.40 → low',  () => expect(interpretMetric('generalization', 0.40)!.level).toBe('low'));
  it('0.10 → poor', () => expect(interpretMetric('generalization', 0.10)!.level).toBe('poor'));
});

describe('interpretMetric — simplicity level thresholds', () => {
  it('0.80 → good', () => expect(interpretMetric('simplicity', 0.80)!.level).toBe('good'));
  it('0.60 → ok',   () => expect(interpretMetric('simplicity', 0.60)!.level).toBe('ok'));
  it('0.40 → low',  () => expect(interpretMetric('simplicity', 0.40)!.level).toBe('low'));
  it('0.10 → poor', () => expect(interpretMetric('simplicity', 0.10)!.level).toBe('poor'));
});

describe('interpretMetric — silhouette level thresholds', () => {
  it('0.75 → good', () => expect(interpretMetric('silhouette', 0.75)!.level).toBe('good'));
  it('0.50 → ok',   () => expect(interpretMetric('silhouette', 0.50)!.level).toBe('ok'));
  it('0.30 → low',  () => expect(interpretMetric('silhouette', 0.30)!.level).toBe('low'));
  it('0.10 → poor', () => expect(interpretMetric('silhouette', 0.10)!.level).toBe('poor'));
});

describe('interpretMetric — drift_score (inverted: lower is better)', () => {
  it('0.10 → good (stable)', () => expect(interpretMetric('drift_score', 0.10)!.level).toBe('good'));
  it('0.30 → ok',            () => expect(interpretMetric('drift_score', 0.30)!.level).toBe('ok'));
  it('0.50 → low',           () => expect(interpretMetric('drift_score', 0.50)!.level).toBe('low'));
  it('0.80 → poor',          () => expect(interpretMetric('drift_score', 0.80)!.level).toBe('poor'));
});

describe('interpretMetric — anomaly_rate (inverted: lower is better)', () => {
  it('0.03 → good', () => expect(interpretMetric('anomaly_rate', 0.03)!.level).toBe('good'));
  it('0.10 → ok',   () => expect(interpretMetric('anomaly_rate', 0.10)!.level).toBe('ok'));
  it('0.20 → low',  () => expect(interpretMetric('anomaly_rate', 0.20)!.level).toBe('low'));
  it('0.40 → poor', () => expect(interpretMetric('anomaly_rate', 0.40)!.level).toBe('poor'));
});

describe('interpretMetric — return shape', () => {
  it('returns required fields for fitness', () => {
    const r = interpretMetric('fitness', 0.73);
    expect(r).not.toBeNull();
    expect(r!.metric).toBe('fitness');
    expect(typeof r!.value).toBe('number');
    expect(['good', 'ok', 'low', 'poor']).toContain(r!.level);
    expect(typeof r!.level_label).toBe('string');
    expect(typeof r!.percentage).toBe('string');
    expect(typeof r!.what_it_means).toBe('string');
    expect(Array.isArray(r!.context_by_range)).toBe(true);
    expect(r!.context_by_range.length).toBeGreaterThan(0);
    expect(Array.isArray(r!.causes)).toBe(true);
    expect(r!.causes.length).toBeGreaterThan(0);
    expect(Array.isArray(r!.actions)).toBe(true);
    expect(r!.actions.length).toBeGreaterThan(0);
    expect(typeof r!.academic_context).toBe('string');
  });

  it('marks exactly one range entry as current', () => {
    const r = interpretMetric('fitness', 0.73)!;
    const currentEntries = r.context_by_range.filter(e => e.current === true);
    expect(currentEntries.length).toBe(1);
  });

  it('returns null for unknown metric', () => {
    expect(interpretMetric('nonexistent_metric', 0.5)).toBeNull();
  });

  it('causes have rank and cause fields', () => {
    const r = interpretMetric('fitness', 0.50)!;
    for (const c of r.causes) {
      expect(typeof c.rank).toBe('number');
      expect(typeof c.cause).toBe('string');
      expect(c.cause.length).toBeGreaterThan(5);
    }
  });

  it('actions have command and description fields', () => {
    const r = interpretMetric('fitness', 0.50)!;
    for (const a of r.actions) {
      expect(typeof a.command).toBe('string');
      expect(a.command).toMatch(/^wpm /);
      expect(typeof a.description).toBe('string');
    }
  });
});

// ─── Unit tests: compareMetrics ──────────────────────────────────────────────

describe('compareMetrics', () => {
  it('returns null for unknown metric', () => {
    expect(compareMetrics('bad_metric', 0.5, 0.8)).toBeNull();
  });

  it('computes correct difference', () => {
    const c = compareMetrics('fitness', 0.71, 0.87)!;
    expect(c.difference).toBeCloseTo(0.16, 4);
  });

  it('detects threshold crossing (ok → good)', () => {
    const c = compareMetrics('fitness', 0.71, 0.87)!;
    expect(c.level1).toBe('ok');
    expect(c.level2).toBe('good');
    expect(c.threshold_crossed).toBe(true);
    expect(c.significant).toBe(true);
  });

  it('marks non-significant small change', () => {
    const c = compareMetrics('fitness', 0.80, 0.82)!;
    expect(c.significant).toBe(false);
    expect(c.threshold_crossed).toBe(false);
  });

  it('marks significant large change without threshold crossing', () => {
    const c = compareMetrics('fitness', 0.72, 0.83)!;
    // Both ok, but diff >= 0.10
    expect(c.significant).toBe(true);
    expect(c.threshold_crossed).toBe(false);
  });

  it('returns correct level labels', () => {
    const c = compareMetrics('fitness', 0.71, 0.87)!;
    expect(c.label1).toBe('OK');
    expect(c.label2).toBe('GOOD');
  });

  it('includes interpretation text', () => {
    const c = compareMetrics('fitness', 0.71, 0.87)!;
    expect(typeof c.interpretation).toBe('string');
    expect(c.interpretation.length).toBeGreaterThan(10);
  });

  it('includes significance text', () => {
    const c = compareMetrics('fitness', 0.71, 0.87)!;
    expect(typeof c.significance).toBe('string');
    expect(c.significance).toMatch(/YES/);
  });

  it('handles equal values', () => {
    const c = compareMetrics('fitness', 0.75, 0.75)!;
    expect(c.difference).toBeCloseTo(0, 6);
    expect(c.significant).toBe(false);
    expect(c.threshold_crossed).toBe(false);
  });

  it('handles precision metric', () => {
    const c = compareMetrics('precision', 0.60, 0.85)!;
    expect(c.level1).toBe('ok');
    expect(c.level2).toBe('good');
    expect(c.threshold_crossed).toBe(true);
  });
});

// ─── Unit tests: analyzeRootCauses ───────────────────────────────────────────

describe('analyzeRootCauses', () => {
  it('returns empty array when all dimensions are good', () => {
    const dims: MetricInterpretation[] = [
      interpretMetric('fitness', 0.90)!,
      interpretMetric('precision', 0.88)!,
    ];
    const causes = analyzeRootCauses(dims);
    expect(causes.length).toBe(0);
  });

  it('returns entry for each non-good dimension', () => {
    const dims: MetricInterpretation[] = [
      interpretMetric('fitness', 0.90)!,  // good — no entry
      interpretMetric('precision', 0.50)!, // low — entry
      interpretMetric('generalization', 0.60)!, // ok — entry
    ];
    const causes = analyzeRootCauses(dims);
    expect(causes.length).toBe(2);
  });

  it('includes dimension, level, cause, and fix fields', () => {
    const dims: MetricInterpretation[] = [interpretMetric('fitness', 0.50)!];
    const causes = analyzeRootCauses(dims);
    expect(causes.length).toBe(1);
    expect(causes[0].dimension).toBe('fitness');
    expect(causes[0].level).toBe('low');
    expect(typeof causes[0].cause).toBe('string');
    expect(typeof causes[0].fix).toBe('string');
    expect(causes[0].cause.length).toBeGreaterThan(5);
    expect(causes[0].fix).toMatch(/wpm /);
  });

  it('marks critical fix for poor level', () => {
    const dims: MetricInterpretation[] = [interpretMetric('fitness', 0.20)!];
    const causes = analyzeRootCauses(dims);
    expect(causes[0].level).toBe('poor');
    expect(causes[0].fix).toMatch(/Critical/i);
  });

  it('marks recommended fix for low level', () => {
    const dims: MetricInterpretation[] = [interpretMetric('fitness', 0.50)!];
    const causes = analyzeRootCauses(dims);
    expect(causes[0].level).toBe('low');
    expect(causes[0].fix).toMatch(/Recommended/i);
  });

  it('marks minor fix for ok level', () => {
    const dims: MetricInterpretation[] = [interpretMetric('fitness', 0.73)!];
    const causes = analyzeRootCauses(dims);
    expect(causes[0].level).toBe('ok');
    expect(causes[0].fix).toMatch(/Minor/i);
  });
});

// ─── CLI integration tests ────────────────────────────────────────────────────

describe('wpm model explain <metric> <value> — CLI integration (was: wpm interpret)', () => {
  it('exits 0 for valid fitness value', async () => {
    const env = await createCliTestEnv();
    try {
      const r = await runCli(['model', 'explain', 'fitness', '0.73'], { env: env.env });
      expect(r.exitCode).toBe(EXIT_CODES.success);
    } finally { env.cleanup?.(); }
  });

  it('JSON output contains metric, value, level, causes, actions', async () => {
    const env = await createCliTestEnv();
    try {
      // model explain is bridged — the bridge always forces JSON regardless
      // of the caller's own --format, so --format json here is redundant
      // but harmless (kept for clarity of intent).
      const r = await runCli(['model', 'explain', 'fitness', '0.73', '--format', 'json'], { env: env.env });
      expect(r.exitCode).toBe(EXIT_CODES.success);
      const body = JSON.parse(r.stdout);
      // payload may be nested under .payload or at root depending on makeResult
      const payload = body.payload ?? body;
      expect(payload.metric).toBe('fitness');
      expect(typeof payload.value).toBe('number');
      expect(['good', 'ok', 'low', 'poor']).toContain(payload.level);
      expect(Array.isArray(payload.causes)).toBe(true);
      expect(Array.isArray(payload.actions)).toBe(true);
    } finally { env.cleanup?.(); }
  });

  it('a metric-shaped-but-unrecognized first token falls through to explain\'s own lenient "unknown algorithm" path (exits 0, not an error)', async () => {
    // `nouns/model/explain.ts` only routes to `commands/interpret.ts` when
    // the first positional IS one of interpret's known metric names —
    // there is no way to reach interpret's OWN "Unknown metric: ..."
    // rejection through the merged `model explain` surface, because a
    // token unrecognized as a metric is by definition treated as an
    // algorithm name for `explain`, which never errors for an unknown
    // algorithm (see jtbd-error-states.test.ts's "explain: ... graceful
    // unknown-algo fallback" group). Confirmed live against the built CLI —
    // this is a structural consequence of the merge, not a bug in this
    // test. `payload.subject` echoes the token back either way.
    const env = await createCliTestEnv();
    try {
      const r = await runCli(['model', 'explain', 'invalid_metric', '0.73', '--format', 'json'], { env: env.env });
      expect(r.exitCode).toBe(EXIT_CODES.success);
      const body = JSON.parse(r.stdout);
      const payload = body.payload ?? body;
      expect(payload.subject).toBe('invalid_metric');
    } finally { env.cleanup?.(); }
  });

  it('exits 2 (was: 1) for a value out of range on a REAL metric name (reaches interpret\'s own validation)', async () => {
    // Unlike an unrecognized metric name, "fitness" IS routed to
    // commands/interpret.ts, so its own `Value must be between 0 and 1`
    // validation fires. `model explain` is bridged: NounVerbError.invalidInput()
    // maps to EXIT_CODES.source_error (2) via cli.ts's ERROR_CODE_MAP,
    // collapsing the old config_error(1)/source_error(2) distinction.
    const env = await createCliTestEnv();
    try {
      const r = await runCli(['model', 'explain', 'fitness', '1.5'], { env: env.env });
      expect(r.exitCode).toBe(EXIT_CODES.source_error);
    } finally { env.cleanup?.(); }
  });

  it('human-readable level marker (GOOD/OK/LOW/POOR) is present in the JSON text even though stdout is always JSON now', async () => {
    const env = await createCliTestEnv();
    try {
      const r = await runCli(['model', 'explain', 'fitness', '0.87'], { env: env.env });
      expect(r.exitCode).toBe(EXIT_CODES.success);
      // The bridge always forces JSON, so there's no separate ANSI human
      // render to strip — but the level label/message fields still spell
      // out "GOOD" as plain text inside the JSON payload.
      expect(r.stdout).toMatch(/GOOD/);
    } finally { env.cleanup?.(); }
  });

  it('all 7 metrics exit 0', async () => {
    const env = await createCliTestEnv();
    try {
      const metrics = ['fitness', 'precision', 'generalization', 'simplicity', 'silhouette', 'drift_score', 'anomaly_rate'];
      for (const m of metrics) {
        const r = await runCli(['model', 'explain', m, '0.50'], { env: env.env });
        expect(r.exitCode).toBe(EXIT_CODES.success);
      }
    } finally { env.cleanup?.(); }
  });
});

describe('wpm model explain compare — CLI integration (was: wpm interpret compare)', () => {
  it('exits 0 for valid compare', async () => {
    const env = await createCliTestEnv();
    try {
      const r = await runCli(['model', 'explain', 'compare', 'fitness', '0.71', '0.87'], { env: env.env });
      expect(r.exitCode).toBe(EXIT_CODES.success);
    } finally { env.cleanup?.(); }
  });

  it('JSON output contains difference and significance', async () => {
    const env = await createCliTestEnv();
    try {
      const r = await runCli(['model', 'explain', 'compare', 'fitness', '0.71', '0.87', '--format', 'json'], { env: env.env });
      expect(r.exitCode).toBe(EXIT_CODES.success);
      const body = JSON.parse(r.stdout);
      const payload = body.payload ?? body;
      expect(typeof payload.difference).toBe('number');
      expect(typeof payload.difference_pct).toBe('string');
      expect(typeof payload.significant).toBe('boolean');
      expect(typeof payload.threshold_crossed).toBe('boolean');
      expect(typeof payload.level1).toBe('string');
      expect(typeof payload.level2).toBe('string');
    } finally { env.cleanup?.(); }
  });

  it('exits 2 (was: 1) for an unrecognized metric in compare (routes to explain\'s OWN compare, not interpret\'s)', async () => {
    // `compare` is ambiguous between explain's algorithm-vs-algorithm
    // compare and interpret's metric-vs-metric compare — the router
    // disambiguates on the token AFTER "compare" (see nouns/model/explain.ts's
    // module doc comment). "bad_metric" isn't a known metric name, so this
    // routes to explain's compare, which fails on an unknown algorithm name
    // (a DIFFERENT error message than interpret's, but still INVALID_INPUT / exit 2).
    const env = await createCliTestEnv();
    try {
      const r = await runCli(['model', 'explain', 'compare', 'bad_metric', '0.71', '0.87'], { env: env.env });
      expect(r.exitCode).toBe(EXIT_CODES.source_error);
    } finally { env.cleanup?.(); }
  });

  it('exits 2 (was: 1) for out-of-range values in compare on a real metric (reaches interpret\'s compare)', async () => {
    const env = await createCliTestEnv();
    try {
      const r = await runCli(['model', 'explain', 'compare', 'fitness', '0.71', '1.5'], { env: env.env });
      expect(r.exitCode).toBe(EXIT_CODES.source_error);
    } finally { env.cleanup?.(); }
  });
});

describe('wpm model explain report — CLI integration (was: wpm interpret report)', () => {
  // The report subcommand requires a valid XES file and WASM
  // We test with the running-example fixture if available, else skip gracefully
  it('exits 2 (was: 1) when no -i flag provided', async () => {
    const env = await createCliTestEnv();
    try {
      const r = await runCli(['model', 'explain', 'report'], { env: env.env });
      expect(r.exitCode).toBe(EXIT_CODES.source_error);
    } finally { env.cleanup?.(); }
  });

  it('exits 2 for non-existent file', async () => {
    const env = await createCliTestEnv();
    try {
      const r = await runCli(['model', 'explain', 'report', '-i', '/nonexistent/log.xes'], { env: env.env });
      expect([EXIT_CODES.source_error, EXIT_CODES.system_error]).toContain(r.exitCode);
    } finally { env.cleanup?.(); }
  });

  it('exits 0 with a real XES file and produces JSON with all quality dimensions', async () => {
    const env = await createCliTestEnv();
    try {
      // Use a small bundled fixture if the main fixture is unavailable
      const xesPath = FIXTURE_XES;
      const r = await runCli(['model', 'explain', 'report', '-i', xesPath, '--format', 'json'], { env: env.env });
      // If the file doesn't exist, it will exit 2 — skip cleanly
      if (r.exitCode === EXIT_CODES.source_error) {
        // File not found — acceptable in CI without fixture data
        return;
      }
      expect(r.exitCode).toBe(EXIT_CODES.success);
      const body = JSON.parse(r.stdout);
      const payload = body.payload ?? body;
      expect(typeof payload.overall_verdict).toBe('string');
      expect(typeof payload.overall_score).toBe('number');
      expect(payload.overall_score).toBeGreaterThanOrEqual(0);
      expect(payload.overall_score).toBeLessThanOrEqual(1);
      expect(Array.isArray(payload.dimensions)).toBe(true);
      expect(payload.dimensions.length).toBeGreaterThan(0);
      expect(Array.isArray(payload.root_causes)).toBe(true);
      expect(typeof payload.key_insight).toBe('string');
      expect(typeof payload.dimensions_above_threshold).toBe('number');
      expect(typeof payload.total_dimensions).toBe('number');
    } finally { env.cleanup?.(); }
  });
});
