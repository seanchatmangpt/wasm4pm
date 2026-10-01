const SOURCE: &str = include_str!("../../src/breeds/circumscription.rs");
const PAPER_POINTERS: &str = include_str!("../paper_pointers_generated.rs");
const ANTICHEAT: &str = include_str!("../universal_anticheat_generated.rs");

#[test]
fn circumscription_has_source_runtime_contract_and_oracles() {
    assert!(
        SOURCE.contains("impl CognitionBreed for "),
        "circumscription: missing CognitionBreed implementation"
    );
    assert!(
        SOURCE.contains("fn id(&self) -> BreedId"),
        "circumscription: missing stable BreedId"
    );
    assert!(
        SOURCE.contains("fn run(&self"),
        "circumscription: missing runtime path"
    );
    assert!(
        SOURCE.contains("fn preconditions(&self"),
        "circumscription: missing admission boundary"
    );
    assert!(
        SOURCE.contains("fn postconditions(&self"),
        "circumscription: missing postcondition boundary"
    );
    assert!(
        !SOURCE.contains("unimplemented!"),
        "circumscription: unimplemented macro present"
    );
    assert!(
        !SOURCE.contains("todo!"),
        "circumscription: todo macro present"
    );
    assert!(
        PAPER_POINTERS.contains("circumscription"),
        "circumscription: missing generated paper-pointer oracle"
    );
    assert!(
        ANTICHEAT.contains("anticheat_circumscription_"),
        "circumscription: missing generated anti-cheat oracle"
    );
}
