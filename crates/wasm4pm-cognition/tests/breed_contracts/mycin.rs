const SOURCE: &str = include_str!("../../src/breeds/production_rules.rs");
const PAPER_POINTERS: &str = include_str!("../paper_pointers_generated.rs");
const ANTICHEAT: &str = include_str!("../universal_anticheat_generated.rs");

#[test]
fn mycin_has_source_runtime_contract_and_oracles() {
    assert!(
        SOURCE.contains("impl CognitionBreed for "),
        "mycin: missing CognitionBreed implementation"
    );
    assert!(
        SOURCE.contains("fn id(&self) -> BreedId"),
        "mycin: missing stable BreedId"
    );
    assert!(
        SOURCE.contains("fn run(&self"),
        "mycin: missing runtime path"
    );
    assert!(
        SOURCE.contains("fn preconditions(&self"),
        "mycin: missing admission boundary"
    );
    assert!(
        SOURCE.contains("fn postconditions(&self"),
        "mycin: missing postcondition boundary"
    );
    assert!(
        !SOURCE.contains("unimplemented!"),
        "mycin: unimplemented macro present"
    );
    assert!(!SOURCE.contains("todo!"), "mycin: todo macro present");
    assert!(
        PAPER_POINTERS.contains("mycin"),
        "mycin: missing generated paper-pointer oracle"
    );
    assert!(
        ANTICHEAT.contains("anticheat_mycin_"),
        "mycin: missing generated anti-cheat oracle"
    );
}
