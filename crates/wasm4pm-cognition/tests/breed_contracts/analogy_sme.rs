const SOURCE: &str = include_str!("../../src/breeds/analogy_sme.rs");
const PAPER_POINTERS: &str = include_str!("../paper_pointers_generated.rs");
const ANTICHEAT: &str = include_str!("../universal_anticheat_generated.rs");

#[test]
fn analogy_sme_has_source_runtime_contract_and_oracles() {
    assert!(
        SOURCE.contains("impl CognitionBreed for "),
        "analogy_sme: missing CognitionBreed implementation"
    );
    assert!(
        SOURCE.contains("fn id(&self) -> BreedId"),
        "analogy_sme: missing stable BreedId"
    );
    assert!(
        SOURCE.contains("fn run(&self"),
        "analogy_sme: missing runtime path"
    );
    assert!(
        SOURCE.contains("fn preconditions(&self"),
        "analogy_sme: missing admission boundary"
    );
    assert!(
        SOURCE.contains("fn postconditions(&self"),
        "analogy_sme: missing postcondition boundary"
    );
    assert!(
        !SOURCE.contains("unimplemented!"),
        "analogy_sme: unimplemented macro present"
    );
    assert!(!SOURCE.contains("todo!"), "analogy_sme: todo macro present");
    assert!(
        PAPER_POINTERS.contains("analogy_sme"),
        "analogy_sme: missing generated paper-pointer oracle"
    );
    assert!(
        ANTICHEAT.contains("anticheat_analogy_sme_"),
        "analogy_sme: missing generated anti-cheat oracle"
    );
}
