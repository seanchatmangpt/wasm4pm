const SOURCE: &str = include_str!("../../src/breeds/ebl.rs");
const PAPER_POINTERS: &str = include_str!("../paper_pointers_generated.rs");
const ANTICHEAT: &str = include_str!("../universal_anticheat_generated.rs");

#[test]
fn ebl_has_source_runtime_contract_and_oracles() {
    assert!(
        SOURCE.contains("impl CognitionBreed for "),
        "ebl: missing CognitionBreed implementation"
    );
    assert!(
        SOURCE.contains("fn id(&self) -> BreedId"),
        "ebl: missing stable BreedId"
    );
    assert!(SOURCE.contains("fn run(&self"), "ebl: missing runtime path");
    assert!(
        SOURCE.contains("fn preconditions(&self"),
        "ebl: missing admission boundary"
    );
    assert!(
        SOURCE.contains("fn postconditions(&self"),
        "ebl: missing postcondition boundary"
    );
    assert!(
        !SOURCE.contains("unimplemented!"),
        "ebl: unimplemented macro present"
    );
    assert!(!SOURCE.contains("todo!"), "ebl: todo macro present");
    assert!(
        PAPER_POINTERS.contains("ebl"),
        "ebl: missing generated paper-pointer oracle"
    );
    assert!(
        ANTICHEAT.contains("anticheat_ebl_"),
        "ebl: missing generated anti-cheat oracle"
    );
}
