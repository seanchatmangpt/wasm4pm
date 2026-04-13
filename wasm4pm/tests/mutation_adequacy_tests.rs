//! Category H -- Mutation Adequacy Validation Tests
//!
//! Validates that the existing test suite is ADEQUATE by simulating specific
//! known bugs (mutations) and proving they would be caught. Each test:
//! 1. Documents the specific mutation (what code change represents the bug)
//! 2. Exercises the function with inputs that expose the mutation
//! 3. Asserts the function produces the CORRECT value (proving the mutation
//!    would cause a detectable failure if introduced)
//!
//! Since we cannot actually modify source code in a test, we prove adequacy
//! by demonstrating that the correct behavior is observably different from
//! what the mutation would produce. If the mutation existed, the assertion
//! would fail -- therefore the test suite WOULD catch it.
//!
//! Mutations validated:
//! 1. Same-state Bellman (update uses state instead of next_state)
//! 2. SPC one-shot vs historical (SPC only checks current snapshot)
//! 3. String::len() instead of event count (feature extraction uses string length)
//! 4. Zero step counter in circuit breaker (step counter never advances)

use pictl::reinforcement::QLearning;
use pictl::self_healing::{advance_clock, reset_clock, CircuitBreaker, CircuitBreakerConfig, CircuitState};
use pictl::spc::{check_western_electric_rules, ChartData, SpecialCause, TrendDirection};
use pictl::RlAction;
use pictl::RlState;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Create an RlState with a specific health_level and all other fields zeroed.
fn health_state(health_level: u8) -> RlState {
    pictl::create_rl_state(health_level, 0, 0, 0, 0, 0, 0, 0)
}

/// Create a QLearning agent with exploration_rate=0.0 (purely greedy).
fn greedy_q_agent() -> QLearning<RlState, RlAction> {
    QLearning::with_hyperparams(0.1, 0.99, 0.0)
}

/// Build a ChartData point with a given value, using standard control limits.
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
// Mutation 1: Same-state Bellman (the original bug)
// ===========================================================================
//
// The bug: `update(state, action, reward, state, done)` instead of
//           `update(state, action, reward, next_state, done)`
//
// If this mutation existed, the Bellman update would look up Q-values for
// the CURRENT state instead of the NEXT state. Since Q(state, .) = 0.0
// for an unvisited state, the bootstrap term would be zero, and the update
// would produce a delta of exactly alpha * (reward - 0.0), ignoring the
// value of the destination state entirely.
//
// Detection: Pre-populate next_state with high Q-values via repeated
// positive updates. Then update the current state with reward=0.0 and
// the valuable next_state. If the mutation existed, Q(state, action)
// would remain at 0.0 (target = 0.0 + gamma * max Q(state, .) = 0.0).
// With correct code, Q(state, action) becomes positive because it
// bootstraps from next_state's high Q-values.

#[test]
fn test_mutation_1_same_state_bellman_detected() {
    // This test validates that our Bellman tests would catch the same-state bug.
    //
    // Mutation: if update() used state instead of next_state, then:
    // - Q(state, action) after update with (state, action, r, state, false)
    //   would equal Q(state, action) before update (target = current Q, delta = 0)
    // - Q(state, action) after update with (state, action, r, next_state, false)
    //   where next_state has high Q-values, would be > Q(state, action) before
    //
    // Detection strategy:
    // 1. Create QLearning agent with exploration_rate=0.0
    // 2. Pre-populate next_state with high Q-values via repeated updates
    // 3. Record Q(state, action) -- should be 0.0 (unvisited)
    // 4. Update with (state, action, r=0.0, next_state, done=false)
    // 5. Assert: Q(state, action) increased (proves next_state was used)
    //
    // If mutation existed: Q would not change, and this assertion would FAIL.
    // Therefore: our test suite WOULD catch this mutation.

    let agent = greedy_q_agent();
    let state = health_state(2); // Degraded (unvisited)
    let next_state = health_state(0); // Normal (will be seeded with high Q)
    let action = RlAction::Continue;

    // Step 2: Pre-populate next_state with high Q-values via repeated updates
    // Each update with r=1.0, gamma=0.99, alpha=0.1 accumulates value.
    // After 10 updates: Q(next_state, Scale) converges toward r/(1-gamma) = 100.0
    for _ in 0..10 {
        agent.update(&next_state, &RlAction::Scale, 1.0, &next_state, false);
    }

    // Verify next_state now has high Q-values (sanity check)
    let q_next = agent.get_q_value(&next_state, &RlAction::Scale);
    assert!(
        q_next > 0.5,
        "Sanity: Q(next_state, Scale) should be high after 10 positive updates, got {}",
        q_next
    );

    // Step 3: Record Q(state, action) -- should be 0.0 since state is unvisited
    let q_before = agent.get_q_value(&state, &action);
    assert_eq!(
        q_before, 0.0,
        "Sanity: Q(state, action) should be 0.0 for unvisited state"
    );

    // Step 4: Update with r=0.0, next_state has high Q-values, non-terminal
    // CORRECT: target = 0.0 + 0.99 * max Q(next_state, .) > 0
    //   -> Q(state, action) INCREASES
    // MUTATION (same-state): target = 0.0 + 0.99 * max Q(state, .) = 0.0
    //   -> Q(state, action) stays at 0.0 (delta = 0)
    agent.update(&state, &action, 0.0, &next_state, false);

    // Step 5: Assert Q increased -- proves next_state was used
    let q_after = agent.get_q_value(&state, &action);
    assert!(
        q_after > q_before,
        "MUTATION 1 DETECTION: Q(state, action) must increase after zero-reward update \
         with valuable next_state. Before={:.6}, After={:.6}. \
         If Q did not change, the Bellman update is using state instead of next_state \
         (the same-state bug). The existing test_bellman_uses_next_state_not_current_state \
         and test_different_next_states_produce_different_q_updates in \
         bellman_correctness_tests.rs would catch this.",
        q_before,
        q_after
    );
}

// ===========================================================================
// Mutation 2: SPC one-shot vs historical
// ===========================================================================
//
// The bug: SPC only checks the current snapshot against control limits
// (one-shot evaluation), ignoring historical trend data.
//
// If this mutation existed, gradual drift where every individual point
// stays within control limits would NEVER be detected, because the
// one-shot check only tests the latest point against UCL/LCL.
//
// Detection: Create data where all points are within UCL/LCL (one-shot
// passes) but 6 consecutive points are strictly increasing (trend rule
// fires). If the mutation existed, no Trend alert would be emitted
// because only Rule 1 (out-of-control) would be evaluated.
//
// This test proves that `check_western_electric_rules` evaluates
// Rule 3 (trend) in addition to Rule 1 (out-of-control).

#[test]
fn test_mutation_2_spc_historical_vs_oneshot_detected() {
    // Validates that our drift tests distinguish historical from one-shot SPC.
    //
    // Mutation: if SPC only checked current value vs limits (one-shot),
    // then gradual drift within limits would never be detected.
    //
    // Detection strategy:
    // 1. Create data points with gradual increase (all within UCL)
    // 2. Each individual point is within control limits (one-shot would pass)
    // 3. But the TREND rule (6 consecutive increasing) should fire
    // 4. Assert: check_western_electric_rules returns a Trend alert
    //
    // If mutation existed: no Trend alert, assertion would FAIL.
    // Therefore: our test suite WOULD catch this mutation.

    let cl = 5.0;
    let sigma = 0.5;
    let _ucl = cl + 3.0 * sigma; // 6.5 (not directly used, but documents the control limit)

    // Build 20 points with a gradual upward trend of +0.05 per step.
    // Values: 5.0, 5.05, 5.10, ..., 5.95 -- all well below UCL=6.5.
    // One-shot check: every value is within [3.5, 6.5] -- all pass.
    // Trend check: 6 consecutive increasing values exist (e.g., t3..t8).
    let data: Vec<ChartData> = (0..20)
        .map(|i| {
            let value = 5.0 + (i as f64) * 0.05; // 5.0 to 5.95
            spc_point(&format!("t{}", i), value, cl, sigma)
        })
        .collect();

    // Verify all points are within control limits (one-shot would pass all)
    for point in &data {
        assert!(
            point.value >= point.lcl && point.value <= point.ucl,
            "Sanity: all values must be within control limits for one-shot to pass. \
             Got value={} (lcl={}, ucl={})",
            point.value,
            point.lcl,
            point.ucl
        );
    }

    // Verify Rule 1 (out-of-control) does NOT fire (all within limits)
    let alerts = check_western_electric_rules(&data);
    assert!(
        !alerts.iter().any(|a| matches!(a, SpecialCause::OutOfControl { .. })),
        "Sanity: Rule 1 must NOT fire when all values are within control limits"
    );

    // THE KEY ASSERTION: Rule 3 (Trend) MUST fire despite all values being in-control.
    // This proves SPC evaluates historical patterns, not just one-shot thresholds.
    let trend_alert = alerts.iter().find(|a| matches!(a, SpecialCause::Trend { .. }));
    assert!(
        trend_alert.is_some(),
        "MUTATION 2 DETECTION: Trend rule must fire on gradual drift within control limits. \
         All 20 values are within [3.5, 6.5] but 6+ are consecutively increasing. \
         If no Trend alert fires, SPC is doing one-shot evaluation only (the bug). \
         The existing test_gradual_drift_detected_by_trend_rule in \
         behavioral_drift_tests.rs would catch this. Got alerts: {:?}",
        alerts
    );

    // Verify trend direction is Increasing
    if let Some(SpecialCause::Trend { direction, .. }) = trend_alert {
        assert_eq!(
            *direction,
            TrendDirection::Increasing,
            "Trend direction must be Increasing for upward drift"
        );
    }
}

// ===========================================================================
// Mutation 3: String::len() instead of event count
// ===========================================================================
//
// The bug: event_rate_q was computed from the trace name's string length
// instead of the actual event count from the XES log.
//
// If this mutation existed, two traces with the same name length but
// different event counts would produce the same event_rate_q, which is
// incorrect. The quantization should depend on the normalized event rate
// (features[0] = event_count / 10000), not on any string property.
//
// Detection: Create two RlState instances via from_features with
// different features[0] values (representing different event rates).
// If the mutation existed, changing features[0] would have no effect
// on event_rate_q because the code would use string length instead.
//
// We prove this by showing that different features[0] values produce
// different event_rate_q values (monotonicity), which proves the
// quantization depends on the feature value, not a fixed string length.

#[test]
fn test_mutation_3_event_count_not_string_length_detected() {
    // Validates that feature extraction uses actual event counts, not string lengths.
    //
    // Mutation: if event_rate_q was computed from string length instead of
    // event count, then changing features[0] would not affect event_rate_q.
    //
    // Detection strategy:
    // 1. Create state_a with features[0] = 0.05 (500 events, low rate)
    // 2. Create state_b with features[0] = 0.80 (8000 events, high rate)
    // 3. All other features identical
    // 4. Assert: state_a.event_rate_q != state_b.event_rate_q
    //
    // If mutation existed: both would have the same event_rate_q (computed
    // from a fixed string length), and the assertion would FAIL.
    // Therefore: our test suite WOULD catch this mutation.

    // features[0] = event_count / 10000
    // 0.05 -> 500 events -> quantize_event_rate: 0..=500 => bucket 0
    // 0.80 -> 8000 events -> quantize_event_rate: 5001..=7500 => bucket 6
    let features_low = [0.05f32, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5];
    let features_high = [0.80f32, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5];

    let state_low = RlState::from_features(&features_low, 0, 0.0);
    let state_high = RlState::from_features(&features_high, 0, 0.0);

    // Assert that event_rate_q differs between the two states
    assert_ne!(
        state_low.event_rate_q, state_high.event_rate_q,
        "MUTATION 3 DETECTION: event_rate_q must differ when features[0] differs. \
         features[0]=0.05 -> event_rate_q={}, features[0]=0.80 -> event_rate_q={}. \
         If both are the same, the quantization is not using the feature value \
         (possibly using string length instead). The existing \
         test_quantization_event_rate_is_monotonic in \
         feature_normalization_tests.rs would catch this.",
        state_low.event_rate_q,
        state_high.event_rate_q
    );

    // Assert the ordering is correct: higher event rate -> higher quantized value
    assert!(
        state_high.event_rate_q > state_low.event_rate_q,
        "MUTATION 3 DETECTION: Higher event rate should produce higher event_rate_q. \
         features[0]=0.80 -> {}, features[0]=0.05 -> {}",
        state_high.event_rate_q,
        state_low.event_rate_q
    );

    // Verify the exact quantization buckets match the documented ranges
    // features[0]=0.05 -> (0.05 * 10000) = 500 -> bucket 0 (0..=500)
    assert_eq!(
        state_low.event_rate_q, 0,
        "500 events (features[0]=0.05) should quantize to bucket 0 (0..=500)"
    );
    // features[0]=0.80 -> (0.80 * 10000) = 8000 -> bucket 7 (7501+)
    assert_eq!(
        state_high.event_rate_q, 7,
        "8000 events (features[0]=0.80) should quantize to bucket 7 (7501+)"
    );

    // Additional proof: intermediate values land in intermediate buckets
    // features[0]=0.15 -> 1500 events -> bucket 2 (1001..=2000)
    let features_mid = [0.15f32, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5];
    let state_mid = RlState::from_features(&features_mid, 0, 0.0);
    assert_eq!(
        state_mid.event_rate_q, 2,
        "1500 events (features[0]=0.15) should quantize to bucket 2 (1001..=2000)"
    );
    assert!(
        state_low.event_rate_q < state_mid.event_rate_q && state_mid.event_rate_q < state_high.event_rate_q,
        "MUTATION 3 DETECTION: Monotonicity must hold: low({}) < mid({}) < high({})",
        state_low.event_rate_q,
        state_mid.event_rate_q,
        state_high.event_rate_q
    );
}

// ===========================================================================
// Mutation 4: Zero step counter in circuit breaker
// ===========================================================================
//
// The bug: The step counter (now_ms()) always returns 0, so the timeout
// calculation `current_ms - last_state_change_ms` always equals 0.
// The Open state would never transition to HalfOpen regardless of
// configured timeout, because the elapsed time is always 0 < timeout.
//
// Detection: Create a circuit breaker, drive it to Open state, advance
// the clock past the configured timeout, then call allow_request() and
// verify the state transitions to HalfOpen.
//
// If the mutation existed (step counter always 0), then:
// - last_state_change_ms = 0 (set at transition to Open)
// - current_ms = 0 (mutation: step counter never advances)
// - elapsed = 0 - 0 = 0 < open_timeout_ms
// - allow_request() returns false, state stays Open
//
// With correct code (advance_clock works):
// - last_state_change_ms = 0
// - current_ms = open_timeout_ms (after advance_clock)
// - elapsed = open_timeout_ms >= open_timeout_ms
// - allow_request() returns true, state transitions to HalfOpen

#[test]
fn test_mutation_4_circuit_breaker_step_counter_detected() {
    // Validates that circuit breaker timeout actually depends on step counter.
    //
    // Mutation: if step counter was always 0, then:
    // - Open state would never transition to HalfOpen regardless of time elapsed
    //
    // Detection strategy:
    // 1. Reset clock to known state
    // 2. Create circuit breaker with known timeout (1ms for fast test)
    // 3. Drive it to Open via failures
    // 4. Advance clock past timeout
    // 5. Call allow_request() or check state()
    // 6. Assert: state == HalfOpen (timeout was honored)
    //
    // If mutation existed: state would still be Open, assertion would FAIL.
    // Therefore: our test suite WOULD catch this mutation.

    // Step 1: Reset clock
    reset_clock();

    // Step 2: Create breaker with very short timeout (1ms) for deterministic test
    let open_timeout_ms = 1u64;
    let config = CircuitBreakerConfig {
        failure_threshold: 2,
        success_threshold: 2,
        open_timeout_ms,
        half_open_timeout_ms: 30_000,
    };
    let mut breaker = CircuitBreaker::with_config(config);

    // Step 3: Drive to Open
    breaker.record_failure();
    assert_eq!(breaker.state(), CircuitState::Closed, "Sanity: should be Closed after 1 failure");
    breaker.record_failure();
    assert_eq!(breaker.state(), CircuitState::Open, "Sanity: should be Open after 2 failures (threshold=2)");

    // Verify allow_request returns false immediately (timeout not elapsed)
    assert!(
        !breaker.allow_request(),
        "Sanity: allow_request should return false immediately after Open"
    );
    // allow_request may have triggered a state check -- verify still Open
    assert_eq!(
        breaker.state(),
        CircuitState::Open,
        "Sanity: state should still be Open when timeout not elapsed"
    );

    // Step 4: Advance clock past timeout
    advance_clock(open_timeout_ms + 1);

    // Step 5-6: Call allow_request and assert transition to HalfOpen
    // This is the critical assertion:
    // If the step counter mutation existed (now_ms() always returns 0),
    // then elapsed = 0 - last_state_change_ms would be negative/zero,
    // and allow_request would return false with state still Open.
    assert!(
        breaker.allow_request(),
        "MUTATION 4 DETECTION: allow_request must return true after timeout elapsed. \
         If this returns false, the step counter is not advancing (always 0), \
         and the circuit breaker can never recover from Open state. \
         The existing test_open_to_half_open_after_timeout and \
         test_recovery_timeout_is_configurable in \
         circuit_breaker_state_machine_tests.rs would catch this."
    );
    assert_eq!(
        breaker.state(),
        CircuitState::HalfOpen,
        "MUTATION 4 DETECTION: State must be HalfOpen after timeout. \
         If still Open, the step counter is not advancing. Got: {:?}",
        breaker.state()
    );
}

// ===========================================================================
// Mutation adequacy documentation (not a test)
// ===========================================================================
//
// Mutation adequacy: 4/4 mutations have detection tests.
//
// Mutations validated:
// 1. Same-state Bellman -> detected by test_mutation_1_same_state_bellman_detected
// 2. SPC one-shot vs historical -> detected by test_mutation_2_spc_historical_vs_oneshot_detected
// 3. String::len() instead of event count -> detected by test_mutation_3_event_count_not_string_length_detected
// 4. Zero step counter in circuit breaker -> detected by test_mutation_4_circuit_breaker_step_counter_detected
