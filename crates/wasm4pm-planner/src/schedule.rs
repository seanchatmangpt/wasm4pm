//! Minimal schedule analysis: max parallelism via interval-overlap sweep.
//! Deliberately smaller than bcinr-pddl's `schedule_analysis.rs` (no
//! critical-path/slack/capacity-sensitivity — a later phase per the plan);
//! this slice proves the loop end to end, not the full analyzer.

use crate::ground::TemporalPlan;

/// Maximum number of steps with overlapping `[start, end)` intervals at any instant.
pub fn max_parallelism(plan: &TemporalPlan) -> usize {
    let mut events: Vec<(f64, i32)> = Vec::new();
    for step in &plan.steps {
        events.push((step.start_time, 1));
        events.push((step.start_time + step.duration, -1));
    }
    // Ends before starts at the same instant, so a step ending at t doesn't
    // count as overlapping with one starting at t.
    events.sort_by(|a, b| {
        a.0.partial_cmp(&b.0)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then(a.1.cmp(&b.1))
    });

    let mut current = 0i32;
    let mut max_seen = 0i32;
    for (_, delta) in events {
        current += delta;
        max_seen = max_seen.max(current);
    }
    max_seen.max(0) as usize
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ground::PlanStep;

    #[test]
    fn sequential_steps_have_parallelism_one() {
        let plan = TemporalPlan {
            steps: vec![
                PlanStep {
                    start_time: 0.0,
                    duration: 5.0,
                    action_name: "a".into(),
                    args: vec![],
                },
                PlanStep {
                    start_time: 5.0,
                    duration: 5.0,
                    action_name: "b".into(),
                    args: vec![],
                },
            ],
            makespan: 10.0,
        };
        assert_eq!(max_parallelism(&plan), 1);
    }

    #[test]
    fn overlapping_steps_have_parallelism_two() {
        let plan = TemporalPlan {
            steps: vec![
                PlanStep {
                    start_time: 0.0,
                    duration: 5.0,
                    action_name: "a".into(),
                    args: vec![],
                },
                PlanStep {
                    start_time: 0.0,
                    duration: 3.0,
                    action_name: "b".into(),
                    args: vec![],
                },
            ],
            makespan: 5.0,
        };
        assert_eq!(max_parallelism(&plan), 2);
    }
}
