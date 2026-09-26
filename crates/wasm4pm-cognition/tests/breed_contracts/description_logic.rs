const SOURCE: &str = include_str!("../../src/breeds/description_logic.rs");
const PAPER_POINTERS: &str = include_str!("../paper_pointers_generated.rs");
const ANTICHEAT: &str = include_str!("../universal_anticheat_generated.rs");

#[test]
fn description_logic_has_source_runtime_contract_and_oracles() {
    assert!(
        SOURCE.contains("impl CognitionBreed for "),
        "description_logic: missing CognitionBreed implementation"
    );
    assert!(
        SOURCE.contains("fn id(&self) -> BreedId"),
        "description_logic: missing stable BreedId"
    );
    assert!(
        SOURCE.contains("fn run(&self"),
        "description_logic: missing runtime path"
    );
    assert!(
        SOURCE.contains("fn preconditions(&self"),
        "description_logic: missing admission boundary"
    );
    assert!(
        SOURCE.contains("fn postconditions(&self"),
        "description_logic: missing postcondition boundary"
    );
    assert!(
        !SOURCE.contains("unimplemented!"),
        "description_logic: unimplemented macro present"
    );
    assert!(
        !SOURCE.contains("todo!"),
        "description_logic: todo macro present"
    );
    assert!(
        PAPER_POINTERS.contains("description_logic"),
        "description_logic: missing generated paper-pointer oracle"
    );
    assert!(
        ANTICHEAT.contains("anticheat_description_logic_"),
        "description_logic: missing generated anti-cheat oracle"
    );
}
