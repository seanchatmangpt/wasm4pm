//! Concurrency/regression tests mirroring bcinr-pddl's `tests/capacity.rs`
//! (as a test pattern, not ported code — see the plan). Proves this fresh
//! temporal planner has the same correctness properties, including the
//! in-flight double-scheduling guard applied from the start here (bcinr-pddl
//! discovered and fixed this bug mid-session; this crate never had it).

use wasm4pm_planner::{domain_from_pddl, find_temporal_plan, ground_domain, problem_from_pddl};

const DOMAIN: &str = r#"
(define (domain capacity-demo)
  (:requirements :durative-actions :numeric-fluents :typing)
  (:predicates (idle ?w) (busy ?w) (done ?w))
  (:functions (available-workers))
  (:durative-action assign-worker
    :parameters (?w - worker)
    :duration (= ?duration 5)
    :condition (and (at start (idle ?w)) (at start (>= (available-workers) 1)))
    :effect (and
      (at start (decrease (available-workers) 1))
      (at start (not (idle ?w))) (at start (busy ?w))
      (at end (increase (available-workers) 1))
      (at end (not (busy ?w))) (at end (done ?w)))))
"#;

fn problem_with_capacity(capacity: u32) -> String {
    format!(
        r#"(define (problem assign-two-workers)
  (:domain capacity-demo)
  (:objects w1 w2 - worker)
  (:init
    (idle w1) (idle w2)
    (= (available-workers) {capacity}))
  (:goal (and (done w1) (done w2))))"#
    )
}

fn assign_worker_intervals(steps: &[wasm4pm_planner::PlanStep]) -> Vec<(f64, f64)> {
    steps
        .iter()
        .filter(|s| s.action_name == "assign-worker")
        .map(|s| (s.start_time, s.start_time + s.duration))
        .collect()
}

fn intervals_overlap(a: (f64, f64), b: (f64, f64)) -> bool {
    a.0 < b.1 && b.0 < a.1
}

#[test]
fn capacity_one_forces_sequential() {
    let domain = domain_from_pddl(DOMAIN).expect("domain parse");
    let problem = problem_from_pddl(&problem_with_capacity(1)).expect("problem parse");
    let ground_actions = ground_domain(&domain, &problem).expect("grounding");
    let plan = find_temporal_plan(&ground_actions, &problem).expect("temporal plan found");

    let intervals = assign_worker_intervals(&plan.steps);
    assert_eq!(
        intervals.len(),
        2,
        "expected two assign-worker steps, got {:?}",
        intervals
    );
    assert!(
        !intervals_overlap(intervals[0], intervals[1]),
        "capacity 1 must force sequential execution: {:?}",
        intervals
    );
}

#[test]
fn capacity_two_allows_concurrent() {
    let domain = domain_from_pddl(DOMAIN).expect("domain parse");
    let problem = problem_from_pddl(&problem_with_capacity(2)).expect("problem parse");
    let ground_actions = ground_domain(&domain, &problem).expect("grounding");
    let plan = find_temporal_plan(&ground_actions, &problem).expect("temporal plan found");

    let intervals = assign_worker_intervals(&plan.steps);
    assert_eq!(
        intervals.len(),
        2,
        "expected two assign-worker steps, got {:?}",
        intervals
    );
    assert!(
        intervals_overlap(intervals[0], intervals[1]),
        "capacity 2 must allow concurrent execution: {:?}",
        intervals
    );
}

/// Regression test for the in-flight double-scheduling bug found in
/// bcinr-pddl this session: an action with no exclusive-lock predicate
/// (only consuming/releasing a shared numeric fluent) must never be
/// scheduled twice while its first instance is still running, even when a
/// *different* pending action's completion frees capacity in the interim.
const DOUBLE_SCHEDULE_DOMAIN: &str = r#"
(define (domain double-schedule-regression)
  (:requirements :durative-actions :numeric-fluents :typing)
  (:predicates (done-a ?w) (done-b ?w))
  (:functions (cap))
  (:durative-action worker-a
    :parameters (?w - worker)
    :duration (= ?duration 5)
    :condition (at start (>= (cap) 1))
    :effect (and (at start (decrease (cap) 1)) (at end (increase (cap) 1)) (at end (done-a ?w))))
  (:durative-action worker-b
    :parameters (?w - worker)
    :duration (= ?duration 2)
    :condition (at start (>= (cap) 1))
    :effect (and (at start (decrease (cap) 1)) (at end (increase (cap) 1)) (at end (done-b ?w)))))
"#;

const DOUBLE_SCHEDULE_PROBLEM: &str = r#"
(define (problem double-schedule-regression-problem)
  (:domain double-schedule-regression)
  (:objects w1 - worker)
  (:init (= (cap) 2))
  (:goal (and (done-a w1) (done-b w1))))
"#;

#[test]
fn same_instance_is_never_scheduled_twice_while_in_flight() {
    let domain = domain_from_pddl(DOUBLE_SCHEDULE_DOMAIN).expect("domain parse");
    let problem = problem_from_pddl(DOUBLE_SCHEDULE_PROBLEM).expect("problem parse");
    let ground_actions = ground_domain(&domain, &problem).expect("grounding");
    let plan = find_temporal_plan(&ground_actions, &problem).expect("temporal plan found");

    for name in ["worker-a", "worker-b"] {
        let intervals: Vec<(f64, f64)> = plan
            .steps
            .iter()
            .filter(|s| s.action_name == name)
            .map(|s| (s.start_time, s.start_time + s.duration))
            .collect();
        for i in 0..intervals.len() {
            for j in (i + 1)..intervals.len() {
                assert!(
                    !intervals_overlap(intervals[i], intervals[j]),
                    "{name}(w1) was scheduled twice while in flight: {:?} and {:?}",
                    intervals[i],
                    intervals[j]
                );
            }
        }
    }
}
