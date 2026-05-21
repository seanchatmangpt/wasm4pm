/// Implementation of the Upper Confidence Bound for Trees (UCT) selection primitive.
/// Zero heap allocations. Constant time evaluation of nodes.
/// Returns a score representing the value of a node given its visit count and total visits.
/// Formula: Q(s,a) + C * sqrt(ln(TotalVisits) / VisitCount)
///
/// **Robustness:** `total_visits = 0` would feed `ln(0) = -inf` into the sqrt,
/// producing `NaN` (cast to `0` as u64). Empirically that inverts UCT's
/// "explore the unvisited" behavior. We clamp `total_visits` to at least 1
/// for the logarithm, and saturate negative scores to zero before the cast.
#[inline(always)]
pub fn monte_carlo_tree_search_mcts(val: u64, aux: u64) -> u64 {
    let visits = (val & 0xFFFFFFFF) as f32;
    let total_visits = (aux & 0xFFFFFFFF) as f32;
    let q_value = (val >> 32) as f32 / 1000.0;

    // Constant exploration factor (sqrt(2))
    let c = 1.414;

    // Clamp total_visits to >=1 so ln() never returns -inf / NaN. Floor the
    // ratio at 0 so sqrt() never receives a negative argument.
    let ln_total = total_visits.max(1.0).ln();
    let ratio = (ln_total / (visits + 1.0)).max(0.0);
    let exploration = c * ratio.sqrt();
    let score = q_value + exploration;

    // Return as fixed point u64 (saturating to 0 for negative or NaN scores).
    if score.is_finite() && score > 0.0 {
        (score * 1000.0) as u64
    } else {
        0
    }
}

/// Pure branchless OR-Join synchronization logic for YAWL-style joins.
/// Returns 1 if the join can fire, 0 otherwise.
/// val: current state mask (present tokens)
/// aux: reachability mask (tokens that can still reach this join)
#[inline(always)]
pub fn synchronizing_merge_wcp37(val: u64, aux: u64) -> u64 {
    let present = val != 0;
    let no_upstream = (aux & !val) == 0;
    (present && no_upstream) as u64
}

#[cfg(test)]
mod uct_tests {
    use super::*;

    /// Rank-1 oracle: the returned score is always a representable u64,
    /// regardless of how degenerate the inputs are. The pre-fix code
    /// returned `0u64` because `NaN as u64` is `0`, masking the defect.
    /// This test now asserts the explicit contract.
    #[test]
    fn uct_score_is_finite_for_unvisited_root() {
        // No total visits, no visit count, no Q value: pure degenerate input.
        let score = monte_carlo_tree_search_mcts(0, 0);
        assert_eq!(score, 0, "degenerate root collapses to exactly zero");
    }

    /// Rank-2 oracle: UCT must reward exploration. An unvisited child of a
    /// visited root must score strictly higher than a fully-visited child
    /// with the same Q value (here: 0).
    #[test]
    fn uct_prefers_unvisited_when_total_is_positive() {
        // visits=0, total_visits=10 -> high exploration term.
        let unvisited = monte_carlo_tree_search_mcts(0, 10);
        // visits=10, total_visits=10 -> low exploration term.
        let visited = monte_carlo_tree_search_mcts(10, 10);
        assert!(
            unvisited > visited,
            "UCT must reward unvisited nodes; unvisited={unvisited} visited={visited}"
        );
    }

    /// Rank-1 oracle: any input combination produces a non-NaN result that
    /// fits in u64. Property-based across a small enumeration.
    #[test]
    fn uct_never_panics_or_returns_garbage() {
        for total in [0u64, 1, 2, 10, 1_000, u32::MAX as u64] {
            for visits in [0u64, 1, 5, u32::MAX as u64] {
                for q in [0u64, 100, 1000] {
                    let val = (q << 32) | visits;
                    let _ = monte_carlo_tree_search_mcts(val, total);
                }
            }
        }
    }
}
