const SOURCE: &str = include_str!("../../src/breeds/autoinstinct_neurosis.rs");
const PAPER_POINTERS: &str = include_str!("../paper_pointers_generated.rs");
const ANTICHEAT: &str = include_str!("../universal_anticheat_generated.rs");

#[test]
fn autoinstinct_neurosis_has_source_runtime_contract_and_oracles() {
    assert!(
        SOURCE.contains("impl CognitionBreed for "),
        "autoinstinct_neurosis: missing CognitionBreed implementation"
    );
    assert!(
        SOURCE.contains("fn id(&self) -> BreedId"),
        "autoinstinct_neurosis: missing stable BreedId"
    );
    assert!(
        SOURCE.contains("fn run(&self"),
        "autoinstinct_neurosis: missing runtime path"
    );
    assert!(
        SOURCE.contains("fn preconditions(&self"),
        "autoinstinct_neurosis: missing admission boundary"
    );
    assert!(
        SOURCE.contains("fn postconditions(&self"),
        "autoinstinct_neurosis: missing postcondition boundary"
    );
    assert!(
        !SOURCE.contains("unimplemented!"),
        "autoinstinct_neurosis: unimplemented macro present"
    );
    assert!(
        !SOURCE.contains("todo!"),
        "autoinstinct_neurosis: todo macro present"
    );
    assert!(
        PAPER_POINTERS.contains("autoinstinct_neurosis"),
        "autoinstinct_neurosis: missing generated paper-pointer oracle"
    );
    assert!(
        ANTICHEAT.contains("anticheat_autoinstinct_neurosis_"),
        "autoinstinct_neurosis: missing generated anti-cheat oracle"
    );
}
