#![cfg(feature = "cloud")]
//! Behavioral drift detection tests.
//!
//! Proves that SPC drift detection corresponds to actual process changes,
//! not just statistical threshold triggers. Each test constructs a realistic
//! process-change scenario and verifies the detection system responds correctly.
//!
//! Tests cover:
//! 1. Sudden drift (point beyond 3-sigma)
//! 2. Gradual drift (monotone trend over time)
//! 3. False positive control on stable processes
//! 4. SpcHistory ring buffer accumulation and cross-cycle shift detection
//! 5. EWMA smoothing distinguishing sustained drift from transient noise
//! 6. Multi-rule detection priority (each rule fires on its own drift type)

#[cfg(feature = "ml")]
use wasm4pm::prediction_additions::ewma;
use wasm4pm::spc::{
    check_western_electric_rules, spc_mean, spc_std_dev, ChartData, ShiftDirection, SpecialCause,
    TrendDirection,
};
use wasm4pm::spc_history::{SpcHistory, SpcSnapshot};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Build a ChartData point with a given value, using standard control limits
/// derived from a known mean and sigma.
fn spc_point(timestamp: &str, value: f64, cl: f64, sigma: f64) -> ChartData {
    ChartData {
        timestamp: timestamp.to_string(),
        value,
        ucl: cl + 3.0 * sigma,
        cl,
        lcl: f64::max(cl - 3.0 * sigma, 0.0),
        subgroup_data: None,
    }
}

/// Generate n in-control data points around a mean with natural variance.
/// Uses a deterministic sequence (no randomness) so tests are reproducible.
fn stable_data(cl: f64, sigma: f64, n: usize, offset: usize) -> Vec<ChartData> {
    // Predefined residuals that stay within 2-sigma (no false positives)
    const RESIDUALS: &[f64] = &[
        0.1, -0.2, 0.15, -0.1, 0.25, -0.15, 0.05, -0.3, 0.2, -0.05, 0.3, -0.25, 0.1, -0.15, 0.2,
        -0.1, 0.0, 0.15, -0.2, 0.1, -0.05, 0.25, -0.1, 0.15, -0.2, 0.1, 0.05, -0.15, 0.2, -0.1,
        0.1, -0.2, 0.0, 0.15, -0.25, 0.1, -0.1, 0.2, -0.15, 0.05, -0.2, 0.1, 0.15, -0.1, 0.25,
        -0.05, 0.0, -0.15, 0.1, -0.2, 0.2, -0.1, 0.05, -0.15, 0.1, 0.0, -0.2, 0.15, -0.1, 0.25,
        -0.05, 0.1, -0.15, 0.2, -0.1, 0.15, 0.0, -0.2, 0.1, -0.05, 0.15, -0.1, 0.2, -0.15, 0.05,
        -0.2, 0.1, 0.0, -0.1, 0.15, -0.2, 0.1, 0.25, -0.05, 0.0, -0.15, 0.2, -0.1, 0.1, -0.2, 0.15,
        -0.1, 0.0, 0.2, -0.15, 0.1, -0.05, 0.25, -0.1, 0.0,
    ];

    (0..n)
        .map(|i| {
            let r = RESIDUALS[(offset + i) % RESIDUALS.len()] * sigma;
            spc_point(&format!("t{}", i), cl + r, cl, sigma)
        })
        .collect()
}

// ===========================================================================
// Test 1: Sudden Drift Detection -- Point Beyond 3-Sigma
// ===========================================================================

/// Simulates a process that has been stable for 20 observations, then
/// experiences a sudden shock (a single observation 5 sigma above the mean).
///
/// Asserts:
/// - The stable region produces zero alerts (no false positives in-control).
/// - The outlier at position 20 triggers Rule 1 (OutOfControl).
/// - The detected alert value matches the injected outlier.
#[test]
fn test_sudden_drift_triggers_immediate_alert() {
    let cl = 5.0;
    let sigma = 0.5;
    let ucl = cl + 3.0 * sigma; // 6.5
    let lcl: f64 = f64::max(cl - 3.0 * sigma, 0.0); // 3.5

    // Phase 1: 20 stable points (all within control limits)
    let mut data = stable_data(cl, sigma, 20, 0);

    // Verify stable region: evaluate rule checks at each point
    // (check_western_electric_rules evaluates the trailing 9-point window)
    for window_end in 9..=20 {
        let window = &data[..window_end];
        let alerts = check_western_electric_rules(window);
        assert!(
            alerts.is_empty(),
            "Stable region must produce zero alerts at window_end={}, got: {:?}",
            window_end,
            alerts
        );
    }

    // Phase 2: inject outlier at position 21 (value = 10.0, well beyond UCL=6.5)
    let outlier_value = 10.0;
    data.push(ChartData {
        timestamp: "t_outlier".to_string(),
        value: outlier_value,
        ucl,
        cl,
        lcl,
        subgroup_data: None,
    });

    // Evaluate with the full 21-point series
    let alerts = check_western_electric_rules(&data);

    // Rule 1 must fire on the outlier
    let ooc_alert = alerts
        .iter()
        .find(|a| matches!(a, SpecialCause::OutOfControl { .. }));
    assert!(
        ooc_alert.is_some(),
        "Rule 1 (OutOfControl) must trigger on the injected outlier value={}",
        outlier_value
    );

    // Verify the alert captures the correct outlier value
    if let Some(SpecialCause::OutOfControl { value, .. }) = ooc_alert {
        assert_eq!(
            *value, outlier_value,
            "OutOfControl alert must report the injected outlier value"
        );
    }
}

// ===========================================================================
// Test 2: Gradual Drift Detection -- Trend Over Time
// ===========================================================================

/// Simulates a process that slowly degrades: event rate increases by 0.1
/// per cycle for 30 cycles (5.0, 5.1, 5.2, ..., 8.0).
///
/// The values start well within control limits but gradually approach and
/// eventually exceed them. The trend rule (Rule 3: 6 consecutive increasing
/// points) should fire BEFORE the values exceed the control limits, proving
/// that the system detects gradual process change proactively.
#[test]
fn test_gradual_drift_detected_by_trend_rule() {
    let cl = 5.0;
    let sigma = 0.5;
    let ucl = cl + 3.0 * sigma; // 6.5

    // Build 30 points with a gradual upward trend of +0.1 per step
    let data: Vec<ChartData> = (0..30)
        .map(|i| {
            let value = 5.0 + (i as f64) * 0.1; // 5.0, 5.1, ..., 8.0
            spc_point(&format!("t{}", i), value, cl, sigma)
        })
        .collect();

    // Check at each window size >= 9
    let mut trend_fired_at: Option<usize> = None;
    let mut value_exceeded_ucl_at: Option<usize> = None;

    for window_end in 9..=30 {
        let window = &data[..window_end];
        let alerts = check_western_electric_rules(window);

        let has_trend = alerts
            .iter()
            .any(|a| matches!(a, SpecialCause::Trend { .. }));
        if has_trend && trend_fired_at.is_none() {
            trend_fired_at = Some(window_end);
        }

        let latest_value = data[window_end - 1].value;
        if latest_value > ucl && value_exceeded_ucl_at.is_none() {
            value_exceeded_ucl_at = Some(window_end);
        }
    }

    // The trend rule MUST fire at some point (6 consecutive increasing values exist)
    assert!(
        trend_fired_at.is_some(),
        "Rule 3 (Trend) must fire on a gradual upward drift of +0.1/step over 30 points"
    );

    // The trend must fire before (or at the same time as) the values exceed UCL
    // UCL=6.5 is exceeded at value=6.6 which is index 16 (t16)
    // 6 consecutive increasing points: t5..t10 = {5.5, 5.6, 5.7, 5.8, 5.9, 6.0}
    // So trend should fire at window_end=11 (indices 0..10, last 6 = t5..t10)
    if let (Some(trend_at), Some(exceeded_at)) = (trend_fired_at, value_exceeded_ucl_at) {
        assert!(
            trend_at <= exceeded_at,
            "Trend rule must fire (at t{}) before values exceed UCL (at t{})",
            trend_at,
            exceeded_at
        );
    }

    // Verify the trend direction is Increasing
    let alerts_at_trend = check_western_electric_rules(&data[..trend_fired_at.unwrap()]);
    let trend_alert = alerts_at_trend
        .iter()
        .find(|a| matches!(a, SpecialCause::Trend { .. }));
    if let Some(SpecialCause::Trend { direction, .. }) = trend_alert {
        assert_eq!(
            *direction,
            TrendDirection::Increasing,
            "Trend direction must be Increasing for an upward drift"
        );
    }
}

// ===========================================================================
// Test 3: False Positive Control -- Stable Process
// ===========================================================================

/// Generates 100 data points with natural variance (mean=5.0, sigma=0.3)
/// and verifies that Western Electric rules produce zero or minimal false alerts.
///
/// A false positive rate below 5% is acceptable for statistical process control.
/// This proves the detection system is trustworthy for monitoring stable processes.
#[test]
fn test_false_positive_rate_on_stable_process() {
    let cl = 5.0;
    let sigma = 0.3; // Tight sigma: control limits are narrow (4.1, 5.9)

    // Generate 100 stable data points using deterministic residuals
    // All residuals are scaled to stay within ~2 sigma of the mean
    let data = stable_data(cl, sigma, 100, 0);

    // Verify all values are within control limits (sanity check)
    for point in &data {
        assert!(
            point.value >= point.lcl && point.value <= point.ucl,
            "Sanity: all generated values must be within control limits, got value={} (lcl={}, ucl={})",
            point.value,
            point.lcl,
            point.ucl
        );
    }

    // Evaluate SPC rules at every window size from 9 to 100
    let mut total_windows = 0;
    let mut windows_with_alerts = 0;

    for window_end in 9..=100 {
        let window = &data[..window_end];
        let alerts = check_western_electric_rules(window);
        total_windows += 1;
        if !alerts.is_empty() {
            windows_with_alerts += 1;
        }
    }

    let false_positive_rate = windows_with_alerts as f64 / total_windows as f64;

    // Allow up to 5% false positive rate (generous for SPC)
    assert!(
        false_positive_rate <= 0.05,
        "False positive rate must be <= 5%, got {:.1}% ({} alerts out of {} windows)",
        false_positive_rate * 100.0,
        windows_with_alerts,
        total_windows
    );
}

// ===========================================================================
// Test 4: SpcHistory Ring Buffer Accumulation
// ===========================================================================

/// Records 50 snapshots into SpcHistory: first 20 with normal event_rate (5.0),
/// then 30 with shifted event_rate (8.0) simulating a process change.
///
/// Asserts:
/// - All 50 snapshots are stored correctly.
/// - The ring buffer stores exactly 50 entries (capacity is 100, so no eviction).
/// - Historical event rates correctly reflect the shift.
/// - When Western Electric rules are applied to the historical data,
///   Rule 2 (Shift: 9 consecutive above CL) fires after the shift.
#[test]
fn test_spc_history_accumulates_and_detects_shift() {
    let mut history = SpcHistory::new();
    assert_eq!(history.cycle_count, 0);
    assert!(!history.has_sufficient_data());

    // Phase 1: Record 20 normal snapshots (event_rate = 5.0)
    for i in 0..20 {
        let snapshot = SpcSnapshot::new(
            format!("cycle-{}", i),
            5.0,   // event_rate
            150.0, // trace_duration_avg
            0.85,  // activity_frequency
            0,     // health_state (Normal)
        );
        history.record_snapshot(snapshot);
    }

    assert_eq!(history.cycle_count, 20);
    assert_eq!(history.history.len(), 20);
    assert!(history.has_sufficient_data()); // 20 >= 9

    // Verify event rates in normal phase
    let rates_normal = history.get_event_rates();
    assert_eq!(rates_normal.len(), 20);
    assert!(rates_normal.iter().all(|&r| (r - 5.0).abs() < 1e-10));

    // Phase 2: Record 30 shifted snapshots (event_rate = 8.0)
    for i in 20..50 {
        let snapshot = SpcSnapshot::new(
            format!("cycle-{}", i),
            8.0,   // event_rate (shifted from 5.0 to 8.0)
            200.0, // trace_duration_avg (also shifted)
            0.92,  // activity_frequency
            1,     // health_state (Warning)
        );
        history.record_snapshot(snapshot);
    }

    assert_eq!(history.cycle_count, 50);
    assert_eq!(history.history.len(), 50); // Capacity 100, no eviction yet

    // Verify all snapshots stored correctly
    let all_snapshots = history.get_all_snapshots();
    assert_eq!(all_snapshots.len(), 50);
    assert_eq!(all_snapshots[0].event_rate, 5.0);
    assert_eq!(all_snapshots[19].event_rate, 5.0);
    assert_eq!(all_snapshots[20].event_rate, 8.0);
    assert_eq!(all_snapshots[49].event_rate, 8.0);

    // Verify event rates reflect the shift
    let all_rates = history.get_event_rates();
    assert_eq!(all_rates.len(), 50);
    assert!(all_rates[0..20].iter().all(|&r| (r - 5.0).abs() < 1e-10));
    assert!(all_rates[20..50].iter().all(|&r| (r - 8.0).abs() < 1e-10));

    // Apply Western Electric rules to historical event rates
    // Mean of all 50 rates: (20*5.0 + 30*8.0) / 50 = (100 + 240) / 50 = 6.8
    let mean = spc_mean(&all_rates);
    let std = spc_std_dev(&all_rates);
    let chart_data: Vec<ChartData> = all_rates
        .iter()
        .enumerate()
        .map(|(i, &v)| ChartData {
            timestamp: format!("cycle-{}", i),
            value: v,
            ucl: mean + 3.0 * std,
            cl: mean,
            lcl: (mean - 3.0 * std).max(0.0),
            subgroup_data: None,
        })
        .collect();

    let alerts = check_western_electric_rules(&chart_data);

    // Rule 2 (Shift) must fire: the last 9 points are all 8.0, which is
    // above the center line (6.8), so 9 consecutive same-side points.
    let shift_alert = alerts
        .iter()
        .find(|a| matches!(a, SpecialCause::Shift { .. }));
    assert!(
        shift_alert.is_some(),
        "Rule 2 (Shift) must detect 9 consecutive above-CL points in the shifted region. \
         Got alerts: {:?}, mean={:.2}, std={:.2}, cl={:.2}",
        alerts,
        mean,
        std,
        mean
    );

    // Verify shift direction is Above
    if let Some(SpecialCause::Shift { direction, .. }) = shift_alert {
        assert_eq!(
            *direction,
            ShiftDirection::Above,
            "Shift must be Above (event_rate increased from 5.0 to 8.0)"
        );
    }
}

// ===========================================================================
// Test 5: EWMA Smoothing Distinguishes Drift From Noise
// ===========================================================================

/// Compares two scenarios:
/// A) Single spike: one high value surrounded by normal values.
/// B) Sustained elevation: 10 consecutive elevated values.
///
/// EWMA (Exponential Weighted Moving Average) should:
/// - Return to baseline quickly in Scenario A (transient noise filtered out).
/// - Show sustained elevation in Scenario B (real drift detected).
///
/// This proves EWMA smoothing correctly separates noise from actual process change.
#[test]
#[cfg(feature = "ml")]
fn test_ewma_distinguishes_sustained_drift_from_noise() {
    let alpha = 0.3; // Standard EWMA smoothing factor
    let baseline = 5.0;
    let spike_value = 10.0;
    let sustained_value = 7.0;

    // Scenario A: Single spike (20 normal, 1 spike, 9 normal)
    let mut scenario_a: Vec<f64> = vec![baseline; 20];
    scenario_a.push(spike_value);
    scenario_a.extend(vec![baseline; 9]);

    // Scenario B: Sustained elevation (10 normal, 10 elevated, 10 normal)
    let mut scenario_b: Vec<f64> = vec![baseline; 10];
    scenario_b.extend(vec![sustained_value; 10]);
    scenario_b.extend(vec![baseline; 10]);

    let ewma_a = ewma(&scenario_a, alpha);
    let ewma_b = ewma(&scenario_b, alpha);

    // Scenario A: After the spike, EWMA must return close to baseline
    // The spike is at index 20. Check EWMA at index 29 (9 points after spike).
    let ewma_a_after_spike = ewma_a[29];
    assert!(
        (ewma_a_after_spike - baseline).abs() < 1.0,
        "Scenario A: EWMA must return close to baseline ({}) after a single spike, \
         got ewma[29]={:.4}",
        baseline,
        ewma_a_after_spike
    );

    // Scenario B: During the sustained elevation, EWMA must be significantly
    // above baseline. Check at index 15 (5 points into the sustained region).
    let ewma_b_during_drift = ewma_b[15];
    assert!(
        ewma_b_during_drift > baseline + 1.0,
        "Scenario B: EWMA must show sustained elevation above baseline ({}) \
         during drift, got ewma[15]={:.4}",
        baseline,
        ewma_b_during_drift
    );

    // Cross-validation: Scenario B's peak EWMA must exceed Scenario A's peak EWMA
    // (proving sustained drift produces a stronger signal than a single spike)
    let peak_a = ewma_a.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
    let peak_b = ewma_b.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
    assert!(
        peak_b > peak_a,
        "Scenario B peak EWMA ({:.4}) must exceed Scenario A peak EWMA ({:.4}): \
         sustained drift produces a stronger signal than a single spike",
        peak_b,
        peak_a
    );

    // Final values: both should return near baseline since the elevation ends
    let ewma_a_final = ewma_a[ewma_a.len() - 1];
    let ewma_b_final = ewma_b[ewma_b.len() - 1];
    assert!(
        (ewma_a_final - baseline).abs() < 0.5,
        "Scenario A final EWMA ({:.4}) must be close to baseline ({})",
        ewma_a_final,
        baseline
    );
    // Scenario B may still be slightly elevated at the end since the sustained
    // period is longer, but it should be trending back toward baseline
    assert!(
        ewma_b_final < ewma_b_during_drift,
        "Scenario B final EWMA ({:.4}) must be lower than peak drift EWMA ({:.4}): \
         process is recovering",
        ewma_b_final,
        ewma_b_during_drift
    );
}

// ===========================================================================
// Test 6: Multi-Rule Detection Priority
// ===========================================================================

/// Creates three separate drift scenarios and verifies that each SPC rule
/// triggers on its corresponding drift type with minimal cross-contamination.
///
/// Scenario A: Single point beyond 3-sigma (Rule 1 target)
/// Scenario B: 9 consecutive points above center line (Rule 2 target)
/// Scenario C: 6 monotone increasing points (Rule 3 target)
///
/// Asserts:
/// - Each rule fires on its designed scenario.
/// - Cross-contamination is minimal: Rule 1 does not fire on Rule 2 or Rule 3
///   scenarios (their values are within control limits).
#[test]
fn test_multiple_spc_rules_detect_different_drift_types() {
    let cl = 50.0;
    let sigma = 5.0;
    let _ucl = cl + 3.0 * sigma; // 65.0
    let _lcl = f64::max(cl - 3.0 * sigma, 0.0); // 35.0

    // Scenario A: 8 normal points + 1 outlier beyond UCL
    let data_a: Vec<ChartData> = (0..8)
        .map(|i| spc_point(&format!("t{}", i), cl + 0.5, cl, sigma))
        .chain(std::iter::once(spc_point("t8", 70.0, cl, sigma)))
        .collect();

    let alerts_a = check_western_electric_rules(&data_a);
    assert!(
        alerts_a
            .iter()
            .any(|a| matches!(a, SpecialCause::OutOfControl { .. })),
        "Scenario A: Rule 1 must fire on point beyond 3-sigma"
    );

    // Scenario B: 9 consecutive points above CL (but within 3-sigma)
    // All values are 52.0, which is above CL=50.0 but well within UCL=65.0
    let data_b: Vec<ChartData> = (0..9)
        .map(|i| spc_point(&format!("t{}", i), 52.0, cl, sigma))
        .collect();

    let alerts_b = check_western_electric_rules(&data_b);
    assert!(
        alerts_b.iter().any(|a| matches!(
            a,
            SpecialCause::Shift {
                direction: ShiftDirection::Above,
                ..
            }
        )),
        "Scenario B: Rule 2 must fire on 9 consecutive above-CL points"
    );
    // Rule 1 must NOT fire (all values within control limits)
    assert!(
        !alerts_b
            .iter()
            .any(|a| matches!(a, SpecialCause::OutOfControl { .. })),
        "Scenario B: Rule 1 must NOT fire (all values within control limits)"
    );

    // Scenario C: 6 monotone increasing points (all within control limits)
    // Need >= 9 points total. First 3 alternate above/below CL, then 6 strictly increasing.
    let data_c: Vec<ChartData> = (0..9)
        .map(|i| {
            let value = if i < 3 {
                if i % 2 == 0 {
                    cl + 1.0
                } else {
                    cl - 1.0
                }
            } else {
                cl + (i as f64 - 2.0) // 1.0, 2.0, 3.0, 4.0, 5.0, 6.0 above CL
            };
            spc_point(&format!("t{}", i), value, cl, sigma)
        })
        .collect();

    let alerts_c = check_western_electric_rules(&data_c);
    assert!(
        alerts_c.iter().any(|a| matches!(
            a,
            SpecialCause::Trend {
                direction: TrendDirection::Increasing,
                ..
            }
        )),
        "Scenario C: Rule 3 must fire on 6 consecutive increasing points"
    );
    // Rule 1 must NOT fire (all values within control limits)
    assert!(
        !alerts_c
            .iter()
            .any(|a| matches!(a, SpecialCause::OutOfControl { .. })),
        "Scenario C: Rule 1 must NOT fire (all values within control limits)"
    );
}
