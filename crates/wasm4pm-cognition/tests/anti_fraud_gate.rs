use std::fs;

#[test]
fn anti_fraud_gate_ebl() {
    let ebl_source = fs::read_to_string("src/breeds/ebl.rs").expect("Failed to read ebl.rs");
    if ebl_source.contains("obj2") {
        panic!("FRAUD DETECTED: ebl.rs contains hardcoded reference to obj2");
    }
}

#[test]
fn anti_fraud_gate_htn_planning() {
    let src = fs::read_to_string("src/breeds/htn_planning.rs").expect("Failed to read");
    for word in &["zorp_location", "blee_station", "zorp_credits"] {
        if src.contains(word) {
            panic!("FRAUD DETECTED: htn_planning.rs contains fresh oracle identifier {}", word);
        }
    }
}

#[test]
fn anti_fraud_gate_dempster_shafer() {
    let src = fs::read_to_string("src/breeds/dempster_shafer.rs").expect("Failed to read");
    for word in &["zorp", "blee"] {
        if src.contains(word) {
            panic!("FRAUD DETECTED: dempster_shafer.rs contains fresh oracle identifier {}", word);
        }
    }
}

#[test]
fn anti_fraud_gate_partial_order_plan() {
    let src = fs::read_to_string("src/breeds/partial_order_plan.rs").expect("Failed to read");
    for word in &["zorp_pkg", "blee_loc", "glorp_loc"] {
        if src.contains(word) {
            panic!("FRAUD DETECTED: partial_order_plan.rs contains fresh oracle identifier {}", word);
        }
    }
}

#[test]
fn anti_fraud_gate_allen_temporal() {
    let src = fs::read_to_string("src/breeds/allen_temporal.rs").expect("Failed to read");
    for word in &["gamma", "delta", "eps"] {
        if src.contains(word) {
            panic!("FRAUD DETECTED: allen_temporal.rs contains fresh oracle identifier {}", word);
        }
    }
}
