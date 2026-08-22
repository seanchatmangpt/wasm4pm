//! Portable WebAssembly boundary for BCINR's Chatman Multifractal Consequence Allocation (CMCA).
//!
//! This crate is deliberately an adapter, not a fork of CMCA. The authoritative
//! allocation mathematics remains in `bcinr-cmca`; this boundary converts a fixed
//! JSON/JS-friendly representation into BCINR's fixed-point types and calls
//! `allocator::allocate_single_lens`.
//!
//! Authority fence: CMCA is analytical/CONSTRUCT-only. This crate has no actuator,
//! credential, network, filesystem, or BRCE-equivalent capability.

use bcinr_cmca::allocator::{allocate_single_lens, LensSelectionRefusal};
use bcinr_cmca::fixed::{NonNegativeFixed, SignedFixed};
use bcinr_cmca::generated::consequence_mass::case_studies::{
    LensSpec, PackedSemanticState, F, GENERATOR_SOURCE_DIGEST, K, N, Q, RDF_INPUT_DIGEST,
};
use serde::{Deserialize, Serialize};

#[cfg(target_arch = "wasm32")]
use wasm_bindgen::prelude::*;

pub const SCHEMA: &str = "wasm4pm.cmca-allocation/v1";
pub const BCINR_REPOSITORY: &str = "https://github.com/seanchatmangpt/bcinr";
pub const BCINR_SOURCE_SHA: &str = "b76dcb377b297cb8826a5256b55f8b57a6b76462";
pub const BCINR_CMCA_PACKAGE: &str = "bcinr-cmca";
pub const BCINR_CMCA_VERSION: &str = "26.7.28";
pub const KERNEL: &str = "bcinr_cmca::allocator::allocate_single_lens";
pub const AUTHORITY: &str = "CONSTRUCT_ONLY";

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct CmcaSemanticState {
    pub id: u32,
    pub factors_q16: [u32; F],
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct CmcaLens {
    pub id: u32,
    pub q_q16: i32,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct CmcaAllocationRequest {
    pub states: [CmcaSemanticState; N],
    pub lenses: [CmcaLens; Q],
    pub measure: usize,
    pub lens_index: usize,
    pub parent: [i32; N],
    pub weights_q16: [[u32; 2 * Q]; N],
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct CmcaAllocationResult {
    pub shares_q16: [u32; N],
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct CmcaComputationReceipt {
    pub schema: String,
    pub bcinr_repository: String,
    pub bcinr_source_sha: String,
    pub bcinr_package: String,
    pub bcinr_version: String,
    pub rdf_input_digest: String,
    pub generator_source_digest: String,
    pub kernel: String,
    pub authority: String,
    pub actuation_performed: bool,
    pub request_blake3: String,
    pub result_blake3: String,
    pub receipt_blake3: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct CmcaAllocationResponse {
    pub standing: String,
    pub result: CmcaAllocationResult,
    pub receipt: CmcaComputationReceipt,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct CmcaRefusal {
    pub schema: String,
    pub code: String,
    pub message: String,
    pub request_blake3: String,
    pub bcinr_source_sha: String,
    pub bcinr_package: String,
    pub bcinr_version: String,
    pub kernel: String,
    pub authority: String,
    pub actuation_performed: bool,
}

#[derive(Serialize)]
struct ReceiptBody<'a> {
    schema: &'a str,
    bcinr_source_sha: &'a str,
    bcinr_package: &'a str,
    bcinr_version: &'a str,
    rdf_input_digest: &'a str,
    generator_source_digest: &'a str,
    kernel: &'a str,
    authority: &'a str,
    actuation_performed: bool,
    request_blake3: &'a str,
    result_blake3: &'a str,
}

fn blake3_json<T: Serialize>(value: &T) -> Result<String, CmcaRefusal> {
    serde_json::to_vec(value)
        .map(|bytes| blake3::hash(&bytes).to_hex().to_string())
        .map_err(|error| CmcaRefusal {
            schema: SCHEMA.to_owned(),
            code: "CMCA_SERIALIZATION_REFUSED".to_owned(),
            message: error.to_string(),
            request_blake3: String::new(),
            bcinr_source_sha: BCINR_SOURCE_SHA.to_owned(),
            bcinr_package: BCINR_CMCA_PACKAGE.to_owned(),
            bcinr_version: BCINR_CMCA_VERSION.to_owned(),
            kernel: KERNEL.to_owned(),
            authority: AUTHORITY.to_owned(),
            actuation_performed: false,
        })
}

fn map_refusal(refusal: LensSelectionRefusal, request_blake3: String) -> CmcaRefusal {
    let code = match refusal {
        LensSelectionRefusal::MeasureIndexOutOfRange { .. } => "CMCA_MEASURE_INDEX_REFUSED",
        LensSelectionRefusal::LensIndexOutOfRange { .. } => "CMCA_LENS_INDEX_REFUSED",
        LensSelectionRefusal::QMagnitudeExceeded { .. } => "CMCA_LENS_MAGNITUDE_REFUSED",
        LensSelectionRefusal::Cyclic => "CMCA_HIERARCHY_CYCLE_REFUSED",
    };

    CmcaRefusal {
        schema: SCHEMA.to_owned(),
        code: code.to_owned(),
        message: refusal.to_string(),
        request_blake3,
        bcinr_source_sha: BCINR_SOURCE_SHA.to_owned(),
        bcinr_package: BCINR_CMCA_PACKAGE.to_owned(),
        bcinr_version: BCINR_CMCA_VERSION.to_owned(),
        kernel: KERNEL.to_owned(),
        authority: AUTHORITY.to_owned(),
        actuation_performed: false,
    }
}

/// Execute one exact BCINR CMCA measure/lens consequence-allocation projection.
///
/// This is a pure analytical computation. The result has no selection or DO authority.
pub fn allocate_native(
    request: &CmcaAllocationRequest,
) -> Result<CmcaAllocationResponse, CmcaRefusal> {
    let request_blake3 = blake3_json(request)?;

    let states: [PackedSemanticState; N] = core::array::from_fn(|index| PackedSemanticState {
        id: request.states[index].id,
        factors: core::array::from_fn(|factor| {
            NonNegativeFixed::from_bits(request.states[index].factors_q16[factor])
        }),
    });
    let lenses: [LensSpec; Q] = core::array::from_fn(|index| LensSpec {
        id: request.lenses[index].id,
        q: SignedFixed::from_bits(request.lenses[index].q_q16),
    });
    let weights: [[NonNegativeFixed; 2 * Q]; N] = core::array::from_fn(|row| {
        core::array::from_fn(|column| NonNegativeFixed::from_bits(request.weights_q16[row][column]))
    });

    let shares = allocate_single_lens(
        &states,
        &lenses,
        request.measure,
        request.lens_index,
        &request.parent,
        &weights,
    )
    .map_err(|refusal| map_refusal(refusal, request_blake3.clone()))?;

    let result = CmcaAllocationResult {
        shares_q16: core::array::from_fn(|index| shares[index].val),
    };
    let result_blake3 = blake3_json(&result)?;
    let body = ReceiptBody {
        schema: SCHEMA,
        bcinr_source_sha: BCINR_SOURCE_SHA,
        bcinr_package: BCINR_CMCA_PACKAGE,
        bcinr_version: BCINR_CMCA_VERSION,
        rdf_input_digest: RDF_INPUT_DIGEST,
        generator_source_digest: GENERATOR_SOURCE_DIGEST,
        kernel: KERNEL,
        authority: AUTHORITY,
        actuation_performed: false,
        request_blake3: &request_blake3,
        result_blake3: &result_blake3,
    };
    let receipt_blake3 = blake3_json(&body)?;

    Ok(CmcaAllocationResponse {
        standing: "ALIVE".to_owned(),
        result,
        receipt: CmcaComputationReceipt {
            schema: SCHEMA.to_owned(),
            bcinr_repository: BCINR_REPOSITORY.to_owned(),
            bcinr_source_sha: BCINR_SOURCE_SHA.to_owned(),
            bcinr_package: BCINR_CMCA_PACKAGE.to_owned(),
            bcinr_version: BCINR_CMCA_VERSION.to_owned(),
            rdf_input_digest: RDF_INPUT_DIGEST.to_owned(),
            generator_source_digest: GENERATOR_SOURCE_DIGEST.to_owned(),
            kernel: KERNEL.to_owned(),
            authority: AUTHORITY.to_owned(),
            actuation_performed: false,
            request_blake3,
            result_blake3,
            receipt_blake3,
        },
    })
}

/// Recompute the deterministic receipt identity from a successful response.
pub fn replay_receipt(response: &CmcaAllocationResponse) -> bool {
    let body = ReceiptBody {
        schema: &response.receipt.schema,
        bcinr_source_sha: &response.receipt.bcinr_source_sha,
        bcinr_package: &response.receipt.bcinr_package,
        bcinr_version: &response.receipt.bcinr_version,
        rdf_input_digest: &response.receipt.rdf_input_digest,
        generator_source_digest: &response.receipt.generator_source_digest,
        kernel: &response.receipt.kernel,
        authority: &response.receipt.authority,
        actuation_performed: response.receipt.actuation_performed,
        request_blake3: &response.receipt.request_blake3,
        result_blake3: &response.receipt.result_blake3,
    };

    blake3_json(&body)
        .map(|actual| actual == response.receipt.receipt_blake3)
        .unwrap_or(false)
        && response.receipt.bcinr_source_sha == BCINR_SOURCE_SHA
        && response.receipt.authority == AUTHORITY
        && !response.receipt.actuation_performed
}

/// Stable JSON host boundary used by native tests and non-JS embedders.
pub fn allocate_json(request_json: &str) -> Result<String, String> {
    let request: CmcaAllocationRequest =
        serde_json::from_str(request_json).map_err(|error| error.to_string())?;

    match allocate_native(&request) {
        Ok(response) => serde_json::to_string(&response).map_err(|error| error.to_string()),
        Err(refusal) => Err(serde_json::to_string(&refusal).unwrap_or_else(|_| {
            r#"{"code":"CMCA_SERIALIZATION_REFUSED","actuation_performed":false}"#.to_owned()
        })),
    }
}

/// JavaScript/WebAssembly export. Domain refusals remain typed JS errors; they are
/// never converted into successful allocation objects.
#[cfg(target_arch = "wasm32")]
#[wasm_bindgen(js_name = cmcaAllocate)]
pub fn cmca_allocate(request: JsValue) -> Result<JsValue, JsValue> {
    let request: CmcaAllocationRequest = serde_wasm_bindgen::from_value(request).map_err(|error| {
        JsValue::from_str(
            &serde_json::json!({
                "schema": SCHEMA,
                "code": "CMCA_INPUT_REFUSED",
                "message": error.to_string(),
                "bcinr_source_sha": BCINR_SOURCE_SHA,
                "authority": AUTHORITY,
                "actuation_performed": false
            })
            .to_string(),
        )
    })?;

    match allocate_native(&request) {
        Ok(response) => serde_wasm_bindgen::to_value(&response)
            .map_err(|error| JsValue::from_str(&error.to_string())),
        Err(refusal) => Err(JsValue::from_str(
            &serde_json::to_string(&refusal).unwrap_or_else(|_| {
                r#"{"code":"CMCA_SERIALIZATION_REFUSED","actuation_performed":false}"#.to_owned()
            }),
        )),
    }
}

/// JavaScript/WebAssembly replay verifier. Hosts can use this as a distinct execution
/// step rather than treating a receipt-shaped object as proof of replay.
#[cfg(target_arch = "wasm32")]
#[wasm_bindgen(js_name = cmcaReplay)]
pub fn cmca_replay(response: JsValue) -> Result<bool, JsValue> {
    let response: CmcaAllocationResponse = serde_wasm_bindgen::from_value(response)
        .map_err(|error| JsValue::from_str(&error.to_string()))?;
    Ok(replay_receipt(&response))
}

/// WASM-visible identity contract so a host can bind receipts to the exact CMCA source.
#[cfg(target_arch = "wasm32")]
#[wasm_bindgen(js_name = cmcaContract)]
pub fn cmca_contract() -> JsValue {
    JsValue::from_str(
        &serde_json::json!({
            "schema": SCHEMA,
            "canonical_repository": BCINR_REPOSITORY,
            "bcinr_source_sha": BCINR_SOURCE_SHA,
            "package": BCINR_CMCA_PACKAGE,
            "version": BCINR_CMCA_VERSION,
            "rdf_input_digest": RDF_INPUT_DIGEST,
            "generator_source_digest": GENERATOR_SOURCE_DIGEST,
            "kernel": KERNEL,
            "shape": {"n": N, "f": F, "k": K, "q": Q},
            "authority": AUTHORITY,
            "actuation_performed": false
        })
        .to_string(),
    )
}
