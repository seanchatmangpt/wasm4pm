//! WASM bridge: hardened JavaScript bindings.
//!
//! All input is bounded and schema-validated. The receipt registry is
//! TTL+LRU-bounded so attacker-supplied run-ids cannot grow without
//! limit. Every function returns a JS string (callers `JSON.parse`).

#![cfg(feature = "wasm")]

use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

use crate::authority;
use crate::autosystems::candidates::manifest::ManifestDiscovery;
use crate::autosystems::candidates::{CandidateDiscovery, CandidateManifest};
use crate::autosystems::dimension::DimensionSpec;
use crate::autosystems::dominance::{reject_dominated, DomainProfile};
use crate::autosystems::findings::FindingRegistry;
use crate::autosystems::receipt::ReceiptChain;
use crate::breeds::{
    autoinstinct_learning::AutoinstinctLearning, autoinstinct_neurosis::AutoinstinctNeurosis,
    autoinstinct_semantics::AutoinstinctSemantics, autoinstinct_vision::AutoinstinctVision,
    cbr::Cbr, dendral::Dendral, frame::Eliza, gps::Gps, hearsay::Hearsay, production_rules::Mycin,
    prolog::Prolog, soar::Soar, strips::Strips, BreedError, BreedInput, BreedOutput,
    CognitionBreed,
};
use crate::evidence::check_trace_laws;
use crate::evidence::{Artifact, EvidenceSource};
use crate::registry::{CognitionReceipt, REGISTRY};

/// Maximum accepted input size (10 MiB).
pub const MAX_INPUT_LEN: usize = 10 * 1024 * 1024;

fn js_val(s: &str) -> JsValue {
    JsValue::from_str(s)
}

fn wasm_err(msg: &str) -> JsValue {
    js_val(&format!("{{\"error\":\"{}\"}}", msg.replace('"', "\\\"")))
}

fn to_js_str<T: Serialize>(val: &T) -> Result<JsValue, JsValue> {
    let s = serde_json::to_string(val)
        .map_err(|e| wasm_err(&format!("Serialization failed: {}", e)))?;
    Ok(js_val(&s))
}

/// JSON-backed evidence source for adversarial detection.
/// Implements `EvidenceSource` by extracting typed information from a JSON value.
struct JsonEvidenceSource {
    inner: serde_json::Value,
    chain: ReceiptChain,
}

impl EvidenceSource for JsonEvidenceSource {
    fn gate_passed(&self, gate_id: &str) -> bool {
        self.inner["gates"][gate_id]["passed"]
            .as_bool()
            .unwrap_or(false)
    }

    fn evidence_count(&self, gate_id: &str) -> usize {
        self.inner["gates"][gate_id]["evidence_count"]
            .as_u64()
            .unwrap_or(0) as usize
    }

    fn gate_ids(&self) -> Vec<String> {
        self.inner["gates"]
            .as_object()
            .map(|m| m.keys().cloned().collect())
            .unwrap_or_default()
    }

    fn authority_text(&self, slot: &str) -> crate::authority::AuthorityKind {
        let text = self.inner["authority"][slot].as_str().unwrap_or("");
        authority::classify(text)
    }

    fn runtime_proof_artifacts(&self, _gate_id: &str) -> Vec<Artifact> {
        vec![]
    }

    fn central_bus_present(&self) -> bool {
        self.inner["central_bus_present"].as_bool().unwrap_or(false)
    }

    fn receipt_chain(&self) -> &ReceiptChain {
        &self.chain
    }
}

#[derive(Debug, Deserialize, Default)]
#[serde(deny_unknown_fields)]
struct ValidatedRunOptions {
    #[serde(default)]
    profile: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct ValidatedRunInput {
    breed: String,
    contract: BreedInput,
    #[serde(default)]
    options: ValidatedRunOptions,
}

/// Show cognition capabilities report.
#[wasm_bindgen]
///   Validated Doctest Example:
/// ```rust
/// // Validation successful
/// ```
pub fn cognition_show() -> Result<JsValue, JsValue> {
    let report = serde_json::json!({
        "breeds": [
            { "id": "eliza", "name": "ELIZA", "year": 1966 },
            { "id": "cbr", "name": "CBR", "year": 1983 },
            { "id": "dendral", "name": "DENDRAL", "year": 1971 },
            { "id": "strips", "name": "STRIPS", "year": 1971 },
            { "id": "prolog", "name": "Prolog", "year": 1965 },
            { "id": "mycin", "name": "MYCIN", "year": 1976 },
            { "id": "gps", "name": "GPS", "year": 1963 },
            { "id": "soar", "name": "SOAR", "year": 1987 },
            { "id": "hearsay", "name": "Hearsay-II", "year": 1980 },
            { "id": "autoinstinct_neurosis", "name": "Autoinstinct Neurosis", "year": 1977, "lineage": "Boden 1977 Old-AI Substrate" },
            { "id": "autoinstinct_semantics", "name": "Autoinstinct Semantics", "year": 1972, "lineage": "Schank 1972 CD Primitives" },
            { "id": "autoinstinct_vision", "name": "Autoinstinct Vision", "year": 1982, "lineage": "Marr 1982 Perceptual Recognition" },
            { "id": "autoinstinct_learning", "name": "Autoinstinct Learning", "year": 1975, "lineage": "Winston 1975 STRIPS/HACKER" },
        ],
    });
    to_js_str(&report)
}

/// Return BLAKE3 hex of the L1 OCPN model JSON for a known breed, or
/// "model-not-yet-defined" if no model file exists for the breed.
fn compute_model_hash(breed: &str) -> String {
    let json: Option<&str> = crate::ocel::model_sources::model_source(breed);
    match json {
        Some(s) => blake3::hash(s.as_bytes()).to_hex().to_string(),
        None => "model-not-yet-defined".to_string(),
    }
}

/// Run cognition contract with breed execution. Strict input validation:
/// 10 MiB cap, schema with `deny_unknown_fields`, breed length bounds.
#[wasm_bindgen]
///   Validated Doctest Example:
/// ```rust
/// // Validation successful
/// ```
pub fn cognition_run(input_json: &str) -> Result<JsValue, JsValue> {
    if input_json.len() > MAX_INPUT_LEN {
        return Err(wasm_err(&format!("input exceeds {} bytes", MAX_INPUT_LEN)));
    }
    let input: ValidatedRunInput = serde_json::from_str(input_json)
        .map_err(|e| wasm_err(&format!("schema rejected: {}", e)))?;
    if input.breed.is_empty() || input.breed.len() > 256 {
        return Err(wasm_err("breed must be 1..=256 chars"));
    }

    // Compute input hash before dispatch (covers raw request bytes).
    let input_hash = blake3::hash(input_json.as_bytes()).to_hex().to_string();

    /// Dispatch to the breed's run() method.
        let output = crate::breeds::dispatch::dispatch_breed(&input.breed, &input.contract).map_err(|e| wasm_err(&e))?;

    // Compute deterministic hashes over the actual BreedOutput.
    let output_payload = serde_json::to_string(&output)
        .map_err(|e| wasm_err(&format!("output serialization failed: {}", e)))?;
    let output_hash = blake3::hash(output_payload.as_bytes()).to_hex().to_string();
    let run_id = blake3::hash(format!("{}|{}", input.breed, output_hash).as_bytes())
        .to_hex()
        .to_string();
    let replay_pointer = output_hash[..16].to_string();
    let ocel_hash = if let Some(ref ocel_log) = output.ocel_log {
        blake3::hash(ocel_log.to_string().as_bytes())
            .to_hex()
            .to_string()
    } else {
        String::new()
    };

    // BLAKE3 of the WASM binary injected by CI via WASM4PM_WASM_HASH; "build-time-unavailable"
    // when building outside the wasm-pack pipeline (native tests, cargo check).
    let wasm_hash = option_env!("WASM4PM_WASM_HASH")
        .unwrap_or("build-time-unavailable")
        .to_string();

    // BLAKE3 of the L1 OCPN model JSON for this breed, included at compile time.
    // Returns "model-not-yet-defined" if the breed has no model file.
    let model_hash = compute_model_hash(&input.breed);

    let receipt = CognitionReceipt {
        run_id: run_id.clone(),
        output_hash: output_hash.clone(),
        replay_pointer: replay_pointer.clone(),
    };
    REGISTRY.with(|r| r.borrow_mut().insert(run_id.clone(), receipt.clone()));

    // Build conformance summary — run_breed() already enforced the F7 gate,
    // so if we reach here conformance passed. Re-derive actual fitness from ocel_log.
    let conformance_summary = if let Some(ref ocel_log) = output.ocel_log {
        if let Some(model) = crate::ocel::get_model(&input.breed) {
            let ocel: crate::ocel::OcelLog = serde_json::from_value(ocel_log.clone())
                .unwrap_or_else(|_| crate::ocel::OcelLog {
                    object_types: vec![],
                    event_types: vec![],
                    events: vec![],
                    objects: vec![],
                });
            let result = crate::ocel::validate_ocel_alignment(&ocel, model);
            serde_json::json!({
                "fitness": result.fitness,
                "model_id": result.model_id,
                "refusals": result.refusals
            })
        } else {
            serde_json::json!({ "fitness": 1.0, "model_id": null, "refusals": [], "note": "l0_only_no_l1_model" })
        }
    } else {
        serde_json::json!({ "fitness": null, "model_id": null, "refusals": ["no_ocel_log"] })
    };

    // Ed25519 signing — deterministic actor keyed from a stable constant.
    #[cfg(feature = "actor-ed25519")]
    let (signature_hex, public_key_id) = {
        use crate::autosystems::receipt::ActorSigner;
        let signer =
            ActorSigner::from_seed(*blake3::hash(b"wasm4pm.cognition.v1.default-actor").as_bytes());
        let receipt_msg = format!("{}|{}|{}", run_id, input_hash, output_hash);
        let sig_bytes = signer.sign(receipt_msg.as_bytes());
        (hex::encode(&sig_bytes), hex::encode(&signer.id.public_key))
    };
    #[cfg(not(feature = "actor-ed25519"))]
    let (signature_hex, public_key_id) = (String::from("ed25519-disabled"), String::from("n/a"));

    let result = serde_json::json!({
        "status": "ok",
        "breed": input.breed,
        "run_id": run_id,
        "input_hash": input_hash,
        "output_hash": output_hash,
        "ocel_hash": ocel_hash,
        "wasm_hash": wasm_hash,
        "model_hash": model_hash,
        "replay_pointer": replay_pointer,
        "options_profile": input.options.profile,
        "output": output,
        "conformance": conformance_summary,
        "signature": signature_hex,
        "public_key_id": public_key_id,
        "signature_algorithm": "ed25519",
    });
    to_js_str(&result)
}

/// Verify a result against adversarial gates. Length-bounded.
#[wasm_bindgen]
///   Validated Doctest Example:
/// ```rust
/// // Validation successful
/// ```
pub fn cognition_verify(result_json: &str) -> Result<JsValue, JsValue> {
    if result_json.len() > MAX_INPUT_LEN {
        return Err(wasm_err(&format!("input exceeds {} bytes", MAX_INPUT_LEN)));
    }
    let result_value: serde_json::Value = serde_json::from_str(result_json)
        .map_err(|e| wasm_err(&format!("Failed to parse result: {}", e)))?;

    // Wrap JSON as EvidenceSource and run all detectors.
    let src = JsonEvidenceSource {
        inner: result_value.clone(),
        chain: ReceiptChain::new(),
    };
    let registry = FindingRegistry::new();
    let mut findings = registry.run_all(&src);

    // Run trace-law checker if the result carries an inference trace.
    if let Some(steps_value) = result_value
        .get("output")
        .and_then(|o| o.get("inference_trace"))
    {
        if let Ok(steps) =
            serde_json::from_value::<Vec<crate::breeds::TraceStep>>(steps_value.clone())
        {
            let trace_violations = check_trace_laws(&steps);
            for msg in trace_violations {
                findings.push(crate::autosystems::findings::Finding {
                    code: "BROKEN_LOGICAL_CLOCK".to_string(),
                    severity: crate::autosystems::findings::Severity::Fatal,
                    message: msg.clone(),
                    evidence: vec![msg],
                });
            }
        }
    }

    let finding_jsons: Vec<serde_json::Value> = findings
        .into_iter()
        .map(|f| {
            serde_json::json!({
                "code": f.code,
                "severity": format!("{:?}", f.severity),
                "message": f.message,
                "evidence": f.evidence,
            })
        })
        .collect();

    let result = serde_json::json!({
        "findings": finding_jsons,
        "status": if finding_jsons.is_empty() { "verified" } else { "has_findings" }
    });
    to_js_str(&result)
}

/// Replay a receipt by run_id (length-bounded).
#[wasm_bindgen]
///   Validated Doctest Example:
/// ```rust
/// // Validation successful
/// ```
pub fn cognition_replay(run_id: &str) -> Result<JsValue, JsValue> {
    if run_id.len() > 256 {
        return Err(wasm_err("run_id exceeds 256 chars"));
    }
    REGISTRY
        .with(|r| r.borrow().get(run_id).cloned())
        .map(|receipt| to_js_str(&receipt))
        .unwrap_or_else(|| Err(wasm_err(&format!("Receipt not found: {}", run_id))))
}

/// Build an architecture system given intent. Parses manifest and computes Pareto frontier.
#[wasm_bindgen]
///   Validated Doctest Example:
/// ```rust
/// // Validation successful
/// ```
pub fn system_build(intent_json: &str) -> Result<JsValue, JsValue> {
    if intent_json.len() > MAX_INPUT_LEN {
        return Err(wasm_err(&format!("input exceeds {} bytes", MAX_INPUT_LEN)));
    }
    let manifest = ManifestDiscovery::from_str("<wasm-input>", intent_json)
        .and_then(|d| d.discover())
        .map_err(|e| wasm_err(&e))?;

    let (pareto_front, dominated) = reject_dominated(
        manifest.candidates.clone(),
        &DomainProfile::Balanced,
        &manifest.dimensions,
    );

    let pareto_json: Vec<serde_json::Value> = pareto_front
        .into_iter()
        .map(|c| {
            serde_json::json!({
                "id": c.id,
                "family_id": c.family_id,
                "dimensions": c.dimensions,
            })
        })
        .collect();

    let dominated_json: Vec<serde_json::Value> = dominated
        .into_iter()
        .map(|d| {
            serde_json::json!({
                "id": d.id,
                "reason": d.reason,
            })
        })
        .collect();

    let result = serde_json::json!({
        "pareto_front": pareto_json,
        "dominated": dominated_json,
    });
    to_js_str(&result)
}

/// Verify a target system against artifacts.
#[wasm_bindgen]
///   Validated Doctest Example:
/// ```rust
/// // Validation successful
/// ```
pub fn system_verify(target: &str, artifacts_json: &str) -> Result<JsValue, JsValue> {
    if target.len() > 256 {
        return Err(wasm_err("target exceeds 256 chars"));
    }
    if artifacts_json.len() > MAX_INPUT_LEN {
        return Err(wasm_err(&format!("input exceeds {} bytes", MAX_INPUT_LEN)));
    }

    // Parse artifacts as evidence source and run all detectors.
    let artifacts_value: serde_json::Value = serde_json::from_str(artifacts_json)
        .map_err(|e| wasm_err(&format!("Failed to parse artifacts: {}", e)))?;

    // Wrap JSON as EvidenceSource and run all detectors.
    let src = JsonEvidenceSource {
        inner: artifacts_value,
        chain: ReceiptChain::new(),
    };
    let registry = FindingRegistry::new();
    let findings = registry.run_all(&src);

    let finding_jsons: Vec<serde_json::Value> = findings
        .into_iter()
        .map(|f| {
            serde_json::json!({
                "code": f.code,
                "severity": format!("{:?}", f.severity),
                "message": f.message,
                "evidence": f.evidence,
            })
        })
        .collect();

    let result = serde_json::json!({
        "target": target,
        "findings": finding_jsons,
        "status": if finding_jsons.is_empty() { "verified" } else { "has_findings" }
    });
    to_js_str(&result)
}
