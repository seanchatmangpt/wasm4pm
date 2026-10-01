use super::Sa2aError;
use serde::{Deserialize, Serialize};
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct CandidatePlan {
    pub subject: String,
    pub effect_id: String,
    pub provider: String,
    pub generation: u64,
    pub authority: String,
    pub plan: serde_json::Value,
}
impl CandidatePlan {
    pub fn guard(&self, subject: &str, effect: &str) -> Result<(), Sa2aError> {
        if self.subject != subject {
            return Err(Sa2aError::SubjectMismatch);
        }
        if self.effect_id != effect {
            return Err(Sa2aError::EffectMismatch);
        }
        if self.authority != "none" {
            return Err(Sa2aError::AuthorityPresent);
        }
        Ok(())
    }
}
