const SOURCE: &str = include_str!("../../src/breeds/ctl_check.rs");
const PAPER_POINTERS: &str = include_str!("../paper_pointers_generated.rs");
const ANTICHEAT: &str = include_str!("../universal_anticheat_generated.rs");

#[test]
fn ctl_check_has_source_runtime_contract_and_oracles() {
    assert!(
        SOURCE.contains("impl CognitionBreed for "),
        "ctl_check: missing CognitionBreed implementation"
    );
    assert!(
        SOURCE.contains("fn id(&self) -> BreedId"),
        "ctl_check: missing stable BreedId"
    );
    assert!(
        SOURCE.contains("fn run(&self"),
        "ctl_check: missing runtime path"
    );
    assert!(
        SOURCE.contains("fn preconditions(&self"),
        "ctl_check: missing admission boundary"
    );
    assert!(
        SOURCE.contains("fn postconditions(&self"),
        "ctl_check: missing postcondition boundary"
    );
    assert!(
        !SOURCE.contains("unimplemented!"),
        "ctl_check: unimplemented macro present"
    );
    assert!(!SOURCE.contains("todo!"), "ctl_check: todo macro present");
    assert!(
        PAPER_POINTERS.contains("ctl_check"),
        "ctl_check: missing generated paper-pointer oracle"
    );
    assert!(
        ANTICHEAT.contains("anticheat_ctl_check_"),
        "ctl_check: missing generated anti-cheat oracle"
    );
}
