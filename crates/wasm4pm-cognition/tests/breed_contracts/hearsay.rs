const SOURCE: &str = include_str!("../../src/breeds/hearsay.rs");
const PAPER_POINTERS: &str = include_str!("../paper_pointers_generated.rs");
const ANTICHEAT: &str = include_str!("../universal_anticheat_generated.rs");

#[test]
fn hearsay_has_source_runtime_contract_and_oracles() {
    assert!(
        SOURCE.contains("impl CognitionBreed for "),
        "hearsay: missing CognitionBreed implementation"
    );
    assert!(
        SOURCE.contains("fn id(&self) -> BreedId"),
        "hearsay: missing stable BreedId"
    );
    assert!(
        SOURCE.contains("fn run(&self"),
        "hearsay: missing runtime path"
    );
    assert!(
        SOURCE.contains("fn preconditions(&self"),
        "hearsay: missing admission boundary"
    );
    assert!(
        SOURCE.contains("fn postconditions(&self"),
        "hearsay: missing postcondition boundary"
    );
    assert!(
        !SOURCE.contains("unimplemented!"),
        "hearsay: unimplemented macro present"
    );
    assert!(!SOURCE.contains("todo!"), "hearsay: todo macro present");
    assert!(
        PAPER_POINTERS.contains("hearsay"),
        "hearsay: missing generated paper-pointer oracle"
    );
    assert!(
        ANTICHEAT.contains("anticheat_hearsay_"),
        "hearsay: missing generated anti-cheat oracle"
    );
}
