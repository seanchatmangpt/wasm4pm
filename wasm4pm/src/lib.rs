pub mod models;
pub mod state;
pub mod types;
pub mod error;
pub mod io;
pub mod ocel_io;
pub mod ocel_flatten;
pub mod discovery;
pub mod analysis;
pub mod conformance;
pub mod algorithms;
pub mod utilities;
pub mod xes_format;
pub mod advanced_algorithms;
pub mod ilp_discovery;
pub mod genetic_discovery;
pub mod fast_discovery;
pub mod more_discovery;
pub mod final_analytics;
pub mod streaming;
pub mod streaming_conformance;
pub mod streaming_wasm;
pub mod simd_streaming_dfg;

// Re-export streaming types for convenience
pub use streaming::{StreamingAlgorithm, StreamStats, StreamingDfgBuilder, StreamingSkeletonBuilder, StreamingHeuristicBuilder};
pub mod performance_dfg;
pub mod filters;
pub mod declare_conformance;
pub mod temporal_profile;
pub mod alignments;
pub mod prediction;
pub mod prediction_additions;
pub mod prediction_features;
pub mod prediction_drift;
pub mod prediction_next_activity;
pub mod anomaly;
pub mod social_network;
pub mod process_tree;
pub mod text_encoding;
pub mod feature_extraction;
pub mod resource_analysis;
pub mod data_quality;
pub mod capability_registry;
pub mod oc_petri_net;
pub mod oc_conformance;
pub mod oc_performance;
pub mod recommendations;
pub mod prediction_outcome;
pub mod prediction_resource;
pub mod prediction_remaining_time;
pub mod hierarchical;

// POWL modules
pub mod powl;
pub mod powl_arena;
pub mod powl_parser;
pub mod powl_api;
pub mod powl_models;
pub mod powl_event_log;
pub mod powl_petri_net;
pub mod powl_process_tree;

// Probabilistic data structures for memory-ephemeral process mining
pub mod probabilistic;

// Incremental O(1) per-event DFG for infinite streams
pub mod incremental_dfg;

// Smart Execution Engine — fused computation, caching, early termination
pub mod smart_engine;

// Caching layer — three-level parse/columnar/interner cache
pub mod cache;

// Binary process mining log format (.pm4bin)
pub mod binary_format;

// Rayon-based parallel algorithm execution for multi-core CPUs
pub mod parallel_executor;

// Streaming pipeline — multi-algorithm event processing pipeline
pub mod streaming_pipeline;

// Conformance cache — cached token replay results
pub mod conformance_cache;

// SIMD-accelerated token replay for conformance checking
pub mod simd_token_replay;

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
#[wasm_bindgen]
pub fn simd_token_replay(log_handle: &str, activity_key: &str) -> String {
    crate::simd_token_replay::replay_log(log_handle, activity_key)
}
