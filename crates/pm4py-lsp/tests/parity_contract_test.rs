use pm4py_lsp::parity::{
    classify_parity_gap, evaluate_parity, EquivalenceKind, ParityFixture, ParityVerdict,
    ParityVerdictDecision,
};
use std::collections::HashMap;

#[test]
fn test_classify_parity_gap() {
    let expected = "Petri Net discovered";
    let actual = "Petri Net discovered";
    assert_eq!(classify_parity_gap(expected, actual), "No gap detected.");

    let actual_gap = "BPMN discovered";
    let gap_msg = classify_parity_gap(expected, actual_gap);
    assert!(gap_msg.contains("Gap detected"));
}

#[test]
fn test_parity_fixture_and_verdict_instantiation() {
    let mut parameters = HashMap::new();
    parameters.insert("sep".to_string(), "';'".to_string());

    let fixture = ParityFixture {
        snapshot_id: "snap-12345".to_string(),
        csv_path: "data/event_log.csv".to_string(),
        parameters,
        expected_outcome: "Petri Net discovered".to_string(),
    };

    let verdict = ParityVerdict {
        fixture_id: "fixture-12345".to_string(),
        equivalence: EquivalenceKind::Exact,
        decision: ParityVerdictDecision::Admitted,
        gap_analysis: Some("No gap detected.".to_string()),
    };

    assert_eq!(fixture.snapshot_id, "snap-12345");
    assert_eq!(verdict.equivalence, EquivalenceKind::Exact);
    assert_eq!(verdict.decision, ParityVerdictDecision::Admitted);
}

#[test]
fn test_evaluate_parity_decisions() {
    // U15: exact match admits
    let verdict_admitted = evaluate_parity(
        "fixture-1",
        "Petri Net",
        "Petri Net",
        EquivalenceKind::Exact,
    );
    assert_eq!(verdict_admitted.decision, ParityVerdictDecision::Admitted);
    assert_eq!(verdict_admitted.gap_analysis.unwrap(), "No gap detected.");

    // U16: mismatch refuses
    let verdict_refused = evaluate_parity("fixture-2", "Petri Net", "BPMN", EquivalenceKind::Exact);
    assert_eq!(verdict_refused.decision, ParityVerdictDecision::Refused);
    assert!(verdict_refused
        .gap_analysis
        .unwrap()
        .contains("Gap detected"));

    // U17: unsupported equivalence returns Unsupported
    let verdict_unsupported = evaluate_parity(
        "fixture-3",
        "Petri Net",
        "Petri Net",
        EquivalenceKind::Unsupported,
    );
    assert_eq!(
        verdict_unsupported.decision,
        ParityVerdictDecision::Unsupported
    );
}

static TEST_MUTEX: std::sync::Mutex<()> = std::sync::Mutex::new(());

#[test]
fn test_run_pm4py_workflow_static() {
    use pm4py_lsp::pm4py_bridge::{run_pm4py_workflow, set_runtime_mode};

    let _guard = TEST_MUTEX.lock().unwrap();

    // Ensure we are in static mode
    set_runtime_mode(false);

    let params = HashMap::new();
    let res_petri =
        run_pm4py_workflow("dummy.csv", "discover_petri_net_inductive", &params).unwrap();
    assert_eq!(res_petri, "Petri Net discovered (static mode)");

    let res_bpmn = run_pm4py_workflow("dummy.csv", "discover_bpmn", &params).unwrap();
    assert_eq!(res_bpmn, "BPMN discovered (static mode)");

    let res_dfg = run_pm4py_workflow("dummy.csv", "discover_dfg", &params).unwrap();
    assert_eq!(res_dfg, "DFG discovered (static mode)");

    let res_tree =
        run_pm4py_workflow("dummy.csv", "discover_process_tree_inductive", &params).unwrap();
    assert_eq!(res_tree, "Process Tree discovered (static mode)");

    let res_declare = run_pm4py_workflow("dummy.csv", "discover_declare", &params).unwrap();
    assert_eq!(res_declare, "DECLARE constraints discovered (static mode)");

    let res_fit = run_pm4py_workflow("dummy.csv", "fitness_token_based_replay", &params).unwrap();
    assert_eq!(
        res_fit,
        "Fitness: 1.0, Precision: 1.0 (static conformance check)"
    );

    let res_sound = run_pm4py_workflow("dummy.csv", "check_wf_net_soundness", &params).unwrap();
    assert_eq!(
        res_sound,
        "SoundnessResult: sound = True, deadlock_free = True, bounded = True (static mode)"
    );

    let res_write = run_pm4py_workflow("dummy.csv", "write_xes", &params).unwrap();
    assert_eq!(
        res_write,
        "Exported process model successfully via write_xes (static mode)"
    );
}

#[test]
fn test_run_pm4py_workflow_runtime() {
    use pm4py_lsp::pm4py_bridge::{is_runtime_mode, run_pm4py_workflow, set_runtime_mode};

    let _guard = TEST_MUTEX.lock().unwrap();

    // Test that toggling runtime mode works
    set_runtime_mode(true);
    assert!(is_runtime_mode());

    let params = HashMap::new();
    // Running in runtime mode on a non-existent file should either fail on pandas import or execution
    let res = run_pm4py_workflow(
        "non_existent_file_12345.csv",
        "discover_petri_net_inductive",
        &params,
    );
    println!("RUNTIME WORKFLOW RESULT: {:?}", res);

    // We assert it does not panic, and returns a structured error
    assert!(res.is_err());

    // Restore static mode for other tests
    set_runtime_mode(false);
}
