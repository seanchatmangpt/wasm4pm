const SOURCE: &str = include_str!("../../src/breeds/triz.rs");
const PAPER_POINTERS: &str = include_str!("../paper_pointers_generated.rs");
const ANTICHEAT: &str = include_str!("../universal_anticheat_generated.rs");

#[test]
fn triz_has_source_runtime_contract_and_oracles() {
    assert!(
        SOURCE.contains("impl CognitionBreed for "),
        "triz: missing CognitionBreed implementation"
    );
    assert!(
        SOURCE.contains("fn id(&self) -> BreedId"),
        "triz: missing stable BreedId"
    );
    assert!(
        SOURCE.contains("fn run(&self"),
        "triz: missing runtime path"
    );
    assert!(
        SOURCE.contains("fn preconditions(&self"),
        "triz: missing admission boundary"
    );
    assert!(
        SOURCE.contains("fn postconditions(&self"),
        "triz: missing postcondition boundary"
    );
    assert!(
        !SOURCE.contains("unimplemented!"),
        "triz: unimplemented macro present"
    );
    assert!(!SOURCE.contains("todo!"), "triz: todo macro present");
    assert!(
        PAPER_POINTERS.contains("triz"),
        "triz: missing generated paper-pointer oracle"
    );
    assert!(
        ANTICHEAT.contains("anticheat_triz_"),
        "triz: missing generated anti-cheat oracle"
    );
}
