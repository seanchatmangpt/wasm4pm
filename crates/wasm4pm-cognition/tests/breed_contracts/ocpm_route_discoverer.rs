const SOURCE: &str = include_str!("../../src/breeds/ocpm_route_discoverer.rs");
const PAPER_POINTERS: &str = include_str!("../paper_pointers_generated.rs");
const ANTICHEAT: &str = include_str!("../universal_anticheat_generated.rs");

#[test]
fn ocpm_route_discoverer_has_source_runtime_contract_and_oracles() {
    assert!(
        SOURCE.contains("impl CognitionBreed for "),
        "ocpm_route_discoverer: missing CognitionBreed implementation"
    );
    assert!(
        SOURCE.contains("fn id(&self) -> BreedId"),
        "ocpm_route_discoverer: missing stable BreedId"
    );
    assert!(
        SOURCE.contains("fn run(&self"),
        "ocpm_route_discoverer: missing runtime path"
    );
    assert!(
        SOURCE.contains("fn preconditions(&self"),
        "ocpm_route_discoverer: missing admission boundary"
    );
    assert!(
        SOURCE.contains("fn postconditions(&self"),
        "ocpm_route_discoverer: missing postcondition boundary"
    );
    assert!(
        !SOURCE.contains("unimplemented!"),
        "ocpm_route_discoverer: unimplemented macro present"
    );
    assert!(
        !SOURCE.contains("todo!"),
        "ocpm_route_discoverer: todo macro present"
    );
    assert!(
        PAPER_POINTERS.contains("ocpm_route_discoverer"),
        "ocpm_route_discoverer: missing generated paper-pointer oracle"
    );
    assert!(
        ANTICHEAT.contains("anticheat_ocpm_route_discoverer_"),
        "ocpm_route_discoverer: missing generated anti-cheat oracle"
    );
}
