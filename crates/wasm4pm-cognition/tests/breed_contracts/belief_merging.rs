const SOURCE: &str = include_str!("../../src/breeds/belief_merging.rs");
const PAPER_POINTERS: &str = include_str!("../paper_pointers_generated.rs");
const ANTICHEAT: &str = include_str!("../universal_anticheat_generated.rs");

#[test]
fn belief_merging_has_source_runtime_contract_and_oracles() {
    assert!(
        SOURCE.contains("impl CognitionBreed for "),
        "belief_merging: missing CognitionBreed implementation"
    );
    assert!(
        SOURCE.contains("fn id(&self) -> BreedId"),
        "belief_merging: missing stable BreedId"
    );
    assert!(
        SOURCE.contains("fn run(&self"),
        "belief_merging: missing runtime path"
    );
    assert!(
        SOURCE.contains("fn preconditions(&self"),
        "belief_merging: missing admission boundary"
    );
    assert!(
        SOURCE.contains("fn postconditions(&self"),
        "belief_merging: missing postcondition boundary"
    );
    assert!(
        !SOURCE.contains("unimplemented!"),
        "belief_merging: unimplemented macro present"
    );
    assert!(
        !SOURCE.contains("todo!"),
        "belief_merging: todo macro present"
    );
    assert!(
        PAPER_POINTERS.contains("belief_merging"),
        "belief_merging: missing generated paper-pointer oracle"
    );
    assert!(
        ANTICHEAT.contains("anticheat_belief_merging_"),
        "belief_merging: missing generated anti-cheat oracle"
    );
}
