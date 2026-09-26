const SOURCE: &str = include_str!("../../src/breeds/abductive_lp.rs");
const PAPER_POINTERS: &str = include_str!("../paper_pointers_generated.rs");
const ANTICHEAT: &str = include_str!("../universal_anticheat_generated.rs");

#[test]
fn abductive_lp_has_source_runtime_contract_and_oracles() {
    assert!(
        SOURCE.contains("impl CognitionBreed for "),
        "abductive_lp: missing CognitionBreed implementation"
    );
    assert!(
        SOURCE.contains("fn id(&self) -> BreedId"),
        "abductive_lp: missing stable BreedId"
    );
    assert!(
        SOURCE.contains("fn run(&self"),
        "abductive_lp: missing runtime path"
    );
    assert!(
        SOURCE.contains("fn preconditions(&self"),
        "abductive_lp: missing admission boundary"
    );
    assert!(
        SOURCE.contains("fn postconditions(&self"),
        "abductive_lp: missing postcondition boundary"
    );
    assert!(
        !SOURCE.contains("unimplemented!"),
        "abductive_lp: unimplemented macro present"
    );
    assert!(
        !SOURCE.contains("todo!"),
        "abductive_lp: todo macro present"
    );
    assert!(
        PAPER_POINTERS.contains("abductive_lp"),
        "abductive_lp: missing generated paper-pointer oracle"
    );
    assert!(
        ANTICHEAT.contains("anticheat_abductive_lp_"),
        "abductive_lp: missing generated anti-cheat oracle"
    );
}
