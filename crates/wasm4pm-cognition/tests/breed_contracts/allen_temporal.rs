const SOURCE: &str = include_str!("../../src/breeds/allen_temporal.rs");
const PAPER_POINTERS: &str = include_str!("../paper_pointers_generated.rs");
const ANTICHEAT: &str = include_str!("../universal_anticheat_generated.rs");

#[test]
fn allen_temporal_has_source_runtime_contract_and_oracles() {
    assert!(
        SOURCE.contains("impl CognitionBreed for "),
        "allen_temporal: missing CognitionBreed implementation"
    );
    assert!(
        SOURCE.contains("fn id(&self) -> BreedId"),
        "allen_temporal: missing stable BreedId"
    );
    assert!(
        SOURCE.contains("fn run(&self"),
        "allen_temporal: missing runtime path"
    );
    assert!(
        SOURCE.contains("fn preconditions(&self"),
        "allen_temporal: missing admission boundary"
    );
    assert!(
        SOURCE.contains("fn postconditions(&self"),
        "allen_temporal: missing postcondition boundary"
    );
    assert!(
        !SOURCE.contains("unimplemented!"),
        "allen_temporal: unimplemented macro present"
    );
    assert!(
        !SOURCE.contains("todo!"),
        "allen_temporal: todo macro present"
    );
    assert!(
        PAPER_POINTERS.contains("allen_temporal"),
        "allen_temporal: missing generated paper-pointer oracle"
    );
    assert!(
        ANTICHEAT.contains("anticheat_allen_temporal_"),
        "allen_temporal: missing generated anti-cheat oracle"
    );
}
