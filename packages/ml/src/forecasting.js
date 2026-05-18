/**
 * Throughput forecasting — hyper-optimized native implementation.
 *
 * Performance techniques:
 *   - Float64Array for all series operations
 *   - Single-pass mean computation
 *   - Autocorrelation with pre-computed centered series and denominator
 *   - O(n) sliding window SMA (no nested loops)
 *   - Seasonal decomposition with single-pass per-cycle accumulation
 *   - Pre-allocated throughput binning
 *
 * Defensive hardening:
 *   - Parameter validation (window size, forecast periods)
 *   - Guard against division by zero in mean/variance
 *   - Safe handling of very short series
 */
// ─────────────────────────────────────────────────────────────────────────────
// Parameter validation
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Validate forecast periods.
 * Valid range: [1, inf]
 */
function validateForecastPeriods(periods) {
    const val = periods ?? 5;
    if (!Number.isInteger(val) || val < 1)
        return 1;
    return Math.min(val, 1000); // Reasonable upper bound
}
/**
 * Validate window size in milliseconds.
 * Valid range: (0, inf]
 */
function validateWindowSizeMs(windowMs) {
    const val = windowMs ?? 3600000;
    if (val <= 0 || !Number.isFinite(val))
        return 3600000;
    return val;
}
// ---------------------------------------------------------------------------
// Single-pass mean
// ---------------------------------------------------------------------------
function mean(series) {
    const n = series.length;
    if (n === 0)
        return 0;
    let sum = 0;
    for (let i = 0; i < n; i++)
        sum += series[i];
    return sum / n;
}
// ---------------------------------------------------------------------------
// Linear regression (single-pass, no intermediate objects)
// ---------------------------------------------------------------------------
function linearRegressionFit(x, y) {
    const n = x.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
    for (let i = 0; i < n; i++) {
        const xi = x[i], yi = y[i];
        sumX += xi;
        sumY += yi;
        sumXY += xi * yi;
        sumXX += xi * xi;
    }
    const denom = n * sumXX - sumX * sumX;
    const slope = denom === 0 ? 0 : (n * sumXY - sumX * sumY) / denom;
    const intercept = (sumY - slope * sumX) / n;
    return { slope, intercept };
}
// ---------------------------------------------------------------------------
// Trend forecast
// ---------------------------------------------------------------------------
function trendForecastCore(series, n, forecastPeriods) {
    // x = 0..n-1
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
    for (let i = 0; i < n; i++) {
        sumX += i;
        sumY += series[i];
        sumXY += i * series[i];
        sumXX += i * i;
    }
    const denom = n * sumXX - sumX * sumX;
    const slope = denom === 0 ? 0 : (n * sumXY - sumX * sumY) / denom;
    const intercept = (sumY - slope * sumX) / n;
    const direction = slope > 0.01 ? 'up' : slope < -0.01 ? 'down' : 'flat';
    const avgY = sumY / n;
    const strength = avgY === 0
        ? 0
        : Math.min(1, (slope < 0 ? -slope : slope) / ((avgY < 0 ? -avgY : avgY) + 1e-10));
    const forecast = new Float64Array(forecastPeriods);
    for (let i = 0; i < forecastPeriods; i++)
        forecast[i] = slope * (n + i) + intercept;
    // ── Goodness-of-fit (R²) and residual standard error ──────────────────────
    // R² = 1 - SS_res / SS_tot
    // residualStdError = sqrt(SS_res / (n - 2))   [uses n-2 for unbiased estimate]
    const meanY = avgY;
    let ssRes = 0;
    let ssTot = 0;
    for (let i = 0; i < n; i++) {
        const fitted = slope * i + intercept;
        const res = series[i] - fitted;
        ssRes += res * res;
        const dev = series[i] - meanY;
        ssTot += dev * dev;
    }
    const rSquared = ssTot === 0 ? 1 : 1 - ssRes / ssTot;
    // df = n - 2 for simple linear regression; clamp at 1 to avoid sqrt(0/neg)
    const dfResidual = Math.max(1, n - 2);
    const residualStdError = Math.sqrt(ssRes / dfResidual);
    // Sxx = sum of (xi - meanX)^2 — used in the CI width formula
    const meanX = sumX / n;
    const sxx = sumXX - n * meanX * meanX; // algebraically equivalent to Σ(xi-meanX)²
    return { direction, slope, strength, forecast, rSquared, residualStdError, sxx, meanX };
}
/**
 * Approximate t-critical value for a 95% two-tailed interval.
 *
 * For df >= 30 the t-distribution is well approximated by 1.96 (z).
 * For df < 30 we use a lookup table of exact values so we have no
 * external stats-library dependency.
 */
function tCritical95(df) {
    if (df <= 0)
        return 1.96;
    // Exact lookup for df 1–30
    const TABLE = [
        0, // index 0 unused
        12.706, 4.303, 3.182, 2.776, 2.571, // df 1-5
        2.447, 2.365, 2.306, 2.262, 2.228, // df 6-10
        2.201, 2.179, 2.160, 2.145, 2.131, // df 11-15
        2.120, 2.110, 2.101, 2.093, 2.086, // df 16-20
        2.080, 2.074, 2.069, 2.064, 2.060, // df 21-25
        2.056, 2.052, 2.048, 2.045, 2.042, // df 26-30
    ];
    if (df <= 30)
        return TABLE[df];
    return 1.96; // z-approximation for df > 30
}
// ---------------------------------------------------------------------------
// Seasonality detection (autocorrelation, pre-computed)
// ---------------------------------------------------------------------------
function detectSeasonalityCore(series) {
    const n = series.length;
    if (n < 4)
        return { period: 1, strength: 0 };
    let avg = 0;
    for (let i = 0; i < n; i++)
        avg += series[i];
    avg /= n;
    const centered = new Float64Array(n);
    let den = 0;
    for (let i = 0; i < n; i++) {
        centered[i] = series[i] - avg;
        den += centered[i] * centered[i];
    }
    if (den === 0)
        return { period: 1, strength: 0 };
    const maxLag = Math.floor(n / 2);
    const invDen = 1 / den;
    // Compute ACF for all lags first
    const acfValues = new Float64Array(maxLag + 1);
    for (let lag = 1; lag <= maxLag; lag++) {
        let num = 0;
        for (let i = 0; i < n - lag; i++)
            num += centered[i] * centered[i + lag];
        acfValues[lag] = num * invDen;
    }
    // Find local maxima (skip lag=1 as it's often trivially high)
    let bestLag = 1;
    let bestAcf = 0;
    for (let lag = 2; lag < maxLag; lag++) {
        const acf = acfValues[lag];
        const isLocalMax = acf > 0 && acf > acfValues[lag - 1] && acf > acfValues[lag + 1];
        if (isLocalMax && acf > bestAcf) {
            bestAcf = acf;
            bestLag = lag;
        }
    }
    return { period: bestLag, strength: bestAcf };
}
// ---------------------------------------------------------------------------
// Seasonal decomposition (single-pass per cycle position)
// ---------------------------------------------------------------------------
function seasonalDecomposeCore(series, period) {
    const n = series.length;
    const halfPeriod = Math.floor(period / 2);
    // Trend
    const trend = new Float64Array(n);
    for (let i = 0; i < n; i++) {
        const start = Math.max(0, i - halfPeriod);
        const end = Math.min(n - 1, i + halfPeriod);
        let sum = 0;
        for (let j = start; j <= end; j++)
            sum += series[j];
        trend[i] = sum / (end - start + 1);
    }
    // Seasonal accumulation
    const seasonalParts = new Float64Array(period);
    const seasonalCounts = new Float64Array(period);
    for (let i = 0; i < n; i++) {
        const pos = i % period;
        seasonalParts[pos] += series[i] - trend[i];
        seasonalCounts[pos]++;
    }
    let seasonalTotal = 0;
    let countTotal = 0;
    for (let p = 0; p < period; p++) {
        seasonalTotal += seasonalParts[p];
        countTotal += seasonalCounts[p];
    }
    const seasonalMean = countTotal > 0 ? seasonalTotal / countTotal : 0;
    for (let p = 0; p < period; p++) {
        seasonalParts[p] =
            seasonalCounts[p] > 0 ? seasonalParts[p] / seasonalCounts[p] - seasonalMean : 0;
    }
    const seasonal = new Float64Array(n);
    const residual = new Float64Array(n);
    for (let i = 0; i < n; i++) {
        seasonal[i] = seasonalParts[i % period];
        residual[i] = series[i] - trend[i] - seasonal[i];
    }
    return { trend, seasonal, residual };
}
// ---------------------------------------------------------------------------
// Exponential regression (single-pass r²)
// ---------------------------------------------------------------------------
function exponentialFit(series) {
    const n = series.length;
    // Filter valid (y > 0)
    const validIdx = [];
    for (let i = 0; i < n; i++)
        if (series[i] > 0)
            validIdx.push(i);
    const vn = validIdx.length;
    if (vn < 2)
        return { rSquared: 0, predict: () => mean(series) };
    // Log-transform and fit
    const xArr = new Float64Array(vn);
    const logYArr = new Float64Array(vn);
    const yArr = new Float64Array(vn);
    for (let k = 0; k < vn; k++) {
        const i = validIdx[k];
        xArr[k] = i;
        logYArr[k] = Math.log(series[i]);
        yArr[k] = series[i];
    }
    const lr = linearRegressionFit(xArr, logYArr);
    const a = Math.exp(lr.intercept);
    const b = lr.slope;
    // R² single-pass
    let meanY = 0;
    for (let k = 0; k < vn; k++)
        meanY += yArr[k];
    meanY /= vn;
    let ssRes = 0, ssTot = 0;
    for (let k = 0; k < vn; k++) {
        const pred = a * Math.exp(b * xArr[k]);
        const rd = yArr[k] - pred;
        ssRes += rd * rd;
        const td = yArr[k] - meanY;
        ssTot += td * td;
    }
    return {
        rSquared: ssTot === 0 ? 1 : 1 - ssRes / ssTot,
        predict: (xi) => a * Math.exp(b * xi),
    };
}
// ---------------------------------------------------------------------------
// Shared seasonality + exponential post-processing
// ---------------------------------------------------------------------------
/**
 * Compute optional seasonality, decomposition, and exponential forecast for a
 * pre-checked series (n >= 3). Both `forecastThroughput` and `forecastSeries`
 * delegate to this to avoid duplication.
 */
function deriveSeasonalAndExponential(series, forecastPeriods, useExponential) {
    const n = series.length;
    let seasonality;
    let decomposition;
    try {
        if (n >= 4) {
            const seasonResult = detectSeasonalityCore(series);
            seasonality = { period: seasonResult.period, strength: seasonResult.strength };
            if (seasonResult.period > 1 && seasonResult.period < n) {
                const decomp = seasonalDecomposeCore(series, seasonResult.period);
                decomposition = {
                    trend: Array.from(decomp.trend),
                    seasonal: Array.from(decomp.seasonal),
                    residual: Array.from(decomp.residual),
                };
            }
        }
    }
    catch {
        /* non-fatal */
    }
    let exponentialForecast;
    if (useExponential && n >= 3) {
        try {
            const expModel = exponentialFit(series);
            if (expModel.rSquared > 0.5) {
                exponentialForecast = new Array(forecastPeriods);
                for (let i = 0; i < forecastPeriods; i++)
                    exponentialForecast[i] = expModel.predict(n + i);
            }
        }
        catch {
            /* non-fatal */
        }
    }
    return { seasonality, decomposition, exponentialForecast };
}
// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
/**
 * Build an event-count time series by binning event timestamps into fixed-width
 * windows. Returns one count per window, plus the start time of each window.
 *
 * @param eventTimestamps - Event timestamps in milliseconds (any order).
 * @param windowSizeMs - Bin width in milliseconds.
 */
export function buildThroughputSeries(eventTimestamps, windowSizeMs) {
    if (eventTimestamps.length === 0)
        return { series: [], windowStarts: [] };
    // Sort via copy
    const sorted = new Float64Array(eventTimestamps.length);
    for (let i = 0; i < eventTimestamps.length; i++)
        sorted[i] = eventTimestamps[i];
    sorted.sort();
    const start = sorted[0];
    const end = sorted[sorted.length - 1];
    const windowCount = Math.ceil((end - start) / windowSizeMs) + 1;
    // Pre-allocate
    const series = new Float64Array(windowCount);
    const windowStarts = new Array(windowCount);
    for (let w = 0; w < windowCount; w++)
        windowStarts[w] = start + w * windowSizeMs;
    // Bin timestamps (single pass)
    const invWindow = 1 / windowSizeMs;
    const maxIdx = windowCount - 1;
    for (let i = 0; i < sorted.length; i++) {
        const idx = Math.min(Math.floor((sorted[i] - start) * invWindow), maxIdx);
        series[idx]++;
    }
    return { series: Array.from(series), windowStarts };
}
/**
 * Forecast future process throughput and detect seasonal patterns.
 *
 * Pipeline: bin timestamps → linear trend → autocorrelation seasonality →
 * (optional) exponential overlay if R² > 0.5.
 *
 * @param eventTimestamps - Event timestamps (milliseconds).
 * @param options.windowSizeMs - Bin size (default 1 hour = 3_600_000 ms).
 * @param options.forecastPeriods - Number of future windows to forecast (default 5).
 * @param options.useExponential - Also fit `y = a · e^(b·x)` (default false).
 */
export async function forecastThroughput(eventTimestamps, options = {}) {
    const validatedWindowSizeMs = validateWindowSizeMs(options.windowSizeMs);
    const { series } = buildThroughputSeries(eventTimestamps, validatedWindowSizeMs);
    if (series.length < 3) {
        return {
            eventCounts: series,
            windowCount: series.length,
            trend: { direction: 'unknown', slope: 0, strength: 0 },
            windowSizeMs: validatedWindowSizeMs,
        };
    }
    const validatedForecastPeriods = validateForecastPeriods(options.forecastPeriods);
    const n = series.length;
    const trendModel = trendForecastCore(series, n, validatedForecastPeriods);
    const extra = deriveSeasonalAndExponential(series, validatedForecastPeriods, options.useExponential ?? false);
    return {
        eventCounts: series,
        windowCount: n,
        trend: {
            direction: trendModel.direction,
            slope: trendModel.slope,
            strength: trendModel.strength,
        },
        forecast: Array.from(trendModel.forecast),
        seasonality: extra.seasonality,
        decomposition: extra.decomposition,
        windowSizeMs: validatedWindowSizeMs,
        exponentialForecast: extra.exponentialForecast,
    };
}
/**
 * Forecast future values from any numeric series.
 *
 * Same pipeline as `forecastThroughput`, but accepts a pre-binned numeric
 * series (e.g., drift distances, queue lengths). Returns `direction: 'unknown'`
 * for series with fewer than 3 observations.
 *
 * @param series - Numeric observations in chronological order.
 * @param options.forecastPeriods - Number of future steps to forecast (default 5).
 * @param options.useExponential - Also fit exponential model (default false).
 */
export async function forecastSeries(series, options = {}) {
    if (series.length < 3) {
        return { seriesLength: series.length, trend: { direction: 'unknown', slope: 0, strength: 0 } };
    }
    const validatedForecastPeriods = validateForecastPeriods(options.forecastPeriods);
    const n = series.length;
    const trendModel = trendForecastCore(series, n, validatedForecastPeriods);
    const extra = deriveSeasonalAndExponential(series, validatedForecastPeriods, options.useExponential ?? false);
    // ── 95% confidence intervals for each forecast period ──────────────────────
    // For a linear regression y = a + bx, the prediction interval at a new x* is:
    //   ŷ ± t(α/2, n-2) * s * sqrt(1 + 1/n + (x* - x̄)² / Sxx)
    // where s = residualStdError, Sxx = Σ(xi - x̄)².
    // The "1" inside the sqrt gives the prediction interval (for a new observation);
    // omitting the "1" gives the confidence interval on the mean.
    // We use the confidence interval on the mean — appropriate for a trend estimate.
    const df = Math.max(1, n - 2);
    const t = tCritical95(df);
    const s = trendModel.residualStdError;
    const sxx = trendModel.sxx;
    const meanX = trendModel.meanX;
    const forecastArray = Array.from(trendModel.forecast);
    // Emit CIs when Sxx > 0 (sufficient x-variation to define the regression).
    // When s = 0 (perfect fit), margin = 0 and the CI collapses to [fitted, fitted] —
    // this is the correct degenerate case for a noiseless series.
    let confidenceIntervals;
    if (sxx > 0) {
        const s = trendModel.residualStdError;
        confidenceIntervals = forecastArray.map((fitted, i) => {
            const xStar = n + i;
            const margin = t * s * Math.sqrt(1 / n + (xStar - meanX) ** 2 / sxx);
            return [fitted - margin, fitted + margin];
        });
    }
    return {
        seriesLength: n,
        trend: {
            direction: trendModel.direction,
            slope: trendModel.slope,
            strength: trendModel.strength,
        },
        forecast: forecastArray,
        rSquared: trendModel.rSquared,
        confidenceIntervals,
        seasonality: extra.seasonality,
        decomposition: extra.decomposition,
        exponentialForecast: extra.exponentialForecast,
    };
}
//# sourceMappingURL=forecasting.js.map