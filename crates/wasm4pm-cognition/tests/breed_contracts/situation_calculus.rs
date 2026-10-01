const SOURCE: &str = include_str!("../../src/breeds/situation_calculus.rs");
const PAPER_POINTERS: &str = include_str!("../paper_pointers_generated.rs");
const ANTICHEAT: &str = include_str!("../universal_anticheat_generated.rs");

#[test]
fn situation_calculus_has_source_runtime_contract_and_oracles() {
    assert!(
        SOURCE.contains("impl CognitionBreed for "),
        "situation_calculus: missing CognitionBreed implementation"
    );
    assert!(
        SOURCE.contains("fn id(&self) -> BreedId"),
        "situation_calculus: missing stable BreedId"
    );
    assert!(
        SOURCE.contains("fn run(&self"),
        "situation_calculus: missing runtime path"
    );
    assert!(
        SOURCE.contains("fn preconditions(&self"),
        "situation_calculus: missing admission boundary"
    );
    assert!(
        SOURCE.contains("fn postconditions(&self"),
        "situation_calculus: missing postcondition boundary"
    );
    assert!(
        !SOURCE.contains("unimplemented!"),
        "situation_calculus: unimplemented macro present"
    );
    assert!(
        !SOURCE.contains("todo!"),
        "situation_calculus: todo macro present"
    );
    assert!(
        PAPER_POINTERS.contains("situation_calculus"),
        "situation_calculus: missing generated paper-pointer oracle"
    );
    assert!(
        ANTICHEAT.contains("anticheat_situation_calculus_"),
        "situation_calculus: missing generated anti-cheat oracle"
    );
}
