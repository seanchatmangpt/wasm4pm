const SOURCE: &str = include_str!("../../src/breeds/prolog.rs");
const PAPER_POINTERS: &str = include_str!("../paper_pointers_generated.rs");
const ANTICHEAT: &str = include_str!("../universal_anticheat_generated.rs");

#[test]
fn prolog_has_source_runtime_contract_and_oracles() {
    assert!(
        SOURCE.contains("impl CognitionBreed for "),
        "prolog: missing CognitionBreed implementation"
    );
    assert!(
        SOURCE.contains("fn id(&self) -> BreedId"),
        "prolog: missing stable BreedId"
    );
    assert!(
        SOURCE.contains("fn run(&self"),
        "prolog: missing runtime path"
    );
    assert!(
        SOURCE.contains("fn preconditions(&self"),
        "prolog: missing admission boundary"
    );
    assert!(
        SOURCE.contains("fn postconditions(&self"),
        "prolog: missing postcondition boundary"
    );
    assert!(
        !SOURCE.contains("unimplemented!"),
        "prolog: unimplemented macro present"
    );
    assert!(!SOURCE.contains("todo!"), "prolog: todo macro present");
    assert!(
        PAPER_POINTERS.contains("prolog"),
        "prolog: missing generated paper-pointer oracle"
    );
    assert!(
        ANTICHEAT.contains("anticheat_prolog_"),
        "prolog: missing generated anti-cheat oracle"
    );
}
