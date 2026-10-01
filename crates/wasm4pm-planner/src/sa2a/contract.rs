use super::Sa2aError;
use serde::{Deserialize, Serialize};
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct PortableRequest {
    pub schema: String,
    pub subject: String,
    pub effect_id: String,
    pub formalism: String,
    pub generation: u64,
    pub authority: String,
    pub payload: serde_json::Value,
}
impl PortableRequest {
    pub fn admit(&self) -> Result<(), Sa2aError> {
        if self.subject.is_empty() {
            return Err(Sa2aError::MissingSubject);
        }
        if self.authority != "none" {
            return Err(Sa2aError::AuthorityPresent);
        }
        Ok(())
    }
}
