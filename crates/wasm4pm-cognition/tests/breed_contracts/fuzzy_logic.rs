const SOURCE: &str = include_str!("../../src/breeds/fuzzy_logic.rs");
const PAPER_POINTERS: &str = include_str!("../paper_pointers_generated.rs");
const ANTICHEAT: &str = include_str!("../universal_anticheat_generated.rs");

#[test]
fn fuzzy_logic_has_source_runtime_contract_and_oracles() {
    assert!(
        SOURCE.contains("impl CognitionBreed for "),
        "fuzzy_logic: missing CognitionBreed implementation"
    );
    assert!(
        SOURCE.contains("fn id(&self) -> BreedId"),
        "fuzzy_logic: missing stable BreedId"
    );
    assert!(
        SOURCE.contains("fn run(&self"),
        "fuzzy_logic: missing runtime path"
    );
    assert!(
        SOURCE.contains("fn preconditions(&self"),
        "fuzzy_logic: missing admission boundary"
    );
    assert!(
        SOURCE.contains("fn postconditions(&self"),
        "fuzzy_logic: missing postcondition boundary"
    );
    assert!(
        !SOURCE.contains("unimplemented!"),
        "fuzzy_logic: unimplemented macro present"
    );
    assert!(!SOURCE.contains("todo!"), "fuzzy_logic: todo macro present");
    assert!(
        PAPER_POINTERS.contains("fuzzy_logic"),
        "fuzzy_logic: missing generated paper-pointer oracle"
    );
    assert!(
        ANTICHEAT.contains("anticheat_fuzzy_logic_"),
        "fuzzy_logic: missing generated anti-cheat oracle"
    );
}
