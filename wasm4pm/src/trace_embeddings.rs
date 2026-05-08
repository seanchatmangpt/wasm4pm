//! Trace embeddings — project trace variants into a low-dimensional PCA space.
//!
//! Each trace is represented as a bag-of-activities vector (activity count per trace),
//! then reduced with PCA so that similar traces cluster together in 2-D / n-D space.
//!
//! Gated on the `miniml` feature (miniml-core crate).

#![cfg(feature = "ml")]

use wasm_bindgen::prelude::*;

use crate::state::{get_or_init_state, StoredObject};

/// Project trace variants into a reduced-dimension PCA space.
///
/// Each trace becomes a bag-of-activities vector over the vocabulary, then
/// PCA reduces that to `n_components` dimensions.
///
/// # Arguments
/// * `log_handle`   — Handle returned by `load_eventlog_from_xes` / `load_eventlog_from_json`.
/// * `activity_key` — Event attribute name for activity labels (e.g. `"concept:name"`).
/// * `n_components` — Number of PCA dimensions (capped at min(vocab_size, n_traces-1)).
///
/// # Returns
/// JSON string:
/// ```json
/// {
///   "n_traces": 42,
///   "n_components": 2,
///   "vocab_size": 8,
///   "explained_variance_ratio": [0.62, 0.21],
///   "points": [
///     { "trace_index": 0, "coords": [1.2, -0.3], "trace_length": 5 },
///     ...
///   ]
/// }
/// ```
#[wasm_bindgen]
pub fn project_trace_variants(
    log_handle: &str,
    activity_key: &str,
    n_components: usize,
) -> Result<JsValue, JsValue> {
    get_or_init_state().with_object(log_handle, |obj| {
        let log = match obj {
            Some(StoredObject::EventLog(l)) => l,
            Some(_) => {
                return Err(crate::error::wasm_err(
                    crate::error::codes::INVALID_INPUT,
                    "project_trace_variants: handle is not an EventLog",
                ))
            }
            None => {
                return Err(crate::error::wasm_err(
                    crate::error::codes::INVALID_INPUT,
                    format!("project_trace_variants: handle '{}' not found", log_handle),
                ))
            }
        };

        // Build columnar representation (borrowed, tied to log lifetime)
        let col = log.to_columnar(activity_key);

        let vocab_size = col.vocab.len();
        let n_traces = col.trace_offsets.len().saturating_sub(1);

        if vocab_size == 0 {
            return Err(crate::error::wasm_err(
                crate::error::codes::INVALID_INPUT,
                "project_trace_variants: event log has no activities (empty vocabulary)",
            ));
        }
        if n_traces < 2 {
            return Err(crate::error::wasm_err(
                crate::error::codes::INVALID_INPUT,
                "project_trace_variants: need at least 2 traces for PCA",
            ));
        }
        if vocab_size > 200 {
            return Err(crate::error::wasm_err(
                crate::error::codes::INVALID_INPUT,
                "project_trace_variants: vocabulary too large for PCA (>200 activities)",
            ));
        }

        // Cap n_components
        let n_comp = n_components.min(vocab_size).min(n_traces - 1).max(1);

        // Build flat bag-of-activities matrix: [n_traces × vocab_size]
        let mut flat_data = vec![0.0f64; n_traces * vocab_size];
        for t in 0..n_traces {
            let start = col.trace_offsets[t];
            let end = col.trace_offsets[t + 1];
            for &ev_id in &col.events[start..end] {
                flat_data[t * vocab_size + ev_id as usize] += 1.0;
            }
        }

        // Run PCA via miniml-core
        let pca_result = miniml::pca_impl(&flat_data, vocab_size, n_comp).map_err(|e| {
            crate::error::wasm_err(
                crate::error::codes::INTERNAL_ERROR,
                format!("PCA failed: {}", e),
            )
        })?;

        let transformed = pca_result.get_transformed(); // Vec<f64>, shape [n_traces * n_comp]
        let evr = pca_result.get_explained_variance_ratio();

        // Build per-trace point objects
        let mut points = Vec::with_capacity(n_traces);
        for t in 0..n_traces {
            let coords: Vec<f64> = (0..n_comp).map(|c| transformed[t * n_comp + c]).collect();
            let trace_len = col.trace_offsets[t + 1] - col.trace_offsets[t];
            points.push(serde_json::json!({
                "trace_index": t,
                "coords": coords,
                "trace_length": trace_len,
            }));
        }

        let result = serde_json::json!({
            "n_traces": n_traces,
            "n_components": n_comp,
            "vocab_size": vocab_size,
            "explained_variance_ratio": evr,
            "points": points,
        });

        Ok(JsValue::from_str(&result.to_string()))
    })
}
