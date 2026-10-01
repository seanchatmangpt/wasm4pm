const SOURCE: &str = include_str!("../../src/breeds/default_logic.rs");
const PAPER_POINTERS: &str = include_str!("../paper_pointers_generated.rs");
const ANTICHEAT: &str = include_str!("../universal_anticheat_generated.rs");

#[test]
fn default_logic_has_source_runtime_contract_and_oracles() {
    assert!(
        SOURCE.contains("impl CognitionBreed for "),
        "default_logic: missing CognitionBreed implementation"
    );
    assert!(
        SOURCE.contains("fn id(&self) -> BreedId"),
        "default_logic: missing stable BreedId"
    );
    assert!(
        SOURCE.contains("fn run(&self"),
        "default_logic: missing runtime path"
    );
    assert!(
        SOURCE.contains("fn preconditions(&self"),
        "default_logic: missing admission boundary"
    );
    assert!(
        SOURCE.contains("fn postconditions(&self"),
        "default_logic: missing postcondition boundary"
    );
    assert!(
        !SOURCE.contains("unimplemented!"),
        "default_logic: unimplemented macro present"
    );
    assert!(
        !SOURCE.contains("todo!"),
        "default_logic: todo macro present"
    );
    assert!(
        PAPER_POINTERS.contains("default_logic"),
        "default_logic: missing generated paper-pointer oracle"
    );
    assert!(
        ANTICHEAT.contains("anticheat_default_logic_"),
        "default_logic: missing generated anti-cheat oracle"
    );
}
