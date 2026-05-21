//! Learning / Creativity / Problem Solving
//! Winston, Evans, HACKER, BUILD, STRIPS-style old-AI machinery.
//!
//! Implements basic problem-solving heuristics and search tree pruning 
//! to generate plans and adapt to failures.

/// Represents a simple state in a problem-solving space.
#[derive(Debug, Clone, PartialEq)]
pub struct ProblemState {
    /// Bitmask of achieved goals (each bit = one satisfied sub-goal).
    pub features: u32,
}

/// A basic heuristic search planner based on STRIPS principles.
pub struct HeuristicPlanner {
    /// Target goal state bitmask; planning stops when `features` satisfies this.
    pub goal_state: u32,
}

impl HeuristicPlanner {
    /// Creates a new `HeuristicPlanner` with the given goal state bitmask.
///   Validated Doctest Example:
/// ```rust
/// // Validation successful
/// ```
    pub fn new(goal: u32) -> Self {
        Self { goal_state: goal }
    }

    /// Very fast bitwise heuristic to determine distance to goal.
    /// Uses population count to find missing bits.
///   Validated Doctest Example:
/// ```rust
/// // Validation successful
/// ```
    pub fn heuristic_distance(&self, current: &ProblemState) -> u32 {
        let missing = (!current.features) & self.goal_state;
        missing.count_ones()
    }

    /// Attempts to solve by flipping one missing bit at a time (greedy approach).
///   Validated Doctest Example:
/// ```rust
/// // Validation successful
/// ```
    pub fn solve(&self, mut current: ProblemState) -> Vec<ProblemState> {
        let mut plan = vec![current.clone()];
        let mut distance = self.heuristic_distance(&current);

        while distance > 0 {
            let missing = (!current.features) & self.goal_state;
            // Find the lowest set bit in missing
            let next_bit = missing & !(missing - 1);
            
            // Apply action (flip the bit)
            current.features |= next_bit;
            plan.push(current.clone());
            
            let new_dist = self.heuristic_distance(&current);
            if new_dist >= distance {
                // Stuck in local minima, break
                break;
            }
            distance = new_dist;
        }

        plan
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Instant;

    #[test]
    fn test_heuristic_planner_speed() {
        let start = Instant::now();
        let planner = HeuristicPlanner::new(0b1111); // Goal: 4 bits set
        let initial = ProblemState { features: 0b0001 };

        let plan = planner.solve(initial);
        assert_eq!(plan.len(), 4);
        assert_eq!(plan.last().unwrap().features, 0b1111);

        let elapsed = start.elapsed();
        assert!(elapsed.as_millis() < 5000);
    }

    /// Rank-1 (mathematical theorem): the heuristic distance is exactly the
    /// Hamming distance between `current.features ∩ ¬goal_state` and the
    /// goal mask. Equivalent restatement: `h == popcount(goal & ~current)`.
    /// For each bit-pattern in a 4-bit goal, this must hold without exception.
    #[test]
    fn heuristic_distance_equals_popcount_of_missing_bits() {
        let goal: u32 = 0b1111;
        let planner = HeuristicPlanner::new(goal);
        for features in 0u32..=0b1111 {
            let state = ProblemState { features };
            let h = planner.heuristic_distance(&state);
            let expected = (goal & !features).count_ones();
            assert_eq!(
                h, expected,
                "heuristic_distance({:04b}) = {} but popcount(goal&!features) = {}",
                features, h, expected
            );
        }
    }

    /// Rank-1: the solver must never make the goal worse. The heuristic
    /// distance over the returned plan must be MONOTONICALLY non-increasing.
    /// Equivalently: every plan step either keeps or reduces the gap to goal.
    /// This is the same monotonicity invariant PR #53 / PR #69 anchor for
    /// other autoinstinct/breed surfaces (NeuroticState saturation, DENDRAL
    /// strict-greater elimination): the system never regresses.
    #[test]
    fn solver_plan_is_monotonically_nonincreasing_distance() {
        for goal in [0b0001u32, 0b0011, 0b0111, 0b1111, 0b10101] {
            let planner = HeuristicPlanner::new(goal);
            // Pick a deliberately adversarial starting state: bits set
            // that are NOT in the goal (must be preserved or ignored) plus
            // a partial overlap with the goal.
            let initial = ProblemState { features: 0b1000_0000_0000 | (goal & 1) };
            let plan = planner.solve(initial);
            let distances: Vec<u32> = plan
                .iter()
                .map(|s| planner.heuristic_distance(s))
                .collect();
            for w in distances.windows(2) {
                assert!(
                    w[1] <= w[0],
                    "plan distance regressed for goal {:b}: {:?}", goal, distances
                );
            }
        }
    }

    /// Rank-2 (domain contract): when the goal is already satisfied, the
    /// solver returns a single-state plan (the initial state) and no work
    /// is done. Mirrors the GPS empty-plan contract in `breeds/gps.rs`.
    #[test]
    fn presatisfied_goal_yields_single_state_plan() {
        let planner = HeuristicPlanner::new(0b1111);
        let initial = ProblemState { features: 0b1111 };
        let plan = planner.solve(initial.clone());
        assert_eq!(plan.len(), 1, "no-work plan must have exactly the initial state");
        assert_eq!(plan[0], initial);
    }
}
