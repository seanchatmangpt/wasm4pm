const SOURCE: &str = include_str!("../../src/breeds/sat_cdcl.rs");
const PAPER_POINTERS: &str = include_str!("../paper_pointers_generated.rs");
const ANTICHEAT: &str = include_str!("../universal_anticheat_generated.rs");

#[test]
fn sat_cdcl_has_source_runtime_contract_and_oracles() {
    assert!(
        SOURCE.contains("impl CognitionBreed for "),
        "sat_cdcl: missing CognitionBreed implementation"
    );
    assert!(
        SOURCE.contains("fn id(&self) -> BreedId"),
        "sat_cdcl: missing stable BreedId"
    );
    assert!(
        SOURCE.contains("fn run(&self"),
        "sat_cdcl: missing runtime path"
    );
    assert!(
        SOURCE.contains("fn preconditions(&self"),
        "sat_cdcl: missing admission boundary"
    );
    assert!(
        SOURCE.contains("fn postconditions(&self"),
        "sat_cdcl: missing postcondition boundary"
    );
    assert!(
        !SOURCE.contains("unimplemented!"),
        "sat_cdcl: unimplemented macro present"
    );
    assert!(!SOURCE.contains("todo!"), "sat_cdcl: todo macro present");
    assert!(
        PAPER_POINTERS.contains("sat_cdcl"),
        "sat_cdcl: missing generated paper-pointer oracle"
    );
    assert!(
        ANTICHEAT.contains("anticheat_sat_cdcl_"),
        "sat_cdcl: missing generated anti-cheat oracle"
    );
}
