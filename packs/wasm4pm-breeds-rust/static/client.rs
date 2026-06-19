// client.rs — SKETCH: how to call cognition_run from Rust (ship as-is; not generated).
//
// The actual WASM binding (loading the wasm4pm-cognition module and invoking its
// exported `cognition_run`) is out of scope for this pack — that is provided by
// the host runtime (e.g. wasmtime, or the JS `@wasm4pm/cognition` binding when
// targeting wasm32). This file shows how the generated `BreedId` / `CATALOG`
// surface and the fixed `breed_types` compose into a request/response.

use crate::breed_ids::BreedId;
use crate::breed_types::{BreedInput, CognitionRunInput, ContractResult, RunOptions};

/// Build a `cognition_run` request for a given breed and contract.
pub fn build_request(breed: BreedId, contract: BreedInput, profile: Option<String>) -> CognitionRunInput {
    CognitionRunInput {
        breed: breed.as_str().to_string(),
        contract,
        options: profile.map(|p| RunOptions { profile: Some(p) }),
    }
}

/// Pseudocode for the round-trip. Replace `wasm_cognition_run` with your binding.
///
/// ```ignore
/// let req = build_request(BreedId::Mycin, contract, None);
/// let req_json = serde_json::to_string(&req)?;
/// let resp_json: String = wasm_cognition_run(&req_json)?; // host-provided
/// let result: ContractResult = serde_json::from_str(&resp_json)?;
/// assert_eq!(result.status, "ok");
/// // Persist a receipt keyed by result.run_id / result.output_hash.
/// ```
pub fn parse_response(resp_json: &str) -> serde_json::Result<ContractResult> {
    serde_json::from_str(resp_json)
}
