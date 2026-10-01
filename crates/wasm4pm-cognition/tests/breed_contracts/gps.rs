const SOURCE: &str = include_str!("../../src/breeds/gps.rs");
const PAPER_POINTERS: &str = include_str!("../paper_pointers_generated.rs");
const ANTICHEAT: &str = include_str!("../universal_anticheat_generated.rs");

#[test]
fn gps_has_source_runtime_contract_and_oracles() {
    assert!(
        SOURCE.contains("impl CognitionBreed for "),
        "gps: missing CognitionBreed implementation"
    );
    assert!(
        SOURCE.contains("fn id(&self) -> BreedId"),
        "gps: missing stable BreedId"
    );
    assert!(SOURCE.contains("fn run(&self"), "gps: missing runtime path");
    assert!(
        SOURCE.contains("fn preconditions(&self"),
        "gps: missing admission boundary"
    );
    assert!(
        SOURCE.contains("fn postconditions(&self"),
        "gps: missing postcondition boundary"
    );
    assert!(
        !SOURCE.contains("unimplemented!"),
        "gps: unimplemented macro present"
    );
    assert!(!SOURCE.contains("todo!"), "gps: todo macro present");
    assert!(
        PAPER_POINTERS.contains("gps"),
        "gps: missing generated paper-pointer oracle"
    );
    assert!(
        ANTICHEAT.contains("anticheat_gps_"),
        "gps: missing generated anti-cheat oracle"
    );
}
