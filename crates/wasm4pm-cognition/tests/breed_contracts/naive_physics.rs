const SOURCE: &str = include_str!("../../src/breeds/naive_physics.rs");
const PAPER_POINTERS: &str = include_str!("../paper_pointers_generated.rs");
const ANTICHEAT: &str = include_str!("../universal_anticheat_generated.rs");

#[test]
fn naive_physics_has_source_runtime_contract_and_oracles() {
    assert!(
        SOURCE.contains("impl CognitionBreed for "),
        "naive_physics: missing CognitionBreed implementation"
    );
    assert!(
        SOURCE.contains("fn id(&self) -> BreedId"),
        "naive_physics: missing stable BreedId"
    );
    assert!(
        SOURCE.contains("fn run(&self"),
        "naive_physics: missing runtime path"
    );
    assert!(
        SOURCE.contains("fn preconditions(&self"),
        "naive_physics: missing admission boundary"
    );
    assert!(
        SOURCE.contains("fn postconditions(&self"),
        "naive_physics: missing postcondition boundary"
    );
    assert!(
        !SOURCE.contains("unimplemented!"),
        "naive_physics: unimplemented macro present"
    );
    assert!(
        !SOURCE.contains("todo!"),
        "naive_physics: todo macro present"
    );
    assert!(
        PAPER_POINTERS.contains("naive_physics"),
        "naive_physics: missing generated paper-pointer oracle"
    );
    assert!(
        ANTICHEAT.contains("anticheat_naive_physics_"),
        "naive_physics: missing generated anti-cheat oracle"
    );
}
