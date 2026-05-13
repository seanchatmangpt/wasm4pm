use crate::ocel::OCEL;
use serde_json;

pub fn import_ocel_json(ocel_json: &str) -> Result<OCEL, serde_json::Error> {
    serde_json::from_str(ocel_json)
}

pub fn import_ocel_json_slice(slice: &[u8]) -> Result<OCEL, serde_json::Error> {
    serde_json::from_slice(slice)
}
