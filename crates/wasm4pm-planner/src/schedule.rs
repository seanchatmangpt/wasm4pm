//! Deterministic temporal schedule analysis and POWL v2 projection.

use crate::ground::TemporalPlan;

/// Maximum number of steps with overlapping `[start, end)` intervals at any instant.
#[must_use]
pub fn max_parallelism(plan: &TemporalPlan) -> usize {
    let mut events: Vec<(f64, i32)> = Vec::new();
    for step in &plan.steps {
        events.push((step.start_time, 1));
        events.push((step.start_time + step.duration, -1));
    }
    // Ends before starts at the same instant, so a step ending at t does not
    // overlap a step starting at t.
    events.sort_by(|left, right| {
        left.0
            .partial_cmp(&right.0)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then(left.1.cmp(&right.1))
    });

    let mut current = 0_i32;
    let mut max_seen = 0_i32;
    for (_, delta) in events {
        current += delta;
        max_seen = max_seen.max(current);
    }
    usize::try_from(max_seen.max(0)).expect("non-negative parallelism fits usize")
}

/// Convert a temporal plan into deterministic, transitively reduced POWL v2 geometry.
///
/// Step `i` precedes step `j` exactly when `end(i) <= start(j)`. Overlapping
/// intervals remain unordered. Only cover edges are emitted, preventing a long
/// sequential plan from manufacturing a quadratic set of redundant precedence arcs.
#[must_use]
pub fn plan_to_powl_v2(plan: &TemporalPlan) -> String {
    let mut steps: Vec<&crate::ground::PlanStep> = plan.steps.iter().collect();
    steps.sort_by(|left, right| {
        left.start_time
            .partial_cmp(&right.start_time)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| left.action_name.cmp(&right.action_name))
            .then_with(|| left.args.cmp(&right.args))
    });

    let ids = stable_step_ids(&steps);
    let order = interval_order(&steps);
    let mut edges = Vec::new();
    for source in 0..steps.len() {
        for target in 0..steps.len() {
            if order[source][target] && is_cover_edge(source, target, &order) {
                edges.push(format!("({}, {})", ids[source], ids[target]));
            }
        }
    }

    format!(
        "PartialOrder(plan) {{ nodes: [{}], edges: [{}] }}",
        ids.join(", "),
        edges.join(", ")
    )
}

fn stable_step_ids(steps: &[&crate::ground::PlanStep]) -> Vec<String> {
    let mut ids = Vec::with_capacity(steps.len());
    let mut counts = std::collections::BTreeMap::<String, usize>::new();
    for step in steps {
        let mut base: String = step
            .action_name
            .chars()
            .chain(
                step.args
                    .iter()
                    .flat_map(|argument| "_".chars().chain(argument.chars())),
            )
            .map(|character| {
                if character.is_ascii_alphanumeric() {
                    character
                } else {
                    '_'
                }
            })
            .collect();
        if base.is_empty() {
            base = "step".to_string();
        }
        let occurrence = counts.entry(base.clone()).or_default();
        let id = if *occurrence == 0 {
            base
        } else {
            format!("{base}_{occurrence}")
        };
        *occurrence += 1;
        ids.push(id);
    }
    ids
}

fn interval_order(steps: &[&crate::ground::PlanStep]) -> Vec<Vec<bool>> {
    let mut order = vec![vec![false; steps.len()]; steps.len()];
    for source in 0..steps.len() {
        let source_end = steps[source].start_time + steps[source].duration;
        for target in 0..steps.len() {
            order[source][target] = source != target && source_end <= steps[target].start_time;
        }
    }
    order
}

fn is_cover_edge(source: usize, target: usize, order: &[Vec<bool>]) -> bool {
    !(0..order.len()).any(|middle| {
        middle != source
            && middle != target
            && order[source][middle]
            && order[middle][target]
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ground::PlanStep;

    fn step(name: &str, start_time: f64, duration: f64) -> PlanStep {
        PlanStep {
            start_time,
            duration,
            action_name: name.to_string(),
            args: Vec::new(),
        }
    }

    #[test]
    fn sequential_steps_have_parallelism_one() {
        let plan = TemporalPlan {
            steps: vec![step("a", 0.0, 5.0), step("b", 5.0, 5.0)],
            makespan: 10.0,
        };
        assert_eq!(max_parallelism(&plan), 1);
    }

    #[test]
    fn overlapping_steps_have_parallelism_two() {
        let plan = TemporalPlan {
            steps: vec![step("a", 0.0, 5.0), step("b", 0.0, 3.0)],
            makespan: 5.0,
        };
        assert_eq!(max_parallelism(&plan), 2);
    }

    #[test]
    fn powl_projection_preserves_parallelism() {
        let plan = TemporalPlan {
            steps: vec![
                step("observe", 0.0, 1.0),
                step("human_review", 1.0, 3.0),
                step("iot_check", 1.0, 2.0),
                step("close", 4.0, 1.0),
            ],
            makespan: 5.0,
        };
        assert_eq!(
            plan_to_powl_v2(&plan),
            "PartialOrder(plan) { nodes: [observe, human_review, iot_check, close], edges: [(observe, human_review), (observe, iot_check), (human_review, close), (iot_check, close)] }"
        );
    }

    #[test]
    fn powl_projection_removes_transitive_edges() {
        let plan = TemporalPlan {
            steps: vec![
                step("a", 0.0, 1.0),
                step("b", 1.0, 1.0),
                step("c", 2.0, 1.0),
            ],
            makespan: 3.0,
        };
        let projected = plan_to_powl_v2(&plan);
        assert!(projected.contains("(a, b)"));
        assert!(projected.contains("(b, c)"));
        assert!(!projected.contains("(a, c)"));
    }

    #[test]
    fn duplicate_labels_receive_stable_unique_ids() {
        let plan = TemporalPlan {
            steps: vec![step("inspect", 0.0, 1.0), step("inspect", 1.0, 1.0)],
            makespan: 2.0,
        };
        assert_eq!(
            plan_to_powl_v2(&plan),
            "PartialOrder(plan) { nodes: [inspect, inspect_1], edges: [(inspect, inspect_1)] }"
        );
    }
}
