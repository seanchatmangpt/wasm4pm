const SOURCE: &str = include_str!("../../src/breeds/soar.rs");
const PAPER_POINTERS: &str = include_str!("../paper_pointers_generated.rs");
const ANTICHEAT: &str = include_str!("../universal_anticheat_generated.rs");

#[test]
fn soar_has_source_runtime_contract_and_oracles() {
    assert!(
        SOURCE.contains("impl CognitionBreed for "),
        "soar: missing CognitionBreed implementation"
    );
    assert!(
        SOURCE.contains("fn id(&self) -> BreedId"),
        "soar: missing stable BreedId"
    );
    assert!(
        SOURCE.contains("fn run(&self"),
        "soar: missing runtime path"
    );
    assert!(
        SOURCE.contains("fn preconditions(&self"),
        "soar: missing admission boundary"
    );
    assert!(
        SOURCE.contains("fn postconditions(&self"),
        "soar: missing postcondition boundary"
    );
    assert!(
        !SOURCE.contains("unimplemented!"),
        "soar: unimplemented macro present"
    );
    assert!(!SOURCE.contains("todo!"), "soar: todo macro present");
    assert!(
        PAPER_POINTERS.contains("soar"),
        "soar: missing generated paper-pointer oracle"
    );
    assert!(
        ANTICHEAT.contains("anticheat_soar_"),
        "soar: missing generated anti-cheat oracle"
    );
}
