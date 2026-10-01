const SOURCE: &str = include_str!("../../src/breeds/cbr.rs");
const PAPER_POINTERS: &str = include_str!("../paper_pointers_generated.rs");
const ANTICHEAT: &str = include_str!("../universal_anticheat_generated.rs");

#[test]
fn cbr_has_source_runtime_contract_and_oracles() {
    assert!(
        SOURCE.contains("impl CognitionBreed for "),
        "cbr: missing CognitionBreed implementation"
    );
    assert!(
        SOURCE.contains("fn id(&self) -> BreedId"),
        "cbr: missing stable BreedId"
    );
    assert!(SOURCE.contains("fn run(&self"), "cbr: missing runtime path");
    assert!(
        SOURCE.contains("fn preconditions(&self"),
        "cbr: missing admission boundary"
    );
    assert!(
        SOURCE.contains("fn postconditions(&self"),
        "cbr: missing postcondition boundary"
    );
    assert!(
        !SOURCE.contains("unimplemented!"),
        "cbr: unimplemented macro present"
    );
    assert!(!SOURCE.contains("todo!"), "cbr: todo macro present");
    assert!(
        PAPER_POINTERS.contains("cbr"),
        "cbr: missing generated paper-pointer oracle"
    );
    assert!(
        ANTICHEAT.contains("anticheat_cbr_"),
        "cbr: missing generated anti-cheat oracle"
    );
}
