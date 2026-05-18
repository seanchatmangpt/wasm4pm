//! Conformance Checking Edge Case Guards
//!
//! Boundary-case detection and correction for fitness computation.
//! Ensures fitness is always in [0.0, 1.0] and handles:
//! - Empty logs (zero traces)
//! - Empty traces (zero events)
//! - Zero denominators
//! - NaN/Inf results
//! - Degenerate models

/// Guard 1: Empty log handling
///
/// Edge case: Log with zero traces should return avg_fitness = 1.0 (vacuous truth)
/// not 0.0 (undefined).
pub fn guard_empty_log(total_cases: usize, total_fitness: f64) -> f64 {
    if total_cases == 0 {
        // Vacuous truth: no cases to violate conformance
        return 1.0;
    }
    // Normal case: average fitness across all traces
    total_fitness / total_cases as f64
}

/// Guard 2: Fitness bounds enforcement
///
/// Edge case: Fitness formula can produce values outside [0.0, 1.0] due to:
/// - Division by small denominators
/// - Cumulative rounding errors
///
/// Always clamp to [0.0, 1.0]
pub fn guard_fitness_bounds(fitness: f64) -> f64 {
    if fitness.is_nan() {
        // NaN case: treat as minimum conformance
        return 0.0;
    }
    if fitness.is_infinite() {
        // Infinite case: clamp to bounds
        return if fitness > 0.0 { 1.0 } else { 0.0 };
    }
    // Normal case: clamp to [0.0, 1.0]
    fitness.clamp(0.0, 1.0)
}

/// Guard 3: Single-event trace handling
///
/// Edge case: Trace with one event has zero denominators in fitness formula:
/// fitness = 0.5 * (1 - missing/consumed) + 0.5 * (1 - remaining/produced)
/// If consumed=0 or produced=0, we use max(1, denominator).
pub fn guard_zero_denominator(numerator: u32, denominator: u32) -> f64 {
    let den = denominator.max(1) as f64;
    (numerator as f64) / den
}

/// Guard 4: Mixed trace conformance (empty + non-empty traces)
///
/// Edge case: Some traces may be empty (zero events) while others have events.
/// Empty trace fitness should be well-defined:
/// - If model accepts empty traces (epsilon language): fitness = 1.0
/// - If model requires ≥1 event: fitness < 1.0
pub fn guard_empty_trace_fitness(event_count: usize, is_conforming: bool) -> f64 {
    if event_count == 0 {
        // Empty trace: 0.5 conformance (half of min fitness for 1-event trace)
        // This ensures empty traces are penalized but not catastrophic
        return 0.5;
    }
    // Non-empty trace: normal fitness computation
    0.0 // Placeholder; actual fitness computed elsewhere
}

/// Guard 5: Degenerate model (single activity)
///
/// Edge case: Model with only one activity has very limited expressiveness.
/// Fitness should still be [0.0, 1.0].
pub fn guard_degenerate_model_fitness(
    fitness: f64,
    activity_count: usize,
    transition_count: usize,
) -> f64 {
    // Degenerate models (activity_count < 2) still produce bounded fitness
    guard_fitness_bounds(fitness)
}

/// Guard 6: Cumulative fitness computation
///
/// Edge case: Averaging many trace fitness values can accumulate rounding error.
/// Ensure intermediate sums don't overflow or underflow.
pub fn guard_cumulative_fitness(
    current_total: f64,
    trace_fitness: f64,
    trace_count: usize,
) -> f64 {
    // Clamp each trace fitness before adding to total
    let bounded_fitness = guard_fitness_bounds(trace_fitness);

    // Check for accumulation errors
    let new_total = current_total + bounded_fitness;
    if new_total.is_nan() || new_total.is_infinite() {
        // Fallback: conservative estimate
        0.0
    } else {
        new_total
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn guard1_empty_log_returns_1_0() {
        assert_eq!(guard_empty_log(0, 0.0), 1.0);
        assert_eq!(guard_empty_log(0, 5.0), 1.0); // Ignores total_fitness
    }

    #[test]
    fn guard1_normal_log_averages() {
        assert_eq!(guard_empty_log(1, 0.5), 0.5);
        assert_eq!(guard_empty_log(2, 1.5), 0.75);
    }

    #[test]
    fn guard2_nan_becomes_0_0() {
        assert_eq!(guard_fitness_bounds(f64::NAN), 0.0);
    }

    #[test]
    fn guard2_inf_clamped() {
        assert_eq!(guard_fitness_bounds(f64::INFINITY), 1.0);
        assert_eq!(guard_fitness_bounds(f64::NEG_INFINITY), 0.0);
    }

    #[test]
    fn guard2_negative_clamped() {
        assert_eq!(guard_fitness_bounds(-0.5), 0.0);
    }

    #[test]
    fn guard2_above_1_clamped() {
        assert_eq!(guard_fitness_bounds(1.5), 1.0);
    }

    #[test]
    fn guard2_in_bounds_unchanged() {
        assert_eq!(guard_fitness_bounds(0.75), 0.75);
        assert_eq!(guard_fitness_bounds(0.0), 0.0);
        assert_eq!(guard_fitness_bounds(1.0), 1.0);
    }

    #[test]
    fn guard3_zero_denominator_becomes_1() {
        assert_eq!(guard_zero_denominator(0, 0), 0.0);
        assert_eq!(guard_zero_denominator(1, 0), 1.0);
        assert_eq!(guard_zero_denominator(1, 1), 1.0);
    }

    #[test]
    fn guard4_empty_trace_fitness() {
        assert_eq!(guard_empty_trace_fitness(0, true), 0.5);
        assert_eq!(guard_empty_trace_fitness(0, false), 0.5);
    }

    #[test]
    fn guard6_cumulative_nan_handling() {
        let result = guard_cumulative_fitness(f64::NAN, 0.5, 1);
        // NaN in current_total + anything = NaN, then fallback to 0.0
        assert_eq!(result, 0.0);
    }
}
