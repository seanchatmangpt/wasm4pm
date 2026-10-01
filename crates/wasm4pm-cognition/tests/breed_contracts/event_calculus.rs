const SOURCE: &str = include_str!("../../src/breeds/event_calculus.rs");
const PAPER_POINTERS: &str = include_str!("../paper_pointers_generated.rs");
const ANTICHEAT: &str = include_str!("../universal_anticheat_generated.rs");

#[test]
fn event_calculus_has_source_runtime_contract_and_oracles() {
    assert!(
        SOURCE.contains("impl CognitionBreed for "),
        "event_calculus: missing CognitionBreed implementation"
    );
    assert!(
        SOURCE.contains("fn id(&self) -> BreedId"),
        "event_calculus: missing stable BreedId"
    );
    assert!(
        SOURCE.contains("fn run(&self"),
        "event_calculus: missing runtime path"
    );
    assert!(
        SOURCE.contains("fn preconditions(&self"),
        "event_calculus: missing admission boundary"
    );
    assert!(
        SOURCE.contains("fn postconditions(&self"),
        "event_calculus: missing postcondition boundary"
    );
    assert!(
        !SOURCE.contains("unimplemented!"),
        "event_calculus: unimplemented macro present"
    );
    assert!(
        !SOURCE.contains("todo!"),
        "event_calculus: todo macro present"
    );
    assert!(
        PAPER_POINTERS.contains("event_calculus"),
        "event_calculus: missing generated paper-pointer oracle"
    );
    assert!(
        ANTICHEAT.contains("anticheat_event_calculus_"),
        "event_calculus: missing generated anti-cheat oracle"
    );
}
