const SOURCE: &str = include_str!("../../src/breeds/csp_ac3.rs");
const PAPER_POINTERS: &str = include_str!("../paper_pointers_generated.rs");
const ANTICHEAT: &str = include_str!("../universal_anticheat_generated.rs");

#[test]
fn csp_ac3_has_source_runtime_contract_and_oracles() {
    assert!(
        SOURCE.contains("impl CognitionBreed for "),
        "csp_ac3: missing CognitionBreed implementation"
    );
    assert!(
        SOURCE.contains("fn id(&self) -> BreedId"),
        "csp_ac3: missing stable BreedId"
    );
    assert!(
        SOURCE.contains("fn run(&self"),
        "csp_ac3: missing runtime path"
    );
    assert!(
        SOURCE.contains("fn preconditions(&self"),
        "csp_ac3: missing admission boundary"
    );
    assert!(
        SOURCE.contains("fn postconditions(&self"),
        "csp_ac3: missing postcondition boundary"
    );
    assert!(
        !SOURCE.contains("unimplemented!"),
        "csp_ac3: unimplemented macro present"
    );
    assert!(!SOURCE.contains("todo!"), "csp_ac3: todo macro present");
    assert!(
        PAPER_POINTERS.contains("csp_ac3"),
        "csp_ac3: missing generated paper-pointer oracle"
    );
    assert!(
        ANTICHEAT.contains("anticheat_csp_ac3_"),
        "csp_ac3: missing generated anti-cheat oracle"
    );
}
