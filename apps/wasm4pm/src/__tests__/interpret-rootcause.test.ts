/**
 * interpret-rootcause.test.ts
 *
 * Tests for the dramatically improved `wpm interpret` command and root cause analysis.
 *
 * Covers:
 *   1. `wpm interpret <metric> <value>` — single metric interpretation
 *   2. `wpm interpret compare <metric> <v1> <v2>` — comparison output
 *   3. `wpm interpret report -i <fixture>` — full quality report
 *   4. Level threshold contracts (good/ok/low/poor)
 *   5. Root cause analysis for sub-threshold dimensions
 *   6. All 7 supported metrics
 *   7. Error handling (unknown metric, out-of-range value)
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

describe('wpm interpret <metric> <value> — CLI integration', () => {
  it('exits 0 for valid fitness value', async () => {
    const env = await createCliTestEnv();
    try {
      const r = await runCli(['interpret', 'fitness', '0.73'], { env: env.env });
      expect(r.exitCode).toBe(EXIT_CODES.success);
    } finally { env.cleanup?.(); }
  });

  it('JSON output contains metric, value, level, causes, actions', async () => {
    const env = await createCliTestEnv();
    try {
      const r = await runCli(['interpret', 'fitness', '0.73', '--format', 'json'], { env: env.env });
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

  it('exits 1 for unknown metric', async () => {
    const env = await createCliTestEnv();
    try {
      const r = await runCli(['interpret', 'invalid_metric', '0.73'], { env: env.env });
      expect(r.exitCode).toBe(EXIT_CODES.config_error);
    } finally { env.cleanup?.(); }
  });

  it('exits 1 for value out of range', async () => {
    const env = await createCliTestEnv();
    try {
      const r = await runCli(['interpret', 'fitness', '1.5'], { env: env.env });
      expect(r.exitCode).toBe(EXIT_CODES.config_error);
    } finally { env.cleanup?.(); }
  });

  it('human output contains level marker', async () => {
    const env = await createCliTestEnv();
    try {
      const r = await runCli(['interpret', 'fitness', '0.87'], { env: env.env });
      expect(r.exitCode).toBe(EXIT_CODES.success);
      // Should contain GOOD in the output (stripping ANSI codes)
      const plain = r.stdout.replace(/\x1b\[[0-9;]*m/g, '');
      expect(plain).toMatch(/GOOD/);
    } finally { env.cleanup?.(); }
  });

  it('all 7 metrics exit 0', async () => {
    const env = await createCliTestEnv();
    try {
      const metrics = ['fitness', 'precision', 'generalization', 'simplicity', 'silhouette', 'drift_score', 'anomaly_rate'];
      for (const m of metrics) {
        const r = await runCli(['interpret', m, '0.50'], { env: env.env });
        expect(r.exitCode).toBe(EXIT_CODES.success);
      }
    } finally { env.cleanup?.(); }
  });
});

describe('wpm interpret compare — CLI integration', () => {
  it('exits 0 for valid compare', async () => {
    const env = await createCliTestEnv();
    try {
      const r = await runCli(['interpret', 'compare', 'fitness', '0.71', '0.87'], { env: env.env });
      expect(r.exitCode).toBe(EXIT_CODES.success);
    } finally { env.cleanup?.(); }
  });

  it('JSON output contains difference and significance', async () => {
    const env = await createCliTestEnv();
    try {
      const r = await runCli(['interpret', 'compare', 'fitness', '0.71', '0.87', '--format', 'json'], { env: env.env });
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

  it('exits 1 for unknown metric in compare', async () => {
    const env = await createCliTestEnv();
    try {
      const r = await runCli(['interpret', 'compare', 'bad_metric', '0.71', '0.87'], { env: env.env });
      expect(r.exitCode).toBe(EXIT_CODES.config_error);
    } finally { env.cleanup?.(); }
  });

  it('exits 1 for out-of-range values in compare', async () => {
    const env = await createCliTestEnv();
    try {
      const r = await runCli(['interpret', 'compare', 'fitness', '0.71', '1.5'], { env: env.env });
      expect(r.exitCode).toBe(EXIT_CODES.config_error);
    } finally { env.cleanup?.(); }
  });
});

describe('wpm interpret report — CLI integration', () => {
  // The report subcommand requires a valid XES file and WASM
  // We test with the running-example fixture if available, else skip gracefully
  it('exits 1 when no -i flag provided', async () => {
    const env = await createCliTestEnv();
    try {
      const r = await runCli(['interpret', 'report'], { env: env.env });
      expect(r.exitCode).toBe(EXIT_CODES.config_error);
    } finally { env.cleanup?.(); }
  });

  it('exits 1 for non-existent file', async () => {
    const env = await createCliTestEnv();
    try {
      const r = await runCli(['interpret', 'report', '-i', '/nonexistent/log.xes'], { env: env.env });
      expect([EXIT_CODES.source_error, EXIT_CODES.system_error]).toContain(r.exitCode);
    } finally { env.cleanup?.(); }
  });

  it('exits 0 with a real XES file and produces JSON with all quality dimensions', async () => {
    const env = await createCliTestEnv();
    try {
      // Use a small bundled fixture if the main fixture is unavailable
      const xesPath = FIXTURE_XES;
      const r = await runCli(['interpret', 'report', '-i', xesPath, '--format', 'json'], { env: env.env });
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
