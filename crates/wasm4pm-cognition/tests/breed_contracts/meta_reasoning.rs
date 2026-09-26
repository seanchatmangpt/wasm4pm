const SOURCE: &str = include_str!("../../src/breeds/meta_reasoning.rs");
const PAPER_POINTERS: &str = include_str!("../paper_pointers_generated.rs");
const ANTICHEAT: &str = include_str!("../universal_anticheat_generated.rs");

#[test]
fn meta_reasoning_has_source_runtime_contract_and_oracles() {
    assert!(
        SOURCE.contains("impl CognitionBreed for "),
        "meta_reasoning: missing CognitionBreed implementation"
    );
    assert!(
        SOURCE.contains("fn id(&self) -> BreedId"),
        "meta_reasoning: missing stable BreedId"
    );
    assert!(
        SOURCE.contains("fn run(&self"),
        "meta_reasoning: missing runtime path"
    );
    assert!(
        SOURCE.contains("fn preconditions(&self"),
        "meta_reasoning: missing admission boundary"
    );
    assert!(
        SOURCE.contains("fn postconditions(&self"),
        "meta_reasoning: missing postcondition boundary"
    );
    assert!(
        !SOURCE.contains("unimplemented!"),
        "meta_reasoning: unimplemented macro present"
    );
    assert!(
        !SOURCE.contains("todo!"),
        "meta_reasoning: todo macro present"
    );
    assert!(
        PAPER_POINTERS.contains("meta_reasoning"),
        "meta_reasoning: missing generated paper-pointer oracle"
    );
    assert!(
        ANTICHEAT.contains("anticheat_meta_reasoning_"),
        "meta_reasoning: missing generated anti-cheat oracle"
    );
}
