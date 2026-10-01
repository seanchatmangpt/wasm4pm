const SOURCE: &str = include_str!("../../src/breeds/qualitative_reason.rs");
const PAPER_POINTERS: &str = include_str!("../paper_pointers_generated.rs");
const ANTICHEAT: &str = include_str!("../universal_anticheat_generated.rs");

#[test]
fn qualitative_reason_has_source_runtime_contract_and_oracles() {
    assert!(
        SOURCE.contains("impl CognitionBreed for "),
        "qualitative_reason: missing CognitionBreed implementation"
    );
    assert!(
        SOURCE.contains("fn id(&self) -> BreedId"),
        "qualitative_reason: missing stable BreedId"
    );
    assert!(
        SOURCE.contains("fn run(&self"),
        "qualitative_reason: missing runtime path"
    );
    assert!(
        SOURCE.contains("fn preconditions(&self"),
        "qualitative_reason: missing admission boundary"
    );
    assert!(
        SOURCE.contains("fn postconditions(&self"),
        "qualitative_reason: missing postcondition boundary"
    );
    assert!(
        !SOURCE.contains("unimplemented!"),
        "qualitative_reason: unimplemented macro present"
    );
    assert!(
        !SOURCE.contains("todo!"),
        "qualitative_reason: todo macro present"
    );
    assert!(
        PAPER_POINTERS.contains("qualitative_reason"),
        "qualitative_reason: missing generated paper-pointer oracle"
    );
    assert!(
        ANTICHEAT.contains("anticheat_qualitative_reason_"),
        "qualitative_reason: missing generated anti-cheat oracle"
    );
}
