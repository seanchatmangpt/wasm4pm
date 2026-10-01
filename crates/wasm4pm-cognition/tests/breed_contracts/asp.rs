const SOURCE: &str = include_str!("../../src/breeds/asp.rs");
const PAPER_POINTERS: &str = include_str!("../paper_pointers_generated.rs");
const ANTICHEAT: &str = include_str!("../universal_anticheat_generated.rs");

#[test]
fn asp_has_source_runtime_contract_and_oracles() {
    assert!(
        SOURCE.contains("impl CognitionBreed for "),
        "asp: missing CognitionBreed implementation"
    );
    assert!(
        SOURCE.contains("fn id(&self) -> BreedId"),
        "asp: missing stable BreedId"
    );
    assert!(SOURCE.contains("fn run(&self"), "asp: missing runtime path");
    assert!(
        SOURCE.contains("fn preconditions(&self"),
        "asp: missing admission boundary"
    );
    assert!(
        SOURCE.contains("fn postconditions(&self"),
        "asp: missing postcondition boundary"
    );
    assert!(
        !SOURCE.contains("unimplemented!"),
        "asp: unimplemented macro present"
    );
    assert!(!SOURCE.contains("todo!"), "asp: todo macro present");
    assert!(
        PAPER_POINTERS.contains("asp"),
        "asp: missing generated paper-pointer oracle"
    );
    assert!(
        ANTICHEAT.contains("anticheat_asp_"),
        "asp: missing generated anti-cheat oracle"
    );
}
