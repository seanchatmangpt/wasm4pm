use wasm4pm_cognition::interview::admission::RawObservation;
use wasm4pm_cognition::interview::authority_broker::{AuthorityClass, AuthorityBroker};
use wasm4pm_cognition::interview::capability::CapabilityDescriptor;
use wasm4pm_cognition::interview::composition::CompositionContext;

pub fn context() -> CompositionContext {
    let mut context = CompositionContext::new(0.5);
    context.grant(AuthorityClass::Admit);
    context.grant(AuthorityClass::Project);
    context
}

pub fn observation(id: &str, text: &str) -> RawObservation {
    RawObservation {
        id: id.to_string(),
        source: "transcript".to_string(),
        text: text.to_string(),
    }
}

pub fn capability(
    id: &str,
    preconditions: &[&str],
    postconditions: &[&str],
    authority_requirement: AuthorityClass,
) -> CapabilityDescriptor {
    CapabilityDescriptor {
        capability_id: id.to_string(),
        preconditions: preconditions.iter().map(|value| (*value).to_string()).collect(),
        postconditions: postconditions.iter().map(|value| (*value).to_string()).collect(),
        effects: vec![format!("exercise:{id}")],
        authority_requirement,
    }
}
