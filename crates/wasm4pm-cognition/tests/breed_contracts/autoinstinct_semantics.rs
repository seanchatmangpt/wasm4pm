const SOURCE: &str = include_str!("../../src/breeds/autoinstinct_semantics.rs");
const PAPER_POINTERS: &str = include_str!("../paper_pointers_generated.rs");
const ANTICHEAT: &str = include_str!("../universal_anticheat_generated.rs");

#[test]
fn autoinstinct_semantics_has_source_runtime_contract_and_oracles() {
    assert!(
        SOURCE.contains("impl CognitionBreed for "),
        "autoinstinct_semantics: missing CognitionBreed implementation"
    );
    assert!(
        SOURCE.contains("fn id(&self) -> BreedId"),
        "autoinstinct_semantics: missing stable BreedId"
    );
    assert!(
        SOURCE.contains("fn run(&self"),
        "autoinstinct_semantics: missing runtime path"
    );
    assert!(
        SOURCE.contains("fn preconditions(&self"),
        "autoinstinct_semantics: missing admission boundary"
    );
    assert!(
        SOURCE.contains("fn postconditions(&self"),
        "autoinstinct_semantics: missing postcondition boundary"
    );
    assert!(
        !SOURCE.contains("unimplemented!"),
        "autoinstinct_semantics: unimplemented macro present"
    );
    assert!(
        !SOURCE.contains("todo!"),
        "autoinstinct_semantics: todo macro present"
    );
    assert!(
        PAPER_POINTERS.contains("autoinstinct_semantics"),
        "autoinstinct_semantics: missing generated paper-pointer oracle"
    );
    assert!(
        ANTICHEAT.contains("anticheat_autoinstinct_semantics_"),
        "autoinstinct_semantics: missing generated anti-cheat oracle"
    );
}
