const SOURCE: &str = include_str!("../../src/breeds/problog.rs");
const PAPER_POINTERS: &str = include_str!("../paper_pointers_generated.rs");
const ANTICHEAT: &str = include_str!("../universal_anticheat_generated.rs");

#[test]
fn problog_has_source_runtime_contract_and_oracles() {
    assert!(
        SOURCE.contains("impl CognitionBreed for "),
        "problog: missing CognitionBreed implementation"
    );
    assert!(
        SOURCE.contains("fn id(&self) -> BreedId"),
        "problog: missing stable BreedId"
    );
    assert!(
        SOURCE.contains("fn run(&self"),
        "problog: missing runtime path"
    );
    assert!(
        SOURCE.contains("fn preconditions(&self"),
        "problog: missing admission boundary"
    );
    assert!(
        SOURCE.contains("fn postconditions(&self"),
        "problog: missing postcondition boundary"
    );
    assert!(
        !SOURCE.contains("unimplemented!"),
        "problog: unimplemented macro present"
    );
    assert!(!SOURCE.contains("todo!"), "problog: todo macro present");
    assert!(
        PAPER_POINTERS.contains("problog"),
        "problog: missing generated paper-pointer oracle"
    );
    assert!(
        ANTICHEAT.contains("anticheat_problog_"),
        "problog: missing generated anti-cheat oracle"
    );
}
