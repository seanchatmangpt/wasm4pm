const SOURCE: &str = include_str!("../../src/breeds/abductive_ibe.rs");
const PAPER_POINTERS: &str = include_str!("../paper_pointers_generated.rs");
const ANTICHEAT: &str = include_str!("../universal_anticheat_generated.rs");

#[test]
fn abductive_ibe_has_source_runtime_contract_and_oracles() {
    assert!(
        SOURCE.contains("impl CognitionBreed for "),
        "abductive_ibe: missing CognitionBreed implementation"
    );
    assert!(
        SOURCE.contains("fn id(&self) -> BreedId"),
        "abductive_ibe: missing stable BreedId"
    );
    assert!(
        SOURCE.contains("fn run(&self"),
        "abductive_ibe: missing runtime path"
    );
    assert!(
        SOURCE.contains("fn preconditions(&self"),
        "abductive_ibe: missing admission boundary"
    );
    assert!(
        SOURCE.contains("fn postconditions(&self"),
        "abductive_ibe: missing postcondition boundary"
    );
    assert!(
        !SOURCE.contains("unimplemented!"),
        "abductive_ibe: unimplemented macro present"
    );
    assert!(
        !SOURCE.contains("todo!"),
        "abductive_ibe: todo macro present"
    );
    assert!(
        PAPER_POINTERS.contains("abductive_ibe"),
        "abductive_ibe: missing generated paper-pointer oracle"
    );
    assert!(
        ANTICHEAT.contains("anticheat_abductive_ibe_"),
        "abductive_ibe: missing generated anti-cheat oracle"
    );
}
