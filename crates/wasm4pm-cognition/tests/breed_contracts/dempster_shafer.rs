const SOURCE: &str = include_str!("../../src/breeds/dempster_shafer.rs");
const PAPER_POINTERS: &str = include_str!("../paper_pointers_generated.rs");
const ANTICHEAT: &str = include_str!("../universal_anticheat_generated.rs");

#[test]
fn dempster_shafer_has_source_runtime_contract_and_oracles() {
    assert!(
        SOURCE.contains("impl CognitionBreed for "),
        "dempster_shafer: missing CognitionBreed implementation"
    );
    assert!(
        SOURCE.contains("fn id(&self) -> BreedId"),
        "dempster_shafer: missing stable BreedId"
    );
    assert!(
        SOURCE.contains("fn run(&self"),
        "dempster_shafer: missing runtime path"
    );
    assert!(
        SOURCE.contains("fn preconditions(&self"),
        "dempster_shafer: missing admission boundary"
    );
    assert!(
        SOURCE.contains("fn postconditions(&self"),
        "dempster_shafer: missing postcondition boundary"
    );
    assert!(
        !SOURCE.contains("unimplemented!"),
        "dempster_shafer: unimplemented macro present"
    );
    assert!(
        !SOURCE.contains("todo!"),
        "dempster_shafer: todo macro present"
    );
    assert!(
        PAPER_POINTERS.contains("dempster_shafer"),
        "dempster_shafer: missing generated paper-pointer oracle"
    );
    assert!(
        ANTICHEAT.contains("anticheat_dempster_shafer_"),
        "dempster_shafer: missing generated anti-cheat oracle"
    );
}
