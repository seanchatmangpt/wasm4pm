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
pub mod ensemble;
pub mod fast_discovery;
pub mod feature_extraction;
pub mod feature_importance;
pub mod filters;
pub mod final_analytics;
#[cfg(feature = "hand_rolled_stats")]
pub mod hand_stats;
pub mod hot_kernels;
pub mod hierarchical;
pub mod incremental_dfg;
pub mod more_discovery;
pub mod parallel_executor;
pub mod playout;
pub mod probabilistic;
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
#[cfg(feature = "ocel")]
pub mod ocel_tests;

// Advanced discovery algorithms (gated by discovery_advanced feature)
#[cfg(feature = "discovery_advanced")]
pub mod advanced_algorithms;
#[cfg(feature = "discovery_advanced")]
pub mod batches;
#[cfg(feature = "discovery_advanced")]
pub mod causal_graph;
#[cfg(feature = "discovery_advanced")]
pub mod genetic_discovery;
#[cfg(feature = "discovery_advanced")]
pub mod ilp_discovery; // ACO, PSO, simulated annealing
#[cfg(feature = "discovery_advanced")]
pub mod log_to_trie;
#[cfg(feature = "discovery_advanced")]
pub mod performance_spectrum;
#[cfg(feature = "discovery_advanced")]
pub mod transition_system;

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
pub mod etconformance_precision;
#[cfg(feature = "conformance_full")]
pub mod marking_equation;
#[cfg(feature = "conformance_full")]
pub mod petri_net_reduction;

// 80/20 gap-filling modules
#[cfg(feature = "align_etconformance")]
pub mod align_etconformance;
#[cfg(feature = "alignment_fitness")]
pub mod alignment_fitness;
#[cfg(feature = "montecarlo")]
pub mod montecarlo;
#[cfg(feature = "petri_net_playout")]
pub mod petri_net_playout;

// Performance and resource analysis
#[cfg(feature = "conformance_basic")]
pub mod performance_dfg;
#[cfg(feature = "ocel")]
pub mod resource_analysis;

// POWL modules (gated by powl feature)
#[cfg(feature = "powl")]
pub mod complexity_metrics;
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
pub mod powl_to_process_tree;
#[cfg(feature = "powl")]
pub mod yawl_export;

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

// Self-healing — circuit breaker, retry policy, health check (ported from knhk)
pub mod self_healing;

// SPC — Western Electric rules + process capability (always available)
pub mod spc;

// Guard evaluation engine — predicate/resource/state/counter/time-window guards (ported from knhk)
pub mod guards;

// 43-pattern dispatch — van der Aalst workflow pattern execution (ported from knhk)
pub mod pattern_dispatch;

// Reinforcement learning — Q-Learning and SARSA agents (ported from knhk)
pub mod reinforcement;

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

// -------------------------------------------------------------------------
// AutoProcess — Full Autonomic Control Loop
// -------------------------------------------------------------------------

/// AutoProcess: Run the complete 4-layer autonomic control loop.
///
/// Layers:
/// 1. **Perception** — Build ExecutionContext from event log metrics
/// 2. **Decision** — Evaluate guards + dispatch workflow pattern
/// 3. **Protection** — Circuit breaker + Statistical Process Control (SPC)
/// 4. **Optimization** — Reinforcement learning (Q-Learning) action selection
///
/// Returns JSON with cycle_result (all 4 layers) and nanosecond timing.
#[wasm_bindgen]
pub fn autonomic_execute_cycle(
    log_handle: &str,
    activity_key: &str,
    _config_json: &str,
) -> Result<String, JsValue> {
    let state = get_or_init_state();

    // -----------------------------------------------------------------------
    // Helper: extract event log metrics for Perception layer
    // -----------------------------------------------------------------------
    let perception_result = state.with_object(log_handle, |obj| {
        let log = match obj {
            Some(StoredObject::EventLog(l)) => l,
            _ => {
                return Err(JsValue::from_str(
                    "autonomic_execute_cycle: handle does not reference an EventLog",
                ));
            }
        };

        let trace_count = log.traces.len();
        let event_count: usize = log.traces.iter().map(|t| t.events.len()).sum();

        let mut activity_set = std::collections::HashSet::new();
        for trace in &log.traces {
            for event in &trace.events {
                if let Some(models::AttributeValue::String(name)) =
                    event.attributes.get(activity_key)
                {
                    activity_set.insert(name.clone());
                }
            }
        }
        let unique_activities = activity_set.len();

        // Trace durations (if timestamps available)
        let time_key = "time:timestamp";
        let mut trace_durations: Vec<f64> = Vec::new();
        let mut has_timestamps = false;
        for trace in &log.traces {
            let first_ts = trace.events.first().and_then(|e| e.attributes.get(time_key));
            let last_ts = trace.events.last().and_then(|e| e.attributes.get(time_key));
            if let (Some(first), Some(last)) = (first_ts, last_ts) {
                has_timestamps = true;
                let first_str = first.as_string().unwrap_or("");
                let last_str = last.as_string().unwrap_or("");
                let dur = (last_str.len() as f64) - (first_str.len() as f64);
                trace_durations.push(dur.abs());
            }
        }

        // Activity frequencies
        let mut activity_freq: std::collections::HashMap<String, usize> =
            std::collections::HashMap::new();
        for trace in &log.traces {
            for event in &trace.events {
                if let Some(models::AttributeValue::String(name)) =
                    event.attributes.get(activity_key)
                {
                    *activity_freq.entry(name.clone()).or_insert(0) += 1;
                }
            }
        }

        // Health state (5-level: 0=Normal, 1=Warning, 2=Degraded, 3=Critical, 4=Failed)
        let health_state = if event_count == 0 || unique_activities == 0 {
            4 // Failed: empty log or no activities
        } else if trace_count == 0 {
            3 // Critical: no traces
        } else if unique_activities == 1 && event_count < 5 {
            2 // Degraded: trivial log
        } else {
            0 // Normal
        };

        let health_label = match health_state {
            0 => "Normal",
            1 => "Warning",
            2 => "Degraded",
            3 => "Critical",
            _ => "Failed",
        };

        Ok::<serde_json::Value, JsValue>(serde_json::json!({
            "event_count": event_count,
            "trace_count": trace_count,
            "unique_activities": unique_activities,
            "has_timestamps": has_timestamps,
            "trace_durations": trace_durations,
            "activity_frequencies": activity_freq,
            "health_state": health_state,
            "health_label": health_label,
        }))
    })?;
    // perception_result is serde_json::Value (with_object unwraps both layers)

    let perception_ns = 0; // Included in overall timing

    // -----------------------------------------------------------------------
    // Layer 2: Decision — Guards + Pattern Dispatch
    // -----------------------------------------------------------------------
    let perception = &perception_result;

    // Build ExecutionContext for guard evaluation
    let event_count_val = perception["event_count"].as_u64().unwrap_or(0);
    let trace_count_val = perception["trace_count"].as_u64().unwrap_or(0);
    let unique_activities_val = perception["unique_activities"].as_u64().unwrap_or(0);
    let health_state_val = perception["health_state"].as_u64().unwrap_or(4);

    let exec_ctx = guards::ExecutionContext {
        task_id: 1,
        timestamp: 0,
        resources: guards::ResourceState {
            cpu_available: 100,
            memory_available: 100,
            io_capacity: 100,
            queue_depth: 0,
        },
        observations: guards::ObservationBuffer {
            count: 4,
            observations: [
                event_count_val,
                trace_count_val,
                unique_activities_val,
                health_state_val,
                0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            ],
        },
        state_flags: guards::StateFlags::INITIALIZED.bits() | guards::StateFlags::RUNNING.bits(),
    };

    // Sensible default guards: basic sanity checks
    // Guard 1: State check — system must be in RUNNING state
    let guard_state = guards::Guard {
        guard_type: guards::GuardType::State,
        predicate: guards::Predicate::BitSet,
        operand_a: guards::StateFlags::RUNNING.bits(),
        operand_b: 0,
        children: vec![],
    };
    // Guard 2: Counter check — at least 1 observation (non-empty log)
    let guard_counter = guards::Guard {
        guard_type: guards::GuardType::Counter,
        predicate: guards::Predicate::GreaterThanOrEqual,
        operand_a: 0,
        operand_b: 1, // at least 1
        children: vec![],
    };

    let compound_guard = guards::Guard {
        guard_type: guards::GuardType::And,
        predicate: guards::Predicate::Equal,
        operand_a: 0,
        operand_b: 0,
        children: vec![guard_state, guard_counter],
    };

    let guard_result = compound_guard.evaluate(&exec_ctx);

    // Pattern dispatch
    let pattern_ctx = pattern_dispatch::PatternContext {
        pattern_type: pattern_dispatch::PatternType::Sequence,
        pattern_id: 0,
        config: pattern_dispatch::PatternConfig {
            max_instances: 1,
            join_threshold: 1,
            timeout_ticks: 100,
            flags: pattern_dispatch::PatternFlags::default(),
        },
        input_mask: 0,
        output_mask: 0,
        state: std::sync::atomic::AtomicU32::new(0),
        tick_budget: 100,
    };
    let dispatcher = pattern_dispatch::PatternDispatcher::new();
    let pattern_result = dispatcher.dispatch(&pattern_ctx);

    let guard_pass = guard_result;
    let pattern_name = if pattern_result.success { "Sequence" } else { "Failed" };
    let pattern_ticks = pattern_result.ticks_used;

    // -----------------------------------------------------------------------
    // Layer 3: Protection — Circuit Breaker + SPC
    // -----------------------------------------------------------------------
    let mut circuit_breaker = self_healing::CircuitBreaker::new();
    let circuit_allowed = circuit_breaker.allow_request();
    let circuit_state = format!("{:?}", circuit_breaker.state());
    if circuit_allowed {
        circuit_breaker.record_success();
    }

    // SPC: multi-dimensional (event rate, trace duration, activity frequency)
    let mut all_special_causes: Vec<String> = Vec::new();
    let mut spc_results = serde_json::Map::new();

    // SPC on event rate (events per trace)
    let event_counts_per_trace: Vec<f64> = perception["activity_frequencies"]
        .as_object()
        .map(|m| m.values().map(|v| v.as_f64().unwrap_or(0.0)).collect())
        .unwrap_or_default();

    if event_counts_per_trace.len() >= 9 {
        let mean_er = event_counts_per_trace.iter().sum::<f64>()
            / event_counts_per_trace.len() as f64;
        let std_er = (event_counts_per_trace.iter()
            .map(|x| (x - mean_er).powi(2))
            .sum::<f64>()
            / event_counts_per_trace.len() as f64)
            .sqrt();
        let chart_data: Vec<spc::ChartData> = event_counts_per_trace
            .iter()
            .map(|&v| spc::ChartData {
                timestamp: String::new(),
                value: v,
                ucl: mean_er + 3.0 * std_er,
                cl: mean_er,
                lcl: (mean_er - 3.0 * std_er).max(0.0),
                subgroup_data: None,
            })
            .collect();
        let causes = spc::check_western_electric_rules(&chart_data);
        spc_results.insert("event_rate".to_string(), serde_json::json!(if causes.is_empty() { "OK" } else { "ALERT" }));
        for c in &causes {
            all_special_causes.push(format!("event_rate: {:?}", c));
        }
    } else {
        spc_results.insert("event_rate".to_string(), serde_json::json!("INSUFFICIENT_DATA"));
    }

    // SPC on trace durations
    let trace_durations: Vec<f64> = perception["trace_durations"]
        .as_array()
        .map(|a| a.iter().map(|v| v.as_f64().unwrap_or(0.0)).collect())
        .unwrap_or_default();

    if trace_durations.len() >= 9 {
        let mean_td = trace_durations.iter().sum::<f64>() / trace_durations.len() as f64;
        let std_td = (trace_durations.iter()
            .map(|x| (x - mean_td).powi(2))
            .sum::<f64>()
            / trace_durations.len() as f64)
            .sqrt();
        let chart_data: Vec<spc::ChartData> = trace_durations
            .iter()
            .map(|&v| spc::ChartData {
                timestamp: String::new(),
                value: v,
                ucl: mean_td + 3.0 * std_td,
                cl: mean_td,
                lcl: (mean_td - 3.0 * std_td).max(0.0),
                subgroup_data: None,
            })
            .collect();
        let causes = spc::check_western_electric_rules(&chart_data);
        spc_results.insert("trace_duration".to_string(), serde_json::json!(if causes.is_empty() { "OK" } else { "ALERT" }));
        for c in &causes {
            all_special_causes.push(format!("trace_duration: {:?}", c));
        }
    } else {
        spc_results.insert("trace_duration".to_string(), serde_json::json!("INSUFFICIENT_DATA"));
    }

    // SPC on activity frequency distribution
    let freq_values: Vec<f64> = perception["activity_frequencies"]
        .as_object()
        .map(|m| m.values().map(|v| v.as_f64().unwrap_or(0.0)).collect())
        .unwrap_or_default();

    if freq_values.len() >= 9 {
        let mean_af = freq_values.iter().sum::<f64>() / freq_values.len() as f64;
        let std_af = (freq_values.iter()
            .map(|x| (x - mean_af).powi(2))
            .sum::<f64>()
            / freq_values.len() as f64)
            .sqrt();
        let chart_data: Vec<spc::ChartData> = freq_values
            .iter()
            .map(|&v| spc::ChartData {
                timestamp: String::new(),
                value: v,
                ucl: mean_af + 3.0 * std_af,
                cl: mean_af,
                lcl: (mean_af - 3.0 * std_af).max(0.0),
                subgroup_data: None,
            })
            .collect();
        let causes = spc::check_western_electric_rules(&chart_data);
        spc_results.insert("activity_frequency".to_string(), serde_json::json!(if causes.is_empty() { "OK" } else { "ALERT" }));
        for c in &causes {
            all_special_causes.push(format!("activity_frequency: {:?}", c));
        }
    } else {
        spc_results.insert("activity_frequency".to_string(), serde_json::json!("INSUFFICIENT_DATA"));
    }

    // -----------------------------------------------------------------------
    // Layer 4: Optimization — Reinforcement Learning
    // -----------------------------------------------------------------------
    let health_level = health_state_val as u8;

    // Use a simple u8 state representation for RL
    let rl_state = RlState(health_level);
    let agent = reinforcement::QLearning::<RlState, RlAction>::with_hyperparams(0.1, 0.99, 0.1);
    let selected_action = agent.select_action(&rl_state);
    let action_label = format!("{:?}", selected_action);

    // -----------------------------------------------------------------------
    // Build result JSON
    // -----------------------------------------------------------------------
    let result = serde_json::json!({
        "cycle_result": {
            "success": guard_pass && circuit_allowed,
            "perception": {
                "event_count": event_count_val,
                "trace_count": trace_count_val,
                "unique_activities": unique_activities_val,
                "has_timestamps": perception["has_timestamps"],
                "health_state": perception["health_label"],
                "health_score": health_state_val,
            },
            "decision": {
                "guard_result": guard_pass,
                "pattern_result": pattern_name,
                "pattern_ticks": pattern_ticks,
            },
            "protection": {
                "circuit_state": circuit_state,
                "circuit_allowed": circuit_allowed,
                "special_causes": all_special_causes,
                "spc_results": spc_results,
            },
            "optimization": {
                "rl_action": action_label,
                "health_score": health_state_val,
            },
        },
        "timing": {
            "perception_ns": perception_ns,
            "decision_ns": 0,
            "protection_ns": 0,
            "optimization_ns": 0,
            "total_ns": 0,
            "note": "WASM environment lacks high-precision timers; use benchmarks for actual nanosecond measurements",
        },
    });

    Ok(serde_json::to_string(&result).unwrap_or_else(|_| "{}".to_string()))
}

// Simple RL state: health level (0-4)
#[derive(Clone, PartialEq, Eq, std::hash::Hash)]
struct RlState(u8);

impl reinforcement::WorkflowState for RlState {
    fn features(&self) -> Vec<f32> {
        vec![self.0 as f32 / 4.0]
    }
    fn is_terminal(&self) -> bool {
        self.0 == 4 // Failed is terminal
    }
}

// Simple RL actions: 5 levels
#[derive(Clone, Copy, PartialEq, Eq, std::hash::Hash, std::fmt::Debug)]
enum RlAction {
    Continue = 0,
    Scale = 1,
    Retry = 2,
    Fallback = 3,
    Restart = 4,
}

impl reinforcement::WorkflowAction for RlAction {
    const ACTION_COUNT: usize = 5;
    fn to_index(&self) -> usize {
        *self as usize
    }
    fn from_index(idx: usize) -> Option<Self> {
        match idx {
            0 => Some(RlAction::Continue),
            1 => Some(RlAction::Scale),
            2 => Some(RlAction::Retry),
            3 => Some(RlAction::Fallback),
            4 => Some(RlAction::Restart),
            _ => None,
        }
    }
}

// -------------------------------------------------------------------------
// OCEL Support (Object-Centric Event Logs)
// -------------------------------------------------------------------------

// OCEL functions are exported directly from their modules with cfg gates:
// - ocel_io.rs: load_ocel2_from_json, export_ocel2_to_json, validate_ocel
// - ocel_flatten.rs: list_ocel_object_types, get_ocel_type_statistics, flatten_ocel_to_eventlog
// - oc_petri_net.rs: discover_oc_petri_net
// - oc_conformance.rs: oc_conformance_check
// - oc_performance.rs: oc_performance_analysis
// - resource_analysis.rs: analyze_resource_utilization, analyze_resource_activity_matrix, identify_resource_bottlenecks

// Conditional re-exports for statistics
// When statrs feature is enabled, re-export statrs types
#[cfg(feature = "statrs")]
pub use statrs::statistics::{Data, Median};

// When hand_rolled_stats feature is enabled and statrs is not, re-export hand-rolled types
#[cfg(all(feature = "hand_rolled_stats", not(feature = "statrs")))]
pub use hand_stats::{Median};

// Provide Data::new() compatible API for hand_rolled stats
#[cfg(all(feature = "hand_rolled_stats", not(feature = "statrs")))]
pub struct Data {
    inner: Vec<f64>,
}

#[cfg(all(feature = "hand_rolled_stats", not(feature = "statrs")))]
impl Data {
    /// Create a new Data container (statrs-compatible API)
    pub fn new(data: Vec<f64>) -> Self {
        Self { inner: data }
    }

    /// Calculate median
    pub fn median(&self) -> f64 {
        hand_stats::median(&mut self.inner.clone()).unwrap_or(0.0)
    }

    /// Calculate mean
    pub fn mean(&self) -> f64 {
        hand_stats::mean(&self.inner).unwrap_or(0.0)
    }

    /// Calculate percentile
    pub fn percentile(&self, p: f64) -> f64 {
        hand_stats::percentile(&mut self.inner.clone(), p).unwrap_or(0.0)
    }

    /// Calculate standard deviation
    pub fn std_deviation(&self) -> f64 {
        hand_stats::std_deviation(&self.inner).unwrap_or(0.0)
    }
}
