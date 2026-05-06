//! Prediction Anti-Leakage Tests — Gap E adversarial suite
//!
//! Verifies that feature extraction does NOT leak future information into
//! prefix features, and validates mathematical properties of all resource-
//! prediction primitives.
//!
//! Oracle hierarchy applied:
//!   Rank 1 — Mathematical theorem (probability axioms, M/M/1 stability, UCB1)
//!   Rank 2 — Domain contract (rework semantics, prefix feature semantics)
//!
//! Gap E: anti-leakage guards for the predictive process mining layer.

use wasm4pm::prediction_additions::{calculate_rework_score, extract_prefix_features};
use wasm4pm::prediction_resource::{
    BanditArm, BanditState, compute_queue_delay, compute_ucb1_selection,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn sv(items: &[&str]) -> Vec<String> {
    items.iter().map(|s| s.to_string()).collect()
}

// ===========================================================================
// Test 1: prefix features do not contain future activities
// ===========================================================================

/// ANTI-LEAKAGE: future activities must not appear in prefix features.
///
/// The `last_activity` field of PrefixFeatures must be the last activity of
/// the *prefix* — not any activity that comes after it in the complete trace.
#[test]
fn prefix_features_do_not_contain_future_activities() {
    // Full trace: A→B→C→D.  We extract features for prefix [A, B].
    let prefix = sv(&["A", "B"]);
    let features = extract_prefix_features(&prefix);

    // The last activity in the prefix is B — not C or D
    assert_eq!(
        features.last_activity, "B",
        "last_activity must be the last prefix element, not a future activity"
    );

    // unique_activities counts only A and B (prefix), not C or D
    assert_eq!(
        features.unique_activities, 2,
        "unique_activities must count only prefix activities (A, B), got {}",
        features.unique_activities
    );

    // length reflects the prefix length, not the full trace
    assert_eq!(
        features.length, 2,
        "feature length must equal prefix length (2), not full trace length (4)"
    );
}

// ===========================================================================
// Test 2: unique activities in prefix bounded by prefix length
// ===========================================================================

/// Rank 1 mathematical: a prefix of length k can contain at most k unique
/// activities (one per event).
#[test]
fn unique_activities_in_prefix_bounded_by_prefix_length() {
    let cases: &[&[&str]] = &[
        &["A"],
        &["A", "B"],
        &["A", "B", "C", "D"],
        &["A", "B", "A", "C"],   // repeated A — still ≤ len
        &["A", "A", "A", "A"],   // all same
    ];

    for &activities in cases {
        let prefix = sv(activities);
        let features = extract_prefix_features(&prefix);
        assert!(
            features.unique_activities <= prefix.len(),
            "prefix {:?}: unique_activities {} must be ≤ prefix length {}",
            activities,
            features.unique_activities,
            prefix.len()
        );
    }
}

// ===========================================================================
// Test 3: rework count is zero for a non-repeating prefix
// ===========================================================================

/// Rank 2: a prefix with no consecutive repeated activities has rework_count = 0.
/// Rework requires at least one activity to appear immediately after itself.
#[test]
fn rework_count_is_zero_for_non_repeating_prefix() {
    // [A, B, C] — all distinct, no consecutive repeats
    let prefix = sv(&["A", "B", "C"]);
    let rework = calculate_rework_score(&prefix);
    assert_eq!(
        rework, 0,
        "prefix [A, B, C] has no consecutive repeats, rework must be 0, got {}",
        rework
    );
}

// ===========================================================================
// Test 4: rework count equals number of consecutive repetitions
// ===========================================================================

/// Rank 2: rework count = number of positions i where trace[i] == trace[i-1].
/// First occurrence is not rework; each subsequent consecutive occurrence is.
#[test]
fn rework_count_equals_repetitions_for_repeating_prefix() {
    // [A, B, A, C, A] — A appears 3 times but never consecutively
    let prefix_no_consecutive = sv(&["A", "B", "A", "C", "A"]);
    let rework1 = calculate_rework_score(&prefix_no_consecutive);
    // No consecutive repeats → rework = 0
    assert_eq!(
        rework1, 0,
        "non-consecutive repetitions must not count as rework, got {}",
        rework1
    );

    // [A, A, B, A, A, A] — consecutive pairs: (0,1), (3,4), (4,5) → rework = 3
    let prefix_consecutive = sv(&["A", "A", "B", "A", "A", "A"]);
    let rework2 = calculate_rework_score(&prefix_consecutive);
    assert_eq!(
        rework2, 3,
        "three consecutive pairs must yield rework_count = 3, got {}",
        rework2
    );
}

// ===========================================================================
// Test 5: entropy of prefix in [0, 1] range (normalized)
// ===========================================================================

/// Rank 1: normalized entropy must be bounded in [0, 1].
/// entropy=0 means one activity dominates; entropy=1 means uniform distribution.
#[test]
fn entropy_of_prefix_in_zero_one_range() {
    let cases: &[&[&str]] = &[
        &["A", "B"],
        &["A", "B", "C"],
        &["A", "A", "B", "B"],
        &["A", "B", "C", "D", "E"],
        &["A", "A", "A", "A"],   // certain — entropy near 0
    ];

    for &activities in cases {
        let prefix = sv(activities);
        let features = extract_prefix_features(&prefix);
        let ent = features.activity_frequency_entropy;
        assert!(
            (0.0..=1.0 + 1e-9).contains(&ent),
            "prefix {:?}: normalized entropy {} must be in [0, 1]",
            activities,
            ent
        );
        assert!(
            ent.is_finite(),
            "prefix {:?}: entropy {} must be finite",
            activities,
            ent
        );
    }
}

// ===========================================================================
// Test 6: M/M/1 queue approaches infinity at full utilization
// ===========================================================================

/// Rank 1 mathematical: M/M/1 queue with ρ ≥ 1 (arrival_rate ≥ service_rate)
/// is unstable — mean waiting time → ∞.
#[test]
fn mm1_queue_approaches_infinity_at_full_utilization() {
    // Stable: λ < μ
    let stable = compute_queue_delay(0.5, 1.0).unwrap();
    assert!(
        stable.is_stable,
        "queue with ρ=0.5 must be stable"
    );
    assert!(
        stable.wait_time.is_finite() && stable.wait_time >= 0.0,
        "stable queue must have finite non-negative wait time, got {}",
        stable.wait_time
    );

    // Unstable: λ = μ  (ρ = 1.0)
    let at_capacity = compute_queue_delay(1.0, 1.0).unwrap();
    assert!(
        !at_capacity.is_stable,
        "queue with ρ=1.0 must be unstable"
    );
    assert!(
        at_capacity.wait_time.is_infinite(),
        "unstable queue (ρ=1) must have infinite wait time, got {}",
        at_capacity.wait_time
    );

    // Overloaded: λ > μ  (ρ > 1.0)
    let overloaded = compute_queue_delay(2.0, 1.0).unwrap();
    assert!(
        !overloaded.is_stable,
        "queue with ρ=2.0 must be unstable"
    );
    assert!(
        overloaded.wait_time.is_infinite(),
        "overloaded queue (ρ>1) must have infinite wait time, got {}",
        overloaded.wait_time
    );
}

// ===========================================================================
// Test 7: UCB1 explores unvisited arm before exploiting
// ===========================================================================

/// Rank 1 UCB1: an unvisited arm has an infinite upper confidence bound
/// and must always be selected before any visited arm.
#[test]
fn ucb1_explores_unvisited_arm_before_exploiting() {
    // arm0: visited 10 times, high mean reward 0.9
    // arm1: unvisited (pull_count = 0)
    // arm2: unvisited (pull_count = 0)
    let state = BanditState {
        arms: vec![
            BanditArm {
                name: "arm0".to_string(),
                total_reward: 9.0,
                pull_count: 10,
            },
            BanditArm {
                name: "arm1".to_string(),
                total_reward: 0.0,
                pull_count: 0,
            },
            BanditArm {
                name: "arm2".to_string(),
                total_reward: 0.0,
                pull_count: 0,
            },
        ],
        total_pulls: 10,
    };

    let result = compute_ucb1_selection(&state, 1.414).unwrap();

    // Rank 1 UCB1: unvisited arm has infinite upper confidence bound →
    // must be selected over arm0 (which has a finite UCB score)
    assert_ne!(
        result.selected, "arm0",
        "UCB1 must not select the visited arm when unvisited arms exist"
    );
    assert!(
        result.selected == "arm1" || result.selected == "arm2",
        "UCB1 must select an unvisited arm (arm1 or arm2), got {}",
        result.selected
    );
    // The UCB score for an unvisited arm is infinity
    assert!(
        result.ucb_score.is_infinite(),
        "unvisited arm must have infinite UCB score, got {}",
        result.ucb_score
    );
}

// ===========================================================================
// Test 8: prediction features reflect prefix length normalization
// ===========================================================================

/// Rank 2: prefix features must be properly normalized by prefix context —
/// the `length` field must equal the actual prefix length, and `unique_activities`
/// must be consistent with the prefix content (not the full trace).
#[test]
fn prediction_features_are_prefix_length_normalized() {
    // Full trace: A→B→C→D→E.
    // Features for prefix [A, B] must reflect only 2 completed activities.
    let prefix_len2 = sv(&["A", "B"]);
    let features_len2 = extract_prefix_features(&prefix_len2);

    // Features for prefix [A, B, C, D] must reflect 4 completed activities.
    let prefix_len4 = sv(&["A", "B", "C", "D"]);
    let features_len4 = extract_prefix_features(&prefix_len4);

    // Rank 2: length field must equal actual prefix length
    assert_eq!(
        features_len2.length, 2,
        "prefix [A,B] length feature must be 2, got {}",
        features_len2.length
    );
    assert_eq!(
        features_len4.length, 4,
        "prefix [A,B,C,D] length feature must be 4, got {}",
        features_len4.length
    );

    // Rank 2: longer prefix has more unique activities
    assert!(
        features_len4.unique_activities >= features_len2.unique_activities,
        "longer prefix must have at least as many unique activities: {} vs {}",
        features_len4.unique_activities,
        features_len2.unique_activities
    );

    // Rank 2: last_activity must reflect the prefix's last element
    assert_eq!(
        features_len2.last_activity, "B",
        "prefix [A,B] last_activity must be B"
    );
    assert_eq!(
        features_len4.last_activity, "D",
        "prefix [A,B,C,D] last_activity must be D"
    );
}
