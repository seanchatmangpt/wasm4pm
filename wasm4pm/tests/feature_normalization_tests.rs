//! Property-based tests for Category F: Feature Normalization.
//!
//! Validates that the 8 RlState feature dimensions are correctly quantized
//! within their declared bounds, that edge-case inputs (NaN, infinity, negative,
//! out-of-range, zero-length) do not panic, and that normalization properties
//! hold (monotonicity, clamping, padding, independence).
//!
//! These are cheap tests designed to run on every commit.

use pictl::{create_rl_state, rl_state_from_features, rl_state_health_level, RlState};

/// Declared upper bounds for each RlState field (verified against lib.rs).
const HEALTH_LEVEL_MAX: u8 = 4;
const EVENT_RATE_Q_MAX: u8 = 7;
const ACTIVITY_COUNT_Q_MAX: u8 = 7;
const SPC_ALERT_LEVEL_MAX: u8 = 3;
const DRIFT_STATUS_MAX: u8 = 2;
const REWORK_RATIO_Q_MAX: u8 = 7;
const CIRCUIT_STATE_MAX: u8 = 2; // actually 0 or 1 in practice, but max is 2
const CYCLE_PHASE_MAX: u8 = 3;

/// Assert that every field in the state is within its declared [0, MAX] range.
fn assert_fields_in_bounds(state: &RlState) {
    assert!(
        state.health_level <= HEALTH_LEVEL_MAX,
        "health_level {} exceeds max {}",
        state.health_level,
        HEALTH_LEVEL_MAX
    );
    assert!(
        state.event_rate_q <= EVENT_RATE_Q_MAX,
        "event_rate_q {} exceeds max {}",
        state.event_rate_q,
        EVENT_RATE_Q_MAX
    );
    assert!(
        state.activity_count_q <= ACTIVITY_COUNT_Q_MAX,
        "activity_count_q {} exceeds max {}",
        state.activity_count_q,
        ACTIVITY_COUNT_Q_MAX
    );
    assert!(
        state.spc_alert_level <= SPC_ALERT_LEVEL_MAX,
        "spc_alert_level {} exceeds max {}",
        state.spc_alert_level,
        SPC_ALERT_LEVEL_MAX
    );
    assert!(
        state.drift_status <= DRIFT_STATUS_MAX,
        "drift_status {} exceeds max {}",
        state.drift_status,
        DRIFT_STATUS_MAX
    );
    assert!(
        state.rework_ratio_q <= REWORK_RATIO_Q_MAX,
        "rework_ratio_q {} exceeds max {}",
        state.rework_ratio_q,
        REWORK_RATIO_Q_MAX
    );
    assert!(
        state.circuit_state <= CIRCUIT_STATE_MAX,
        "circuit_state {} exceeds max {}",
        state.circuit_state,
        CIRCUIT_STATE_MAX
    );
    assert!(
        state.cycle_phase <= CYCLE_PHASE_MAX,
        "cycle_phase {} exceeds max {}",
        state.cycle_phase,
        CYCLE_PHASE_MAX
    );
}

// ---------------------------------------------------------------------------
// Test 1: All quantized fields stay within declared bounds
// ---------------------------------------------------------------------------

#[test]
fn test_all_fields_within_declared_bounds_extreme_values() {
    // Alternating extremes: 0.0 and 1.0
    let features = [0.0, 1.0, 0.0, 1.0, 0.0, 1.0, 0.0, 1.0];
    let state = rl_state_from_features(&features, 2, 0.5);
    assert_fields_in_bounds(&state);
}

#[test]
fn test_all_fields_within_declared_bounds_mid_values() {
    let features = [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5];
    let state = rl_state_from_features(&features, 2, 0.5);
    assert_fields_in_bounds(&state);
}

#[test]
fn test_all_fields_within_declared_bounds_all_zeros() {
    let features = [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0];
    let state = rl_state_from_features(&features, 0, 0.0);
    assert_fields_in_bounds(&state);
}

#[test]
fn test_all_fields_within_declared_bounds_all_ones() {
    let features = [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0];
    let state = rl_state_from_features(&features, 4, 1.0);
    assert_fields_in_bounds(&state);
}

#[test]
fn test_all_fields_within_declared_bounds_direct_construction() {
    // Direct construction via create_rl_state -- verifies bounds at every boundary
    let state = create_rl_state(4, 7, 7, 3, 2, 7, 2, 3);
    assert_fields_in_bounds(&state);
    assert_eq!(state.health_level, 4);
    assert_eq!(state.event_rate_q, 7);
    assert_eq!(state.activity_count_q, 7);
    assert_eq!(state.spc_alert_level, 3);
    assert_eq!(state.drift_status, 2);
    assert_eq!(state.rework_ratio_q, 7);
    assert_eq!(state.circuit_state, 2);
    assert_eq!(state.cycle_phase, 3);
}

#[test]
fn test_all_fields_within_declared_bounds_zero_construction() {
    let state = create_rl_state(0, 0, 0, 0, 0, 0, 0, 0);
    assert_fields_in_bounds(&state);
}

// ---------------------------------------------------------------------------
// Test 2: Feature vector [0,1] input produces valid state
// ---------------------------------------------------------------------------

#[test]
fn test_unit_feature_vector_all_zeros_produces_valid_state() {
    let features = [0.0f32; 8];
    let state = rl_state_from_features(&features, 0, 0.0);
    assert_fields_in_bounds(&state);
    assert_eq!(state.health_level, 0);
}

#[test]
fn test_unit_feature_vector_all_ones_produces_valid_state() {
    let features = [1.0f32; 8];
    let state = rl_state_from_features(&features, 4, 1.0);
    assert_fields_in_bounds(&state);
    assert_eq!(state.health_level, 4);
}

#[test]
fn test_unit_feature_individual_zero_features() {
    // Set each feature to 0.0 individually, others at 0.5
    for i in 0..8 {
        let mut features = [0.5f32; 8];
        features[i] = 0.0;
        let state = rl_state_from_features(&features, 2, 0.5);
        assert_fields_in_bounds(&state);
    }
}

#[test]
fn test_unit_feature_individual_one_features() {
    // Set each feature to 1.0 individually, others at 0.5
    for i in 0..8 {
        let mut features = [0.5f32; 8];
        features[i] = 1.0;
        let state = rl_state_from_features(&features, 2, 0.5);
        assert_fields_in_bounds(&state);
    }
}

// ---------------------------------------------------------------------------
// Test 3: Out-of-range features are clamped (no panic)
// ---------------------------------------------------------------------------

#[test]
fn test_out_of_range_negative_one() {
    let features = [-1.0f32; 8];
    let state = rl_state_from_features(&features, 2, -1.0);
    // Must not panic. Negative values are cast to u32 which wraps, but
    // match arms have catch-all branches so no invalid index.
    assert_fields_in_bounds(&state);
}

#[test]
fn test_out_of_range_two() {
    let features = [2.0f32; 8];
    let state = rl_state_from_features(&features, 2, 2.0);
    // Must not panic. Values > 1.0 produce larger u32 counts, but match arms
    // catch all with `_ => MAX` branches.
    assert_fields_in_bounds(&state);
}

#[test]
fn test_out_of_range_f32_max() {
    let features = [f32::MAX; 8];
    let state = rl_state_from_features(&features, 2, f32::MAX);
    // f32::MAX * 10000.0 overflows to u32::MAX, but match arms catch it.
    assert_fields_in_bounds(&state);
}

#[test]
fn test_out_of_range_f32_nan() {
    let features = [f32::NAN; 8];
    let state = rl_state_from_features(&features, 2, f32::NAN);
    // NaN comparisons return false, so NaN < threshold is false.
    // This means drift_status will be 2 (the else branch).
    // Cast NaN to u32 is 0 in safe Rust (saturating cast via `as`).
    // Must not panic.
    assert_fields_in_bounds(&state);
}

#[test]
fn test_out_of_range_f32_infinity() {
    let features = [f32::INFINITY; 8];
    let state = rl_state_from_features(&features, 2, f32::INFINITY);
    assert_fields_in_bounds(&state);
}

#[test]
fn test_out_of_range_f32_neg_infinity() {
    let features = [f32::NEG_INFINITY; 8];
    let state = rl_state_from_features(&features, 2, f32::NEG_INFINITY);
    assert_fields_in_bounds(&state);
}

// ---------------------------------------------------------------------------
// Test 4: Short feature vector pads with zeros
// ---------------------------------------------------------------------------

#[test]
fn test_short_feature_vector_two_elements() {
    let features_short = vec![0.5f32, 0.5];
    let features_padded = [0.5f32, 0.5, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0];

    let state_short = rl_state_from_features(&features_short, 1, 0.0);
    let state_padded = RlState::from_features(&features_padded, 1, 0.0);

    assert_eq!(state_short, state_padded, "Short slice should pad with zeros");
}

#[test]
fn test_short_feature_vector_one_element() {
    let features_short = vec![0.8f32];
    let features_padded = [0.8f32, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0];

    let state_short = rl_state_from_features(&features_short, 0, 0.0);
    let state_padded = RlState::from_features(&features_padded, 0, 0.0);

    assert_eq!(state_short, state_padded);
}

#[test]
fn test_short_feature_vector_five_elements() {
    let features_short = vec![0.1f32, 0.2, 0.3, 0.4, 0.5];
    let features_padded = [0.1f32, 0.2, 0.3, 0.4, 0.5, 0.0, 0.0, 0.0];

    let state_short = rl_state_from_features(&features_short, 2, 0.3);
    let state_padded = RlState::from_features(&features_padded, 2, 0.3);

    assert_eq!(state_short, state_padded);
}

#[test]
fn test_short_feature_vector_seven_elements() {
    let features_short = vec![0.1f32, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7];
    let features_padded = [0.1f32, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.0];

    let state_short = rl_state_from_features(&features_short, 1, 0.2);
    let state_padded = RlState::from_features(&features_padded, 1, 0.2);

    assert_eq!(state_short, state_padded);
}

// ---------------------------------------------------------------------------
// Test 5: Empty feature vector produces valid state
// ---------------------------------------------------------------------------

#[test]
fn test_empty_feature_vector_produces_valid_state() {
    let features: Vec<f32> = vec![];
    let state = rl_state_from_features(&features, 0, 0.0);

    assert_fields_in_bounds(&state);
    assert_eq!(state.health_level, 0);
}

#[test]
fn test_empty_feature_vector_matches_all_zeros() {
    let features_empty: Vec<f32> = vec![];
    let features_zeros = [0.0f32; 8];

    let state_empty = rl_state_from_features(&features_empty, 3, 0.5);
    let state_zeros = RlState::from_features(&features_zeros, 3, 0.5);

    assert_eq!(state_empty, state_zeros, "Empty slice should produce same state as all-zeros");
}

#[test]
fn test_empty_feature_various_health_levels() {
    let features: Vec<f32> = vec![];
    for health in 0..=4u8 {
        let state = rl_state_from_features(&features, health, 0.0);
        assert_fields_in_bounds(&state);
        assert_eq!(state.health_level, health);
    }
}

// ---------------------------------------------------------------------------
// Test 6: Quantization is monotonic
// ---------------------------------------------------------------------------

#[test]
fn test_quantization_event_rate_is_monotonic() {
    // features[0] maps to event_rate_q via quantize_event_rate
    let low = 0.1f32;
    let mid = 0.5f32;
    let high = 0.9f32;

    let state_low = RlState::from_features(&[low, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0], 0, 0.0);
    let state_mid = RlState::from_features(&[mid, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0], 0, 0.0);
    let state_high = RlState::from_features(&[high, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0], 0, 0.0);

    assert!(
        state_low.event_rate_q <= state_mid.event_rate_q,
        "event_rate_q should be monotonically non-decreasing: low={}, mid={}",
        state_low.event_rate_q,
        state_mid.event_rate_q
    );
    assert!(
        state_mid.event_rate_q <= state_high.event_rate_q,
        "event_rate_q should be monotonically non-decreasing: mid={}, high={}",
        state_mid.event_rate_q,
        state_high.event_rate_q
    );
}

#[test]
fn test_quantization_activity_count_is_monotonic() {
    // features[2] maps to activity_count_q via quantize_activity_count
    let low = 0.05f32;  // 5 activities
    let mid = 0.30f32;  // 30 activities
    let high = 0.80f32; // 80 activities

    let state_low = RlState::from_features(&[0.0, 0.0, low, 0.0, 0.0, 0.0, 0.0, 0.0], 0, 0.0);
    let state_mid = RlState::from_features(&[0.0, 0.0, mid, 0.0, 0.0, 0.0, 0.0, 0.0], 0, 0.0);
    let state_high = RlState::from_features(&[0.0, 0.0, high, 0.0, 0.0, 0.0, 0.0, 0.0], 0, 0.0);

    assert!(
        state_low.activity_count_q <= state_mid.activity_count_q,
        "activity_count_q should be monotonically non-decreasing: low={}, mid={}",
        state_low.activity_count_q,
        state_mid.activity_count_q
    );
    assert!(
        state_mid.activity_count_q <= state_high.activity_count_q,
        "activity_count_q should be monotonically non-decreasing: mid={}, high={}",
        state_mid.activity_count_q,
        state_high.activity_count_q
    );
}

#[test]
fn test_quantization_spc_alerts_is_monotonic() {
    // features[5] maps to spc_alert_level
    let low = 0.0f32;   // 0 alerts
    let mid = 0.3f32;   // 3 alerts
    let high = 0.8f32;  // 8 alerts

    let state_low = RlState::from_features(&[0.0, 0.0, 0.0, 0.0, 0.0, low, 0.0, 0.0], 0, 0.0);
    let state_mid = RlState::from_features(&[0.0, 0.0, 0.0, 0.0, 0.0, mid, 0.0, 0.0], 0, 0.0);
    let state_high = RlState::from_features(&[0.0, 0.0, 0.0, 0.0, 0.0, high, 0.0, 0.0], 0, 0.0);

    assert!(
        state_low.spc_alert_level <= state_mid.spc_alert_level,
        "spc_alert_level should be monotonically non-decreasing: low={}, mid={}",
        state_low.spc_alert_level,
        state_mid.spc_alert_level
    );
    assert!(
        state_mid.spc_alert_level <= state_high.spc_alert_level,
        "spc_alert_level should be monotonically non-decreasing: mid={}, high={}",
        state_mid.spc_alert_level,
        state_high.spc_alert_level
    );
}

#[test]
fn test_quantization_cycle_phase_is_monotonic() {
    // features[7] maps to cycle_phase
    let low = 0.005f32; // 5 cycles
    let mid = 0.030f32; // 30 cycles
    let high = 0.200f32; // 200 cycles

    let state_low = RlState::from_features(&[0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, low], 0, 0.0);
    let state_mid = RlState::from_features(&[0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, mid], 0, 0.0);
    let state_high = RlState::from_features(&[0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, high], 0, 0.0);

    assert!(
        state_low.cycle_phase <= state_mid.cycle_phase,
        "cycle_phase should be monotonically non-decreasing: low={}, mid={}",
        state_low.cycle_phase,
        state_mid.cycle_phase
    );
    assert!(
        state_mid.cycle_phase <= state_high.cycle_phase,
        "cycle_phase should be monotonically non-decreasing: mid={}, high={}",
        state_mid.cycle_phase,
        state_high.cycle_phase
    );
}

#[test]
fn test_quantization_rework_ratio_is_monotonic() {
    // rework_ratio param maps to rework_ratio_q
    let low = 0.03f32;  // 3%
    let mid = 0.30f32;  // 30%
    let high = 0.90f32; // 90%

    let state_low = RlState::from_features(&[0.0; 8], 0, low);
    let state_mid = RlState::from_features(&[0.0; 8], 0, mid);
    let state_high = RlState::from_features(&[0.0; 8], 0, high);

    assert!(
        state_low.rework_ratio_q <= state_mid.rework_ratio_q,
        "rework_ratio_q should be monotonically non-decreasing: low={}, mid={}",
        state_low.rework_ratio_q,
        state_mid.rework_ratio_q
    );
    assert!(
        state_mid.rework_ratio_q <= state_high.rework_ratio_q,
        "rework_ratio_q should be monotonically non-decreasing: mid={}, high={}",
        state_mid.rework_ratio_q,
        state_high.rework_ratio_q
    );
}

// ---------------------------------------------------------------------------
// Test 7: Health level is independent of features
// ---------------------------------------------------------------------------

#[test]
fn test_health_level_set_explicitly_zero() {
    // Features are all 1.0 (max), but health should still be 0
    let features = [1.0f32; 8];
    let state = rl_state_from_features(&features, 0, 0.5);
    assert_eq!(state.health_level, 0);
}

#[test]
fn test_health_level_set_explicitly_four() {
    // Features are all 0.0 (min), but health should still be 4
    let features = [0.0f32; 8];
    let state = rl_state_from_features(&features, 4, 0.5);
    assert_eq!(state.health_level, 4);
}

#[test]
fn test_health_level_independent_of_all_feature_values() {
    // Same features, different health levels
    let features = [0.3, 0.7, 0.5, 0.2, 0.1, 0.4, 0.6, 0.8];

    for health in 0..=4u8 {
        let state = rl_state_from_features(&features, health, 0.5);
        assert_eq!(
            state.health_level,
            health,
            "health_level should be {} but got {}",
            health,
            state.health_level
        );
    }
}

#[test]
fn test_health_level_independent_of_feature_three() {
    // features[3] = health_level / 4 in the feature vector, but it is NOT used
    // to set health_level -- the explicit parameter takes precedence
    let features_low = [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0];
    let features_high = [0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0];

    let state_low = rl_state_from_features(&features_low, 3, 0.0);
    let state_high = rl_state_from_features(&features_high, 3, 0.0);

    assert_eq!(state_low.health_level, state_high.health_level);
    assert_eq!(state_low.health_level, 3);
}

#[test]
fn test_health_level_independent_via_direct_construction() {
    for health in 0..=4u8 {
        let state = create_rl_state(health, 0, 0, 0, 0, 0, 0, 0);
        assert_eq!(state.health_level, health);
    }
}

// ---------------------------------------------------------------------------
// Test 8: Roundtrip extraction preserves health
// ---------------------------------------------------------------------------

#[test]
fn test_health_level_roundtrip_all_levels() {
    for health in 0..=4u8 {
        let state = create_rl_state(health, 0, 0, 0, 0, 0, 0, 0);
        let extracted = rl_state_health_level(&state);
        assert_eq!(
            extracted, health,
            "Roundtrip failed: set health={}, got health={}",
            health,
            extracted
        );
    }
}

#[test]
fn test_health_level_roundtrip_from_features() {
    let features = [0.1, 0.3, 0.5, 0.2, 0.0, 0.1, 0.4, 0.05];
    for health in 0..=4u8 {
        let state = rl_state_from_features(&features, health, 0.5);
        let extracted = rl_state_health_level(&state);
        assert_eq!(extracted, health);
    }
}

#[test]
fn test_health_level_roundtrip_create_then_extract_then_create() {
    let original_health = 3u8;
    let state1 = create_rl_state(original_health, 5, 3, 2, 1, 4, 1, 2);
    let extracted = rl_state_health_level(&state1);
    let state2 = create_rl_state(extracted, 0, 0, 0, 0, 0, 0, 0);

    assert_eq!(extracted, original_health);
    assert_eq!(rl_state_health_level(&state2), original_health);
}

// ---------------------------------------------------------------------------
// Test 9: State memory size is bounded
// ---------------------------------------------------------------------------

#[test]
fn test_state_memory_size_is_exactly_eight_bytes() {
    let size = std::mem::size_of::<RlState>();
    assert_eq!(
        size, 8,
        "RlState should be exactly 8 bytes (8 x u8), but got {} bytes. \
         Hidden bloat in the state struct would increase memory pressure \
         across the 460,800-state space.",
        size
    );
}

#[test]
fn test_state_size_does_not_exceed_64_bytes() {
    let size = std::mem::size_of::<RlState>();
    assert!(
        size <= 64,
        "RlState should be at most 64 bytes but got {} bytes",
        size
    );
}

#[test]
fn test_state_alignment_is_minimal() {
    let align = std::mem::align_of::<RlState>();
    assert_eq!(
        align, 1,
        "RlState alignment should be 1 (all u8 fields) but got {}. \
         Higher alignment wastes memory in arrays/vecs of RlState.",
        align
    );
}
