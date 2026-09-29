#[test]
fn resource_admission_and_allocation_claim_precede_do_in_the_only_entrypoint() {
    let source = include_str!("../src/actuator.rs");

    let admission = source.find("ResourceAdmission::admit").unwrap();
    let claim = source.find("claim_with_allocation").unwrap();
    let perform = source.find("self.effector.perform").unwrap();

    assert!(
        admission < claim,
        "resource admission must precede durable claim"
    );
    assert!(
        claim < perform,
        "durable allocation-bound claim must precede DO"
    );
    assert!(!source.contains(".ledger.claim(&digest"));
}
