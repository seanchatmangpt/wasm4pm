#![cfg(feature = "cloud")]
//! SPC Exact Position + Ring Buffer Eviction tests (Category C).
//!
//! Rank-1 precision tests that verify:
//! - SPC rules fire with EXACT value matches (not "within tolerance")
//! - Rules fire at the correct window boundary (exact data length)
//! - Ring buffer eviction is deterministic and observable
//! - Evicted data is truly gone and does not affect statistics
//!
//! These tests complement the existing behavioral_drift_tests.rs which verify
//! detection within ±10 traces. Here we verify exact matches at exact positions.

use wasm4pm::spc::{
    check_western_electric_rules, spc_mean, spc_std_dev, ChartData, ShiftDirection, SpecialCause,
    TrendDirection,
};
use wasm4pm::spc_history::{SpcHistory, SpcSnapshot};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Build a ChartData point with a given value and standard 3-sigma control limits.
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

// ===========================================================================
// Part 1: Exact Position Tests
// ===========================================================================

// ---------------------------------------------------------------------------
// Test 1: Rule 1 fires at EXACT observation index
// ---------------------------------------------------------------------------

/// Build 25 data points where index 20 has value = cl + 4*sigma (beyond 3-sigma).
///
/// Because check_western_electric_rules examines the trailing 9-point window,
/// Rule 1 fires only when index 20 is within the trailing window (data len >= 21).
/// The alert must carry the EXACT outlier value -- no tolerance, no approximation.
#[test]
fn test_rule_1_fires_at_exact_observation_index() {
    let cl = 50.0;
    let sigma = 5.0;
    let outlier_value = cl + 4.0 * sigma; // 70.0 -- well beyond UCL=65.0

    // Build 25 points: indices 0-19 are stable (CL), index 20 is the outlier,
    // indices 21-24 are stable again.
    let mut data: Vec<ChartData> = Vec::new();
    for i in 0..25 {
        let value = if i == 20 {
            outlier_value
        } else {
            cl + 0.1 * (i as f64 % 7.0 - 3.0) // stable, within 2-sigma
        };
        data.push(spc_point(&format!("t{}", i), value, cl, sigma));
    }

    // Rule 1 must NOT fire before index 20 enters the trailing 9-point window.
    // The trailing window covers data[len-9..len], so index 20 is in the window
    // when len-9 <= 20, i.e., len <= 29. But the latest point checked is len-1.
    // Actually: Rule 1 checks `latest` (the last element). So it fires only when
    // index 20 IS the last element, i.e., window_end == 21.
    //
    // For window_end < 21, the last point is stable -- no alert.
    // At window_end == 21, data[20] is the last point and beyond UCL -> Rule 1 fires.
    for window_end in 9..=20 {
        let alerts = check_western_electric_rules(&data[..window_end]);
        assert!(
            !alerts
                .iter()
                .any(|a| matches!(a, SpecialCause::OutOfControl { .. })),
            "Rule 1 must NOT fire at window_end={} (outlier not yet in trailing window)",
            window_end
        );
    }

    // At window_end == 21, data[20] is the latest point -> Rule 1 must fire.
    let alerts_at_21 = check_western_electric_rules(&data[..21]);
    let ooc = alerts_at_21
        .iter()
        .find(|a| matches!(a, SpecialCause::OutOfControl { .. }));
    assert!(
        ooc.is_some(),
        "Rule 1 (OutOfControl) must fire at window_end=21 where outlier is the latest point"
    );

    // Verify EXACT value match in the alert.
    if let Some(SpecialCause::OutOfControl { value, ucl, lcl }) = ooc {
        assert_eq!(
            *value, outlier_value,
            "OutOfControl alert value must exactly match the injected outlier ({}), got {}",
            outlier_value, value
        );
        assert_eq!(
            *ucl,
            cl + 3.0 * sigma,
            "OutOfControl alert UCL must be exact"
        );
        assert_eq!(
            *lcl,
            f64::max(cl - 3.0 * sigma, 0.0),
            "OutOfControl alert LCL must be exact"
        );
    }

    // After the outlier passes out of the trailing window (window_end > 29),
    // Rule 1 must no longer fire because the latest point is stable again.
    // Actually: the trailing window is always the last 9 points. Index 20 is
    // in the trailing window for window_end in [21..=29]. At window_end=30,
    // the window is data[21..=29], which is all stable.
    // But wait: the function takes data[data.len()-9..], so at len=30 it's
    // data[21..=29]. Index 20 is no longer included. Latest = data[29], stable.
    // However, for len in [22..=29], latest = data[len-1] which is stable,
    // so Rule 1 won't fire either (it only checks the latest point).
    // Rule 1 fires ONLY at len=21 where data[20] is the latest point.
    for window_end in 22..=25 {
        let alerts = check_western_electric_rules(&data[..window_end]);
        assert!(
            !alerts
                .iter()
                .any(|a| matches!(a, SpecialCause::OutOfControl { .. })),
            "Rule 1 must NOT fire at window_end={} (latest point is stable)",
            window_end
        );
    }
}

// ---------------------------------------------------------------------------
// Test 2: Rule 2 fires at EXACT shift start (9th consecutive same-side point)
// ---------------------------------------------------------------------------

/// Build data where the first below-CL point ensures the trailing window
/// starts mixed, then a run of above-CL points eventually fills the entire
/// 9-point trailing window.
///
/// Strategy: points 0-7 are below CL, points 8-16 are above CL.
/// The trailing window becomes all-above-CL at window_end=17
/// (window = data[8..=16], all 9 points above CL).
/// The 9th consecutive above-CL point is index 16.
#[test]
fn test_rule_2_fires_at_exact_ninth_consecutive_point() {
    let cl = 50.0;
    let sigma = 5.0;

    let mut data: Vec<ChartData> = Vec::new();

    // Points 0-7: below CL (prevents any premature shift).
    for i in 0..8 {
        data.push(spc_point(&format!("t{}", i), cl - 1.0, cl, sigma));
    }

    // Points 8-16: all above CL (9 consecutive above-CL points).
    for i in 8..=16 {
        data.push(spc_point(&format!("t{}", i), cl + 1.0, cl, sigma));
    }

    // Point 17: above CL (continuing the run, to verify shift persists).
    data.push(spc_point("t17", cl + 1.0, cl, sigma));

    // Rule 2 must NOT fire before the trailing window is entirely above-CL.
    // The trailing window (last 9 points) becomes all-above-CL at window_end=17
    // (window = data[8..=16], 9 points all above CL).
    // At window_end=16, trailing window = data[7..=15]: point 7 is below CL -> mixed.
    for window_end in 9..=16 {
        let alerts = check_western_electric_rules(&data[..window_end]);
        assert!(
            !alerts.iter().any(|a| matches!(a, SpecialCause::Shift { .. })),
            "Rule 2 (Shift) must NOT fire at window_end={} -- trailing window still contains below-CL points",
            window_end
        );
    }

    // At window_end=17, the trailing window is data[8..=16] (all above CL).
    let alerts_at_17 = check_western_electric_rules(&data[..17]);
    let shift = alerts_at_17
        .iter()
        .find(|a| matches!(a, SpecialCause::Shift { .. }));
    assert!(
        shift.is_some(),
        "Rule 2 (Shift) must fire at window_end=17 where all 9 trailing points are above CL"
    );

    // Verify exact shift direction and count.
    if let Some(SpecialCause::Shift { direction, count }) = shift {
        assert_eq!(
            *direction,
            ShiftDirection::Above,
            "Shift direction must be Above (all 9 points above CL)"
        );
        assert_eq!(*count, 9, "Shift count must be exactly 9");
    }
}

// ---------------------------------------------------------------------------
// Test 3: Rule 3 fires at EXACT trend completion (6th increasing point)
// ---------------------------------------------------------------------------

/// Build data where the first 5 points are strictly decreasing (preventing
/// any increasing-trend detection), then a monotone increasing run begins.
///
/// Strategy: points 0-4 are strictly decreasing (10.0, 9.0, 8.0, 7.0, 6.0).
/// Points 5-10 are strictly increasing (1.0, 2.0, 3.0, 4.0, 5.0, 6.0 above CL).
/// Points 11-14 are flat (plateau to verify trend stops).
///
/// The trailing window's last 6 become all-increasing at window_end=11
/// (data[5..=10] = 1.0, 2.0, 3.0, 4.0, 5.0, 6.0).
/// At window_end=10, trailing window last 6 = data[4..=9] includes the decreasing
/// point at index 4 (6.0 -> 1.0), so no monotone trend.
#[test]
fn test_rule_3_fires_at_exact_sixth_increasing_point() {
    let cl = 50.0;
    let sigma = 5.0;

    let mut data: Vec<ChartData> = Vec::new();

    // Points 0-4: strictly decreasing values above CL.
    // This ensures the last-6 window cannot be all-increasing until we have
    // 6 consecutive increasing points in the trailing window.
    for i in 0..5 {
        data.push(spc_point(
            &format!("t{}", i),
            cl + 10.0 - i as f64, // 60.0, 59.0, 58.0, 57.0, 56.0
            cl,
            sigma,
        ));
    }

    // Points 5-10: strictly increasing (6 points): cl+1, cl+2, ..., cl+6.
    for i in 5..=10 {
        data.push(spc_point(
            &format!("t{}", i),
            cl + (i - 4) as f64, // 1.0, 2.0, 3.0, 4.0, 5.0, 6.0 above CL
            cl,
            sigma,
        ));
    }

    // Points 11-14: flat (plateau to confirm trend doesn't persist).
    for i in 11..15 {
        data.push(spc_point(&format!("t{}", i), cl + 6.0, cl, sigma));
    }

    // Rule 3 must NOT fire before 6 increasing points fill the last-6 window.
    // At window_end=10: trailing window = data[1..=10], last 6 = data[4..=9].
    // data[4]=56.0, data[5]=51.0 -- decreasing, so no trend.
    for window_end in 9..=10 {
        let alerts = check_western_electric_rules(&data[..window_end]);
        assert!(
            !alerts.iter().any(|a| matches!(a, SpecialCause::Trend { .. })),
            "Rule 3 (Trend) must NOT fire at window_end={} -- not yet 6 consecutive increasing points in trailing window",
            window_end
        );
    }

    // At window_end=11, trailing window = data[2..=10], last 6 = data[5..=10].
    // data[5]=51.0, data[6]=52.0, ..., data[10]=56.0 -- strictly increasing.
    let alerts_at_11 = check_western_electric_rules(&data[..11]);
    let trend = alerts_at_11
        .iter()
        .find(|a| matches!(a, SpecialCause::Trend { .. }));
    assert!(
        trend.is_some(),
        "Rule 3 (Trend) must fire at window_end=11 where last 6 trailing points are monotone increasing"
    );

    // Verify exact trend direction and count.
    if let Some(SpecialCause::Trend { direction, count }) = trend {
        assert_eq!(
            *direction,
            TrendDirection::Increasing,
            "Trend direction must be Increasing"
        );
        assert_eq!(*count, 6, "Trend count must be exactly 6");
    }

    // At window_end=12, last 6 = data[6..=11]. data[10]=56.0, data[11]=56.0.
    // 56.0 -> 56.0 is NOT strictly increasing (not >), so trend stops.
    let alerts_at_12 = check_western_electric_rules(&data[..12]);
    assert!(
        !alerts_at_12
            .iter()
            .any(|a| matches!(a, SpecialCause::Trend { .. })),
        "Rule 3 must NOT fire at window_end=12 (plateau breaks monotone increase)"
    );
}

// ---------------------------------------------------------------------------
// Test 4: Stable data has zero exact-position matches
// ---------------------------------------------------------------------------

/// Generate 50 data points all within 2-sigma of CL.
/// Assert: check_western_electric_rules returns empty vec at every window size.
#[test]
fn test_stable_data_has_zero_exact_position_matches() {
    let cl = 100.0;
    let sigma = 2.0;

    // Deterministic residuals: cycle through values that stay within ±1.5 sigma.
    const RESIDUALS: &[f64] = &[
        0.1, -0.3, 0.2, -0.1, 0.4, -0.2, 0.0, 0.3, -0.4, 0.1, -0.2, 0.3, -0.1, 0.2, -0.3, 0.1, 0.0,
        -0.2, 0.4, -0.1, 0.2, -0.3, 0.1, -0.1, 0.3, -0.2, 0.0, 0.1, -0.3, 0.2, -0.1, 0.4, -0.2,
        0.1, 0.0, -0.3, 0.2, -0.1, 0.3, -0.2, 0.1, -0.1, 0.2, 0.0, -0.3, 0.3, -0.2, 0.1, -0.1, 0.2,
    ];

    let data: Vec<ChartData> = (0..50)
        .map(|i| {
            let r = RESIDUALS[i] * sigma; // max residual = 0.4 * 2.0 = 0.8 sigma
            spc_point(&format!("t{}", i), cl + r, cl, sigma)
        })
        .collect();

    // Verify all values are within control limits (sanity).
    for point in &data {
        assert!(
            point.value >= point.lcl && point.value <= point.ucl,
            "All stable data must be within control limits, got value={} (lcl={}, ucl={})",
            point.value,
            point.lcl,
            point.ucl
        );
    }

    // Check every window from 9 to 50.
    for window_end in 9..=50 {
        let alerts = check_western_electric_rules(&data[..window_end]);
        assert!(
            alerts.is_empty(),
            "Stable data must produce zero alerts at window_end={}, got {:?}",
            window_end,
            alerts
        );
    }
}

// ---------------------------------------------------------------------------
// Test 5: Multiple rules can fire at the same position
// ---------------------------------------------------------------------------

/// Create a point that is both beyond 3-sigma AND the 9th consecutive above-CL point.
/// Assert: both OutOfControl and Shift alerts are returned for the same window.
#[test]
fn test_multiple_rules_can_fire_at_same_position() {
    let cl = 50.0;
    let sigma = 3.0;
    let outlier_value = cl + 4.0 * sigma; // 62.0 -- beyond UCL=59.0

    // Build 8 points above CL but within control limits, then the outlier
    // (which is also above CL and beyond UCL).
    let mut data: Vec<ChartData> = Vec::new();

    // 8 points above CL but within 3-sigma.
    for i in 0..8 {
        data.push(spc_point(&format!("t{}", i), cl + 1.5, cl, sigma));
    }

    // 9th point: above CL AND beyond 3-sigma.
    data.push(spc_point("t8", outlier_value, cl, sigma));

    let alerts = check_western_electric_rules(&data);

    // Rule 1 (OutOfControl) must fire -- the latest point is beyond UCL.
    let ooc = alerts
        .iter()
        .find(|a| matches!(a, SpecialCause::OutOfControl { .. }));
    assert!(
        ooc.is_some(),
        "Rule 1 (OutOfControl) must fire on point beyond UCL. Got alerts: {:?}",
        alerts
    );

    // Rule 2 (Shift) must fire -- all 9 trailing points are above CL.
    let shift = alerts
        .iter()
        .find(|a| matches!(a, SpecialCause::Shift { .. }));
    assert!(
        shift.is_some(),
        "Rule 2 (Shift) must fire on 9 consecutive above-CL points. Got alerts: {:?}",
        alerts
    );

    // Verify exact values.
    if let Some(SpecialCause::OutOfControl { value, .. }) = ooc {
        assert_eq!(
            *value, outlier_value,
            "OutOfControl value must exactly match outlier ({})",
            outlier_value
        );
    }

    if let Some(SpecialCause::Shift { direction, count }) = shift {
        assert_eq!(*direction, ShiftDirection::Above);
        assert_eq!(*count, 9);
    }

    // Both alerts must be present simultaneously.
    assert_eq!(
        alerts.len(),
        2,
        "Exactly 2 alerts (OutOfControl + Shift) must fire, got {:?}",
        alerts
    );
}

// ===========================================================================
// Part 2: Ring Buffer Eviction Tests
// ===========================================================================

// Capacity is RingBuffer<SpcSnapshot, 100>.
const SPC_CAPACITY: usize = 100;

// ---------------------------------------------------------------------------
// Test 6: Ring buffer evicts oldest when full
// ---------------------------------------------------------------------------

#[test]
fn test_ring_buffer_evicts_oldest_when_full() {
    let mut history = SpcHistory::new();

    // Record SPC_CAPACITY + 1 snapshots with distinct event_rates.
    for i in 0..=SPC_CAPACITY {
        history.record_snapshot(SpcSnapshot::new(
            format!("snap-{}", i),
            i as f64, // distinct event_rate: 0.0, 1.0, ..., 100.0
            150.0,
            0.85,
            0,
        ));
    }

    // Buffer must be at capacity, not capacity + 1.
    assert_eq!(
        history.history.len(),
        SPC_CAPACITY,
        "Ring buffer must hold exactly {} entries after inserting {} snapshots",
        SPC_CAPACITY,
        SPC_CAPACITY + 1
    );

    // The first snapshot (event_rate=0.0, timestamp="snap-0") must be evicted.
    let oldest = history.history.iter().next().unwrap();
    assert_eq!(
        oldest.timestamp, "snap-1",
        "Oldest entry must be snap-1 (snap-0 was evicted)"
    );
    assert_eq!(
        oldest.event_rate, 1.0,
        "Oldest event_rate must be 1.0 (0.0 was evicted)"
    );

    // The newest snapshot must be the last one inserted.
    let newest = history.history.iter().last().unwrap();
    assert_eq!(
        newest.timestamp,
        format!("snap-{}", SPC_CAPACITY),
        "Newest entry must be snap-{}",
        SPC_CAPACITY
    );
    assert_eq!(
        newest.event_rate, SPC_CAPACITY as f64,
        "Newest event_rate must be {}",
        SPC_CAPACITY
    );

    // Verify no snapshot with event_rate=0.0 exists.
    let has_zero = history
        .history
        .iter()
        .any(|s| (s.event_rate - 0.0).abs() < 1e-10);
    assert!(
        !has_zero,
        "Evicted snapshot (event_rate=0.0) must not be in the buffer"
    );
}

// ---------------------------------------------------------------------------
// Test 7: Evicted data doesn't affect statistics
// ---------------------------------------------------------------------------

#[test]
fn test_evicted_data_does_not_affect_spc_analysis() {
    let mut history = SpcHistory::new();

    // Record 50 snapshots with event_rate=5.0.
    for i in 0..50 {
        history.record_snapshot(SpcSnapshot::new(format!("snap-{}", i), 5.0, 150.0, 0.85, 0));
    }

    // Record 51 more snapshots with event_rate=8.0 (total 101).
    for i in 50..101 {
        history.record_snapshot(SpcSnapshot::new(format!("snap-{}", i), 8.0, 200.0, 0.92, 1));
    }

    // Total recorded: 101. Buffer holds 100. One evicted.
    assert_eq!(history.cycle_count, 101);
    assert_eq!(history.history.len(), SPC_CAPACITY);

    // The oldest snapshot must be snap-1 (snap-0 evicted).
    let oldest = history.history.iter().next().unwrap();
    assert_eq!(oldest.timestamp, "snap-1");

    // Compute mean from the retained event rates.
    // Buffer contains snap-1 through snap-100.
    // snap-1..snap-49 have event_rate=5.0 (49 entries)
    // snap-50..snap-100 have event_rate=8.0 (51 entries)
    // Expected mean = (49*5.0 + 51*8.0) / 100 = (245 + 408) / 100 = 6.53
    let rates = history.get_event_rates();
    let mean = spc_mean(&rates);
    let expected_mean = (49.0 * 5.0 + 51.0 * 8.0) / 100.0;
    assert!(
        (mean - expected_mean).abs() < 1e-10,
        "Mean must reflect the post-eviction composition (expected={:.2}, got={:.2})",
        expected_mean,
        mean
    );

    // The mean must be closer to 8.0 than to 5.0 (51 out of 100 entries are 8.0).
    assert!(
        mean > 6.0,
        "Mean ({:.2}) must be closer to 8.0 than to 5.0 after eviction shifted composition",
        mean
    );

    // Verify no snapshot with timestamp "snap-0" exists.
    let has_snap_zero = history.history.iter().any(|s| s.timestamp == "snap-0");
    assert!(
        !has_snap_zero,
        "Evicted snapshot 'snap-0' must not appear in history"
    );
}

// ---------------------------------------------------------------------------
// Test 8: Cycle count increments past eviction
// ---------------------------------------------------------------------------

#[test]
fn test_cycle_count_increments_past_eviction() {
    let mut history = SpcHistory::new();

    let total_snapshots: u64 = 150;

    // Record 150 snapshots (capacity=100, so 50 evictions).
    for i in 0..total_snapshots {
        history.record_snapshot(SpcSnapshot::new(
            format!("snap-{}", i),
            i as f64,
            150.0,
            0.85,
            0,
        ));
    }

    // Cycle count must reflect ALL recordings, not just what fits in the buffer.
    assert_eq!(
        history.cycle_count, total_snapshots,
        "cycle_count must be {} (total recordings), not capped at buffer capacity",
        total_snapshots
    );

    // Buffer must be at capacity (100), not 150.
    assert_eq!(
        history.history.len(),
        SPC_CAPACITY,
        "Buffer must hold exactly {} entries, not grow beyond capacity",
        SPC_CAPACITY
    );

    // The oldest retained snapshot must be snap-50 (snap-0 through snap-49 evicted).
    let oldest = history.history.iter().next().unwrap();
    assert_eq!(
        oldest.timestamp, "snap-50",
        "Oldest retained snapshot must be snap-50 after 50 evictions"
    );
    assert_eq!(oldest.event_rate, 50.0, "Oldest event_rate must be 50.0");
}

// ---------------------------------------------------------------------------
// Test 9: Control limits remain stable during eviction
// ---------------------------------------------------------------------------

#[test]
fn test_control_limits_stable_during_eviction() {
    let mut history = SpcHistory::new();

    // Record 100 snapshots with event_rate=5.0 (fill buffer to capacity).
    for i in 0..100 {
        history.record_snapshot(SpcSnapshot::new(format!("snap-{}", i), 5.0, 150.0, 0.85, 0));
    }

    // Record 50 more with event_rate=5.0 (eviction happening, but identical data).
    for i in 100..150 {
        history.record_snapshot(SpcSnapshot::new(format!("snap-{}", i), 5.0, 150.0, 0.85, 0));
    }

    // Buffer is full. Oldest evicted, but all values are identical.
    assert_eq!(history.history.len(), SPC_CAPACITY);
    assert_eq!(history.cycle_count, 150);

    // Compute mean and std from retained event rates.
    let rates = history.get_event_rates();
    assert_eq!(rates.len(), SPC_CAPACITY);

    let mean = spc_mean(&rates);
    let std = spc_std_dev(&rates);

    // Mean must be exactly 5.0 (all retained values are 5.0).
    assert_eq!(
        mean, 5.0,
        "Mean must be 5.0 (all values identical despite eviction), got {}",
        mean
    );

    // Std must be 0.0 (no variance in retained data).
    assert_eq!(
        std, 0.0,
        "Std must be 0.0 (no variance despite eviction), got {}",
        std
    );
}

// ---------------------------------------------------------------------------
// Test 10: get_all_snapshots returns only non-evicted entries
// ---------------------------------------------------------------------------

#[test]
fn test_get_all_snapshots_reflects_eviction() {
    let mut history = SpcHistory::new();

    // Record 110 snapshots with identifiable timestamps.
    for i in 0..110 {
        history.record_snapshot(SpcSnapshot::new(
            format!("snap-{}", i),
            i as f64,
            150.0,
            0.85,
            0,
        ));
    }

    let all = history.get_all_snapshots();

    // Must have exactly 100 entries (capacity).
    assert_eq!(
        all.len(),
        SPC_CAPACITY,
        "get_all_snapshots must return exactly {} entries",
        SPC_CAPACITY
    );

    // The first 10 snapshots (snap-0 through snap-9) must be evicted.
    let timestamps: Vec<&str> = all.iter().map(|s| s.timestamp.as_str()).collect();
    for i in 0..10 {
        assert!(
            !timestamps.contains(&format!("snap-{}", i).as_str()),
            "snap-{} must have been evicted and must not appear in get_all_snapshots",
            i
        );
    }

    // snap-10 through snap-109 must be present.
    assert_eq!(
        timestamps[0], "snap-10",
        "First retained snapshot must be snap-10"
    );
    assert_eq!(
        timestamps[timestamps.len() - 1],
        "snap-109",
        "Last retained snapshot must be snap-109"
    );

    // Verify chronological order is preserved (oldest to newest).
    for i in 1..timestamps.len() {
        let prev_num: usize = timestamps[i - 1]
            .strip_prefix("snap-")
            .unwrap()
            .parse()
            .unwrap();
        let curr_num: usize = timestamps[i]
            .strip_prefix("snap-")
            .unwrap()
            .parse()
            .unwrap();
        assert!(
            curr_num > prev_num,
            "Snapshots must be in chronological order: snap-{} before snap-{}",
            prev_num,
            curr_num
        );
    }
}
