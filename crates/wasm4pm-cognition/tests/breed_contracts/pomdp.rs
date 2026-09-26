const SOURCE: &str = include_str!("../../src/breeds/pomdp.rs");
const PAPER_POINTERS: &str = include_str!("../paper_pointers_generated.rs");
const ANTICHEAT: &str = include_str!("../universal_anticheat_generated.rs");

#[test]
fn pomdp_has_source_runtime_contract_and_oracles() {
    assert!(
        SOURCE.contains("impl CognitionBreed for "),
        "pomdp: missing CognitionBreed implementation"
    );
    assert!(
        SOURCE.contains("fn id(&self) -> BreedId"),
        "pomdp: missing stable BreedId"
    );
    assert!(
        SOURCE.contains("fn run(&self"),
        "pomdp: missing runtime path"
    );
    assert!(
        SOURCE.contains("fn preconditions(&self"),
        "pomdp: missing admission boundary"
    );
    assert!(
        SOURCE.contains("fn postconditions(&self"),
        "pomdp: missing postcondition boundary"
    );
    assert!(
        !SOURCE.contains("unimplemented!"),
        "pomdp: unimplemented macro present"
    );
    assert!(!SOURCE.contains("todo!"), "pomdp: todo macro present");
    assert!(
        PAPER_POINTERS.contains("pomdp"),
        "pomdp: missing generated paper-pointer oracle"
    );
    assert!(
        ANTICHEAT.contains("anticheat_pomdp_"),
        "pomdp: missing generated anti-cheat oracle"
    );
}
