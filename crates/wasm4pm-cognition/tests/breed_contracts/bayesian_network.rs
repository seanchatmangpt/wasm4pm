const SOURCE: &str = include_str!("../../src/breeds/bayesian_network.rs");
const PAPER_POINTERS: &str = include_str!("../paper_pointers_generated.rs");
const ANTICHEAT: &str = include_str!("../universal_anticheat_generated.rs");

#[test]
fn bayesian_network_has_source_runtime_contract_and_oracles() {
    assert!(
        SOURCE.contains("impl CognitionBreed for "),
        "bayesian_network: missing CognitionBreed implementation"
    );
    assert!(
        SOURCE.contains("fn id(&self) -> BreedId"),
        "bayesian_network: missing stable BreedId"
    );
    assert!(
        SOURCE.contains("fn run(&self"),
        "bayesian_network: missing runtime path"
    );
    assert!(
        SOURCE.contains("fn preconditions(&self"),
        "bayesian_network: missing admission boundary"
    );
    assert!(
        SOURCE.contains("fn postconditions(&self"),
        "bayesian_network: missing postcondition boundary"
    );
    assert!(
        !SOURCE.contains("unimplemented!"),
        "bayesian_network: unimplemented macro present"
    );
    assert!(
        !SOURCE.contains("todo!"),
        "bayesian_network: todo macro present"
    );
    assert!(
        PAPER_POINTERS.contains("bayesian_network"),
        "bayesian_network: missing generated paper-pointer oracle"
    );
    assert!(
        ANTICHEAT.contains("anticheat_bayesian_network_"),
        "bayesian_network: missing generated anti-cheat oracle"
    );
}
