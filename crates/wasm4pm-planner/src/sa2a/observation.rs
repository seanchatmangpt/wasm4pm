use super::PortableReceipt;
use serde::{Deserialize, Serialize};
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ReplanObservation {
    pub subject: String,
    pub effect_id: String,
    pub provider: String,
    pub outcome: String,
}
impl From<&PortableReceipt> for ReplanObservation {
    fn from(r: &PortableReceipt) -> Self {
        Self {
            subject: r.subject.clone(),
            effect_id: r.effect_id.clone(),
            provider: r.provider.clone(),
            outcome: r.outcome.clone(),
        }
    }
}
