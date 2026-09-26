const SOURCE: &str = include_str!("../../src/breeds/construction_grammar.rs");
const PAPER_POINTERS: &str = include_str!("../paper_pointers_generated.rs");
const ANTICHEAT: &str = include_str!("../universal_anticheat_generated.rs");

#[test]
fn construction_grammar_has_source_runtime_contract_and_oracles() {
    assert!(
        SOURCE.contains("impl CognitionBreed for "),
        "construction_grammar: missing CognitionBreed implementation"
    );
    assert!(
        SOURCE.contains("fn id(&self) -> BreedId"),
        "construction_grammar: missing stable BreedId"
    );
    assert!(
        SOURCE.contains("fn run(&self"),
        "construction_grammar: missing runtime path"
    );
    assert!(
        SOURCE.contains("fn preconditions(&self"),
        "construction_grammar: missing admission boundary"
    );
    assert!(
        SOURCE.contains("fn postconditions(&self"),
        "construction_grammar: missing postcondition boundary"
    );
    assert!(
        !SOURCE.contains("unimplemented!"),
        "construction_grammar: unimplemented macro present"
    );
    assert!(
        !SOURCE.contains("todo!"),
        "construction_grammar: todo macro present"
    );
    assert!(
        PAPER_POINTERS.contains("construction_grammar"),
        "construction_grammar: missing generated paper-pointer oracle"
    );
    assert!(
        ANTICHEAT.contains("anticheat_construction_grammar_"),
        "construction_grammar: missing generated anti-cheat oracle"
    );
}
