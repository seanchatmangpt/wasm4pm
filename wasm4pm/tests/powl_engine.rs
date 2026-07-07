//! Closed-loop tests for the bcinr-powl workflow execution engine bridge.
#![cfg(feature = "powl-engine")]

use wasm4pm::powl_execution::execute_powl_string;

fn fired_activities(v: &serde_json::Value) -> Vec<String> {
    v["fired"]
        .as_array()
        .unwrap()
        .iter()
        .filter_map(|f| f["activity"].as_str().map(str::to_string))
        .collect()
}

/// Sequence a→b must fire a before b, conform to its own tape, and carry a
/// sealed receipt with a real chain hash.
#[test]
fn powl_execute_sequence_conforms() {
    let v = execute_powl_string("PO=(nodes={a, b}, order={a-->b})", 3)
        .expect("sequence model must execute");
    assert_eq!(v["conformance"], "conforms");
    let acts = fired_activities(&v);
    let ia = acts.iter().position(|x| x == "a").expect("a fired");
    let ib = acts.iter().position(|x| x == "b").expect("b fired");
    assert!(ia < ib, "a must fire before b, got {acts:?}");
    let receipt = &v["receipt"];
    assert_eq!(receipt["overflow"], false);
    assert!(receipt["event_count"].as_u64().unwrap() >= 2);
    assert_eq!(receipt["chain_hash"].as_str().unwrap().len(), 64);
    // OCEL log must contain op_fired and run_sealed event types.
    let ocel = serde_json::to_string(&v["ocel"]).unwrap();
    assert!(ocel.contains("op_fired") && ocel.contains("run_sealed"));
}

/// XOR fires exactly one branch (deterministically the lowest slot).
#[test]
fn powl_execute_xor_fires_one_branch() {
    let v = execute_powl_string("X (a, b)", 3).expect("xor model must execute");
    assert_eq!(v["conformance"], "conforms");
    let acts = fired_activities(&v);
    let a = acts.iter().filter(|x| *x == "a").count();
    let b = acts.iter().filter(|x| *x == "b").count();
    assert_eq!(a + b, 1, "exactly one XOR branch must fire, got {acts:?}");
}

/// Determinism: same model + config → identical chain hash and firing order.
#[test]
fn powl_execute_is_deterministic() {
    let m = "PO=(nodes={a, b, c}, order={a-->b, a-->c})";
    let v1 = execute_powl_string(m, 3).unwrap();
    let v2 = execute_powl_string(m, 3).unwrap();
    assert_eq!(v1["receipt"]["chain_hash"], v2["receipt"]["chain_hash"]);
    assert_eq!(v1["receipt"]["topo_order"], v2["receipt"]["topo_order"]);
}

/// Closed loop: parallel split a→(b∥c) executes both branches after a, and
/// the emitted OCEL log validates against the compiled tape.
#[test]
fn powl_execute_parallel_closed_loop() {
    let v = execute_powl_string("PO=(nodes={a, b, c}, order={a-->b, a-->c})", 3).unwrap();
    assert_eq!(v["conformance"], "conforms");
    let acts = fired_activities(&v);
    let ia = acts.iter().position(|x| x == "a").unwrap();
    assert!(acts.contains(&"b".to_string()) && acts.contains(&"c".to_string()));
    assert_eq!(ia, 0, "a is the entry and must fire first");
}
