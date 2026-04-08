pub mod models;
pub mod state;
pub mod types;
pub mod error;
pub mod io;

// Hand-rolled statistics (when hand_rolled_stats feature is enabled)
#[cfg(feature = "hand_rolled_stats")]
pub mod hand_stats;
pub mod discovery;
pub mod analysis;
pub mod conformance;
pub mod algorithms;
pub mod utilities;
pub mod xes_format;
pub mod fast_discovery;
pub mod more_discovery;
pub mod final_analytics;
pub mod filters;
pub mod social_network;
pub mod process_tree;
pub mod text_encoding;
pub mod feature_extraction;
pub mod data_quality;
pub mod capability_registry;
pub mod hierarchical;
pub mod probabilistic;
pub mod incremental_dfg;
pub mod smart_engine;
pub mod cache;
pub mod binary_format;
pub mod parallel_executor;

// OCEL support (gated by ocel feature)
#[cfg(feature = "ocel")]
pub mod ocel_io;
#[cfg(feature = "ocel")]
pub mod ocel_flatten;
#[cfg(feature = "ocel")]
pub mod oc_petri_net;
#[cfg(feature = "ocel")]
pub mod oc_conformance;
#[cfg(feature = "ocel")]
pub mod oc_performance;

// Advanced discovery algorithms (gated by discovery_advanced feature)
#[cfg(feature = "discovery_advanced")]
pub mod ilp_discovery;
#[cfg(feature = "discovery_advanced")]
pub mod genetic_discovery;
#[cfg(feature = "discovery_advanced")]
pub mod advanced_algorithms;  // ACO, PSO, simulated annealing

// ML/Prediction (gated by ml feature)
#[cfg(feature = "ml")]
pub mod prediction;
#[cfg(feature = "ml")]
pub mod prediction_additions;
#[cfg(feature = "ml")]
pub mod prediction_features;
#[cfg(feature = "ml")]
pub mod prediction_drift;
#[cfg(feature = "ml")]
pub mod prediction_next_activity;
#[cfg(feature = "ml")]
pub mod anomaly;
#[cfg(feature = "ml")]
pub mod prediction_outcome;
#[cfg(feature = "ml")]
pub mod prediction_resource;
#[cfg(feature = "ml")]
pub mod prediction_remaining_time;

// Streaming algorithms (gated by streaming_basic or streaming_full features)
#[cfg(feature = "streaming_basic")]
pub mod streaming;
#[cfg(feature = "streaming_basic")]
pub mod simd_streaming_dfg;

#[cfg(feature = "streaming_full")]
pub mod streaming_conformance;
#[cfg(feature = "streaming_full")]
pub mod streaming_wasm;
#[cfg(feature = "streaming_full")]
pub mod streaming_pipeline;

// Conformance (gated by conformance_basic or conformance_full features)
#[cfg(feature = "conformance_basic")]
pub mod declare_conformance;
#[cfg(feature = "conformance_basic")]
pub mod temporal_profile;
#[cfg(feature = "conformance_basic")]
pub mod simd_token_replay;

#[cfg(feature = "conformance_full")]
pub mod alignments;

// Performance and resource analysis
#[cfg(feature = "conformance_basic")]
pub mod performance_dfg;
#[cfg(feature = "ocel")]
pub mod resource_analysis;

// POWL modules (gated by powl feature)
#[cfg(feature = "powl")]
pub mod powl;
#[cfg(feature = "powl")]
pub mod powl_arena;
#[cfg(feature = "powl")]
pub mod powl_parser;
#[cfg(feature = "powl")]
pub mod powl_api;
#[cfg(feature = "powl")]
pub mod powl_models;
#[cfg(feature = "powl")]
pub mod powl_event_log;
#[cfg(feature = "powl")]
pub mod powl_petri_net;
#[cfg(feature = "powl")]
pub mod powl_process_tree;

// Re-export streaming types for convenience (conditional)
#[cfg(feature = "streaming_basic")]
pub use streaming::{StreamingAlgorithm, StreamStats, StreamingDfgBuilder, StreamingSkeletonBuilder, StreamingHeuristicBuilder};

// Recommendations module (always available)
pub mod recommendations;

// Conformance cache — cached token replay results (always available)
pub mod conformance_cache;

// Suppress unused warnings for re-exported modules
#[allow(unused)]
use state::*;
#[allow(unused)]
use types::*;

use wasm_bindgen::prelude::*;

#[wasm_bindgen(start)]
pub fn init_wasm() {
    // Initialize panic hook for better error messages in console
    console_error_panic_hook::set_once();
}

/// Initialize the WASM module
#[wasm_bindgen]
pub fn init() -> Result<String, JsValue> {
    init_state();
    Ok("Rust4PM WASM initialized successfully".to_string())
}

/// Initialize global state
fn init_state() {
    let _ = state::get_or_init_state();
}

#[wasm_bindgen]
pub fn get_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

/// Clear all caches (parse, columnar, interner).
#[wasm_bindgen]
pub fn clear_all_caches() {
    crate::cache::cache_clear();
}

/// Get cache statistics as JSON string.
#[wasm_bindgen]
pub fn get_cache_stats() -> String {
    let stats = crate::cache::cache_stats();
    format!(r#"{{"parse_hits":{},"parse_misses":{},"columnar_entries":{},"interner_entries":{}}}"#,
        stats.parse_hits, stats.parse_misses, stats.columnar_entries, stats.interner_entries)
}

/// SIMD-accelerated token replay for conformance checking.
///
/// Discovers a DFG from the log, builds a SimdPetriNet, then replays
/// every trace and returns fitness / precision / per-case diagnostics.
#[cfg(feature = "conformance_basic")]
#[wasm_bindgen]
pub fn simd_token_replay(log_handle: &str, activity_key: &str) -> String {
    crate::simd_token_replay::replay_log(log_handle, activity_key)
}

// Conditional re-exports for statistics
// When statrs feature is enabled, re-export statrs types
#[cfg(feature = "statrs")]
pub use statrs::statistics::{Data, Median};

// When hand_rolled_stats feature is enabled and statrs is not, re-export hand-rolled types
#[cfg(all(feature = "hand_rolled_stats", not(feature = "statrs")))]
pub use hand_stats::{Data};
