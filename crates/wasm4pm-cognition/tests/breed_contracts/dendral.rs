const SOURCE: &str = include_str!("../../src/breeds/dendral.rs");
const PAPER_POINTERS: &str = include_str!("../paper_pointers_generated.rs");
const ANTICHEAT: &str = include_str!("../universal_anticheat_generated.rs");

#[test]
fn dendral_has_source_runtime_contract_and_oracles() {
    assert!(
        SOURCE.contains("impl CognitionBreed for "),
        "dendral: missing CognitionBreed implementation"
    );
    assert!(
        SOURCE.contains("fn id(&self) -> BreedId"),
        "dendral: missing stable BreedId"
    );
    assert!(
        SOURCE.contains("fn run(&self"),
        "dendral: missing runtime path"
    );
    assert!(
        SOURCE.contains("fn preconditions(&self"),
        "dendral: missing admission boundary"
    );
    assert!(
        SOURCE.contains("fn postconditions(&self"),
        "dendral: missing postcondition boundary"
    );
    assert!(
        !SOURCE.contains("unimplemented!"),
        "dendral: unimplemented macro present"
    );
    assert!(!SOURCE.contains("todo!"), "dendral: todo macro present");
    assert!(
        PAPER_POINTERS.contains("dendral"),
        "dendral: missing generated paper-pointer oracle"
    );
    assert!(
        ANTICHEAT.contains("anticheat_dendral_"),
        "dendral: missing generated anti-cheat oracle"
    );
}
