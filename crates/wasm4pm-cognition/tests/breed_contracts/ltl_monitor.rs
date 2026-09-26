const SOURCE: &str = include_str!("../../src/breeds/ltl_monitor.rs");
const PAPER_POINTERS: &str = include_str!("../paper_pointers_generated.rs");
const ANTICHEAT: &str = include_str!("../universal_anticheat_generated.rs");

#[test]
fn ltl_monitor_has_source_runtime_contract_and_oracles() {
    assert!(
        SOURCE.contains("impl CognitionBreed for "),
        "ltl_monitor: missing CognitionBreed implementation"
    );
    assert!(
        SOURCE.contains("fn id(&self) -> BreedId"),
        "ltl_monitor: missing stable BreedId"
    );
    assert!(
        SOURCE.contains("fn run(&self"),
        "ltl_monitor: missing runtime path"
    );
    assert!(
        SOURCE.contains("fn preconditions(&self"),
        "ltl_monitor: missing admission boundary"
    );
    assert!(
        SOURCE.contains("fn postconditions(&self"),
        "ltl_monitor: missing postcondition boundary"
    );
    assert!(
        !SOURCE.contains("unimplemented!"),
        "ltl_monitor: unimplemented macro present"
    );
    assert!(!SOURCE.contains("todo!"), "ltl_monitor: todo macro present");
    assert!(
        PAPER_POINTERS.contains("ltl_monitor"),
        "ltl_monitor: missing generated paper-pointer oracle"
    );
    assert!(
        ANTICHEAT.contains("anticheat_ltl_monitor_"),
        "ltl_monitor: missing generated anti-cheat oracle"
    );
}
