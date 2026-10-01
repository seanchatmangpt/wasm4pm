const SOURCE: &str = include_str!("../../src/breeds/partial_order_plan.rs");
const PAPER_POINTERS: &str = include_str!("../paper_pointers_generated.rs");
const ANTICHEAT: &str = include_str!("../universal_anticheat_generated.rs");

#[test]
fn partial_order_plan_has_source_runtime_contract_and_oracles() {
    assert!(
        SOURCE.contains("impl CognitionBreed for "),
        "partial_order_plan: missing CognitionBreed implementation"
    );
    assert!(
        SOURCE.contains("fn id(&self) -> BreedId"),
        "partial_order_plan: missing stable BreedId"
    );
    assert!(
        SOURCE.contains("fn run(&self"),
        "partial_order_plan: missing runtime path"
    );
    assert!(
        SOURCE.contains("fn preconditions(&self"),
        "partial_order_plan: missing admission boundary"
    );
    assert!(
        SOURCE.contains("fn postconditions(&self"),
        "partial_order_plan: missing postcondition boundary"
    );
    assert!(
        !SOURCE.contains("unimplemented!"),
        "partial_order_plan: unimplemented macro present"
    );
    assert!(
        !SOURCE.contains("todo!"),
        "partial_order_plan: todo macro present"
    );
    assert!(
        PAPER_POINTERS.contains("partial_order_plan"),
        "partial_order_plan: missing generated paper-pointer oracle"
    );
    assert!(
        ANTICHEAT.contains("anticheat_partial_order_plan_"),
        "partial_order_plan: missing generated anti-cheat oracle"
    );
}
