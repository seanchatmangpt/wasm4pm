/// Implementation of the Upper Confidence Bound for Trees (UCT) selection primitive.
/// Zero heap allocations. Constant time evaluation of nodes.
/// Returns a score representing the value of a node given its visit count and total visits.
/// Formula: Q(s,a) + C * sqrt(ln(TotalVisits) / VisitCount)
#[inline(always)]
pub fn monte_carlo_tree_search_mcts(val: u64, aux: u64) -> u64 {
    let visits = (val & 0xFFFFFFFF) as f32;
    let total_visits = (aux & 0xFFFFFFFF) as f32;
    let q_value = (val >> 32) as f32 / 1000.0;

    // Constant exploration factor (sqrt(2))
    let c = 1.414;

    let exploration = c * (total_visits.ln() / (visits + 1.0)).sqrt();
    let score = q_value + exploration;

    // Return as fixed point u64
    (score * 1000.0) as u64
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
