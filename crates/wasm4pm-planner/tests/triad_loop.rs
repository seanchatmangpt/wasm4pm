//! Triad closed loop: PDDL plan (future) → POWL v2 (present) → OCEL 2.0 (past).

use wasm4pm_planner::{plan_to_powl_v2, PlanStep, TemporalPlan};

fn step(start_time: f64, duration: f64, name: &str) -> PlanStep {
    PlanStep {
        start_time,
        duration,
        action_name: name.to_string(),
        args: vec![],
    }
}

#[test]
fn plan_converts_to_powl_v2_and_executes_to_ocel() {
    // FUTURE: a@0 and b@0 run in parallel (1s each); c@1 starts after both end.
    let plan = TemporalPlan {
        steps: vec![step(0.0, 1.0, "a"), step(0.0, 1.0, "b"), step(1.0, 1.0, "c")],
        makespan: 2.0,
    };
    let powl = plan_to_powl_v2(&plan);
    assert!(powl.starts_with("PartialOrder(plan)"), "{powl}");
    assert!(
        powl.contains("(a, c)") && powl.contains("(b, c)"),
        "both parallel steps must order before c: {powl}"
    );
    assert!(
        !powl.contains("(a, b)") && !powl.contains("(b, a)"),
        "overlapping steps must stay unordered: {powl}"
    );

    // PRESENT: execute the POWL v2 model with the proof-carrying engine.
    let result = wasm4pm::powl_execution::execute_powl_string(&powl, 3)
        .expect("plan-derived POWL must execute");
    assert_eq!(result["conformance"], "conforms");

    // PAST: the emitted log is OCEL 2.0 with a sealed run, and the firing
    // order respects the plan's precedence.
    let ocel = serde_json::to_string(&result["ocel"]).unwrap();
    assert!(ocel.contains("op_fired") && ocel.contains("run_sealed"));
    let fired: Vec<String> = result["fired"]
        .as_array()
        .unwrap()
        .iter()
        .filter_map(|f| f["activity"].as_str().map(str::to_string))
        .collect();
    let ic = fired.iter().position(|x| x == "c").expect("c fired");
    let ia = fired.iter().position(|x| x == "a").expect("a fired");
    let ib = fired.iter().position(|x| x == "b").expect("b fired");
    assert!(ia < ic && ib < ic, "a,b must precede c: {fired:?}");
}
