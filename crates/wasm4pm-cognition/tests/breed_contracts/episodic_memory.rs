const SOURCE: &str = include_str!("../../src/breeds/episodic_memory.rs");
const PAPER_POINTERS: &str = include_str!("../paper_pointers_generated.rs");
const ANTICHEAT: &str = include_str!("../universal_anticheat_generated.rs");

#[test]
fn episodic_memory_has_source_runtime_contract_and_oracles() {
    assert!(
        SOURCE.contains("impl CognitionBreed for "),
        "episodic_memory: missing CognitionBreed implementation"
    );
    assert!(
        SOURCE.contains("fn id(&self) -> BreedId"),
        "episodic_memory: missing stable BreedId"
    );
    assert!(
        SOURCE.contains("fn run(&self"),
        "episodic_memory: missing runtime path"
    );
    assert!(
        SOURCE.contains("fn preconditions(&self"),
        "episodic_memory: missing admission boundary"
    );
    assert!(
        SOURCE.contains("fn postconditions(&self"),
        "episodic_memory: missing postcondition boundary"
    );
    assert!(
        !SOURCE.contains("unimplemented!"),
        "episodic_memory: unimplemented macro present"
    );
    assert!(
        !SOURCE.contains("todo!"),
        "episodic_memory: todo macro present"
    );
    assert!(
        PAPER_POINTERS.contains("episodic_memory"),
        "episodic_memory: missing generated paper-pointer oracle"
    );
    assert!(
        ANTICHEAT.contains("anticheat_episodic_memory_"),
        "episodic_memory: missing generated anti-cheat oracle"
    );
}
