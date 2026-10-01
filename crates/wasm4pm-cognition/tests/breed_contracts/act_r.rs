const SOURCE: &str = include_str!("../../src/breeds/act_r.rs");
const PAPER_POINTERS: &str = include_str!("../paper_pointers_generated.rs");
const ANTICHEAT: &str = include_str!("../universal_anticheat_generated.rs");

#[test]
fn act_r_has_source_runtime_contract_and_oracles() {
    assert!(
        SOURCE.contains("impl CognitionBreed for "),
        "act_r: missing CognitionBreed implementation"
    );
    assert!(
        SOURCE.contains("fn id(&self) -> BreedId"),
        "act_r: missing stable BreedId"
    );
    assert!(
        SOURCE.contains("fn run(&self"),
        "act_r: missing runtime path"
    );
    assert!(
        SOURCE.contains("fn preconditions(&self"),
        "act_r: missing admission boundary"
    );
    assert!(
        SOURCE.contains("fn postconditions(&self"),
        "act_r: missing postcondition boundary"
    );
    assert!(
        !SOURCE.contains("unimplemented!"),
        "act_r: unimplemented macro present"
    );
    assert!(!SOURCE.contains("todo!"), "act_r: todo macro present");
    assert!(
        PAPER_POINTERS.contains("act_r"),
        "act_r: missing generated paper-pointer oracle"
    );
    assert!(
        ANTICHEAT.contains("anticheat_act_r_"),
        "act_r: missing generated anti-cheat oracle"
    );
}
