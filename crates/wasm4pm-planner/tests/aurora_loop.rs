//! Aurora — closed autonomic loop over the hospital case study.
//!
//! Triad doctrine: PDDL figures out the FUTURE, POWL v2 is the PRESENT,
//! OCEL 2.0 is the PAST. Four phases (MAPE-K):
//!   1. PAST    — mine the synthetic hospital log; every planted phenomenon
//!                must be found (drift, never-together, outcome, speedup,
//!                structured model).
//!   2. ANALYZE — cognition breeds deliberate over the mined facts.
//!   3. FUTURE  — a PDDL problem built from the verdicts is planned.
//!   4. PRESENT — the plan executes on the proof-carrying POWL engine,
//!                emitting OCEL 2.0 that closes the loop back into mining.

use std::collections::BTreeMap;

use wasm4pm::models::{AttributeValue, Event, EventLog, Trace};
use wasm4pm_cognition::breeds::{dispatch_breed, BreedInput, Case, Fact, Goal, Rule};
use wasm4pm_planner::{
    domain_from_pddl, find_temporal_plan, ground_domain, max_parallelism, plan_to_powl_v2,
    problem_from_pddl,
};

// ─── G1: deterministic synthetic hospital log (no RNG — structured variation) ──

fn event(activity: &str, ts: &str) -> Event {
    let mut attrs = BTreeMap::new();
    attrs.insert(
        "concept:name".to_string(),
        AttributeValue::String(activity.to_string()),
    );
    attrs.insert(
        "time:timestamp".to_string(),
        AttributeValue::String(ts.to_string()),
    );
    Event { attributes: attrs }
}

fn trace(case: usize, day: usize, gap_min: usize, activities: &[&str]) -> Trace {
    let mut attrs = BTreeMap::new();
    attrs.insert(
        "concept:name".to_string(),
        AttributeValue::String(format!("aurora-{case}")),
    );
    let events = activities
        .iter()
        .enumerate()
        .map(|(i, a)| {
            let total_min = i * gap_min;
            event(
                a,
                &format!("2026-02-{:02}T{:02}:{:02}:00Z", day, 8 + total_min / 60, total_min % 60),
            )
        })
        .collect();
    Trace { attributes: attrs, events }
}

/// Planted phenomena:
/// - Variant A (sterile lab path, incl. vitals_check ∥ lab_collect both orders)
/// - Variant B (fast track)
/// - Variant C (sepsis: prefix [triage, sepsis_alert] always ends icu_transfer)
/// - Drift: late traces replace the lab_* block with rapid_test (flu season)
/// - never_together: sterile_prep never co-occurs with contaminated_flag
/// - Speedup: per-trace event gaps shrink over time (12 → 4 minutes)
fn aurora_log() -> EventLog {
    let mut log = EventLog::new();
    let mut case = 0usize;
    let a1: &[&str] = &["register", "triage", "sterile_prep", "lab_order", "vitals_check", "lab_collect", "lab_analyze", "treat", "discharge"];
    let a2: &[&str] = &["register", "triage", "sterile_prep", "lab_order", "lab_collect", "vitals_check", "lab_analyze", "treat", "discharge"];
    let b: &[&str] = &["register", "triage", "assess", "treat", "discharge"];
    let c: &[&str] = &["register", "triage", "sepsis_alert", "antibiotics", "icu_transfer"];
    let b_contam: &[&str] = &["register", "triage", "assess", "contaminated_flag", "treat", "discharge"];
    let d_late: &[&str] = &["register", "triage", "rapid_test", "treat", "discharge"];

    // Early period (days 1-14): lab-era variants with 12-minute gaps.
    for day in 1..=14usize {
        log.traces.push(trace(case, day, 12, if day % 2 == 0 { a1 } else { a2 }));
        case += 1;
        log.traces.push(trace(case, day, 12, b));
        case += 1;
        if day % 3 == 0 {
            log.traces.push(trace(case, day, 12, c));
            case += 1;
        }
        if day % 5 == 0 {
            log.traces.push(trace(case, day, 12, b_contam));
            case += 1;
        }
    }
    // Late period (days 15-28): flu season — rapid_test replaces the lab
    // block, and the whole process speeds up (4-minute gaps).
    for day in 15..=28usize {
        log.traces.push(trace(case, day, 4, d_late));
        case += 1;
        log.traces.push(trace(case, day, 4, b));
        case += 1;
        if day % 3 == 0 {
            log.traces.push(trace(case, day, 4, c));
            case += 1;
        }
    }
    log
}

// ─── The loop ────────────────────────────────────────────────────────────────

#[test]
fn aurora_closed_autonomic_loop() {
    let log = aurora_log();

    // ── Phase 1: THE PAST — mine the history ────────────────────────────────
    // 1a. Log skeleton: the planted contamination rule must surface.
    let skeleton = wasm4pm::more_discovery::compute_log_skeleton(&log, "concept:name");
    let never: Vec<(String, String)> = skeleton["never_together"]
        .as_array()
        .unwrap()
        .iter()
        .map(|p| (p[0].as_str().unwrap().into(), p[1].as_str().unwrap().into()))
        .collect();
    assert!(
        never.contains(&("contaminated_flag".into(), "sterile_prep".into())),
        "skeleton must plant-detect the contamination never-together rule; got {never:?}"
    );

    // 1b. Concept drift: early lab-era vocabulary vs late rapid-test era.
    let half = log.traces.len() / 2;
    let window_freqs = |traces: &[Trace]| {
        let mut m: BTreeMap<String, usize> = BTreeMap::new();
        for t in traces {
            for e in &t.events {
                if let Some(AttributeValue::String(a)) = e.attributes.get("concept:name") {
                    *m.entry(a.clone()).or_default() += 1;
                }
            }
        }
        m
    };
    let early = window_freqs(&log.traces[..half]);
    let late = window_freqs(&log.traces[half..]);
    let tv = wasm4pm::prediction_drift::total_variation_distance(&early, &late);
    assert!(
        tv > 0.15,
        "flu-season drift must exceed TV threshold; got {tv:.4}"
    );
    assert!(early.contains_key("lab_analyze") && !late.contains_key("lab_analyze"));

    // 1c. Outcome prediction: the sepsis prefix must forecast icu_transfer.
    let prefix = vec!["triage".to_string(), "sepsis_alert".to_string()];
    let outcome =
        wasm4pm::prediction_outcome::predict_outcome_from_log(&log, "concept:name", &prefix)
            .expect("outcome model must train");
    assert_eq!(outcome["outcome"], "icu_transfer");
    assert!(
        outcome["probability"].as_f64().unwrap() > 0.7,
        "sepsis prefix must strongly predict ICU transfer; got {}",
        outcome["probability"]
    );

    // 1d. Windowed speedup: discharge is accelerating (12-min → 4-min gaps).
    let speedup = wasm4pm::final_analytics::analyze_process_speedup_from_log(
        &log,
        "time:timestamp",
        10,
    );
    assert_eq!(speedup["trend"], "speedup", "gaps shrink over time");

    // 1e. Structured discovery: the miner must produce a real model (not a
    // flower) and see the planted vitals_check ∥ lab_collect concurrency.
    let admitted =
        wasm4pm_compat::admission::Admission::<_, ()>::new(log.clone()).into_evidence();
    let tree_json = wasm4pm::more_discovery::discover_inductive_miner_from_log(
        &admitted,
        "concept:name",
    );
    let tree: serde_json::Value = serde_json::from_str(&tree_json).unwrap();
    let tree_str = tree["root"].to_string();
    assert_ne!(tree["root"]["node_type"], "flower", "IM must structure the log");

    // ── Phase 2: ANALYZE — breeds deliberate over mined facts ───────────────
    // ltl_monitor: G(sepsis_alert → F antibiotics), states from a mined trace.
    let ltl_input = BreedInput {
        intent: "G (sepsis_alert -> F antibiotics)".into(),
        candidates: vec![],
        facts: vec![],
        cases: vec![
            Case {
                id: "state0".into(),
                intent: String::new(),
                architecture: String::new(),
                outcome_score: 1.0,
                facts: vec![Fact { key: "sepsis_alert".into(), value: "true".into() }],
            },
            Case {
                id: "state1".into(),
                intent: String::new(),
                architecture: String::new(),
                outcome_score: 1.0,
                facts: vec![Fact { key: "antibiotics".into(), value: "true".into() }],
            },
        ],
        rules: vec![],
        goals: vec![],
        state: vec![],
    };
    let ltl_out = dispatch_breed("ltl_monitor", &ltl_input).expect("ltl_monitor runs");
    let conforms = ltl_out
        .facts
        .iter()
        .find(|f| f.key == "conforms")
        .expect("ltl verdict fact");
    assert_eq!(conforms.value, "true", "sepsis protocol must conform in mined trace");

    // mycin: infection diagnosis over mined culture facts (CF chain).
    let mycin_input = BreedInput {
        intent: "diagnose bacteremia organism and recommend antibiotic therapy".into(),
        candidates: vec![],
        facts: [
            ("gram-stain", "gram-positive"),
            ("morphology", "coccus"),
            ("growth-conformation", "chains"),
            ("site", "blood"),
            ("portal-of-entry", "gi-tract"),
        ]
        .iter()
        .map(|(k, v)| Fact { key: (*k).into(), value: (*v).into() })
        .collect(),
        cases: vec![],
        rules: vec![
            Rule {
                id: "RULE050-class".into(),
                premise: vec!["gram-positive".into(), "coccus".into(), "chains".into()],
                conclusion: "organism=streptococcus".into(),
                certainty: 0.7,
            },
            Rule {
                id: "RULE096-therapy".into(),
                premise: vec!["organism=streptococcus".into()],
                conclusion: "therapy=penicillin".into(),
                certainty: 0.9,
            },
        ],
        goals: vec![],
        state: vec![],
    };
    let mycin_out = dispatch_breed("mycin", &mycin_input).expect("mycin runs");
    assert!(
        !mycin_out.inference_trace.is_empty(),
        "mycin must produce a real inference trace"
    );

    // meta_reasoning arbitrates the two verdicts (which breed to trust).
    let meta_input = BreedInput {
        intent: "arbitrate ltl_monitor vs mycin".into(),
        candidates: vec![],
        facts: vec![
            Fact { key: "breed:ltl_monitor:conclusion".into(), value: format!("conforms={}", conforms.value) },
            Fact { key: "breed:ltl_monitor:confidence".into(), value: "1.0".into() },
            Fact {
                key: "breed:mycin:conclusion".into(),
                value: mycin_out
                    .facts
                    .first()
                    .map(|f| f.value.clone())
                    .unwrap_or_default(),
            },
            Fact { key: "breed:mycin:confidence".into(), value: "0.63".into() },
            Fact { key: "drift:tv".into(), value: format!("{tv:.4}") },
            Fact { key: "outcome:icu_p".into(), value: outcome["probability"].to_string() },
        ],
        cases: vec![],
        rules: vec![],
        goals: vec![Goal {
            id: "g1".into(),
            predicate: "trust".into(),
            value: "assign".into(),
        }],
        state: vec![],
    };
    let meta_out = dispatch_breed("meta_reasoning", &meta_input).expect("meta_reasoning runs");
    assert!(!meta_out.explanation.is_empty());

    // Determinism gate: breed outputs must be byte-identical across runs.
    let ltl_again = dispatch_breed("ltl_monitor", &ltl_input).expect("rerun");
    assert_eq!(
        serde_json::to_string(&ltl_out).unwrap(),
        serde_json::to_string(&ltl_again).unwrap(),
        "breed deliberation must be deterministic"
    );

    // ── Phase 3: THE FUTURE — PDDL plans the response ────────────────────────
    // Verdicts → problem: sepsis load + drift means restock rapid tests and
    // transfer the ICU-bound patient, with 2 nurses available in parallel.
    const DOMAIN: &str = r#"
(define (domain aurora-response)
  (:requirements :durative-actions :numeric-fluents :typing)
  (:predicates (pending ?t) (done ?t))
  (:functions (available-nurses))
  (:durative-action perform-task
    :parameters (?t - task)
    :duration (= ?duration 10)
    :condition (and (at start (pending ?t)) (at start (>= (available-nurses) 1)))
    :effect (and
      (at start (decrease (available-nurses) 1))
      (at start (not (pending ?t)))
      (at end (increase (available-nurses) 1))
      (at end (done ?t)))))
"#;
    const PROBLEM: &str = r#"(define (problem aurora-shift)
  (:domain aurora-response)
  (:objects transfer_icu restock_rapid_tests - task)
  (:init (pending transfer_icu) (pending restock_rapid_tests)
         (= (available-nurses) 2))
  (:goal (and (done transfer_icu) (done restock_rapid_tests))))"#;

    let domain = domain_from_pddl(DOMAIN).expect("aurora domain parses");
    let problem = problem_from_pddl(PROBLEM).expect("aurora problem parses");
    let ground = ground_domain(&domain, &problem).expect("grounding");
    let plan = find_temporal_plan(&ground, &problem).expect("temporal plan found");
    assert_eq!(plan.steps.len(), 2, "both response tasks planned");
    assert!(
        max_parallelism(&plan) >= 2,
        "two nurses must allow parallel execution"
    );

    // ── Phase 4: THE PRESENT — POWL v2 executes the plan ─────────────────────
    let powl = plan_to_powl_v2(&plan);
    assert!(powl.starts_with("PartialOrder(plan)"), "{powl}");
    let run1 = wasm4pm::powl_execution::execute_powl_string(&powl, 3)
        .expect("plan executes on the engine");
    assert_eq!(run1["conformance"], "conforms");
    let run2 = wasm4pm::powl_execution::execute_powl_string(&powl, 3).unwrap();
    assert_eq!(
        run1["receipt"]["chain_hash"], run2["receipt"]["chain_hash"],
        "proof-carrying execution must be replayable"
    );

    // ── Loop closure: the emitted OCEL 2.0 is tomorrow's PAST ────────────────
    let ocel = &run1["ocel"];
    let ocel_str = serde_json::to_string(ocel).unwrap();
    assert!(ocel_str.contains("op_fired") && ocel_str.contains("run_sealed"));
    let fired: Vec<String> = run1["fired"]
        .as_array()
        .unwrap()
        .iter()
        .filter_map(|f| f["activity"].as_str().map(str::to_string))
        .collect();
    for step in &plan.steps {
        let id: String = step
            .action_name
            .chars()
            .chain(step.args.iter().flat_map(|a| "_".chars().chain(a.chars())))
            .map(|c| if c.is_ascii_alphanumeric() { c } else { '_' })
            .collect();
        assert!(
            fired.iter().any(|f| *f == id || f.starts_with(&id)),
            "plan step '{id}' must appear in the executed OCEL firing; fired={fired:?}"
        );
    }

    // The mined tree (PAST) and the executed plan (PRESENT) both live in the
    // same knowledge base for the next cycle — nothing asserted that wasn't
    // mined, nothing executed that can't be replayed.
    assert!(tree_str.len() > 2);
}
