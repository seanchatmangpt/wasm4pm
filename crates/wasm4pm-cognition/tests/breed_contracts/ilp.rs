const SOURCE: &str = include_str!("../../src/breeds/ilp.rs");
const PAPER_POINTERS: &str = include_str!("../paper_pointers_generated.rs");
const ANTICHEAT: &str = include_str!("../universal_anticheat_generated.rs");

#[test]
fn ilp_has_source_runtime_contract_and_oracles() {
    assert!(
        SOURCE.contains("impl CognitionBreed for "),
        "ilp: missing CognitionBreed implementation"
    );
    assert!(
        SOURCE.contains("fn id(&self) -> BreedId"),
        "ilp: missing stable BreedId"
    );
    assert!(SOURCE.contains("fn run(&self"), "ilp: missing runtime path");
    assert!(
        SOURCE.contains("fn preconditions(&self"),
        "ilp: missing admission boundary"
    );
    assert!(
        SOURCE.contains("fn postconditions(&self"),
        "ilp: missing postcondition boundary"
    );
    assert!(
        !SOURCE.contains("unimplemented!"),
        "ilp: unimplemented macro present"
    );
    assert!(!SOURCE.contains("todo!"), "ilp: todo macro present");
    assert!(
        PAPER_POINTERS.contains("ilp"),
        "ilp: missing generated paper-pointer oracle"
    );
    assert!(
        ANTICHEAT.contains("anticheat_ilp_"),
        "ilp: missing generated anti-cheat oracle"
    );
}
