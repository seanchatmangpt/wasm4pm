use wasm4pm_sa2a_actuator::{
    ActuationReceipt, ActuatorRefusal, ResourceBudget, ResourceEnvelope, ResourceReceipt,
};

fn envelope() -> ResourceEnvelope {
    ResourceEnvelope {
        version: "sa2a/resource-envelope/v1".into(),
        allocation_id: "allocation:receipt".into(),
        effect_digest: "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
            .into(),
        replay_key: "replay:receipt".into(),
        generation: 11,
        parent_allocation_id: None,
        budget: ResourceBudget::default(),
        authority: "none".into(),
    }
}

#[test]
fn resource_receipt_accepts_only_the_allocation_bound_actuation_receipt() {
    let resources = envelope();
    let receipt = ActuationReceipt {
        effect_digest: resources.effect_digest.clone(),
        generation: resources.generation,
        allocation_id: resources.allocation_id.clone(),
        replay_key: resources.replay_key.clone(),
        result_digest: "sha256:result".into(),
        state: "executed".into(),
    };

    let bound = ResourceReceipt::bind(&resources, &receipt).unwrap();
    assert_eq!(bound.allocation_id, "allocation:receipt");
    assert_eq!(bound.replay_key, "replay:receipt");

    let mut wrong = receipt;
    wrong.allocation_id = "allocation:other".into();
    assert_eq!(
        ResourceReceipt::bind(&resources, &wrong).unwrap_err(),
        ActuatorRefusal::AllocationClaimMismatch
    );
}
