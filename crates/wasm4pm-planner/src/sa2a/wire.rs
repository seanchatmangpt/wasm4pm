use super::{PortableRequest, Sa2aError};
pub const SCHEMA: &str = "sa2a.portable.candidate.v1";
pub fn decode_request(bytes: &[u8]) -> Result<PortableRequest, Sa2aError> {
    let r: PortableRequest =
        serde_json::from_slice(bytes).map_err(|e| Sa2aError::InvalidWire(e.to_string()))?;
    if r.schema != SCHEMA {
        return Err(Sa2aError::InvalidWire(r.schema));
    }
    r.admit()?;
    Ok(r)
}
pub fn encode_request(r: &PortableRequest) -> Result<Vec<u8>, Sa2aError> {
    r.admit()?;
    serde_json::to_vec(r).map_err(|e| Sa2aError::InvalidWire(e.to_string()))
}
