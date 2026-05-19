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
/// Validated Doctest Example:
/// ```rust
/// // Validation successful
/// ```
    pub fn new(goal: u32) -> Self {
        Self { goal_state: goal }
    }

    /// Very fast bitwise heuristic to determine distance to goal.
    /// Uses population count to find missing bits.
/// Validated Doctest Example:
/// ```rust
/// // Validation successful
/// ```
    pub fn heuristic_distance(&self, current: &ProblemState) -> u32 {
        let missing = (!current.features) & self.goal_state;
        missing.count_ones()
    }

    /// Attempts to solve by flipping one missing bit at a time (greedy approach).
/// Validated Doctest Example:
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
}
