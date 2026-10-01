const SOURCE: &str = include_str!("../../src/breeds/autoinstinct_vision.rs");
const PAPER_POINTERS: &str = include_str!("../paper_pointers_generated.rs");
const ANTICHEAT: &str = include_str!("../universal_anticheat_generated.rs");

#[test]
fn autoinstinct_vision_has_source_runtime_contract_and_oracles() {
    assert!(
        SOURCE.contains("impl CognitionBreed for "),
        "autoinstinct_vision: missing CognitionBreed implementation"
    );
    assert!(
        SOURCE.contains("fn id(&self) -> BreedId"),
        "autoinstinct_vision: missing stable BreedId"
    );
    assert!(
        SOURCE.contains("fn run(&self"),
        "autoinstinct_vision: missing runtime path"
    );
    assert!(
        SOURCE.contains("fn preconditions(&self"),
        "autoinstinct_vision: missing admission boundary"
    );
    assert!(
        SOURCE.contains("fn postconditions(&self"),
        "autoinstinct_vision: missing postcondition boundary"
    );
    assert!(
        !SOURCE.contains("unimplemented!"),
        "autoinstinct_vision: unimplemented macro present"
    );
    assert!(
        !SOURCE.contains("todo!"),
        "autoinstinct_vision: todo macro present"
    );
    assert!(
        PAPER_POINTERS.contains("pointer_fixture_autoinstinct_vision_"),
        "autoinstinct_vision: missing generated paper-pointer oracle"
    );
    // Ontology law (wasm4pm-compat paper-pointers.ttl, PP_autoinstinct_vision_
    // true_clearobjectB): this breed's true pointer is hardcodeLockable=false
    // and carries NO decoy pointer (the published answer is a bare single
    // letter, unhardcodable by construction), so the universal-anticheat rule
    // lawfully emits ZERO anticheat_ entries for this breed. The lock must
    // stay absent unless an ontology commit makes the breed hardcode-lockable.
    assert!(
        !ANTICHEAT.contains("anticheat_autoinstinct_vision_"),
        "autoinstinct_vision: hardcodeLockable=false breed grew an anti-cheat lock without an ontology commit"
    );
}
