const SOURCE: &str = include_str!("../../src/breeds/mdp.rs");
const PAPER_POINTERS: &str = include_str!("../paper_pointers_generated.rs");
const ANTICHEAT: &str = include_str!("../universal_anticheat_generated.rs");

#[test]
fn mdp_has_source_runtime_contract_and_oracles() {
    assert!(
        SOURCE.contains("impl CognitionBreed for "),
        "mdp: missing CognitionBreed implementation"
    );
    assert!(
        SOURCE.contains("fn id(&self) -> BreedId"),
        "mdp: missing stable BreedId"
    );
    assert!(SOURCE.contains("fn run(&self"), "mdp: missing runtime path");
    assert!(
        SOURCE.contains("fn preconditions(&self"),
        "mdp: missing admission boundary"
    );
    assert!(
        SOURCE.contains("fn postconditions(&self"),
        "mdp: missing postcondition boundary"
    );
    assert!(
        !SOURCE.contains("unimplemented!"),
        "mdp: unimplemented macro present"
    );
    assert!(!SOURCE.contains("todo!"), "mdp: todo macro present");
    assert!(
        PAPER_POINTERS.contains("mdp"),
        "mdp: missing generated paper-pointer oracle"
    );
    assert!(
        ANTICHEAT.contains("anticheat_mdp_"),
        "mdp: missing generated anti-cheat oracle"
    );
}
