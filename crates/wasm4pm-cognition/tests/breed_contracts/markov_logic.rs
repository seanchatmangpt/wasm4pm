const SOURCE: &str = include_str!("../../src/breeds/markov_logic.rs");
const PAPER_POINTERS: &str = include_str!("../paper_pointers_generated.rs");
const ANTICHEAT: &str = include_str!("../universal_anticheat_generated.rs");

#[test]
fn markov_logic_has_source_runtime_contract_and_oracles() {
    assert!(
        SOURCE.contains("impl CognitionBreed for "),
        "markov_logic: missing CognitionBreed implementation"
    );
    assert!(
        SOURCE.contains("fn id(&self) -> BreedId"),
        "markov_logic: missing stable BreedId"
    );
    assert!(
        SOURCE.contains("fn run(&self"),
        "markov_logic: missing runtime path"
    );
    assert!(
        SOURCE.contains("fn preconditions(&self"),
        "markov_logic: missing admission boundary"
    );
    assert!(
        SOURCE.contains("fn postconditions(&self"),
        "markov_logic: missing postcondition boundary"
    );
    assert!(
        !SOURCE.contains("unimplemented!"),
        "markov_logic: unimplemented macro present"
    );
    assert!(
        !SOURCE.contains("todo!"),
        "markov_logic: todo macro present"
    );
    assert!(
        PAPER_POINTERS.contains("markov_logic"),
        "markov_logic: missing generated paper-pointer oracle"
    );
    assert!(
        ANTICHEAT.contains("anticheat_markov_logic_"),
        "markov_logic: missing generated anti-cheat oracle"
    );
}
