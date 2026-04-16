/**
 * provenance.rs - Serialization and provenance tracking layer
 *
 * Provides WASM-side metadata wrapper for discovered models with cryptographic
 * provenance information. Each algorithm result is wrapped in RawModelOutput to
 * track execution lineage, versioning, and hashing.
 *
 * Section 2.5 of the Three-Layer Architecture Contract Specification.
 */

use serde::{Deserialize, Serialize};
use std::time::Instant;
use wasm_bindgen::prelude::*;

/// WASM-side metadata wrapper for algorithm outputs with provenance.
///
/// Every algorithm result (DFG, Petri Net, etc.) is wrapped in this struct
/// before being returned to JavaScript. The wrapper includes algorithm version,
/// execution latency, and BLAKE3 hashing of the model JSON.
///
/// **Invariants:**
/// - `model_hash` is always a 128-character hex string (BLAKE3 hex-64)
/// - `deterministic` is const true for all pictl algorithms
/// - `algorithm_version` follows format: "CRATE_VERSION.algorithm_variant"
/// - `latency_class` is derived from `algorithm_duration_ms`
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RawModelOutput {
    /// Discovered model JSON (DFG, PetriNet, ProcessTree, etc.)
    pub model: serde_json::Value,

    /// BLAKE3 hash of model JSON (64 hex characters, no uppercase)
    pub model_hash: String,

    /// Const true — all pictl algorithms are deterministic
    pub deterministic: bool,

    /// Algorithm version string: "CRATE_VERSION.variant"
    /// Example: "26.4.8.dfg_v1", "26.4.8.inductive_v2"
    pub algorithm_version: String,

    /// Latency classification: "sub_ms" | "low_ms" | "high_ms" | "seconds" | "minutes"
    pub latency_class: String,

    /// Measured algorithm execution time in milliseconds
    pub algorithm_duration_ms: u64,
}

/// Derives latency class from duration in milliseconds.
///
/// - `sub_ms`: duration < 1
/// - `low_ms`: duration >= 1 and < 100
/// - `high_ms`: duration >= 100 and < 1000
/// - `seconds`: duration >= 1000 and < 60000
/// - `minutes`: duration >= 60000
pub fn derive_latency_class(duration_ms: u64) -> &'static str {
    match duration_ms {
        0..=0 => "sub_ms",
        1..=99 => "low_ms",
        100..=999 => "high_ms",
        1000..=59999 => "seconds",
        _ => "minutes",
    }
}

/// Computes BLAKE3 hash of a JSON value as a 64-character hex string.
///
/// Uses blake3 crate with deterministic serialization (sorted object keys).
/// The resulting string is always lowercase hex, exactly 64 characters (256 bits = 32 bytes).
pub fn hash_model_json(model: &serde_json::Value) -> String {
    // Serialize with sorted keys for determinism
    let canonical_json = serde_json::to_string(model)
        .unwrap_or_else(|_| "{}".to_string());

    // Compute BLAKE3 (256 bits = 32 bytes = 64 hex chars)
    let digest = blake3::hash(canonical_json.as_bytes());
    digest.to_hex().to_string()
}

/// Wraps a discovered model in RawModelOutput with provenance metadata.
///
/// **Parameters:**
/// - `model`: The discovered model (DFG, Petri Net, etc.) as serde_json::Value
/// - `algorithm_version`: Version string (e.g., "26.4.8.dfg_v1")
/// - `duration_ms`: Algorithm execution time in milliseconds
///
/// **Returns:**
/// A RawModelOutput with:
/// - `model_hash` computed from model JSON
/// - `deterministic: true`
/// - `latency_class` derived from duration
/// - All fields populated and validated
///
/// **Example:**
/// ```ignore
/// let dfg_json = serde_json::to_value(&dfg)?;
/// let output = wrap_discovery_result(dfg_json, "26.4.8.dfg_v1", 45);
/// ```
pub fn wrap_discovery_result(
    model: serde_json::Value,
    algorithm_version: &str,
    duration_ms: u64,
) -> RawModelOutput {
    let model_hash = hash_model_json(&model);
    let latency_class = derive_latency_class(duration_ms).to_string();

    RawModelOutput {
        model,
        model_hash,
        deterministic: true,
        algorithm_version: algorithm_version.to_string(),
        latency_class,
        algorithm_duration_ms: duration_ms,
    }
}

/// Exports a RawModelOutput to JavaScript as JSON string.
///
/// Safely serializes the output struct to JSON, handling errors gracefully
/// by returning a JsValue error.
pub fn export_raw_output_to_js(output: &RawModelOutput) -> Result<JsValue, JsValue> {
    let json_str = serde_json::to_string(output)
        .map_err(|e| JsValue::from_str(&format!("Failed to serialize RawModelOutput: {}", e)))?;

    let js_value = JsValue::from_str(&json_str);
    Ok(js_value)
}

// ============================================================================
// Algorithm Version Constants
// ============================================================================
//
// Each algorithm module maintains a const VERSION string in the format:
// "CRATE_VERSION.algorithm_variant"
//
// Example: pub const VERSION: &str = "26.4.8.dfg_v1";
//
// These are used by wrap_discovery_result() to populate the algorithm_version
// field in RawModelOutput. Version strings enable precise audit trail lineage
// and allow future algorithm improvements without breaking provenance chains.

pub mod versions {
    //! Algorithm version constants for provenance tracking.
    //! Format: "CRATE_VERSION.algorithm_variant"

    pub const DFG_V1: &str = "26.4.8.dfg_v1";
    pub const STREAMING_DFG_V1: &str = "26.4.8.streaming_dfg_v1";
    pub const PROCESS_SKELETON_V1: &str = "26.4.8.process_skeleton_v1";
    pub const ALPHA_PLUS_PLUS_V1: &str = "26.4.8.alpha_plus_plus_v1";
    pub const HEURISTIC_MINER_V1: &str = "26.4.8.heuristic_miner_v1";
    pub const INDUCTIVE_MINER_V1: &str = "26.4.8.inductive_miner_v1";
    pub const HILL_CLIMBING_V1: &str = "26.4.8.hill_climbing_v1";
    pub const DECLARE_V1: &str = "26.4.8.declare_v1";
    pub const SIMULATED_ANNEALING_V1: &str = "26.4.8.simulated_annealing_v1";
    pub const A_STAR_V1: &str = "26.4.8.a_star_v1";
    pub const ACO_V1: &str = "26.4.8.aco_v1";
    pub const PSO_V1: &str = "26.4.8.pso_v1";
    pub const GENETIC_ALGORITHM_V1: &str = "26.4.8.genetic_algorithm_v1";
    pub const OPTIMIZED_DFG_V1: &str = "26.4.8.optimized_dfg_v1";
    pub const ILP_V1: &str = "26.4.8.ilp_v1";
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_derive_latency_class_boundaries() {
        assert_eq!(derive_latency_class(0), "sub_ms");
        assert_eq!(derive_latency_class(1), "low_ms");
        assert_eq!(derive_latency_class(99), "low_ms");
        assert_eq!(derive_latency_class(100), "high_ms");
        assert_eq!(derive_latency_class(999), "high_ms");
        assert_eq!(derive_latency_class(1000), "seconds");
        assert_eq!(derive_latency_class(59999), "seconds");
        assert_eq!(derive_latency_class(60000), "minutes");
        assert_eq!(derive_latency_class(999999), "minutes");
    }

    #[test]
    fn test_hash_model_json_determinism() {
        let model1 = serde_json::json!({
            "nodes": [
                { "id": "a", "label": "Activity A" },
                { "id": "b", "label": "Activity B" }
            ],
            "edges": [
                { "from": "a", "to": "b", "weight": 10 }
            ]
        });

        // Hash the same model twice — should match exactly
        let hash1 = hash_model_json(&model1);
        let hash2 = hash_model_json(&model1);

        assert_eq!(hash1, hash2);
        assert_eq!(hash1.len(), 128); // BLAKE3 hex-64 = 128 chars
        assert!(hash1.chars().all(|c| c.is_ascii_hexdigit()));
    }

    #[test]
    fn test_hash_model_json_format() {
        let model = serde_json::json!({"test": "value"});
        let hash = hash_model_json(&model);

        // BLAKE3 hash must be exactly 64 characters (256 bits = 32 bytes)
        assert_eq!(hash.len(), 64);

        // All lowercase hex
        assert!(hash.chars().all(|c| {
            (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f')
        }));
    }

    #[test]
    fn test_wrap_discovery_result_all_fields_populated() {
        let model = serde_json::json!({"nodes": [], "edges": []});
        let output = wrap_discovery_result(model.clone(), "26.4.8.dfg_v1", 45);

        assert!(!output.model_hash.is_empty());
        assert_eq!(output.model_hash.len(), 128);
        assert_eq!(output.deterministic, true);
        assert_eq!(output.algorithm_version, "26.4.8.dfg_v1");
        assert_eq!(output.latency_class, "low_ms");
        assert_eq!(output.algorithm_duration_ms, 45);
    }

    #[test]
    fn test_wrap_discovery_result_latency_classification() {
        let model = serde_json::json!({"test": "model"});

        let output_sub_ms = wrap_discovery_result(model.clone(), "test", 0);
        assert_eq!(output_sub_ms.latency_class, "sub_ms");

        let output_low_ms = wrap_discovery_result(model.clone(), "test", 50);
        assert_eq!(output_low_ms.latency_class, "low_ms");

        let output_high_ms = wrap_discovery_result(model.clone(), "test", 500);
        assert_eq!(output_high_ms.latency_class, "high_ms");

        let output_seconds = wrap_discovery_result(model.clone(), "test", 5000);
        assert_eq!(output_seconds.latency_class, "seconds");

        let output_minutes = wrap_discovery_result(model, "test", 120000);
        assert_eq!(output_minutes.latency_class, "minutes");
    }

    #[test]
    fn test_version_constants_format() {
        // Verify all version constants follow the expected format
        assert!(versions::DFG_V1.starts_with("26.4.8."));
        assert!(versions::STREAMING_DFG_V1.starts_with("26.4.8."));
        assert!(versions::ALPHA_PLUS_PLUS_V1.starts_with("26.4.8."));
        assert!(versions::ILP_V1.starts_with("26.4.8."));
    }
}
