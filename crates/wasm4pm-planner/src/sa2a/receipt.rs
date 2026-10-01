use serde::{Deserialize, Serialize};
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct PortableReceipt {
    pub subject: String,
    pub effect_id: String,
    pub provider: String,
    pub replay_key: String,
    pub outcome: String,
    pub authority: String,
}
