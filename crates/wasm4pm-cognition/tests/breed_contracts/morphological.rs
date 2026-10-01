const SOURCE: &str = include_str!("../../src/breeds/morphological.rs");
const PAPER_POINTERS: &str = include_str!("../paper_pointers_generated.rs");
const ANTICHEAT: &str = include_str!("../universal_anticheat_generated.rs");

#[test]
fn morphological_has_source_runtime_contract_and_oracles() {
    assert!(
        SOURCE.contains("impl CognitionBreed for "),
        "morphological: missing CognitionBreed implementation"
    );
    assert!(
        SOURCE.contains("fn id(&self) -> BreedId"),
        "morphological: missing stable BreedId"
    );
    assert!(
        SOURCE.contains("fn run(&self"),
        "morphological: missing runtime path"
    );
    assert!(
        SOURCE.contains("fn preconditions(&self"),
        "morphological: missing admission boundary"
    );
    assert!(
        SOURCE.contains("fn postconditions(&self"),
        "morphological: missing postcondition boundary"
    );
    assert!(
        !SOURCE.contains("unimplemented!"),
        "morphological: unimplemented macro present"
    );
    assert!(
        !SOURCE.contains("todo!"),
        "morphological: todo macro present"
    );
    assert!(
        PAPER_POINTERS.contains("morphological"),
        "morphological: missing generated paper-pointer oracle"
    );
    assert!(
        ANTICHEAT.contains("anticheat_morphological_"),
        "morphological: missing generated anti-cheat oracle"
    );
}
