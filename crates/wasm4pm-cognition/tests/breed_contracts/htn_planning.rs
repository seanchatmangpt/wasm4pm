const SOURCE: &str = include_str!("../../src/breeds/htn_planning.rs");
const PAPER_POINTERS: &str = include_str!("../paper_pointers_generated.rs");
const ANTICHEAT: &str = include_str!("../universal_anticheat_generated.rs");

#[test]
fn htn_planning_has_source_runtime_contract_and_oracles() {
    assert!(
        SOURCE.contains("impl CognitionBreed for "),
        "htn_planning: missing CognitionBreed implementation"
    );
    assert!(
        SOURCE.contains("fn id(&self) -> BreedId"),
        "htn_planning: missing stable BreedId"
    );
    assert!(
        SOURCE.contains("fn run(&self"),
        "htn_planning: missing runtime path"
    );
    assert!(
        SOURCE.contains("fn preconditions(&self"),
        "htn_planning: missing admission boundary"
    );
    assert!(
        SOURCE.contains("fn postconditions(&self"),
        "htn_planning: missing postcondition boundary"
    );
    assert!(
        !SOURCE.contains("unimplemented!"),
        "htn_planning: unimplemented macro present"
    );
    assert!(
        !SOURCE.contains("todo!"),
        "htn_planning: todo macro present"
    );
    assert!(
        PAPER_POINTERS.contains("htn_planning"),
        "htn_planning: missing generated paper-pointer oracle"
    );
    assert!(
        ANTICHEAT.contains("anticheat_htn_planning_"),
        "htn_planning: missing generated anti-cheat oracle"
    );
}
