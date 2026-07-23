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

/// Convert a temporal plan (the FUTURE) into a POWL v2 model string (the
/// PRESENT) executable by wasm4pm's `powl_execute` engine, which in turn
/// emits an OCEL 2.0 log (the PAST). Precedence: step i orders before step j
/// iff `end_i <= start_j` (interval order — a valid strict partial order);
/// overlapping steps stay unordered (parallel).
pub fn plan_to_powl_v2(plan: &TemporalPlan) -> String {
    // Deterministic step order: by start time, then name+args.
    let mut steps: Vec<&crate::ground::PlanStep> = plan.steps.iter().collect();
    steps.sort_by(|a, b| {
        a.start_time
            .partial_cmp(&b.start_time)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| a.action_name.cmp(&b.action_name))
            .then_with(|| a.args.cmp(&b.args))
    });

    // Node ids: sanitized action name + args, deduped with an index suffix.
    let mut ids: Vec<String> = Vec::with_capacity(steps.len());
    for (i, s) in steps.iter().enumerate() {
        let mut base: String = s
            .action_name
            .chars()
            .chain(s.args.iter().flat_map(|a| "_".chars().chain(a.chars())))
            .map(|c| if c.is_ascii_alphanumeric() { c } else { '_' })
            .collect();
        if base.is_empty() {
            base = "step".to_string();
        }
        if ids.contains(&base) {
            base = format!("{base}_{i}");
        }
        ids.push(base);
    }

    let mut edges: Vec<String> = Vec::new();
    for i in 0..steps.len() {
        let end_i = steps[i].start_time + steps[i].duration;
        for j in 0..steps.len() {
            if i != j && end_i <= steps[j].start_time {
                edges.push(format!("({}, {})", ids[i], ids[j]));
            }
        }
    }

    format!(
        "PartialOrder(plan) {{ nodes: [{}], edges: [{}] }}",
        ids.join(", "),
        edges.join(", ")
    )
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
