#![cfg(feature = "cloud")]
//! Adversarial Test Category C — SPC Time-Series (Rank-1 Oracle)
//!
//! From ADVERSARIAL_TEST_PLAN.md, Category C:
//!   Target: Western Electric rules engine with 100-snapshot ring buffer.
//!   Oracle: Mathematical theorem — rules fire at exactly specified points.
//!
//! | Test | Property | Method |
//! |------|----------|--------|
//! | C1   | Rule 1: 3σ violation fires at exactly that point  | Construct series ending with 3σ outlier |
//! | C2   | Rule 2: 9 consecutive fires at exactly 9th       | Construct 9-point series above mean |
//! | C3   | Rule 3: 6 trending fires at exactly 6th          | Construct 6-point monotonic series |
//! | C4   | Ring buffer evicts oldest (capacity 100)          | Add 101 observations, verify count=100 |
//! | C5   | SP-1 regression: consecutive rules work           | Rule 2 and 3 fire after buffer accumulation |
//!
//! SP-1 Bug Description:
//!   SPC was originally implemented as a one-shot check that didn't accumulate history.
//!   Rules 2 and 3 (consecutive-point rules) require a window of 9 or 6 points respectively.
//!   The SP-1 bug manifested as: even after 50+ observations, Rules 2 and 3 never fired
//!   because the history wasn't maintained between checks.
//!
//! Design decisions:
//!   - All tests are fully deterministic (no RNG).
//!   - Expected values are derived from Western Electric rule definitions.
//!   - No FM-5 assertions — expected values not derived from implementation.

use wasm4pm::spc::{
    check_western_electric_rules, ChartData, ShiftDirection, SpecialCause, TrendDirection,
};
// Rule 4 (TwoOfThree) uses ShiftDirection — already imported above.
use wasm4pm::spc_history::{SpcHistory, SpcSnapshot};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Build a ChartData point for a standard control chart.
/// Values within cl ± 3*sigma are within control limits.
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
// C1 — Rule 1 fires at exactly the point where value exceeds 3σ
//
// Western Electric Rule 1: One point beyond 3-sigma control limits.
// Theorem: The rule fires if and only if the LATEST point in the window
//          is beyond UCL or LCL.
// ===========================================================================

#[test]
fn c1_rule1_fires_at_exactly_the_outlier_point() {
    let cl = 50.0;
    let sigma = 5.0;
    let outlier = cl + 4.0 * sigma; // 70.0 — clearly beyond UCL=65.0

    // Build 10 stable points (within control limits), then the outlier.
    let mut data: Vec<ChartData> = (0..10)
        .map(|i| {
            let offset = if i % 2 == 0 {
                0.3 * sigma
            } else {
                -0.3 * sigma
            };
            spc_point(&format!("stable-{}", i), cl + offset, cl, sigma)
        })
        .collect();
    data.push(spc_point("outlier", outlier, cl, sigma));

    // Before the outlier is included, no Rule 1 alert.
    let alerts_before = check_western_electric_rules(&data[..10]);
    assert!(
        !alerts_before
            .iter()
            .any(|a| matches!(a, SpecialCause::OutOfControl { .. })),
        "C1 FAILED: Rule 1 must NOT fire on stable data (no outlier in window)"
    );

    // At exactly 11 points (outlier is latest), Rule 1 must fire.
    let alerts_at_outlier = check_western_electric_rules(&data[..11]);
    let ooc = alerts_at_outlier
        .iter()
        .find(|a| matches!(a, SpecialCause::OutOfControl { .. }));
    assert!(
        ooc.is_some(),
        "C1 FAILED: Rule 1 must fire when the latest point ({}) is beyond UCL ({})",
        outlier,
        cl + 3.0 * sigma
    );

    // Verify exact values from the alert.
    if let Some(SpecialCause::OutOfControl { value, ucl, lcl }) = ooc {
        assert_eq!(
            *value, outlier,
            "C1 FAILED: OutOfControl alert value must be exactly {} (the outlier). Got {}",
            outlier, value
        );
        assert_eq!(
            *ucl,
            cl + 3.0 * sigma,
            "C1: UCL in alert must be cl + 3*sigma = {}. Got {}",
            cl + 3.0 * sigma,
            ucl
        );
        assert_eq!(
            *lcl,
            f64::max(cl - 3.0 * sigma, 0.0),
            "C1: LCL in alert must be max(cl - 3*sigma, 0) = {}. Got {}",
            f64::max(cl - 3.0 * sigma, 0.0),
            lcl
        );
    }
}

#[test]
fn c1_rule1_does_not_fire_on_point_exactly_at_3sigma() {
    // Boundary condition: a point AT exactly UCL (not beyond it) must NOT trigger Rule 1.
    let cl = 50.0;
    let sigma = 5.0;
    let boundary_value = cl + 3.0 * sigma; // exactly UCL (65.0)

    let mut data: Vec<ChartData> = (0..10)
        .map(|i| {
            let offset = if i % 2 == 0 {
                0.3 * sigma
            } else {
                -0.3 * sigma
            };
            spc_point(&format!("stable-{}", i), cl + offset, cl, sigma)
        })
        .collect();
    data.push(spc_point("boundary", boundary_value, cl, sigma));

    let alerts = check_western_electric_rules(&data);
    assert!(
        !alerts
            .iter()
            .any(|a| matches!(a, SpecialCause::OutOfControl { .. })),
        "C1 boundary: Rule 1 must NOT fire for a point exactly at UCL (not BEYOND). \
         Value={}, UCL={}",
        boundary_value,
        cl + 3.0 * sigma
    );
}

// ===========================================================================
// C2 — Rule 2 fires at exactly the 9th consecutive same-side point
//
// Western Electric Rule 2: Nine consecutive points on the same side of CL.
// Theorem: Alert fires when the trailing 9-point window contains all
//          points above CL (or all below CL). The 9th point triggers it.
// ===========================================================================

#[test]
fn c2_rule2_fires_at_exactly_ninth_consecutive_above_cl() {
    let cl = 50.0;
    let sigma = 5.0;

    let mut data: Vec<ChartData> = Vec::new();

    // Points 0-7: alternating above/below CL (prevent premature Rule 2).
    for i in 0..8 {
        let value = if i % 2 == 0 { cl + 2.0 } else { cl - 2.0 };
        data.push(spc_point(&format!("mixed-{}", i), value, cl, sigma));
    }

    // Points 8-16: 9 consecutive above CL.
    for i in 8..=16 {
        data.push(spc_point(&format!("above-{}", i), cl + 1.0, cl, sigma));
    }

    // Before the 9-point all-above window, Rule 2 must NOT fire.
    for window_end in 9..=16 {
        let alerts = check_western_electric_rules(&data[..window_end]);
        assert!(
            !alerts
                .iter()
                .any(|a| matches!(a, SpecialCause::Shift { .. })),
            "C2 FAILED: Rule 2 must NOT fire at window_end={} \
             (9-point window still has below-CL points)",
            window_end
        );
    }

    // At window_end=17, trailing 9 = indices 8..=16 (all above CL). Rule 2 fires.
    let alerts_at_17 = check_western_electric_rules(&data[..17]);
    let shift = alerts_at_17
        .iter()
        .find(|a| matches!(a, SpecialCause::Shift { .. }));
    assert!(
        shift.is_some(),
        "C2 FAILED: Rule 2 must fire at exactly the 9th consecutive above-CL point (window_end=17)"
    );

    if let Some(SpecialCause::Shift { direction, count }) = shift {
        assert_eq!(
            *direction,
            ShiftDirection::Above,
            "C2: Shift direction must be Above"
        );
        assert_eq!(
            *count, 9,
            "C2: Shift count must be exactly 9 (Western Electric Rule 2 window size)"
        );
    }
}

#[test]
fn c2_rule2_fires_at_ninth_consecutive_below_cl() {
    let cl = 50.0;
    let sigma = 5.0;

    let mut data: Vec<ChartData> = Vec::new();

    for i in 0..8 {
        let value = if i % 2 == 0 { cl + 2.0 } else { cl - 2.0 };
        data.push(spc_point(&format!("mixed-{}", i), value, cl, sigma));
    }

    for i in 8..=16 {
        data.push(spc_point(&format!("below-{}", i), cl - 1.0, cl, sigma));
    }

    let alerts = check_western_electric_rules(&data[..17]);
    let shift = alerts
        .iter()
        .find(|a| matches!(a, SpecialCause::Shift { .. }));
    assert!(
        shift.is_some(),
        "C2 FAILED: Rule 2 must fire for 9 consecutive below-CL points"
    );

    if let Some(SpecialCause::Shift { direction, count }) = shift {
        assert_eq!(
            *direction,
            ShiftDirection::Below,
            "C2: below-CL shift direction must be Below"
        );
        assert_eq!(*count, 9, "C2: below-CL shift count must be 9");
    }
}

// ===========================================================================
// C3 — Rule 3 fires at exactly the 6th consecutive trending point
//
// Western Electric Rule 3: Six consecutive points steadily increasing or decreasing.
// Theorem: The rule fires when the trailing 6-point window is strictly monotone.
// ===========================================================================

#[test]
fn c3_rule3_fires_at_exactly_sixth_consecutive_increasing() {
    let cl = 50.0;
    let sigma = 5.0;

    let mut data: Vec<ChartData> = Vec::new();

    // Points 0-4: strictly DECREASING (prevents increasing-trend detection).
    for i in 0..5 {
        data.push(spc_point(
            &format!("dec-{}", i),
            cl + 10.0 - i as f64,
            cl,
            sigma,
        ));
    }

    // Points 5-10: strictly INCREASING — 6 consecutive monotone points.
    for i in 5..=10 {
        data.push(spc_point(
            &format!("inc-{}", i),
            cl + (i - 4) as f64,
            cl,
            sigma,
        ));
    }

    // Points 11-14: flat (confirms trend stops at plateau).
    for i in 11..15 {
        data.push(spc_point(&format!("flat-{}", i), cl + 6.0, cl, sigma));
    }

    // Before 6 increasing points fill the trailing-6 window, Rule 3 must NOT fire.
    for window_end in 9..=10 {
        let alerts = check_western_electric_rules(&data[..window_end]);
        assert!(
            !alerts
                .iter()
                .any(|a| matches!(a, SpecialCause::Trend { .. })),
            "C3 FAILED: Rule 3 must NOT fire at window_end={} \
             (not yet 6 consecutive increasing points)",
            window_end
        );
    }

    // At window_end=11, trailing 6 = indices 5..=10 (strictly increasing). Fires.
    let alerts_at_11 = check_western_electric_rules(&data[..11]);
    let trend = alerts_at_11
        .iter()
        .find(|a| matches!(a, SpecialCause::Trend { .. }));
    assert!(
        trend.is_some(),
        "C3 FAILED: Rule 3 must fire when trailing 6 points are monotone increasing (window_end=11)"
    );

    if let Some(SpecialCause::Trend { direction, count }) = trend {
        assert_eq!(
            *direction,
            TrendDirection::Increasing,
            "C3: Trend direction must be Increasing"
        );
        assert_eq!(
            *count, 6,
            "C3: Trend count must be exactly 6 (Western Electric Rule 3 window size)"
        );
    }

    // At window_end=12, latest 6 includes a flat point — Rule 3 must NOT fire.
    let alerts_at_12 = check_western_electric_rules(&data[..12]);
    assert!(
        !alerts_at_12
            .iter()
            .any(|a| matches!(a, SpecialCause::Trend { .. })),
        "C3 FAILED: Rule 3 must NOT fire when plateau breaks monotone trend (window_end=12)"
    );
}

#[test]
fn c3_rule3_fires_at_sixth_consecutive_decreasing() {
    let cl = 50.0;
    let sigma = 5.0;

    let mut data: Vec<ChartData> = Vec::new();

    // 5 increasing points to prevent premature decreasing-trend detection.
    for i in 0..5 {
        data.push(spc_point(
            &format!("inc-{}", i),
            cl + i as f64 + 1.0,
            cl,
            sigma,
        ));
    }

    // 6 strictly decreasing points.
    for i in 5..=10 {
        data.push(spc_point(
            &format!("dec-{}", i),
            cl + 10.0 - (i as f64 - 4.0),
            cl,
            sigma,
        ));
    }

    let alerts = check_western_electric_rules(&data[..11]);
    let trend = alerts
        .iter()
        .find(|a| matches!(a, SpecialCause::Trend { .. }));
    assert!(
        trend.is_some(),
        "C3 FAILED: Rule 3 must fire for 6 consecutive decreasing points"
    );

    if let Some(SpecialCause::Trend { direction, count }) = trend {
        assert_eq!(
            *direction,
            TrendDirection::Decreasing,
            "C3: Decreasing trend direction must be Decreasing"
        );
        assert_eq!(*count, 6, "C3: Decreasing trend count must be 6");
    }
}

// ===========================================================================
// C4 — Ring buffer evicts oldest entry when capacity=100 is exceeded
//
// Theorem: A ring buffer of capacity N holding N+1 insertions must contain
//          exactly N entries, with the first insertion evicted.
// ===========================================================================

#[test]
fn c4_ring_buffer_evicts_oldest_at_capacity_100() {
    const CAPACITY: usize = 100;
    let mut history = SpcHistory::new();

    // Insert CAPACITY + 1 snapshots with distinct timestamps and event_rates.
    for i in 0..=CAPACITY {
        history.record_snapshot(SpcSnapshot::new(
            format!("snap-{}", i),
            i as f64,
            100.0,
            0.85,
            0,
        ));
    }

    // After 101 insertions, buffer must hold exactly 100 entries.
    assert_eq!(
        history.history.len(),
        CAPACITY,
        "C4 FAILED: Ring buffer must hold exactly {} entries after {} insertions",
        CAPACITY,
        CAPACITY + 1
    );

    // The first entry (snap-0, event_rate=0.0) must be evicted.
    let has_snap_zero = history.history.iter().any(|s| s.timestamp == "snap-0");
    assert!(
        !has_snap_zero,
        "C4 FAILED: snap-0 must be evicted (oldest entry)"
    );

    // The second entry (snap-1) must now be the oldest retained.
    let oldest = history.history.iter().next().unwrap();
    assert_eq!(
        oldest.timestamp, "snap-1",
        "C4 FAILED: Oldest retained entry must be snap-1 (snap-0 was evicted)"
    );
    assert_eq!(
        oldest.event_rate, 1.0,
        "C4: Oldest retained event_rate must be 1.0 (0.0 was evicted)"
    );

    // The newest entry must be the last one inserted.
    let newest = history.history.iter().last().unwrap();
    assert_eq!(
        newest.timestamp,
        format!("snap-{}", CAPACITY),
        "C4: Newest entry must be snap-{}",
        CAPACITY
    );
}

#[test]
fn c4_ring_buffer_cycle_count_tracks_all_insertions_including_evicted() {
    let mut history = SpcHistory::new();
    let total_insertions: u64 = 150;

    for i in 0..total_insertions {
        history.record_snapshot(SpcSnapshot::new(
            format!("snap-{}", i),
            i as f64,
            100.0,
            0.85,
            0,
        ));
    }

    // cycle_count tracks all insertions (not capped by buffer capacity).
    assert_eq!(
        history.cycle_count, total_insertions,
        "C4: cycle_count must be {} (total insertions, including evicted). Got {}",
        total_insertions, history.cycle_count
    );

    // Buffer holds exactly 100 entries.
    assert_eq!(
        history.history.len(),
        100,
        "C4: Buffer must hold exactly 100 entries after {} insertions",
        total_insertions
    );

    // Oldest retained must be snap-50 (first 50 evicted).
    let oldest = history.history.iter().next().unwrap();
    assert_eq!(
        oldest.timestamp, "snap-50",
        "C4: After 150 insertions (capacity=100), oldest retained must be snap-50"
    );
}

// ===========================================================================
// C5 — SP-1 Regression: Rules 2 and 3 fire after buffer accumulation
//
// SP-1 Bug Description:
//   SPC was originally one-shot — it didn't accumulate history between checks.
//   Consequence: Rules 2 (9 consecutive) and 3 (6 trending) never fired.
//
// This regression test verifies that after accumulating points into the buffer,
// the rules can still fire. The key insight: check_western_electric_rules
// operates on a slice of ChartData constructed from accumulated data.
// ===========================================================================

#[test]
fn c5_sp1_regression_rule2_fires_after_buffer_accumulation() {
    let cl = 50.0;
    let sigma = 5.0;

    let mut chart_data: Vec<ChartData> = Vec::new();

    // 20 stable (mixed alternating above/below CL).
    for i in 0..20 {
        let value = if i % 2 == 0 { cl + 2.0 } else { cl - 2.0 };
        chart_data.push(spc_point(&format!("stable-{}", i), value, cl, sigma));
    }

    // Add 9 consecutive above-CL points (Rule 2 trigger).
    for i in 20..=28 {
        chart_data.push(spc_point(&format!("above-{}", i), cl + 1.0, cl, sigma));
    }

    // After 29 total points, trailing 9 = indices 20-28 (all above CL).
    let alerts = check_western_electric_rules(&chart_data);
    let shift = alerts
        .iter()
        .find(|a| matches!(a, SpecialCause::Shift { .. }));

    assert!(
        shift.is_some(),
        "C5 SP-1 REGRESSION: Rule 2 must fire after buffer accumulation of 20 stable + \
         9 above-CL points. If it doesn't fire, the SPC check is resetting history (SP-1 bug)."
    );

    if let Some(SpecialCause::Shift { direction, count }) = shift {
        assert_eq!(
            *direction,
            ShiftDirection::Above,
            "C5: Rule 2 shift direction must be Above"
        );
        assert_eq!(*count, 9, "C5: Rule 2 count must be 9");
    }
}

#[test]
fn c5_sp1_regression_rule3_fires_after_buffer_accumulation() {
    let cl = 50.0;
    let sigma = 5.0;

    let mut chart_data: Vec<ChartData> = Vec::new();

    // 20 stable points (alternating).
    for i in 0..20 {
        let value = if i % 2 == 0 { cl + 2.0 } else { cl - 1.0 };
        chart_data.push(spc_point(&format!("stable-{}", i), value, cl, sigma));
    }

    // 5 decreasing points (to prevent false increasing-trend).
    for i in 20..25 {
        chart_data.push(spc_point(
            &format!("dec-{}", i),
            cl + 10.0 - i as f64 * 0.5,
            cl,
            sigma,
        ));
    }

    // 6 strictly INCREASING points (Rule 3 trigger).
    for j in 0..6 {
        chart_data.push(spc_point(
            &format!("trend-{}", j),
            cl + j as f64 + 1.0,
            cl,
            sigma,
        ));
    }

    let alerts = check_western_electric_rules(&chart_data);
    let trend = alerts
        .iter()
        .find(|a| matches!(a, SpecialCause::Trend { .. }));

    assert!(
        trend.is_some(),
        "C5 SP-1 REGRESSION: Rule 3 must fire after buffer accumulation of 25 stable/decreasing + \
         6 increasing points. If it doesn't fire, the SPC check is resetting between calls (SP-1 bug)."
    );

    if let Some(SpecialCause::Trend { direction, count }) = trend {
        assert_eq!(
            *direction,
            TrendDirection::Increasing,
            "C5: Rule 3 trend direction must be Increasing"
        );
        assert_eq!(*count, 6, "C5: Rule 3 count must be 6");
    }
}

#[test]
fn c5_sp1_regression_spc_history_retains_data_across_record_calls() {
    // Direct SpcHistory test: verify that repeated record_snapshot() calls
    // accumulate data correctly (not one-shot).
    let mut history = SpcHistory::new();

    // Record 30 snapshots.
    for i in 0..30 {
        history.record_snapshot(SpcSnapshot::new(format!("snap-{}", i), 5.0, 150.0, 0.85, 0));
    }

    // History must have 30 entries (no reset between calls).
    assert_eq!(
        history.history.len(),
        30,
        "C5 SP-1: SpcHistory must retain all 30 snapshots across record_snapshot() calls. \
         If len < 30, the history is being reset (SP-1 bug). Got {}",
        history.history.len()
    );

    // Add 70 more snapshots (total 100, filling the buffer).
    for i in 30..100 {
        history.record_snapshot(SpcSnapshot::new(format!("snap-{}", i), 8.0, 200.0, 0.92, 0));
    }

    assert_eq!(
        history.history.len(),
        100,
        "C5 SP-1: SpcHistory must hold 100 entries at capacity. Got {}",
        history.history.len()
    );

    // Verify composition: first 30 have event_rate=5.0, next 70 have event_rate=8.0.
    let rates = history.get_event_rates();
    let count_5: usize = rates.iter().filter(|&&r| (r - 5.0).abs() < 1e-10).count();
    let count_8: usize = rates.iter().filter(|&&r| (r - 8.0).abs() < 1e-10).count();

    assert_eq!(
        count_5, 30,
        "C5: History must retain 30 snapshots with event_rate=5.0. Got {}",
        count_5
    );
    assert_eq!(
        count_8, 70,
        "C5: History must retain 70 snapshots with event_rate=8.0. Got {}",
        count_8
    );
}

// ===========================================================================
// C6 — Rule 4: 2 of 3 consecutive points beyond 2σ on the same side of CL
//
// Western Electric Rule 4 (classic): 2 of 3 consecutive points fall beyond
// the 2-sigma zone on the same side of the center line.
//
// Theorem:
//   The 2σ boundary is derived from control limits: sigma = (ucl - cl) / 3.
//   upper_2sigma = cl + 2 * sigma.
//   Rule fires when ≥ 2 of the latest 3 points exceed upper_2sigma (above)
//   or fall below lower_2sigma (below), on the SAME side.
//
// Oracle rank: Rank 1 (mathematical theorem — exact conditions).
// ===========================================================================

// ---------------------------------------------------------------------------
// C6-a: Rule 4 fires when exactly 2 of the last 3 points are beyond 2σ above CL
// ---------------------------------------------------------------------------

#[test]
fn c6_rule4_fires_when_2_of_3_beyond_2sigma_above() {
    let cl = 50.0;
    let sigma = 5.0; // UCL = cl + 3*sigma = 65.0
    let two_sigma_above = cl + 2.0 * sigma; // 60.0

    // Build 9 stable points (within 1-sigma of CL) to satisfy the 9-point minimum.
    let mut data: Vec<ChartData> = (0..7)
        .map(|i| ChartData {
            timestamp: format!("stable-{}", i),
            value: cl + 0.5 * sigma, // 52.5 — within 1-sigma, below 2-sigma
            ucl: cl + 3.0 * sigma,
            cl,
            lcl: cl - 3.0 * sigma,
            subgroup_data: None,
        })
        .collect();

    // Last 3: two points beyond 2σ above, one within 2σ.
    // Pattern: [beyond_2sigma, in_control, beyond_2sigma] → 2 of 3 above → fires.
    data.push(ChartData {
        timestamp: "beyond-1".to_string(),
        value: two_sigma_above + 1.0, // 61.0 — beyond 2-sigma, still within 3-sigma (UCL=65)
        ucl: cl + 3.0 * sigma,
        cl,
        lcl: cl - 3.0 * sigma,
        subgroup_data: None,
    });
    data.push(ChartData {
        timestamp: "in-control".to_string(),
        value: cl + 0.5 * sigma, // 52.5 — within 2-sigma
        ucl: cl + 3.0 * sigma,
        cl,
        lcl: cl - 3.0 * sigma,
        subgroup_data: None,
    });
    data.push(ChartData {
        timestamp: "beyond-2".to_string(),
        value: two_sigma_above + 1.0, // 61.0 — beyond 2-sigma
        ucl: cl + 3.0 * sigma,
        cl,
        lcl: cl - 3.0 * sigma,
        subgroup_data: None,
    });

    assert_eq!(data.len(), 10, "Test setup: 10 data points");

    let alerts = check_western_electric_rules(&data);

    let two_of_three = alerts
        .iter()
        .find(|a| matches!(a, SpecialCause::TwoOfThree { .. }));
    assert!(
        two_of_three.is_some(),
        "C6 FAILED: Rule 4 must fire when 2 of last 3 points ({}) exceed 2σ above CL ({}). \
         Got alerts: {:?}",
        two_sigma_above + 1.0,
        two_sigma_above,
        alerts
    );

    if let Some(SpecialCause::TwoOfThree { direction }) = two_of_three {
        assert_eq!(
            *direction,
            ShiftDirection::Above,
            "C6: TwoOfThree direction must be Above when beyond 2σ above CL"
        );
    }
}

// ---------------------------------------------------------------------------
// C6-b: Rule 4 fires when 2 of 3 beyond 2σ BELOW CL
// ---------------------------------------------------------------------------

#[test]
fn c6_rule4_fires_when_2_of_3_beyond_2sigma_below() {
    let cl = 50.0;
    let sigma = 5.0;
    let two_sigma_below = cl - 2.0 * sigma; // 40.0

    let mut data: Vec<ChartData> = (0..7)
        .map(|i| ChartData {
            timestamp: format!("stable-{}", i),
            value: cl - 0.5 * sigma, // 47.5 — within 1-sigma, above lower 2-sigma
            ucl: cl + 3.0 * sigma,
            cl,
            lcl: cl - 3.0 * sigma,
            subgroup_data: None,
        })
        .collect();

    // 2 of last 3: below the lower 2-sigma line.
    data.push(ChartData {
        timestamp: "beyond-below-1".to_string(),
        value: two_sigma_below - 1.0, // 39.0 — beyond 2-sigma below
        ucl: cl + 3.0 * sigma,
        cl,
        lcl: cl - 3.0 * sigma,
        subgroup_data: None,
    });
    data.push(ChartData {
        timestamp: "in-control".to_string(),
        value: cl - 0.5 * sigma, // 47.5 — within 2-sigma
        ucl: cl + 3.0 * sigma,
        cl,
        lcl: cl - 3.0 * sigma,
        subgroup_data: None,
    });
    data.push(ChartData {
        timestamp: "beyond-below-2".to_string(),
        value: two_sigma_below - 1.0, // 39.0 — beyond 2-sigma below
        ucl: cl + 3.0 * sigma,
        cl,
        lcl: cl - 3.0 * sigma,
        subgroup_data: None,
    });

    let alerts = check_western_electric_rules(&data);

    let two_of_three = alerts
        .iter()
        .find(|a| matches!(a, SpecialCause::TwoOfThree { .. }));
    assert!(
        two_of_three.is_some(),
        "C6 FAILED: Rule 4 must fire when 2 of last 3 points are beyond 2σ below CL. \
         Got alerts: {:?}",
        alerts
    );

    if let Some(SpecialCause::TwoOfThree { direction }) = two_of_three {
        assert_eq!(
            *direction,
            ShiftDirection::Below,
            "C6: TwoOfThree direction must be Below when 2 of 3 are below the 2σ lower line"
        );
    }
}

// ---------------------------------------------------------------------------
// C6-c: Rule 4 does NOT fire when only 1 of 3 is beyond 2σ
// ---------------------------------------------------------------------------

#[test]
fn c6_rule4_does_not_fire_when_only_1_of_3_beyond_2sigma() {
    let cl = 50.0;
    let sigma = 5.0;
    let two_sigma_above = cl + 2.0 * sigma; // 60.0

    // 9 stable points, then 2 in-control + 1 beyond 2sigma (only 1 of 3 → no fire).
    let mut data: Vec<ChartData> = (0..7)
        .map(|i| ChartData {
            timestamp: format!("stable-{}", i),
            value: cl + 0.5 * sigma,
            ucl: cl + 3.0 * sigma,
            cl,
            lcl: cl - 3.0 * sigma,
            subgroup_data: None,
        })
        .collect();

    data.push(ChartData {
        timestamp: "in-control-a".to_string(),
        value: cl + 0.5 * sigma, // within 2-sigma
        ucl: cl + 3.0 * sigma,
        cl,
        lcl: cl - 3.0 * sigma,
        subgroup_data: None,
    });
    data.push(ChartData {
        timestamp: "in-control-b".to_string(),
        value: cl + 0.5 * sigma, // within 2-sigma
        ucl: cl + 3.0 * sigma,
        cl,
        lcl: cl - 3.0 * sigma,
        subgroup_data: None,
    });
    data.push(ChartData {
        timestamp: "beyond-2sigma".to_string(),
        value: two_sigma_above + 1.0, // beyond 2-sigma — but only 1 of 3
        ucl: cl + 3.0 * sigma,
        cl,
        lcl: cl - 3.0 * sigma,
        subgroup_data: None,
    });

    let alerts = check_western_electric_rules(&data);

    let two_of_three = alerts
        .iter()
        .find(|a| matches!(a, SpecialCause::TwoOfThree { .. }));
    assert!(
        two_of_three.is_none(),
        "C6 boundary: Rule 4 must NOT fire when only 1 of last 3 points is beyond 2σ. \
         Got alerts: {:?}",
        alerts
    );
}

// ---------------------------------------------------------------------------
// C6-d: Rule 4 does NOT fire when 2 of 3 are beyond 2σ but on OPPOSITE sides
// ---------------------------------------------------------------------------

#[test]
fn c6_rule4_does_not_fire_when_2_of_3_on_opposite_sides() {
    let cl = 50.0;
    let sigma = 5.0;
    let two_sigma_above = cl + 2.0 * sigma; // 60.0
    let two_sigma_below = cl - 2.0 * sigma; // 40.0

    // 7 stable, then: one beyond 2σ above, one in-control, one beyond 2σ below.
    // Both sides have 1 point beyond 2σ — not ≥2 on the same side.
    let mut data: Vec<ChartData> = (0..7)
        .map(|i| ChartData {
            timestamp: format!("stable-{}", i),
            value: cl + 0.3 * sigma,
            ucl: cl + 3.0 * sigma,
            cl,
            lcl: cl - 3.0 * sigma,
            subgroup_data: None,
        })
        .collect();

    data.push(ChartData {
        timestamp: "above".to_string(),
        value: two_sigma_above + 1.0, // beyond 2σ ABOVE
        ucl: cl + 3.0 * sigma,
        cl,
        lcl: cl - 3.0 * sigma,
        subgroup_data: None,
    });
    data.push(ChartData {
        timestamp: "in-control".to_string(),
        value: cl + 0.3 * sigma,
        ucl: cl + 3.0 * sigma,
        cl,
        lcl: cl - 3.0 * sigma,
        subgroup_data: None,
    });
    data.push(ChartData {
        timestamp: "below".to_string(),
        value: two_sigma_below - 1.0, // beyond 2σ BELOW
        ucl: cl + 3.0 * sigma,
        cl,
        lcl: cl - 3.0 * sigma,
        subgroup_data: None,
    });

    let alerts = check_western_electric_rules(&data);

    let two_of_three = alerts
        .iter()
        .find(|a| matches!(a, SpecialCause::TwoOfThree { .. }));
    assert!(
        two_of_three.is_none(),
        "C6 side-check: Rule 4 must NOT fire when 2 of 3 beyond 2σ are on OPPOSITE sides. \
         Got alerts: {:?}",
        alerts
    );
}

// ---------------------------------------------------------------------------
// C6-e: Rule 4 fires at exactly the 3rd point (boundary precision)
// ---------------------------------------------------------------------------

#[test]
fn c6_rule4_fires_at_exact_third_point_in_window() {
    let cl = 50.0;
    let sigma = 5.0;
    let two_sigma_above = cl + 2.0 * sigma; // 60.0

    // 9 stable points (all within 1-sigma).
    let mut data: Vec<ChartData> = (0..9)
        .map(|i| ChartData {
            timestamp: format!("stable-{}", i),
            value: cl + 0.5 * sigma,
            ucl: cl + 3.0 * sigma,
            cl,
            lcl: cl - 3.0 * sigma,
            subgroup_data: None,
        })
        .collect();

    // Rule 4 must NOT fire on this 9-stable baseline.
    let alerts_before = check_western_electric_rules(&data);
    assert!(
        !alerts_before
            .iter()
            .any(|a| matches!(a, SpecialCause::TwoOfThree { .. })),
        "C6-e: Rule 4 must NOT fire on 9 stable in-control points. Got: {:?}",
        alerts_before
    );

    // Add 2 points beyond 2σ above (making last 3: stable, beyond, beyond).
    // After adding the 10th point (1st beyond-2sigma), last 3 = [stable, stable, beyond] → 1 of 3 → no fire.
    data.push(ChartData {
        timestamp: "beyond-1".to_string(),
        value: two_sigma_above + 1.0,
        ucl: cl + 3.0 * sigma,
        cl,
        lcl: cl - 3.0 * sigma,
        subgroup_data: None,
    });
    let alerts_after_10 = check_western_electric_rules(&data);
    assert!(
        !alerts_after_10
            .iter()
            .any(|a| matches!(a, SpecialCause::TwoOfThree { .. })),
        "C6-e: Rule 4 must NOT fire with only 1 of last 3 beyond 2σ (10 points). Got: {:?}",
        alerts_after_10
    );

    // Add the 11th point: another beyond-2sigma. Last 3 = [stable, beyond, beyond] → 2 of 3 → fires.
    data.push(ChartData {
        timestamp: "beyond-2".to_string(),
        value: two_sigma_above + 1.0,
        ucl: cl + 3.0 * sigma,
        cl,
        lcl: cl - 3.0 * sigma,
        subgroup_data: None,
    });
    let alerts_after_11 = check_western_electric_rules(&data);
    let two_of_three = alerts_after_11
        .iter()
        .find(|a| matches!(a, SpecialCause::TwoOfThree { .. }));
    assert!(
        two_of_three.is_some(),
        "C6-e: Rule 4 must fire exactly when 2 of last 3 are beyond 2σ (11 points). Got: {:?}",
        alerts_after_11
    );

    if let Some(SpecialCause::TwoOfThree { direction }) = two_of_three {
        assert_eq!(
            *direction,
            ShiftDirection::Above,
            "C6-e: TwoOfThree direction must be Above"
        );
    }
}
