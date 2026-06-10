use std::fs;

#[test]
fn anti_fraud_gate_ebl() {
    let ebl_source = fs::read_to_string("src/breeds/ebl.rs").expect("Failed to read ebl.rs");
    if ebl_source.contains("obj2") {
        panic!("FRAUD DETECTED: ebl.rs contains hardcoded reference to obj2");
    }
}
