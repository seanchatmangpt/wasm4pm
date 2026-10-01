const SOURCE: &str = include_str!("../../src/breeds/frames_inheritance.rs");
const PAPER_POINTERS: &str = include_str!("../paper_pointers_generated.rs");
const ANTICHEAT: &str = include_str!("../universal_anticheat_generated.rs");

#[test]
fn frames_inheritance_has_source_runtime_contract_and_oracles() {
    assert!(
        SOURCE.contains("impl CognitionBreed for "),
        "frames_inheritance: missing CognitionBreed implementation"
    );
    assert!(
        SOURCE.contains("fn id(&self) -> BreedId"),
        "frames_inheritance: missing stable BreedId"
    );
    assert!(
        SOURCE.contains("fn run(&self"),
        "frames_inheritance: missing runtime path"
    );
    assert!(
        SOURCE.contains("fn preconditions(&self"),
        "frames_inheritance: missing admission boundary"
    );
    assert!(
        SOURCE.contains("fn postconditions(&self"),
        "frames_inheritance: missing postcondition boundary"
    );
    assert!(
        !SOURCE.contains("unimplemented!"),
        "frames_inheritance: unimplemented macro present"
    );
    assert!(
        !SOURCE.contains("todo!"),
        "frames_inheritance: todo macro present"
    );
    assert!(
        PAPER_POINTERS.contains("frames_inheritance"),
        "frames_inheritance: missing generated paper-pointer oracle"
    );
    assert!(
        ANTICHEAT.contains("anticheat_frames_inheritance_"),
        "frames_inheritance: missing generated anti-cheat oracle"
    );
}
