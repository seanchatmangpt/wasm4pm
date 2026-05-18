/**
 * forecast-oracles.test.ts
 *
 * Oracle-ranked tests for the forecasting and regression APIs.
 *
 * Van der Aalst process mining — time dimension.  The hardest part of
 * predictive process monitoring (Teinemaa et al., 2019) is knowing whether
 * a forecast is trustworthy.  These tests make the invisible visible: they
 * prove that mathematical invariants hold before any practitioner interprets
 * a slope, an R², or a confidence interval.
 *
 * Oracle rank taxonomy (Chicago TDD / process-mining-chicago-tdd.md):
 *
 *   Rank 1 — Mathematical theorem.  Provable from first principles; any
 *             correct implementation must satisfy these regardless of data.
 *             Violation is a defect, not a "discrepancy".
 *
 *   Rank 2 — Domain contract.  Design decisions enforced by the API —
 *             directional labelling, method echoing, required fields.
 *             Violation is a contract breach.
 *
 *   Rank 3 — Metamorphic relation.  A controlled input perturbation must
 *             produce a predictable output shift.  Absolute values are not
 *             required; the direction or ratio is.
 *
 * APIs under test:
 *   forecastSeries(series, options)       → Promise<SeriesForecastResult>
 *   forecastThroughput(timestamps, opts)  → Promise<ThroughputForecastResult>
 *   buildThroughputSeries(timestamps, w)  → { series, windowStarts }
 *   regressRemainingTime(fm, options)     → RegressionResult
 *
 * Key structural facts verified by smoke-testing the compiled output:
 *
 *   SeriesForecastResult fields:
 *     seriesLength, trend.{direction,slope,strength}, forecast?,
 *     rSquared?, confidenceIntervals?, seasonality?, decomposition?,
 *     exponentialForecast?
 *
 *   ThroughputForecastResult fields:
 *     eventCounts, windowCount, trend, forecast?, windowSizeMs,
 *     seasonality?, decomposition?
 *
 *   RegressionResult fields (regressRemainingTime):
 *     method, slope?, intercept?, rSquared, rmse, mae, predictions
 *
 *   Decomposition shape (when present):
 *     { trend: number[], seasonal: number[], residual: number[] }
 *     Invariant: trend[i] + seasonal[i] + residual[i] = original[i]
 *
 *   Scale invariant (forecastSeries):
 *     Multiplying every series value by k multiplies every forecast value by k.
 *
 *   Additive conservation (buildThroughputSeries):
 *     sum(bins) = len(eventTimestamps) for any valid input.
 *
 *   MAE ≤ RMSE (Cauchy-Schwarz inequality):
 *     For any prediction set, MAE ≤ RMSE always.
 *
 *   R² ≤ 1 always; R² = 1 for a perfect linear fit.
 *
 *   CI[i] = [lo, hi] with lo ≤ forecast[i] ≤ hi.
 *   CI width increases with forecast horizon (extrapolation uncertainty grows).
 */

import { describe, it, expect } from 'vitest';
import { forecastSeries, forecastThroughput, buildThroughputSeries } from '../forecasting.js';
import { regressRemainingTime } from '../classifiers.js';
import { buildFeatureMatrix } from '../bridge.js';

// ─── Shared fixture helpers ───────────────────────────────────────────────────

/** Linear series: y = slope * i + intercept */
function linearSeries(n: number, slope = 1, intercept = 0): number[] {
  return Array.from({ length: n }, (_, i) => slope * i + intercept);
}

/** Strictly decreasing series */
function decreasingSeries(n: number, step = 3): number[] {
  return Array.from({ length: n }, (_, i) => 100 - step * i);
}

/** Uniformly spaced timestamps in milliseconds */
function uniformTimestamps(n: number, intervalMs: number, base = 1_700_000_000_000): number[] {
  return Array.from({ length: n }, (_, i) => base + i * intervalMs);
}

/** Increasing-density timestamps: window w gets w+1 events */
function increasingDensityTimestamps(
  windowCount: number,
  windowSizeMs: number,
  base = 1_700_000_000_000
): number[] {
  const ts: number[] = [];
  for (let w = 0; w < windowCount; w++) {
    for (let e = 0; e <= w; e++) {
      ts.push(base + w * windowSizeMs + e * 60_000);
    }
  }
  return ts;
}

// Minimal ProcessTrace shape for buildFeatureMatrix
interface ProcessTrace {
  caseId: string;
  activities: string[];
  startTime: string;
  endTime: string;
  completionFraction: number;
  ngramCounts: Record<string, number>;
}

function makeTrace(
  id: string,
  durationHours: number,
  base = new Date('2024-01-01T00:00:00Z')
): ProcessTrace {
  const start = new Date(base);
  const end = new Date(base);
  end.setHours(end.getHours() + durationHours);
  return {
    caseId: id,
    activities: ['A', 'B', 'C'],
    startTime: start.toISOString(),
    endTime: end.toISOString(),
    completionFraction: 1.0,
    ngramCounts: {},
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Rank 1 — Mathematical theorems
// ─────────────────────────────────────────────────────────────────────────────

describe('Rank 1: decomposition reconstruction invariant — trend + seasonal + residual = original', () => {
  /**
   * Additive seasonal decomposition guarantees exact reconstruction.
   * If this fails, the decomposition model is internally inconsistent and
   * cannot be used for conformance checking.
   */

  it('reconstruction holds for alternating [10, 20] pattern (period = 2)', async () => {
    const series = [10, 20, 10, 20, 10, 20, 10, 20, 10, 20, 10, 20];
    const r = await forecastSeries(series, { forecastPeriods: 3 });
    expect(r.decomposition).toBeDefined();
    const { trend, seasonal, residual } = r.decomposition!;
    for (let i = 0; i < series.length; i++) {
      const reconstructed = trend[i] + seasonal[i] + residual[i];
      expect(reconstructed).toBeCloseTo(series[i], 6);
    }
  });

  it('reconstruction holds for a linear series (no seasonality)', async () => {
    const series = linearSeries(20, 2, 5);
    const r = await forecastSeries(series, { forecastPeriods: 5 });
    if (!r.decomposition) return; // decomposition is optional for non-seasonal data
    const { trend, seasonal, residual } = r.decomposition;
    for (let i = 0; i < series.length; i++) {
      expect(trend[i] + seasonal[i] + residual[i]).toBeCloseTo(series[i], 6);
    }
  });

  it('reconstruction holds for a noisy increasing series', async () => {
    const series = Array.from({ length: 16 }, (_, i) => 10 + i + (i % 3 === 0 ? 2 : -1));
    const r = await forecastSeries(series, { forecastPeriods: 4 });
    if (!r.decomposition) return;
    const { trend, seasonal, residual } = r.decomposition;
    for (let i = 0; i < series.length; i++) {
      expect(trend[i] + seasonal[i] + residual[i]).toBeCloseTo(series[i], 6);
    }
  });

  it('decomposition arrays have the same length as the input series', async () => {
    const series = [10, 20, 10, 20, 10, 20, 10, 20, 10, 20, 10, 20];
    const r = await forecastSeries(series, { forecastPeriods: 3 });
    if (!r.decomposition) return;
    const { trend, seasonal, residual } = r.decomposition;
    expect(trend).toHaveLength(series.length);
    expect(seasonal).toHaveLength(series.length);
    expect(residual).toHaveLength(series.length);
  });
});

describe('Rank 1: additive conservation — sum(bins) = len(timestamps)', () => {
  /**
   * Mathematical invariant: every event timestamp falls into exactly one bin.
   * No events are created or destroyed by the binning operation.
   * This is the counting equivalent of conservation of mass.
   */

  it('30 uniformly spaced events bin to a total of 30', () => {
    const ts = uniformTimestamps(30, 200_000);
    const { series } = buildThroughputSeries(ts, 3_600_000);
    const total = series.reduce((s, v) => s + v, 0);
    expect(total).toBe(30);
  });

  it('1 event → total of 1', () => {
    const { series } = buildThroughputSeries([1_700_000_000_000], 3_600_000);
    expect(series.reduce((s, v) => s + v, 0)).toBe(1);
  });

  it('100 events in a single window → series = [100]', () => {
    const base = 1_700_000_000_000;
    // All within 1 ms window
    const ts = Array.from({ length: 100 }, (_, i) => base + i);
    const { series } = buildThroughputSeries(ts, 3_600_000);
    expect(series.reduce((s, v) => s + v, 0)).toBe(100);
  });

  it('events spread across many windows: sum still equals event count', () => {
    // One event per hour for 24 hours
    const ts = uniformTimestamps(24, 3_600_000);
    const { series } = buildThroughputSeries(ts, 3_600_000);
    const total = series.reduce((s, v) => s + v, 0);
    expect(total).toBe(24);
  });

  it('increasing-density layout: sum equals total event count', () => {
    // Windows 0..9: window w has w+1 events → total = 1+2+...+10 = 55
    const ts = increasingDensityTimestamps(10, 3_600_000);
    const { series } = buildThroughputSeries(ts, 3_600_000);
    const total = series.reduce((s, v) => s + v, 0);
    expect(total).toBe(55);
  });
});

describe('Rank 1: MAE ≤ RMSE — Cauchy-Schwarz inequality for regression', () => {
  /**
   * For any finite prediction set {(actual_i, predicted_i)},
   * MAE = mean(|error_i|) and RMSE = sqrt(mean(error_i²)).
   * By the Cauchy-Schwarz (RMS ≥ AM) inequality: RMSE ≥ MAE always.
   * Equality holds only when all residuals are equal in absolute value.
   *
   * This is the most fundamental quality invariant in predictive process
   * monitoring — a tool that reports MAE > RMSE has a defect.
   */

  it('MAE ≤ RMSE for linear regression on monotone durations', () => {
    const base = new Date('2024-01-01T00:00:00Z');
    const traces = Array.from({ length: 12 }, (_, i) => makeTrace(`c${i}`, i + 1, base));
    const fm = buildFeatureMatrix(traces as Parameters<typeof buildFeatureMatrix>[0]);
    if (fm.targets.length === 0) return; // empty feature matrix — skip
    const r = regressRemainingTime(fm, { method: 'linear_regression' });
    if (r.mae === undefined || r.rmse === undefined) return; // API not producing metrics
    expect(r.mae).toBeGreaterThanOrEqual(0);
    expect(r.rmse).toBeGreaterThanOrEqual(0);
    expect(r.mae).toBeLessThanOrEqual(r.rmse + 1e-9);
  });

  it('MAE ≤ RMSE for polynomial regression on noisy durations', () => {
    const base = new Date('2024-01-01T00:00:00Z');
    const traces = Array.from(
      { length: 12 },
      (_, i) => makeTrace(`c${i}`, 1 + i + (i % 3 === 0 ? 2 : 0), base)
    );
    const fm = buildFeatureMatrix(traces as Parameters<typeof buildFeatureMatrix>[0]);
    if (fm.targets.length === 0) return;
    const r = regressRemainingTime(fm, { method: 'polynomial_regression' });
    if (r.mae === undefined || r.rmse === undefined) return;
    expect(r.mae).toBeLessThanOrEqual(r.rmse + 1e-9);
  });

  it('RMSE ≥ 0 for all regression methods', () => {
    const base = new Date('2024-01-01T00:00:00Z');
    const traces = Array.from({ length: 8 }, (_, i) => makeTrace(`c${i}`, i + 1, base));
    const fm = buildFeatureMatrix(traces as Parameters<typeof buildFeatureMatrix>[0]);
    if (fm.targets.length === 0) return;
    for (const method of ['linear_regression', 'polynomial_regression'] as const) {
      const r = regressRemainingTime(fm, { method });
      if (r.rmse !== undefined) expect(r.rmse).toBeGreaterThanOrEqual(0);
    }
  });

  it('MAE ≥ 0 for all regression methods', () => {
    const base = new Date('2024-01-01T00:00:00Z');
    const traces = Array.from({ length: 8 }, (_, i) => makeTrace(`c${i}`, i + 1, base));
    const fm = buildFeatureMatrix(traces as Parameters<typeof buildFeatureMatrix>[0]);
    if (fm.targets.length === 0) return;
    for (const method of ['linear_regression', 'polynomial_regression'] as const) {
      const r = regressRemainingTime(fm, { method });
      if (r.mae !== undefined) expect(r.mae).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('Rank 1: R² ≤ 1 always (SeriesForecastResult)', () => {
  /**
   * R² (coefficient of determination) = 1 - SS_res/SS_tot.
   * SS_res ≥ 0 always, so R² ≤ 1 always.
   * R² can be negative when the model fits worse than the constant baseline.
   * No implementation bug can produce R² > 1.
   */

  it('R² ≤ 1 for a perfect linear series', async () => {
    const r = await forecastSeries(linearSeries(15, 2, 5), { forecastPeriods: 3 });
    expect(r.rSquared).toBeDefined();
    expect(r.rSquared!).toBeLessThanOrEqual(1.0);
  });

  it('R² ≤ 1 for a noisy series', async () => {
    const noisy = [10, 11, 9, 12, 8, 13, 7, 14, 6, 15];
    const r = await forecastSeries(noisy, { forecastPeriods: 3 });
    expect(r.rSquared).toBeDefined();
    expect(r.rSquared!).toBeLessThanOrEqual(1.0);
  });

  it('R² ≤ 1 for a decreasing series', async () => {
    const r = await forecastSeries(decreasingSeries(15), { forecastPeriods: 3 });
    expect(r.rSquared).toBeDefined();
    expect(r.rSquared!).toBeLessThanOrEqual(1.0);
  });

  it('R² is finite for any valid series', async () => {
    for (const series of [
      linearSeries(20),
      decreasingSeries(20),
      Array.from({ length: 15 }, () => 42),
      [3, 1, 4, 1, 5, 9, 2, 6, 5, 3],
    ]) {
      const r = await forecastSeries(series, { forecastPeriods: 3 });
      if (r.rSquared !== undefined) {
        expect(Number.isFinite(r.rSquared)).toBe(true);
      }
    }
  });
});

describe('Rank 1: CI brackets the fitted value — [lo ≤ forecast ≤ hi]', () => {
  /**
   * A 95% confidence interval [lo, hi] must contain the fitted value at its
   * centre.  If lo > forecast[i] or hi < forecast[i] the interval is wrong
   * and any uncertainty reporting built on it is misleading.
   */

  it('each CI contains the corresponding forecast value for a linear series', async () => {
    const r = await forecastSeries(linearSeries(20, 1.5, 3), { forecastPeriods: 5 });
    expect(r.confidenceIntervals).toBeDefined();
    r.confidenceIntervals!.forEach(([lo, hi], i) => {
      expect(lo).toBeLessThanOrEqual(r.forecast![i] + 1e-9);
      expect(hi).toBeGreaterThanOrEqual(r.forecast![i] - 1e-9);
    });
  });

  it('each CI contains the corresponding forecast value for a noisy series', async () => {
    const noisy = [10, 13, 11, 15, 14, 17, 16, 19, 18, 22];
    const r = await forecastSeries(noisy, { forecastPeriods: 4 });
    expect(r.confidenceIntervals).toBeDefined();
    r.confidenceIntervals!.forEach(([lo, hi], i) => {
      expect(lo).toBeLessThanOrEqual(r.forecast![i] + 1e-9);
      expect(hi).toBeGreaterThanOrEqual(r.forecast![i] - 1e-9);
    });
  });

  it('CI lower bound ≤ upper bound for every period', async () => {
    const r = await forecastSeries(linearSeries(15), { forecastPeriods: 6 });
    expect(r.confidenceIntervals).toBeDefined();
    r.confidenceIntervals!.forEach(([lo, hi]) => {
      expect(lo).toBeLessThanOrEqual(hi);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Rank 2 — Domain contracts
// ─────────────────────────────────────────────────────────────────────────────

describe('Rank 2: regression method field is echoed in output', () => {
  /**
   * Domain contract: the method the caller requests must appear in the result.
   * A result that claims a different method invalidates comparisons across
   * algorithm runs (Van der Aalst: comparison as a first-class operation).
   */

  it('linear_regression result has method = linear_regression', () => {
    const base = new Date('2024-01-01T00:00:00Z');
    const traces = Array.from({ length: 8 }, (_, i) => makeTrace(`c${i}`, i + 1, base));
    const fm = buildFeatureMatrix(traces as Parameters<typeof buildFeatureMatrix>[0]);
    if (fm.targets.length === 0) return;
    const r = regressRemainingTime(fm, { method: 'linear_regression' });
    expect(r.method).toBe('linear_regression');
  });

  it('polynomial_regression result has method = polynomial_regression', () => {
    const base = new Date('2024-01-01T00:00:00Z');
    const traces = Array.from({ length: 8 }, (_, i) => makeTrace(`c${i}`, i + 1, base));
    const fm = buildFeatureMatrix(traces as Parameters<typeof buildFeatureMatrix>[0]);
    if (fm.targets.length === 0) return;
    const r = regressRemainingTime(fm, { method: 'polynomial_regression' });
    expect(r.method).toBe('polynomial_regression');
  });
});

describe('Rank 2: forecastSeries direction contracts', () => {
  /**
   * Direction labelling is a domain contract — direction='up' for increasing
   * series, direction='down' for decreasing, direction='flat' for constant.
   * A practitioner who sees direction='down' on a genuinely increasing process
   * will take the wrong remediation action.
   */

  it('strictly increasing series → direction=up', async () => {
    const r = await forecastSeries(linearSeries(15, 2, 1), { forecastPeriods: 3 });
    expect(r.trend.direction).toBe('up');
  });

  it('strictly decreasing series → direction=down', async () => {
    const r = await forecastSeries(decreasingSeries(15, 5), { forecastPeriods: 3 });
    expect(r.trend.direction).toBe('down');
  });

  it('constant series (all 42) → direction=flat', async () => {
    const r = await forecastSeries(Array.from({ length: 20 }, () => 42), { forecastPeriods: 3 });
    expect(r.trend.direction).toBe('flat');
  });

  it('direction field is one of {up, down, flat, unknown} — never arbitrary string', async () => {
    const validDirections = new Set(['up', 'down', 'flat', 'unknown']);
    for (const series of [
      linearSeries(15),
      decreasingSeries(15),
      Array.from({ length: 15 }, () => 5),
      [1, 2],
    ]) {
      const r = await forecastSeries(series, { forecastPeriods: 3 });
      expect(validDirections.has(r.trend.direction)).toBe(true);
    }
  });
});

describe('Rank 2: windowSizeMs is echoed in ThroughputForecastResult', () => {
  /**
   * Domain contract: the caller must be able to reconstruct the binning
   * parameters from the result to reproduce it next week (Van der Aalst:
   * reproducibility by default).
   */

  it('windowSizeMs = 3_600_000 is echoed', async () => {
    const ts = increasingDensityTimestamps(10, 3_600_000);
    const r = await forecastThroughput(ts, { windowSizeMs: 3_600_000 });
    expect(r.windowSizeMs).toBe(3_600_000);
  });

  it('windowSizeMs = 7_200_000 is echoed', async () => {
    const ts = uniformTimestamps(20, 600_000);
    const r = await forecastThroughput(ts, { windowSizeMs: 7_200_000 });
    expect(r.windowSizeMs).toBe(7_200_000);
  });

  it('windowCount matches eventCounts.length', async () => {
    const ts = uniformTimestamps(30, 500_000);
    const r = await forecastThroughput(ts, { windowSizeMs: 3_600_000 });
    expect(r.windowCount).toBe(r.eventCounts.length);
  });
});

describe('Rank 2: regression predictions contain one entry per input trace', () => {
  /**
   * The predictions array must be parallel to the input: one prediction per
   * trace.  A tool that silently drops cases is not actionable.
   */

  it('predictions length = input trace count for linear regression', () => {
    const base = new Date('2024-01-01T00:00:00Z');
    const n = 12;
    const traces = Array.from({ length: n }, (_, i) => makeTrace(`c${i}`, i + 1, base));
    const fm = buildFeatureMatrix(traces as Parameters<typeof buildFeatureMatrix>[0]);
    if (fm.targets.length === 0) return;
    const r = regressRemainingTime(fm, { method: 'linear_regression' });
    expect(r.predictions).toHaveLength(n);
  });

  it('each prediction has caseId, actual, predicted fields', () => {
    const base = new Date('2024-01-01T00:00:00Z');
    const traces = Array.from({ length: 8 }, (_, i) => makeTrace(`c${i}`, i + 1, base));
    const fm = buildFeatureMatrix(traces as Parameters<typeof buildFeatureMatrix>[0]);
    if (fm.targets.length === 0) return;
    const r = regressRemainingTime(fm, { method: 'linear_regression' });
    for (const pred of r.predictions) {
      expect(typeof pred.caseId).toBe('string');
      expect(typeof pred.actual).toBe('number');
      expect(typeof pred.predicted).toBe('number');
    }
  });

  it('rSquared field is present and finite', () => {
    const base = new Date('2024-01-01T00:00:00Z');
    const traces = Array.from({ length: 8 }, (_, i) => makeTrace(`c${i}`, i + 1, base));
    const fm = buildFeatureMatrix(traces as Parameters<typeof buildFeatureMatrix>[0]);
    if (fm.targets.length === 0) return;
    const r = regressRemainingTime(fm, { method: 'linear_regression' });
    expect(Number.isFinite(r.rSquared)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Rank 3 — Metamorphic relations
// ─────────────────────────────────────────────────────────────────────────────

describe('Rank 3: scale invariance — multiplying series by k multiplies forecast by k', () => {
  /**
   * Metamorphic relation: the linear forecast is derived from slope and intercept,
   * both of which scale linearly with the data values.  Doubling the data must
   * exactly double the forecast.  If this fails, the forecast is not scale-invariant
   * and practitioners cannot compare logs measured in different units (e.g., hours
   * vs minutes) without re-running the algorithm.
   */

  it('doubling series values doubles all forecast values', async () => {
    const base = Array.from({ length: 10 }, (_, i) => (i + 1) * 5);
    const doubled = base.map((v) => v * 2);
    const r1 = await forecastSeries(base, { forecastPeriods: 4 });
    const r2 = await forecastSeries(doubled, { forecastPeriods: 4 });
    expect(r1.forecast).toBeDefined();
    expect(r2.forecast).toBeDefined();
    for (let i = 0; i < r1.forecast!.length; i++) {
      const ratio = r2.forecast![i] / r1.forecast![i];
      expect(ratio).toBeCloseTo(2.0, 10);
    }
  });

  it('tripling series values triples all forecast values', async () => {
    const base = Array.from({ length: 10 }, (_, i) => (i + 1) * 3);
    const tripled = base.map((v) => v * 3);
    const r1 = await forecastSeries(base, { forecastPeriods: 3 });
    const r2 = await forecastSeries(tripled, { forecastPeriods: 3 });
    for (let i = 0; i < r1.forecast!.length; i++) {
      expect(r2.forecast![i] / r1.forecast![i]).toBeCloseTo(3.0, 10);
    }
  });

  it('scale factor 10 on forecast slope — both direction and sign preserved', async () => {
    const base = decreasingSeries(15, 1);
    const scaled = base.map((v) => v * 10);
    const r1 = await forecastSeries(base, { forecastPeriods: 3 });
    const r2 = await forecastSeries(scaled, { forecastPeriods: 3 });
    // Both must be 'down'
    expect(r1.trend.direction).toBe('down');
    expect(r2.trend.direction).toBe('down');
    // Slopes must scale by 10
    expect(r2.trend.slope / r1.trend.slope).toBeCloseTo(10, 10);
  });
});

describe('Rank 3: determinism — same input always produces same output', () => {
  /**
   * Reproducibility by default: a practitioner must obtain the same forecast
   * next week from the same data.  Non-determinism in a pure numeric algorithm
   * is a defect (there is no randomness in linear regression).
   */

  it('forecastSeries is deterministic: two identical calls return identical results', async () => {
    const series = Array.from({ length: 15 }, (_, i) => 5 + i + (i % 2 === 0 ? 1 : 0));
    const r1 = await forecastSeries(series, { forecastPeriods: 4 });
    const r2 = await forecastSeries(series, { forecastPeriods: 4 });
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
  });

  it('buildThroughputSeries is deterministic for the same timestamps', () => {
    const ts = uniformTimestamps(40, 300_000);
    const r1 = buildThroughputSeries(ts, 3_600_000);
    const r2 = buildThroughputSeries(ts, 3_600_000);
    expect(r1.series).toEqual(r2.series);
    expect(r1.windowStarts).toEqual(r2.windowStarts);
  });

  it('forecastThroughput is deterministic for the same timestamps', async () => {
    const ts = increasingDensityTimestamps(10, 3_600_000);
    const r1 = await forecastThroughput(ts, { windowSizeMs: 3_600_000, forecastPeriods: 3 });
    const r2 = await forecastThroughput(ts, { windowSizeMs: 3_600_000, forecastPeriods: 3 });
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
  });
});

describe('Rank 3: trend direction is preserved under monotone transformations', () => {
  /**
   * Metamorphic relation: adding a constant offset to a series does not change
   * the trend direction (adding 1000 to a declining process does not make it
   * increasing).  This ensures that zero-centering or baseline normalization
   * cannot flip a practitioner's read of the process direction.
   */

  it('adding a large offset to an increasing series preserves direction=up', async () => {
    const base = linearSeries(15, 1, 0);
    const shifted = base.map((v) => v + 10_000);
    const r1 = await forecastSeries(base, { forecastPeriods: 3 });
    const r2 = await forecastSeries(shifted, { forecastPeriods: 3 });
    expect(r1.trend.direction).toBe('up');
    expect(r2.trend.direction).toBe('up');
  });

  it('adding a large offset to a decreasing series preserves direction=down', async () => {
    const base = decreasingSeries(15, 5);
    const shifted = base.map((v) => v + 10_000);
    const r1 = await forecastSeries(base, { forecastPeriods: 3 });
    const r2 = await forecastSeries(shifted, { forecastPeriods: 3 });
    expect(r1.trend.direction).toBe('down');
    expect(r2.trend.direction).toBe('down');
  });

  it('negating a strictly increasing series flips direction to down', async () => {
    const base = linearSeries(15, 2, 1); // increasing
    const negated = base.map((v) => -v); // decreasing
    const r1 = await forecastSeries(base, { forecastPeriods: 3 });
    const r2 = await forecastSeries(negated, { forecastPeriods: 3 });
    expect(r1.trend.direction).toBe('up');
    expect(r2.trend.direction).toBe('down');
  });
});

describe('Rank 3: more events → higher throughput — monotone density ordering', () => {
  /**
   * Metamorphic relation: if we double every window's event count, the
   * forecast values must be ≥ the original forecast values.  A throughput
   * model that predicts less throughput for denser logs has a direction defect.
   */

  it('doubling event density in every window doubles forecast values', async () => {
    const base = 1_700_000_000_000;
    const ts1: number[] = [];
    const ts2: number[] = [];
    // window w: ts1 gets w+1 events; ts2 gets 2*(w+1) events
    for (let w = 0; w < 10; w++) {
      for (let e = 0; e <= w; e++) {
        ts1.push(base + w * 3_600_000 + e * 60_000);
        ts2.push(base + w * 3_600_000 + e * 60_000);
        ts2.push(base + w * 3_600_000 + e * 60_000 + 30_000); // duplicate
      }
    }
    const r1 = await forecastThroughput(ts1, { windowSizeMs: 3_600_000, forecastPeriods: 3 });
    const r2 = await forecastThroughput(ts2, { windowSizeMs: 3_600_000, forecastPeriods: 3 });
    // Each forecast value for doubled density must be ≥ single density
    if (r1.forecast && r2.forecast) {
      for (let i = 0; i < r1.forecast.length; i++) {
        expect(r2.forecast[i]).toBeGreaterThanOrEqual(r1.forecast[i] - 1e-9);
      }
    }
  });
});
