const SOURCE: &str = include_str!("../../src/breeds/frame.rs");
const PAPER_POINTERS: &str = include_str!("../paper_pointers_generated.rs");
const ANTICHEAT: &str = include_str!("../universal_anticheat_generated.rs");

#[test]
fn eliza_has_source_runtime_contract_and_oracles() {
    assert!(
        SOURCE.contains("impl CognitionBreed for "),
        "eliza: missing CognitionBreed implementation"
    );
    assert!(
        SOURCE.contains("fn id(&self) -> BreedId"),
        "eliza: missing stable BreedId"
    );
    assert!(
        SOURCE.contains("fn run(&self"),
        "eliza: missing runtime path"
    );
    assert!(
        SOURCE.contains("fn preconditions(&self"),
        "eliza: missing admission boundary"
    );
    assert!(
        SOURCE.contains("fn postconditions(&self"),
        "eliza: missing postcondition boundary"
    );
    assert!(
        !SOURCE.contains("unimplemented!"),
        "eliza: unimplemented macro present"
    );
    assert!(!SOURCE.contains("todo!"), "eliza: todo macro present");
    assert!(
        PAPER_POINTERS.contains("eliza"),
        "eliza: missing generated paper-pointer oracle"
    );
    assert!(
        ANTICHEAT.contains("anticheat_eliza_"),
        "eliza: missing generated anti-cheat oracle"
    );
}
