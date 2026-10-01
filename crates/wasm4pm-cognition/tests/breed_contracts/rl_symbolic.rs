const SOURCE: &str = include_str!("../../src/breeds/rl_symbolic.rs");
const PAPER_POINTERS: &str = include_str!("../paper_pointers_generated.rs");
const ANTICHEAT: &str = include_str!("../universal_anticheat_generated.rs");

#[test]
fn rl_symbolic_has_source_runtime_contract_and_oracles() {
    assert!(
        SOURCE.contains("impl CognitionBreed for "),
        "rl_symbolic: missing CognitionBreed implementation"
    );
    assert!(
        SOURCE.contains("fn id(&self) -> BreedId"),
        "rl_symbolic: missing stable BreedId"
    );
    assert!(
        SOURCE.contains("fn run(&self"),
        "rl_symbolic: missing runtime path"
    );
    assert!(
        SOURCE.contains("fn preconditions(&self"),
        "rl_symbolic: missing admission boundary"
    );
    assert!(
        SOURCE.contains("fn postconditions(&self"),
        "rl_symbolic: missing postcondition boundary"
    );
    assert!(
        !SOURCE.contains("unimplemented!"),
        "rl_symbolic: unimplemented macro present"
    );
    assert!(!SOURCE.contains("todo!"), "rl_symbolic: todo macro present");
    assert!(
        PAPER_POINTERS.contains("rl_symbolic"),
        "rl_symbolic: missing generated paper-pointer oracle"
    );
    assert!(
        ANTICHEAT.contains("anticheat_rl_symbolic_"),
        "rl_symbolic: missing generated anti-cheat oracle"
    );
}
