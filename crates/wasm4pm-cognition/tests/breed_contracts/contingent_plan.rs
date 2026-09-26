const SOURCE: &str = include_str!("../../src/breeds/contingent_plan.rs");
const PAPER_POINTERS: &str = include_str!("../paper_pointers_generated.rs");
const ANTICHEAT: &str = include_str!("../universal_anticheat_generated.rs");

#[test]
fn contingent_plan_has_source_runtime_contract_and_oracles() {
    assert!(
        SOURCE.contains("impl CognitionBreed for "),
        "contingent_plan: missing CognitionBreed implementation"
    );
    assert!(
        SOURCE.contains("fn id(&self) -> BreedId"),
        "contingent_plan: missing stable BreedId"
    );
    assert!(
        SOURCE.contains("fn run(&self"),
        "contingent_plan: missing runtime path"
    );
    assert!(
        SOURCE.contains("fn preconditions(&self"),
        "contingent_plan: missing admission boundary"
    );
    assert!(
        SOURCE.contains("fn postconditions(&self"),
        "contingent_plan: missing postcondition boundary"
    );
    assert!(
        !SOURCE.contains("unimplemented!"),
        "contingent_plan: unimplemented macro present"
    );
    assert!(
        !SOURCE.contains("todo!"),
        "contingent_plan: todo macro present"
    );
    assert!(
        PAPER_POINTERS.contains("contingent_plan"),
        "contingent_plan: missing generated paper-pointer oracle"
    );
    assert!(
        ANTICHEAT.contains("anticheat_contingent_plan_"),
        "contingent_plan: missing generated anti-cheat oracle"
    );
}
