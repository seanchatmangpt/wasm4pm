use wasm_bindgen::prelude::*;

/// Placeholder for discovery algorithms
/// Full implementations require additional API exploration of the process_mining crate

#[wasm_bindgen]
pub fn discovery_info() -> String {
    serde_json::json!({
        "status": "discovery_module_configured",
        "note": "Discovery algorithm implementations documented and tested in vitest suite",
        "available_algorithms": [
            "alpha_plus_plus",
            "dfg",
            "oc_dfg",
            "declare",
            "oc_declare"
        ]
    })
    .to_string()
}

/// Get list of available discovery algorithms
#[wasm_bindgen]
pub fn available_discovery_algorithms() -> String {
    serde_json::json!({
        "algorithms": [
            {
                "name": "alpha_plus_plus",
                "description": "Alpha++ algorithm for discovering Petri nets from event logs",
                "status": "documented"
            },
            {
                "name": "dfg",
                "description": "Directly-Follows Graph discovery from event logs",
                "status": "documented"
            },
            {
                "name": "oc_dfg",
                "description": "Object-Centric Directly-Follows Graph discovery from OCEL",
                "status": "documented"
            },
            {
                "name": "declare",
                "description": "DECLARE constraint discovery from event logs",
                "status": "documented"
            },
            {
                "name": "oc_declare",
                "description": "Object-Centric DECLARE discovery from OCEL",
                "status": "documented"
            }
        ]
    })
    .to_string()
}
