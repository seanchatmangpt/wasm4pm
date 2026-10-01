const SOURCE: &str = include_str!("../../src/breeds/clp.rs");
const PAPER_POINTERS: &str = include_str!("../paper_pointers_generated.rs");
const ANTICHEAT: &str = include_str!("../universal_anticheat_generated.rs");

#[test]
fn clp_has_source_runtime_contract_and_oracles() {
    assert!(
        SOURCE.contains("impl CognitionBreed for "),
        "clp: missing CognitionBreed implementation"
    );
    assert!(
        SOURCE.contains("fn id(&self) -> BreedId"),
        "clp: missing stable BreedId"
    );
    assert!(SOURCE.contains("fn run(&self"), "clp: missing runtime path");
    assert!(
        SOURCE.contains("fn preconditions(&self"),
        "clp: missing admission boundary"
    );
    assert!(
        SOURCE.contains("fn postconditions(&self"),
        "clp: missing postcondition boundary"
    );
    assert!(
        !SOURCE.contains("unimplemented!"),
        "clp: unimplemented macro present"
    );
    assert!(!SOURCE.contains("todo!"), "clp: todo macro present");
    assert!(
        PAPER_POINTERS.contains("clp"),
        "clp: missing generated paper-pointer oracle"
    );
    assert!(
        ANTICHEAT.contains("anticheat_clp_"),
        "clp: missing generated anti-cheat oracle"
    );
}
