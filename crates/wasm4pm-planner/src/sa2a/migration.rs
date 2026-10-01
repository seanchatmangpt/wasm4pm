use super::{PortableRequest, SCHEMA};
pub fn from_legacy(
    subject: String,
    effect_id: String,
    formalism: String,
    payload: serde_json::Value,
) -> PortableRequest {
    PortableRequest {
        schema: SCHEMA.into(),
        subject,
        effect_id,
        formalism,
        generation: 0,
        authority: "none".into(),
        payload,
    }
}
