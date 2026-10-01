const SOURCE: &str = include_str!("../../src/breeds/script_sam.rs");
const PAPER_POINTERS: &str = include_str!("../paper_pointers_generated.rs");
const ANTICHEAT: &str = include_str!("../universal_anticheat_generated.rs");

#[test]
fn script_sam_has_source_runtime_contract_and_oracles() {
    assert!(
        SOURCE.contains("impl CognitionBreed for "),
        "script_sam: missing CognitionBreed implementation"
    );
    assert!(
        SOURCE.contains("fn id(&self) -> BreedId"),
        "script_sam: missing stable BreedId"
    );
    assert!(
        SOURCE.contains("fn run(&self"),
        "script_sam: missing runtime path"
    );
    assert!(
        SOURCE.contains("fn preconditions(&self"),
        "script_sam: missing admission boundary"
    );
    assert!(
        SOURCE.contains("fn postconditions(&self"),
        "script_sam: missing postcondition boundary"
    );
    assert!(
        !SOURCE.contains("unimplemented!"),
        "script_sam: unimplemented macro present"
    );
    assert!(!SOURCE.contains("todo!"), "script_sam: todo macro present");
    assert!(
        PAPER_POINTERS.contains("script_sam"),
        "script_sam: missing generated paper-pointer oracle"
    );
    assert!(
        ANTICHEAT.contains("anticheat_script_sam_"),
        "script_sam: missing generated anti-cheat oracle"
    );
}
