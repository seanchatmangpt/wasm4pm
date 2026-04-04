pub mod models;
pub mod state;
pub mod types;
pub mod io;
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
    "0.5.4".to_string()
}
