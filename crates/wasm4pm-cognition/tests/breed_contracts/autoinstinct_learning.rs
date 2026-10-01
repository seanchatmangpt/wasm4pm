const SOURCE: &str = include_str!("../../src/breeds/autoinstinct_learning.rs");
const PAPER_POINTERS: &str = include_str!("../paper_pointers_generated.rs");
const ANTICHEAT: &str = include_str!("../universal_anticheat_generated.rs");

#[test]
fn autoinstinct_learning_has_source_runtime_contract_and_oracles() {
    assert!(
        SOURCE.contains("impl CognitionBreed for "),
        "autoinstinct_learning: missing CognitionBreed implementation"
    );
    assert!(
        SOURCE.contains("fn id(&self) -> BreedId"),
        "autoinstinct_learning: missing stable BreedId"
    );
    assert!(
        SOURCE.contains("fn run(&self"),
        "autoinstinct_learning: missing runtime path"
    );
    assert!(
        SOURCE.contains("fn preconditions(&self"),
        "autoinstinct_learning: missing admission boundary"
    );
    assert!(
        SOURCE.contains("fn postconditions(&self"),
        "autoinstinct_learning: missing postcondition boundary"
    );
    assert!(
        !SOURCE.contains("unimplemented!"),
        "autoinstinct_learning: unimplemented macro present"
    );
    assert!(
        !SOURCE.contains("todo!"),
        "autoinstinct_learning: todo macro present"
    );
    assert!(
        PAPER_POINTERS.contains("autoinstinct_learning"),
        "autoinstinct_learning: missing generated paper-pointer oracle"
    );
    assert!(
        ANTICHEAT.contains("anticheat_autoinstinct_learning_"),
        "autoinstinct_learning: missing generated anti-cheat oracle"
    );
}
