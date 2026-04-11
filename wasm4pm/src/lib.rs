//! # pictl — High-Performance Process Mining in WebAssembly
//!
//! `pictl` provides production-ready process mining algorithms compiled to WebAssembly,
//! enabling efficient **process discovery**, **conformance checking**, and **predictive analytics**
//! in JavaScript/TypeScript environments.
//!
//! ## Features
//!
//! - **Process Discovery** — DFG, Alpha++, Heuristic Miner, Inductive Miner, Genetic Algorithm, ILP, ACO, PSO
//! - **Conformance Checking** — Token-based replay, streaming conformance
//! - **Machine Learning** — Remaining-time prediction, outcome prediction, anomaly detection, drift detection
//! - **Streaming** — Real-time process mining for IoT and event streaming with SIMD acceleration
//! - **OCEL Support** — Object-Centric Event Logs with flattened analysis and DECLARE conformance
//! - **POWL** — Process-Oriented Workflow Language support
//!
//! ## Quick Start
//!
//! ```javascript
//! import initWasm, {
//!   load_eventlog_from_xes,
//!   discover_dfg,
//!   delete_object,
//! } from "@seanchatmangpt/pictl";
//!
//! // Initialize WASM module
//! await initWasm();
//!
//! // Load event log from XES string
//! const logHandle = load_eventlog_from_xes(xesString);
//!
//! // Discover Directly-Follows Graph
//! const dfg = discover_dfg(logHandle, "concept:name");
//!
//! // Clean up
//! delete_object(logHandle);
//! ```
//!
//! ## Feature Flags
//!
//! ### Deployment Profiles (Binary Size Optimization)
//!
//! | Profile  | Size    | Reduction | Use Case            |
//! |----------|---------|-----------|---------------------|
//! | `cloud`  | ~2.78MB | —         | Cloud servers (default) |
//! | `browser`| ~500KB  | 82%       | Web browsers, mobile |
//! | `edge`   | ~1.5MB  | 46%       | Edge servers, CDN    |
//! | `fog`    | ~2.0MB  | 28%       | Fog computing, IoT   |
//! | `iot`    | ~1.0MB  | 64%       | IoT devices, embedded |
//!
//! ### Algorithm Selection
//!
//! - `basic` — Fast discovery algorithms (DFG, skeleton)
//! - `advanced` — Full algorithm suite (ILP, genetic, ACO, PSO)
//! - `ml` — Machine learning features (prediction, anomaly, clustering)
//! - `streaming` — Streaming algorithms for real-time processing
//!
//! ## Architecture
//!
//! The crate uses a **handle-based state management system** where all objects
//! (event logs, process models, results) are stored internally and referenced by
//! string handles. This design enables:
//!
//! - Efficient serialization across the WASM boundary
//! - Automatic memory management via object pooling
//! - Simplified JavaScript interop (no manual lifetime management)
//!
//! ## Performance
//!
//! - **Throughput:** 100K+ events/second for DFG discovery
//! - **Memory:** Columnar data layouts, object pooling, incremental computation
//! - **Binary Size:** Deployment profiles reduce WASM by up to 82%
//! - **SIMD:** Vectorized streaming DFG via WASM SIMD instructions
//!
//! ## Links
//!
//! - [GitHub Repository](https://github.com/seanchatmangpt/pictl)
//! - [npm Package](https://www.npmjs.com/package/@seanchatmangpt/pictl)
//! - [Documentation](https://docs.rs/pictl)

pub mod error;
pub mod io;
pub mod models;
pub mod state;
pub mod types;

// Hand-rolled statistics (when hand_rolled_stats feature is enabled)
pub mod algorithms;
pub mod analysis;
pub mod binary_format;
pub mod cache;
pub mod capability_registry;
pub mod conformance;
pub mod data_quality;
pub mod discovery;
pub mod fast_discovery;
pub mod feature_extraction;
pub mod filters;
pub mod final_analytics;
#[cfg(feature = "hand_rolled_stats")]
pub mod hand_stats;
pub mod hierarchical;
pub mod incremental_dfg;
pub mod more_discovery;
pub mod parallel_executor;
pub mod probabilistic;
pub mod playout;
pub mod process_tree;
pub mod smart_engine;
pub mod social_network;
pub mod text_encoding;
pub mod utilities;
pub mod xes_format;

// OCEL support (gated by ocel feature)
#[cfg(feature = "ocel")]
pub mod oc_conformance;
#[cfg(feature = "ocel")]
pub mod oc_performance;
#[cfg(feature = "ocel")]
pub mod oc_petri_net;
#[cfg(feature = "ocel")]
pub mod ocel_flatten;
#[cfg(feature = "ocel")]
pub mod ocel_io;

// Advanced discovery algorithms (gated by discovery_advanced feature)
#[cfg(feature = "discovery_advanced")]
pub mod advanced_algorithms;
#[cfg(feature = "discovery_advanced")]
pub mod genetic_discovery;
#[cfg(feature = "discovery_advanced")]
pub mod ilp_discovery; // ACO, PSO, simulated annealing
#[cfg(feature = "discovery_advanced")]
pub mod transition_system;
#[cfg(feature = "discovery_advanced")]
pub mod causal_graph;
#[cfg(feature = "discovery_advanced")]
pub mod log_to_trie;
#[cfg(feature = "discovery_advanced")]
pub mod performance_spectrum;
#[cfg(feature = "discovery_advanced")]
pub mod batches;

// Quality metrics (gated by conformance_full feature)
#[cfg(feature = "conformance_full")]
pub mod generalization;

// ML/Prediction (gated by ml feature)
#[cfg(feature = "ml")]
pub mod anomaly;
#[cfg(feature = "ml")]
pub mod prediction;
#[cfg(feature = "ml")]
pub mod prediction_additions;
#[cfg(feature = "ml")]
pub mod prediction_drift;
#[cfg(feature = "ml")]
pub mod prediction_features;
#[cfg(feature = "ml")]
pub mod prediction_next_activity;
#[cfg(feature = "ml")]
pub mod prediction_outcome;
#[cfg(feature = "ml")]
pub mod prediction_remaining_time;
#[cfg(feature = "ml")]
pub mod prediction_resource;

// Streaming algorithms (gated by streaming_basic or streaming_full features)
#[cfg(feature = "streaming_basic")]
pub mod simd_streaming_dfg;
#[cfg(feature = "streaming_basic")]
pub mod streaming;

#[cfg(feature = "streaming_full")]
pub mod streaming_conformance;
#[cfg(feature = "streaming_full")]
pub mod streaming_pipeline;
#[cfg(feature = "streaming_full")]
pub mod streaming_wasm;

// Conformance (gated by conformance_basic or conformance_full features)
#[cfg(feature = "conformance_basic")]
pub mod declare_conformance;
#[cfg(feature = "conformance_basic")]
pub mod simd_token_replay;
#[cfg(feature = "conformance_basic")]
pub mod temporal_profile;

#[cfg(feature = "conformance_full")]
pub mod alignments;
#[cfg(feature = "conformance_full")]
pub mod petri_net_reduction;
#[cfg(feature = "conformance_full")]
pub mod etconformance_precision;
#[cfg(feature = "conformance_full")]
pub mod marking_equation;

// 80/20 gap-filling modules
#[cfg(feature = "alignment_fitness")]
pub mod alignment_fitness;
#[cfg(feature = "petri_net_playout")]
pub mod petri_net_playout;
#[cfg(feature = "align_etconformance")]
pub mod align_etconformance;
#[cfg(feature = "montecarlo")]
pub mod montecarlo;

// Performance and resource analysis
#[cfg(feature = "conformance_basic")]
pub mod performance_dfg;
#[cfg(feature = "ocel")]
pub mod resource_analysis;

// POWL modules (gated by powl feature)
#[cfg(feature = "powl")]
pub mod powl;
#[cfg(feature = "powl")]
pub mod powl_api;
#[cfg(feature = "powl")]
pub mod powl_arena;
#[cfg(feature = "powl")]
pub mod powl_event_log;
#[cfg(feature = "powl")]
pub mod powl_models;
#[cfg(feature = "powl")]
pub mod powl_parser;
#[cfg(feature = "powl")]
pub mod powl_petri_net;
#[cfg(feature = "powl")]
pub mod powl_process_tree;
#[cfg(feature = "powl")]
pub mod complexity_metrics;
#[cfg(feature = "powl")]
pub mod powl_to_process_tree;

// PNML import/export (always available)
pub mod pnml_io;

// BPMN import (always available, uses roxmltree)
pub mod bpmn_import;

#[cfg(feature = "streaming_basic")]
pub use streaming::{
    StreamStats, StreamingAlgorithm, StreamingDfgBuilder, StreamingHeuristicBuilder,
    StreamingSkeletonBuilder,
};

// Recommendations module (always available)
pub mod recommendations;

// Conformance cache — cached token replay results (always available)
pub mod conformance_cache;

// Correlation miner — DFG discovery without case identifiers (always available)
pub mod correlation_miner;

// Suppress unused warnings for re-exported modules
#[allow(unused)]
use state::*;
#[allow(unused)]
use types::*;

use wasm_bindgen::prelude::*;

#[wasm_bindgen(start)]
pub fn init_wasm() {
    // Initialize panic hook for better error messages in console
    #[cfg(feature = "console_error_panic_hook")]
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

/// Get WASM module capabilities as JSON string.
///
/// Returns version and feature flags indicating which algorithms
/// and capabilities are available in this build.
#[wasm_bindgen]
pub fn get_capabilities() -> String {
    format!(
        r#"{{"version":"{}","features":{{"discovery":true,"conformance":{},"ml":{},"streaming":{},"powl":{},"ocel":{},"alignment_fitness":{},"petri_net_playout":{},"extensive_playout":{},"align_etconformance":{},"montecarlo":{}}}}}"#,
        env!("CARGO_PKG_VERSION"),
        cfg!(feature = "conformance_full"),
        cfg!(feature = "ml"),
        cfg!(feature = "streaming_full"),
        cfg!(feature = "powl"),
        cfg!(feature = "ocel"),
        cfg!(feature = "alignment_fitness"),
        cfg!(feature = "petri_net_playout"),
        cfg!(feature = "extensive_playout"),
        cfg!(feature = "align_etconformance"),
        cfg!(feature = "montecarlo")
    )
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
    format!(
        r#"{{"parse_hits":{},"parse_misses":{},"columnar_entries":{},"interner_entries":{}}}"#,
        stats.parse_hits, stats.parse_misses, stats.columnar_entries, stats.interner_entries
    )
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
pub use hand_stats::Data;
