const SOURCE: &str = include_str!("../../src/breeds/version_space.rs");
const PAPER_POINTERS: &str = include_str!("../paper_pointers_generated.rs");
const ANTICHEAT: &str = include_str!("../universal_anticheat_generated.rs");

#[test]
fn version_space_has_source_runtime_contract_and_oracles() {
    assert!(
        SOURCE.contains("impl CognitionBreed for "),
        "version_space: missing CognitionBreed implementation"
    );
    assert!(
        SOURCE.contains("fn id(&self) -> BreedId"),
        "version_space: missing stable BreedId"
    );
    assert!(
        SOURCE.contains("fn run(&self"),
        "version_space: missing runtime path"
    );
    assert!(
        SOURCE.contains("fn preconditions(&self"),
        "version_space: missing admission boundary"
    );
    assert!(
        SOURCE.contains("fn postconditions(&self"),
        "version_space: missing postcondition boundary"
    );
    assert!(
        !SOURCE.contains("unimplemented!"),
        "version_space: unimplemented macro present"
    );
    assert!(
        !SOURCE.contains("todo!"),
        "version_space: todo macro present"
    );
    assert!(
        PAPER_POINTERS.contains("version_space"),
        "version_space: missing generated paper-pointer oracle"
    );
    assert!(
        ANTICHEAT.contains("anticheat_version_space_"),
        "version_space: missing generated anti-cheat oracle"
    );
}
