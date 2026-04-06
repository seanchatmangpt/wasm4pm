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
