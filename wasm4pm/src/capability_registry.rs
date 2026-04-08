use crate::utilities::to_js;
use serde_json::json;
/// Capability Registry — LLM-discoverable tool catalog
///
/// Provides a complete inventory of wasm4pm functions for Claude and other LLMs
/// to discover and use via tool calling. Organized by process mining category.
///
/// Part of Van der Aalst's 5 Connections framework:
/// Connection 4: Generative AI (LLM-based process improvement)
use wasm_bindgen::prelude::*;

/// Get the complete capability registry of all wasm4pm functions
#[wasm_bindgen]
pub fn get_capability_registry() -> Result<JsValue, JsValue> {
    let registry = json!({
        "version": "0.5.4",
        "title": "wasm4pm Capability Registry",
        "description": "Complete catalog of process mining functions for LLM tool discovery",
        "categories": {
            "discovery": [
                {
                    "name": "discover_dfg",
                    "description": "Discover a Directly-Follows Graph from an EventLog",
                    "params": [
                        { "name": "eventlog_handle", "type": "string", "description": "Handle to loaded EventLog" },
                        { "name": "activity_key", "type": "string", "description": "Attribute key for activity names (e.g., 'concept:name')" }
                    ],
                    "returns": "JsValue (DirectlyFollowsGraph JSON)",
                    "example": "discover_dfg(log_handle, 'concept:name')"
                },
                {
                    "name": "discover_alpha_plus_plus",
                    "description": "Discover a Petri Net using Alpha++ algorithm",
                    "params": [
                        { "name": "eventlog_handle", "type": "string", "description": "Handle to loaded EventLog" },
                        { "name": "activity_key", "type": "string", "description": "Attribute key for activity names" }
                    ],
                    "returns": "string (Petri Net handle)",
                    "example": "discover_alpha_plus_plus(log_handle, 'concept:name')"
                },
                {
                    "name": "discover_heuristic_miner",
                    "description": "Discover a Petri Net using Heuristic Miner",
                    "params": [
                        { "name": "eventlog_handle", "type": "string" },
                        { "name": "activity_key", "type": "string" },
                        { "name": "min_threshold", "type": "f64", "description": "Minimum dependency threshold (0-1)" }
                    ],
                    "returns": "string (Petri Net handle)",
                    "example": "discover_heuristic_miner(log_handle, 'concept:name', 0.8)"
                },
                {
                    "name": "discover_dfg_filtered",
                    "description": "Discover DFG with edge filtering by frequency threshold",
                    "params": [
                        { "name": "eventlog_handle", "type": "string" },
                        { "name": "activity_key", "type": "string" },
                        { "name": "min_frequency", "type": "usize", "description": "Minimum edge frequency" }
                    ],
                    "returns": "JsValue (filtered DFG)",
                    "example": "discover_dfg_filtered(log_handle, 'concept:name', 5)"
                },
                {
                    "name": "discover_declare",
                    "description": "Discover DECLARE declarative constraints from EventLog",
                    "params": [
                        { "name": "eventlog_handle", "type": "string" },
                        { "name": "activity_key", "type": "string" }
                    ],
                    "returns": "JsValue (DECLARE model)",
                    "example": "discover_declare(log_handle, 'concept:name')"
                },
                {
                    "name": "discover_ocel_dfg",
                    "description": "Discover global DFG from Object-Centric Event Log",
                    "params": [
                        { "name": "ocel_handle", "type": "string", "description": "Handle to loaded OCEL" }
                    ],
                    "returns": "JsValue (DirectlyFollowsGraph)",
                    "example": "discover_ocel_dfg(ocel_handle)"
                },
                {
                    "name": "discover_ocel_dfg_per_type",
                    "description": "Discover per-type DFGs from OCEL (one per object type)",
                    "params": [
                        { "name": "ocel_handle", "type": "string" }
                    ],
                    "returns": "JsValue ({object_type: DFG, ...})",
                    "example": "discover_ocel_dfg_per_type(ocel_handle)"
                }
            ],
            "conformance": [
                {
                    "name": "check_token_based_replay",
                    "description": "Check trace conformance using token-based replay",
                    "params": [
                        { "name": "log_handle", "type": "string" },
                        { "name": "petri_net_handle", "type": "string" },
                        { "name": "activity_key", "type": "string" }
                    ],
                    "returns": "JsValue (conformance metrics)",
                    "example": "check_token_based_replay(log_handle, net_handle, 'concept:name')"
                },
                {
                    "name": "compute_optimal_alignments",
                    "description": "Compute optimal trace alignments using A* search",
                    "params": [
                        { "name": "log_handle", "type": "string" },
                        { "name": "petri_net_handle", "type": "string" },
                        { "name": "activity_key", "type": "string" },
                        { "name": "cost_config_json", "type": "string", "description": "{sync_cost: 0, log_move_cost: 1, model_move_cost: 1}" }
                    ],
                    "returns": "JsValue (alignment results with costs)",
                    "example": "compute_optimal_alignments(log_handle, net_handle, 'concept:name', '{\"sync_cost\": 0}')"
                },
                {
                    "name": "check_declare_conformance",
                    "description": "Check traces against DECLARE constraint model",
                    "params": [
                        { "name": "log_handle", "type": "string" },
                        { "name": "declare_handle", "type": "string" },
                        { "name": "activity_key", "type": "string" }
                    ],
                    "returns": "JsValue (conformance results)",
                    "example": "check_declare_conformance(log_handle, declare_handle, 'concept:name')"
                }
            ],
            "analysis": [
                {
                    "name": "analyze_event_statistics",
                    "description": "Compute basic event log statistics",
                    "params": [
                        { "name": "eventlog_handle", "type": "string" }
                    ],
                    "returns": "JsValue (trace count, event count, duration, activities)",
                    "example": "analyze_event_statistics(log_handle)"
                },
                {
                    "name": "analyze_ocel_statistics",
                    "description": "Compute OCEL-specific statistics",
                    "params": [
                        { "name": "ocel_handle", "type": "string" }
                    ],
                    "returns": "JsValue (event/object counts, types)",
                    "example": "analyze_ocel_statistics(ocel_handle)"
                },
                {
                    "name": "analyze_case_duration",
                    "description": "Analyze case durations and throughput",
                    "params": [
                        { "name": "eventlog_handle", "type": "string" }
                    ],
                    "returns": "JsValue (min/max/avg duration, percentiles)",
                    "example": "analyze_case_duration(log_handle)"
                },
                {
                    "name": "detect_rework",
                    "description": "Detect rework (repeated activities) per trace",
                    "params": [
                        { "name": "eventlog_handle", "type": "string" },
                        { "name": "activity_key", "type": "string" }
                    ],
                    "returns": "JsValue (rework counts and profiles)",
                    "example": "detect_rework(log_handle, 'concept:name')"
                },
                {
                    "name": "detect_bottlenecks",
                    "description": "Identify bottleneck activities (high waiting time)",
                    "params": [
                        { "name": "eventlog_handle", "type": "string" },
                        { "name": "timestamp_key", "type": "string" },
                        { "name": "threshold_percentile", "type": "f64", "description": "Percentile threshold (0-100)" }
                    ],
                    "returns": "JsValue (bottleneck activities with stats)",
                    "example": "detect_bottlenecks(log_handle, 'time:timestamp', 75.0)"
                }
            ],
            "data_quality": [
                {
                    "name": "check_data_quality",
                    "description": "Check EventLog for common data quality issues",
                    "params": [
                        { "name": "log_handle", "type": "string" },
                        { "name": "activity_key", "type": "string" },
                        { "name": "timestamp_key", "type": "string" }
                    ],
                    "returns": "JsValue (issues: missing values, duplicates, ordering)",
                    "example": "check_data_quality(log_handle, 'concept:name', 'time:timestamp')"
                },
                {
                    "name": "check_ocel_data_quality",
                    "description": "Check OCEL for referential integrity and consistency",
                    "params": [
                        { "name": "ocel_handle", "type": "string" }
                    ],
                    "returns": "JsValue (orphan objects, invalid references)",
                    "example": "check_ocel_data_quality(ocel_handle)"
                },
                {
                    "name": "infer_eventlog_schema",
                    "description": "Infer schema from EventLog attributes",
                    "params": [
                        { "name": "log_handle", "type": "string" }
                    ],
                    "returns": "JsValue (attribute types, distributions)",
                    "example": "infer_eventlog_schema(log_handle)"
                },
                {
                    "name": "infer_ocel_schema",
                    "description": "Infer schema from OCEL",
                    "params": [
                        { "name": "ocel_handle", "type": "string" }
                    ],
                    "returns": "JsValue (event/object attribute schemas)",
                    "example": "infer_ocel_schema(ocel_handle)"
                }
            ],
            "feature_extraction": [
                {
                    "name": "extract_case_features",
                    "description": "Extract ML-ready features per complete trace",
                    "params": [
                        { "name": "log_handle", "type": "string" },
                        { "name": "activity_key", "type": "string" },
                        { "name": "timestamp_key", "type": "string" },
                        { "name": "config_json", "type": "string", "description": "{features: [...], target: 'outcome'}" }
                    ],
                    "returns": "JsValue (array of feature vectors)",
                    "example": "extract_case_features(log_handle, 'concept:name', 'time:timestamp', '{\"features\": [\"trace_length\"]}')"
                },
                {
                    "name": "extract_prefix_features",
                    "description": "Extract features per trace prefix (for next-activity prediction)",
                    "params": [
                        { "name": "log_handle", "type": "string" },
                        { "name": "activity_key", "type": "string" },
                        { "name": "timestamp_key", "type": "string" },
                        { "name": "prefix_length", "type": "usize", "description": "Max prefix length" }
                    ],
                    "returns": "JsValue (array of prefix feature vectors)",
                    "example": "extract_prefix_features(log_handle, 'concept:name', 'time:timestamp', 10)"
                },
                {
                    "name": "export_features_csv",
                    "description": "Export feature vectors as CSV string",
                    "params": [
                        { "name": "features_json", "type": "string", "description": "JSON array from extract_case_features" }
                    ],
                    "returns": "string (CSV with headers)",
                    "example": "export_features_csv(features_json)"
                }
            ],
            "filtering": [
                {
                    "name": "filter_by_start_activity",
                    "description": "Filter traces by start activity",
                    "params": [
                        { "name": "log_handle", "type": "string" },
                        { "name": "activity", "type": "string" },
                        { "name": "activity_key", "type": "string" }
                    ],
                    "returns": "string (filtered log handle)",
                    "example": "filter_by_start_activity(log_handle, 'Create', 'concept:name')"
                },
                {
                    "name": "filter_by_end_activity",
                    "description": "Filter traces by end activity",
                    "params": [
                        { "name": "log_handle", "type": "string" },
                        { "name": "activity", "type": "string" },
                        { "name": "activity_key", "type": "string" }
                    ],
                    "returns": "string (filtered log handle)",
                    "example": "filter_by_end_activity(log_handle, 'Complete', 'concept:name')"
                },
                {
                    "name": "filter_by_case_size",
                    "description": "Filter traces by event count range",
                    "params": [
                        { "name": "log_handle", "type": "string" },
                        { "name": "min_size", "type": "usize" },
                        { "name": "max_size", "type": "usize" }
                    ],
                    "returns": "string (filtered log handle)",
                    "example": "filter_by_case_size(log_handle, 5, 50)"
                }
            ],
            "io": [
                {
                    "name": "load_eventlog_from_json",
                    "description": "Load EventLog from JSON string",
                    "params": [
                        { "name": "content", "type": "string", "description": "JSON EventLog structure" }
                    ],
                    "returns": "string (EventLog handle)",
                    "example": "load_eventlog_from_json(json_string)"
                },
                {
                    "name": "load_ocel_from_json",
                    "description": "Load OCEL from JSON (OCEL 2.0 standard)",
                    "params": [
                        { "name": "content", "type": "string", "description": "JSON OCEL structure" }
                    ],
                    "returns": "string (OCEL handle)",
                    "example": "load_ocel_from_json(json_string)"
                },
                {
                    "name": "export_eventlog_to_json",
                    "description": "Export EventLog to JSON string",
                    "params": [
                        { "name": "handle", "type": "string" }
                    ],
                    "returns": "string (JSON)",
                    "example": "export_eventlog_to_json(log_handle)"
                },
                {
                    "name": "export_ocel_to_json",
                    "description": "Export OCEL to JSON string",
                    "params": [
                        { "name": "handle", "type": "string" }
                    ],
                    "returns": "string (JSON)",
                    "example": "export_ocel_to_json(ocel_handle)"
                }
            ],
            "state": [
                {
                    "name": "init",
                    "description": "Initialize the wasm4pm module",
                    "params": [],
                    "returns": "Promise<void>",
                    "example": "await init()"
                },
                {
                    "name": "clear_all",
                    "description": "Free all stored objects (logs, nets, etc.)",
                    "params": [],
                    "returns": "Result<(), JsValue>",
                    "example": "clear_all()"
                },
                {
                    "name": "free_handle",
                    "description": "Free memory for a specific handle",
                    "params": [
                        { "name": "handle", "type": "string" }
                    ],
                    "returns": "Result<(), JsValue>",
                    "example": "free_handle(log_handle)"
                }
            ]
        },
        "notes": [
            "All functions are exposed via WASM and callable from JavaScript/TypeScript",
            "Large objects (logs, nets, DFGs) are stored in Rust memory and referenced by string handles",
            "Use free_handle() to explicitly free memory when done",
            "OCEL 2.0 (Object-Centric Event Log) format is supported with camelCase field names",
            "All timestamps use ISO 8601 format (RFC 3339)",
            "Event attributes keyed by 'concept:name' for activity, 'time:timestamp' for timestamp"
        ]
    });

    to_js(&registry)
}
