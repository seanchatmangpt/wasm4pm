//! Literal source inclusion for OCPN models to ensure BLAKE3 determinism.
//!
//! To prevent runtime dependency issues and guarantee that the WASM bundle
//! is self-contained and cryptographically verifiable, we embed the JSON
//! models using `include_str!`.

/// Return the string content of the L1 OCPN model JSON for a known breed, or
/// `None` if no model file exists for the breed.
pub fn model_source(breed_id: &str) -> Option<&'static str> {
    match breed_id {
        "mycin" => Some(include_str!("../../../../ocel/models/l1/mycin.ocpn.json")),
        "prolog" => Some(include_str!("../../../../ocel/models/l1/prolog.ocpn.json")),
        "strips" => Some(include_str!("../../../../ocel/models/l1/strips.ocpn.json")),
        "soar" => Some(include_str!("../../../../ocel/models/l1/soar.ocpn.json")),
        "hearsay" => Some(include_str!("../../../../ocel/models/l1/hearsay.ocpn.json")),
        "cbr" => Some(include_str!("../../../../ocel/models/l1/cbr.ocpn.json")),
        "gps" => Some(include_str!("../../../../ocel/models/l1/gps.ocpn.json")),
        "dendral" => Some(include_str!("../../../../ocel/models/l1/dendral.ocpn.json")),
        "eliza" => Some(include_str!("../../../../ocel/models/l1/eliza.ocpn.json")),
        "autoinstinct_vision" => Some(include_str!(
            "../../../../ocel/models/l1/autoinstinct_vision.ocpn.json"
        )),
        "autoinstinct_semantics" => Some(include_str!(
            "../../../../ocel/models/l1/autoinstinct_semantics.ocpn.json"
        )),
        "autoinstinct_neurosis" => Some(include_str!(
            "../../../../ocel/models/l1/autoinstinct_neurosis.ocpn.json"
        )),
        "autoinstinct_learning" => Some(include_str!(
            "../../../../ocel/models/l1/autoinstinct_learning.ocpn.json"
        )),
        _ => None,
    }
}
