#![allow(
    dead_code,
    unused_variables,
    unused_assignments,
    unused_mut,
    clippy::all,
    unused_imports,
    unused_features
)]
#![feature(generic_const_exprs)]
#![feature(adt_const_params)]
#![feature(const_trait_impl)]
#![feature(min_specialization)]
#![feature(portable_simd)]
#![allow(incomplete_features)]
//! # wasm4pm — High-Performance Process Mining in WebAssembly
//!
//! `wasm4pm` provides production-ready process mining algorithms compiled to WebAssembly,
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
//! } from "wasm4pm";
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
//! - [GitHub Repository](https://github.com/seanchatmangpt/wasm4pm)
//! - [npm Package](https://www.npmjs.com/package/@wasm4pm/cli)
//! - [Documentation](https://docs.rs/wasm4pm)

/// Accept(x) = C1..C7 admissibility framework.
pub mod admission;
/// baseline for bcinr.
pub mod bcinr_compat;
/// Cache residency helpers for warm-starting the WASM module.
pub mod cache_resident;
/// Compile-checked API probe for wasm4pm-compat integration.
pub mod compat_api_probe;
/// Conformance Authority Module — A* alignment, fitness/precision metrics, admission gates (v30.1.2)
pub mod conformance_authority;
/// Structured error types and JS interop helpers.
pub mod error;
/// Process-World Foundry: manufacture one Order-to-Cash field, emit every lawful projection.
#[cfg(feature = "ocel")]
pub mod foundry;
/// Graduation intake module bridging the baseline.
pub mod graduation;
/// Event log I/O utilities (XES import/export, binary format).
pub mod io;
/// Lifecycle State Machine module — WASM4PM autonomic control flow.
pub mod lifecycle;
pub mod lsa;
/// High-level ML algorithm dispatchers (remaining-time, outcome, anomaly).
pub mod ml_algorithms;
/// Process-Model Registry module.
pub mod model_registry;
/// Core data models: `EventLog`, `OCEL`, `DFG`, `PetriNet`, etc.
pub mod models;
/// Adversarial receipt doctor validation and truth verification.
pub mod receipt;
/// Process Replay Authority Module — token-based replay, simulation, and execution profiling.
pub mod replay;
/// Formal WF-net soundness + structural predicates (Separable WF-net paper, Defs 3.1–3.13).
pub mod soundness;
/// Global stored-object state (handles, object pool, arena management).
pub mod state;
/// Shared type aliases and newtype wrappers.
pub mod types;
/// WF-net → POWL 2.0 translation (Separable WF-net paper, Section 4: Partition_MG / Partition_SM).
pub mod wf_to_powl;

#[cfg(feature = "ocel")]
pub mod ocpq_parser;
#[cfg(feature = "ocel")]
pub mod ocpq_runtime;

use std::cell::RefCell;

#[wasm_bindgen(start)]
pub fn main() {
    #[cfg(feature = "console_error_panic_hook")]
    console_error_panic_hook::set_once();

    #[cfg(not(target_arch = "wasm32"))]
    {
        tracing_subscriber::fmt()
            .with_span_events(tracing_subscriber::fmt::format::FmtSpan::CLOSE)
            .init();
    }
}

// Drift detection thresholds (configurable via set_drift_thresholds)
const DRIFT_THRESHOLD_LOW_DEFAULT: f32 = 0.3;
const DRIFT_THRESHOLD_HIGH_DEFAULT: f32 = 0.7;

// Latency budget for autonomic cycle (in microseconds) — only used by cloud feature
#[cfg(feature = "cloud")]
const CYCLE_LATENCY_BUDGET_US: u64 = 5_000;

use std::sync::atomic::{AtomicU32, Ordering};

// Global drift threshold configuration
static DRIFT_THRESHOLD_LOW: AtomicU32 = AtomicU32::new(0x3e99999a); // 0.3 as f32 bits
static DRIFT_THRESHOLD_HIGH: AtomicU32 = AtomicU32::new(0x3f333333); // 0.7 as f32 bits

fn get_drift_threshold_low() -> f32 {
    f32::from_bits(DRIFT_THRESHOLD_LOW.load(Ordering::Relaxed))
}

/// Wall-clock time in microseconds since process start.
///
/// On wasm32, uses `js_sys::Date::now()` (millisecond precision).
/// On native, uses `std::time::Instant` (nanosecond precision).
///
/// Returns microseconds as u64 for portability.
#[cfg(feature = "cloud")]
pub(crate) fn wall_clock_us() -> u64 {
    #[cfg(target_arch = "wasm32")]
    {
        // wasm32: js_sys::Date::now() returns milliseconds
        (js_sys::Date::now() * 1000.0) as u64
    }

    #[cfg(not(target_arch = "wasm32"))]
    {
        // native: use once_cell::sync::Lazy anchor point
        use once_cell::sync::Lazy;
        use std::time::Instant;

        static ANCHOR: Lazy<Instant> = Lazy::new(Instant::now);
        ANCHOR.elapsed().as_micros() as u64
    }
}

fn get_drift_threshold_high() -> f32 {
    f32::from_bits(DRIFT_THRESHOLD_HIGH.load(Ordering::Relaxed))
}

/// Parse a subset of ISO-8601 timestamps and return the duration between them in milliseconds.
///
/// Supports formats:
/// - `2026-04-13T10:00:00Z` (UTC)
/// - `2026-04-13T10:00:00+00:00` (with timezone offset)
/// - `2026-04-13T10:00:00.000Z` (with fractional seconds)
/// - `2026-04-13T10:00:00` (naive, treated as local)
///
/// Returns 0.0 for unparseable or identical timestamps.
/// WASM-compatible — no external dependencies.
pub fn parse_iso8601_duration(first: &str, last: &str) -> f64 {
    fn parse_ts(s: &str) -> Option<i64> {
        let s = s.trim();
        if s.is_empty() {
            return None;
        }
        // Strip trailing Z or +00:00 timezone
        let s = if let Some(stripped) = s.strip_suffix('Z') {
            stripped
        } else if s.len() > 6
            && s.chars().nth(s.len() - 3) == Some(':')
            && s.chars().nth(s.len() - 6) == Some('+')
        {
            // +HH:MM offset — strip it (6 chars)
            &s[..s.len() - 6]
        } else if s.len() > 6
            && s.chars().nth(s.len() - 3) == Some(':')
            && s.chars().nth(s.len() - 6) == Some('-')
        {
            // -HH:MM offset — strip it (6 chars)
            &s[..s.len() - 6]
        } else {
            s
        };

        // Expected: YYYY-MM-DDTHH:MM:SS[.fff]
        let parts: Vec<&str> = s.split('T').collect();
        if parts.len() != 2 {
            return None;
        }
        let date_parts: Vec<&str> = parts[0].split('-').collect();
        if date_parts.len() != 3 {
            return None;
        }
        let time_parts: Vec<&str> = parts[1].split('.').collect(); // split off fractional seconds
        let time_main: Vec<&str> = time_parts[0].split(':').collect();
        if time_main.len() != 3 {
            return None;
        }

        let year: i64 = date_parts[0].parse().ok()?;
        let month: i64 = date_parts[1].parse().ok()?;
        let day: i64 = date_parts[2].parse().ok()?;
        let hour: i64 = time_main[0].parse().ok()?;
        let minute: i64 = time_main[1].parse().ok()?;
        let second: i64 = time_main[2].parse().ok()?;

        // Days in each month (non-leap-year baseline; leap year handled below)
        let days_in_month: [i64; 12] = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

        let is_leap = (year % 4 == 0 && year % 100 != 0) || (year % 400 == 0);

        let mut total_days: i64 = 0;
        // Full years
        for y in 1970..year {
            total_days += if (y % 4 == 0 && y % 100 != 0) || (y % 400 == 0) {
                366
            } else {
                365
            };
        }
        // Full months
        for m in 1..month {
            total_days += days_in_month[(m - 1) as usize];
            if m == 2 && is_leap {
                total_days += 1;
            }
        }
        // Days
        total_days += day - 1;

        // Convert to milliseconds
        let ms: i64 = total_days * 86_400_000 + hour * 3_600_000 + minute * 60_000 + second * 1_000;

        Some(ms)
    }

    match (parse_ts(first), parse_ts(last)) {
        (Some(a), Some(b)) => (b - a) as f64,
        _ => 0.0,
    }
}

// Auto-generated registries from wasm4pm ontology (A = μ(O))
// DO NOT EDIT — regenerate via: ostar manufacture wasm4pm
#[allow(dead_code)]
pub mod algorithm_registry;
#[allow(dead_code)]
pub mod benchmark_registry;
#[allow(dead_code)]
pub mod capability_registry_generated;
#[allow(dead_code)]
pub mod deployment_profile_constants;
#[allow(dead_code)]
pub mod feature_flag_registry;
#[allow(dead_code)]
pub mod module_category_constants;
#[allow(dead_code)]
pub mod operator_registry;
#[allow(dead_code)]
pub mod proof_gate_registry;
#[allow(dead_code)]
pub mod tps_metrics_registry;
#[allow(dead_code)]
pub mod wasm_export_registry;

// Proof-of-concept gate validator — in-memory HashSet, NOT connected to SPARQL receipt store.
// DO NOT add poc_gate_validator to browser/cloud/fog/edge/iot profiles.
// For production gate checks, use proof_gate_registry.
#[cfg(feature = "poc_gate_validator")]
pub mod gate_validator;

// Hand-rolled statistics (when hand_rolled_stats feature is enabled)
pub mod algorithms;
#[cfg(feature = "conformance_basic")]
pub mod analysis;
pub mod binary_format;
pub mod branchless;
pub mod cache;
pub mod capability_registry;
#[cfg(feature = "conformance_basic")]
pub mod conformance;
#[cfg(feature = "conformance_basic")]
pub mod conformance_guards;
pub mod conformance_reporting;
#[cfg(feature = "conformance_basic")]
pub mod data_quality;
#[cfg(feature = "streaming_basic")]
pub mod dfg_io;
pub mod discovery;
pub mod discovery_determinism_guards;
#[cfg(feature = "discovery_advanced")]
pub mod ensemble;
pub mod fast_discovery;
#[cfg(feature = "ml")]
pub mod feature_extraction;
#[cfg(feature = "ml")]
pub mod feature_importance;
pub mod filters;
#[cfg(feature = "ml")]
pub mod final_analytics;
#[cfg(feature = "hand_rolled_stats")]
pub mod hand_stats;
#[cfg(feature = "discovery_advanced")]
pub mod hierarchical;
pub mod hot_kernels;
pub mod incremental_dfg;
#[cfg(feature = "discovery_advanced")]
pub mod more_discovery;
pub mod network_metrics;
pub mod parallel_executor;
#[cfg(all(feature = "conformance_basic", feature = "discovery_advanced"))]
pub mod pattern_analysis;
#[cfg(feature = "petri_net_playout")]
pub mod playout;
pub mod probabilistic;
pub mod process_tree;
#[cfg(feature = "cloud")]
pub mod rl_state_serialization;
#[cfg(feature = "discovery_advanced")]
pub mod smart_engine;
pub mod social_network;
pub mod testing;
pub mod text_encoding;
pub mod utilities;
pub mod wasm_utils;
pub mod xes_format;

// OCEL support (gated by ocel feature)
#[cfg(feature = "ocel")]
pub mod oc_conformance;
#[cfg(feature = "ocel")]
pub mod oc_performance;
#[cfg(feature = "ocel")]
pub mod oc_petri_net;
#[cfg(feature = "ocel")]
pub mod ocel_csv;
#[cfg(feature = "ocel")]
pub mod ocel_flatten;
#[cfg(feature = "ocel")]
pub mod ocel_io;
#[cfg(feature = "ocel")]
pub mod ocel_tests;
#[cfg(feature = "ocel")]
pub mod ocel_v2;

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
#[cfg(feature = "miniml")]
pub mod actor_envelope;
#[cfg(feature = "ml")]
pub mod anomaly;
#[cfg(feature = "miniml")]
pub mod automembrane;
#[cfg(feature = "miniml")]
pub mod automl_envelope;
#[cfg(feature = "miniml")]
pub mod benchmark_runner;
#[cfg(feature = "miniml")]
pub mod drift_manager;
#[cfg(feature = "miniml")]
pub mod object_envelope;
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
#[cfg(feature = "miniml")]
pub mod prediction_rf;
#[cfg(feature = "miniml")]
pub mod route_envelope;
#[cfg(all(feature = "ml", feature = "miniml"))]
pub mod statistical_analysis;
#[cfg(feature = "miniml")]
pub mod time_envelope;

// Utilities always available
pub mod duration_utils;

// Trace embeddings (gated internally by #![cfg(feature = "miniml")])
pub mod trace_embeddings;

// WASM testing and introspection utilities
pub mod wasm_testing_utils;

// Streaming algorithms (gated by streaming_basic or streaming_full features)
#[cfg(feature = "streaming_basic")]
pub mod simd_streaming_dfg;
#[cfg(feature = "streaming_basic")]
pub mod streaming;

#[cfg(feature = "streaming_full")]
pub mod streaming_conformance;
#[cfg(feature = "streaming_full")]
pub mod streaming_pipeline;
// streaming_wasm exposes #[wasm_bindgen] exports for all streaming algorithms.
// It only depends on types available in streaming_basic (StreamingDfgBuilder,
// StreamingHeuristicBuilder, StreamingSkeletonBuilder), so it compiles under
// streaming_basic — not just streaming_full. Without this gate change, the
// streaming_dfg_begin/add_event/snapshot/… functions are completely absent from
// edge and iot WASM builds, and the TypeScript optional methods on WasmModule
// would always be undefined at runtime.
#[cfg(feature = "streaming_basic")]
pub mod streaming_wasm;

// Conformance (gated by conformance_basic or conformance_full features)
#[cfg(feature = "conformance_basic")]
pub mod declare_conformance;
#[cfg(feature = "conformance_basic")]
pub mod simd_token_replay;
#[cfg(feature = "conformance_basic")]
pub mod temporal_profile;

// SIMD inner loop optimizations (always compiled, feature-gated at runtime)
pub mod simd_inner_loops;

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

// Conformance cache — cached token replay results (gated by conformance_basic)
#[cfg(feature = "conformance_basic")]
pub mod conformance_cache;

// Correlation miner — DFG discovery without case identifiers (always available)
pub mod correlation_miner;

// Self-healing — circuit breaker, retry policy, health check (ported from knhk)
#[cfg(feature = "cloud")]
pub mod self_healing;

// SPC — Western Electric rules + process capability (always available)
#[cfg(feature = "cloud")]
pub mod spc;

// SPC History — Ring buffer for cross-cycle trend analysis (fixes one-shot problem)
#[cfg(feature = "cloud")]
pub mod spc_history;

// Guard evaluation engine — predicate/resource/state/counter/time-window guards (ported from knhk)
#[cfg(feature = "cloud")]
pub mod guards;

// 43-pattern dispatch — van der Aalst workflow pattern execution (ported from knhk)
#[cfg(feature = "discovery_advanced")]
pub mod pattern_dispatch;

// Reinforcement learning — Q-Learning and SARSA agents (ported from knhk)
#[cfg(feature = "cloud")]
pub mod reinforcement;

// RL Orchestrator — persistent state hub for all RL agents
#[cfg(feature = "cloud")]
pub mod rl_orchestrator;
#[cfg(feature = "cloud")]
pub use rl_orchestrator::{RlOrchestrator, StateCoverage};

// RL Stability Monitor — detects learning instability (TD error, Q-divergence, reward scaling)
#[cfg(feature = "cloud")]
pub mod rl_stability_monitor;
#[cfg(feature = "cloud")]
pub use rl_stability_monitor::RlStabilityMonitor;

// RL Dimensionality Analysis — analyzes state space coverage and dimension usage
#[cfg(feature = "cloud")]
pub mod rl_dimensionality_analysis;
#[cfg(feature = "cloud")]
pub use rl_dimensionality_analysis::{
    analyze_dimension_usage, format_dimensionality_report, DimensionUsageReport,
    DimensionalityAnalyzer, StateClustering,
};

// Action Dispatch Layer — converts RL action labels to executable operations
#[cfg(feature = "cloud")]
pub mod action_dispatch;

// Agentic control primitives — role selection, task decomposition, handoffs, escalation
#[cfg(feature = "cloud")]
pub mod agentic;

thread_local! {
    /// Persistent RL orchestrator — survives across autonomic cycles.
    #[cfg(feature = "cloud")]
    pub static RL_ORCHESTRATOR: RefCell<rl_orchestrator::RlOrchestrator> =
        RefCell::new(rl_orchestrator::RlOrchestrator::new());

    /// Persistent circuit breaker for the autonomic loop.
    #[cfg(feature = "cloud")]
    pub static CIRCUIT_BREAKER: RefCell<self_healing::CircuitBreaker> =
        RefCell::new(self_healing::CircuitBreaker::new());

    /// Persistent SPC history — ring buffer of 100 snapshots for cross-cycle trend analysis.
    /// Fixes the one-shot SPC problem by maintaining historical context across autonomic cycles.
    #[cfg(feature = "cloud")]
    pub static SPC_HISTORY: RefCell<spc_history::SpcHistory> =
        RefCell::new(spc_history::SpcHistory::new());

    /// MAPE-K action dispatch: remaining Scale boost calls for current action
    #[cfg(feature = "cloud")]
    pub static SCALE_BOOST_REMAINING: std::cell::Cell<u32> = const { std::cell::Cell::new(0) };

    /// MAPE-K action dispatch: last selected algorithm (for Fallback and comparison)
    #[cfg(feature = "cloud")]
    pub static LAST_ALGORITHM: RefCell<String> = RefCell::new("dfg".to_string());

    /// AutoProcessAgent — branchless 34-nanosecond autonomic loop (Domain 2 wiring)
    /// Gated on feature-cloud to avoid bloating browser/edge/iot builds
    #[cfg(feature = "cloud")]
    pub static AUTO_PROCESS_AGENT: RefCell<autoprocess::AutoProcessAgent> =
        RefCell::new(autoprocess::AutoProcessAgent::new());

    /// UCB1 bandit for Fallback action — selects best discovery algorithm when
    /// the RL system triggers a Fallback action, replacing the hardcoded "dfg".
    /// Gated on ml feature (prediction_resource is ml-gated).
    #[cfg(feature = "ml")]
    pub static FALLBACK_BANDIT: RefCell<Option<crate::prediction_resource::BanditState>> =
        const { RefCell::new(None) };
}

// ML contextual bandits — LinUCB CPU baseline (ground truth for GPU parity)
#[cfg(feature = "ml")]
pub mod ml;

// Cognition substrate re-export — surfaces `wasm4pm_cognition` as `wasm4pm::cognition`
// so downstream crates (e.g. mcpp) can depend on wasm4pm alone (with the `cognition`
// feature) without taking a direct dependency on wasm4pm-cognition.
#[cfg(feature = "cognition")]
pub use wasm4pm_cognition as cognition;

// Types substrate re-export — surfaces `wasm4pm_compat` (the canonical type
// foundation: hash, BLAKE3 helpers, canonical JSON, and cross-crate
// baseline) as `wasm4pm::data_types`. Downstream crates that need
// canonical receipt serialization can reach
// `wasm4pm::data_types::hash::canonical_json` via the single wasm4pm
// dependency. (The name `types` is already taken by an internal WASM bindings
// module at this crate root.)
pub use wasm4pm_compat as data_types;

// GPU-accelerated LinUCB contextual bandit for algorithm selection
// (van der Aalst: resource/intervention prediction perspective)
// CPU fallback always available; GPU path activated by `gpu` feature flag.
// Not compiled for wasm32 — wgpu targets native GPU (Vulkan/Metal/DX12).
#[cfg(not(target_arch = "wasm32"))]
pub mod gpu;

// AutoProcessAgent — Vision 2030 autonomic loop (Perception → Decision → Protection → Optimization)
#[cfg(feature = "cloud")]
pub mod autoprocess;

// Trace correlation for CLI→WASM causality proof (Chicago TDD Tier 5)
pub mod trace_correlation;

// RL Policy Persistence — Checkpoint save/load with BLAKE3 integrity verification (Gap-18)
pub mod policy_persistence;

// Advanced algorithms and structures (Gap-21)
pub mod advanced;

// Autonomic Audit Trail — Immutable append-only event log with Merkle chain (Gap-20)
pub mod autonomic_audit_trail;
pub mod oc_orchestrator;
pub use autonomic_audit_trail::*;

// Convenience re-exports for WASM API (Gap-1)
pub use discovery::discover_dfg;
pub use state::delete_object;
pub use xes_format::{load_eventlog_from_xes, load_eventlog_from_xes_cached};

// Suppress unused warnings for re-exported modules
#[allow(unused)]
use state::*;
#[allow(unused)]
use types::*;

use wasm_bindgen::prelude::*;

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

/// Get the wasm4pm crate version string.
#[wasm_bindgen]
pub fn get_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

/// Get WASM module capabilities as a JavaScript object.
///
/// Returns version and feature flags indicating which algorithms
/// and capabilities are available in this build.
/// Shape: `{version: string, features: {discovery: bool, conformance: bool, ...}}`
#[wasm_bindgen]
pub fn get_capabilities() -> Result<JsValue, JsValue> {
    #[derive(serde::Serialize)]
    struct Features {
        discovery: bool,
        conformance: bool,
        ml: bool,
        streaming: bool,
        powl: bool,
        ocel: bool,
        alignment_fitness: bool,
        petri_net_playout: bool,
        extensive_playout: bool,
        align_etconformance: bool,
        montecarlo: bool,
    }
    #[derive(serde::Serialize)]
    struct Capabilities {
        version: &'static str,
        features: Features,
    }
    let caps = Capabilities {
        version: env!("CARGO_PKG_VERSION"),
        features: Features {
            discovery: true,
            conformance: cfg!(feature = "conformance_full"),
            ml: cfg!(feature = "ml"),
            streaming: cfg!(feature = "streaming_full"),
            powl: cfg!(feature = "powl"),
            ocel: cfg!(feature = "ocel"),
            alignment_fitness: cfg!(feature = "alignment_fitness"),
            petri_net_playout: cfg!(feature = "petri_net_playout"),
            extensive_playout: cfg!(feature = "extensive_playout"),
            align_etconformance: cfg!(feature = "align_etconformance"),
            montecarlo: cfg!(feature = "montecarlo"),
        },
    };
    serde_wasm_bindgen::to_value(&caps).map_err(|e| crate::error::js_val(&e.to_string()))
}

/// Clear all caches (parse, columnar, interner).
#[wasm_bindgen]
pub fn clear_all_caches() {
    crate::cache::cache_clear();
}

/// Get cache statistics as a JavaScript object.
///
/// Returns `{parse_hits, parse_misses, columnar_entries, interner_entries}`.
#[wasm_bindgen]
pub fn get_cache_stats() -> Result<JsValue, JsValue> {
    #[derive(serde::Serialize)]
    struct CacheStats {
        parse_hits: u64,
        parse_misses: u64,
        columnar_entries: usize,
        interner_entries: usize,
    }
    let raw = crate::cache::cache_stats();
    let stats = CacheStats {
        parse_hits: raw.parse_hits,
        parse_misses: raw.parse_misses,
        columnar_entries: raw.columnar_entries,
        interner_entries: raw.interner_entries,
    };
    serde_wasm_bindgen::to_value(&stats).map_err(|e| crate::error::js_val(&e.to_string()))
}

/// Set drift detection thresholds for RL state feature quantization.
///
/// # Arguments
/// * `low` - Low threshold (default: 0.3). Values below this are drift_status=0.
/// * `high` - High threshold (default: 0.7). Values at or above this are drift_status=2.
///           Values in [low, high) are drift_status=1.
///
/// # Returns
/// * `Ok(String)` - Success message with new thresholds
/// * `Err(JsValue)` - Error if thresholds are invalid
///
/// # Example
/// ```javascript
/// // Set custom thresholds: 0.2 and 0.8
/// set_drift_thresholds(0.2, 0.8);
/// ```
#[wasm_bindgen]
pub fn set_drift_thresholds(low: f32, high: f32) -> Result<String, JsValue> {
    if !(0.0..=1.0).contains(&low) {
        return Err(crate::error::js_val(&format!(
            "Invalid low threshold {}: must be in [0.0, 1.0]",
            low
        )));
    }
    if !(0.0..=1.0).contains(&high) {
        return Err(crate::error::js_val(&format!(
            "Invalid high threshold {}: must be in [0.0, 1.0]",
            high
        )));
    }
    if low >= high {
        return Err(crate::error::js_val(&format!(
            "Invalid thresholds: low ({}) must be less than high ({})",
            low, high
        )));
    }

    DRIFT_THRESHOLD_LOW.store(low.to_bits(), Ordering::Relaxed);
    DRIFT_THRESHOLD_HIGH.store(high.to_bits(), Ordering::Relaxed);

    Ok(format!(
        "Drift thresholds updated: low={}, high={}",
        low, high
    ))
}

/// Get current drift detection thresholds as JSON string.
///
/// # Returns
/// JSON string with current threshold values: `{"low":0.3,"high":0.7}`
///
/// # Example
/// ```javascript
/// const thresholds = JSON.parse(get_drift_thresholds());
/// console.log(thresholds.low, thresholds.high);
/// ```
#[wasm_bindgen]
pub fn get_drift_thresholds() -> String {
    format!(
        r#"{{"low":{},"high":{}}}"#,
        get_drift_threshold_low(),
        get_drift_threshold_high()
    )
}

/// Reset drift detection thresholds to defaults (0.3, 0.7).
#[wasm_bindgen]
pub fn reset_drift_thresholds() -> String {
    DRIFT_THRESHOLD_LOW.store(DRIFT_THRESHOLD_LOW_DEFAULT.to_bits(), Ordering::Relaxed);
    DRIFT_THRESHOLD_HIGH.store(DRIFT_THRESHOLD_HIGH_DEFAULT.to_bits(), Ordering::Relaxed);
    format!(
        "Drift thresholds reset to defaults: low={}, high={}",
        DRIFT_THRESHOLD_LOW_DEFAULT, DRIFT_THRESHOLD_HIGH_DEFAULT
    )
}

/// SIMD-accelerated token replay for conformance checking.
///
/// Discovers a DFG from the log, builds a SimdPetriNet, then replays
/// every trace and returns a JSON string with `overall_fitness`, `precision`,
/// and per-case diagnostics (each trace has a `fitness` field).
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
#[cfg(feature = "cloud")]
#[wasm_bindgen]
pub fn autonomic_execute_cycle(
    log_handle: &str,
    activity_key: &str,
    _config_json: &str,
) -> Result<String, JsValue> {
    let state = get_or_init_state();

    // Distributed tracing: top-level span for the full MAPE-K cycle.
    // Zero-cost when no subscriber is attached (native tests, WASM with no tracing-web).
    let _cycle_span = tracing::info_span!(
        "autonomic.cycle",
        log_handle = log_handle,
        activity_key = activity_key,
    )
    .entered();

    // -----------------------------------------------------------------------
    // Timing instrumentation
    // -----------------------------------------------------------------------
    let t_cycle_start = wall_clock_us();

    // -----------------------------------------------------------------------
    // Helper: extract event log metrics for Perception layer
    // -----------------------------------------------------------------------
    let t_perception_start = wall_clock_us();
    let perception_result = state.with_object(log_handle, |obj| {
        let log = match obj {
            Some(StoredObject::EventLog(l)) => l,
            _ => {
                return Err(crate::error::js_val(
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
            let first_ts = trace
                .events
                .first()
                .and_then(|e| e.attributes.get(time_key));
            let last_ts = trace.events.last().and_then(|e| e.attributes.get(time_key));
            if let (Some(first), Some(last)) = (first_ts, last_ts) {
                has_timestamps = true;
                let first_str = first.as_string().unwrap_or("");
                let last_str = last.as_string().unwrap_or("");
                // TS-1 fix: Parse ISO-8601 timestamps instead of using string length.
                // String lengths are nearly identical regardless of actual time difference.
                let dur = parse_iso8601_duration(first_str, last_str);
                trace_durations.push(dur);
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
        } else if unique_activities <= 2 && event_count < 20 {
            1 // Warning: sparse log
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

        // Compute rework metrics using advanced loop detection
        let col = log.to_columnar(activity_key);
        let rework_count = col.count_traces_with_rework();
        let loop_count_l1 = col.count_loops_length_1();
        let loop_count_l2 = col.count_loops_length_2();

        let rework_ratio = if trace_count > 0 {
            rework_count as f32 / trace_count as f32
        } else {
            0.0
        };

        // Accuracy improvement: also compute raw loop density
        let total_loops = loop_count_l1 + loop_count_l2;
        let loop_density = if event_count > 0 {
            total_loops as f32 / event_count as f32
        } else {
            0.0
        };

        // Compute DFG-density: unique edges / (n*(n-1)) where n = unique_activities
        // DFG-density measure of process complexity
        let mut dfg_edges = std::collections::HashSet::new();
        for trace in &log.traces {
            let trace_activities: Vec<String> = trace
                .events
                .iter()
                .filter_map(|event| {
                    event
                        .attributes
                        .get(activity_key)
                        .and_then(|attr| attr.as_string())
                        .map(|s| s.to_string())
                })
                .collect();

            // Count directly-follows edges in this trace
            for i in 0..trace_activities.len().saturating_sub(1) {
                let edge = (trace_activities[i].clone(), trace_activities[i + 1].clone());
                dfg_edges.insert(edge);
            }
        }

        let unique_edges = dfg_edges.len();
        let n = unique_activities as f32;
        let max_edges = (n * (n - 1.0)).max(1.0) as usize;
        let dfg_density = (unique_edges as f32 / max_edges as f32).min(1.0);

        // Compute health score from DFG-density and rework ratio
        // Formula: (dfg_density*70 - rework_ratio*30).clamp(0,100)
        let health_score_dfg = ((dfg_density * 70.0 - rework_ratio * 30.0).clamp(0.0, 100.0)) as u8;

        // Map DFG-density to health state (0-4)
        let health_state_from_dfg = if dfg_density < 0.2 {
            4 // Failed
        } else if dfg_density < 0.4 {
            3 // Critical
        } else if dfg_density < 0.6 {
            2 // Degraded
        } else if dfg_density < 0.8 {
            1 // Warning
        } else {
            0 // Normal
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
            "rework_ratio": rework_ratio,
            "loop_count_l1": loop_count_l1,
            "loop_count_l2": loop_count_l2,
            "loop_density": loop_density,
            "unique_edges": unique_edges,
            "dfg_density": dfg_density,
            "health_score_dfg": health_score_dfg,
            "health_state_from_dfg": health_state_from_dfg,
        }))
    })?;
    // perception_result is serde_json::Value (with_object unwraps both layers)

    let _perception_ns = 0; // Included in overall timing

    // -----------------------------------------------------------------------
    // Pattern Analysis: Dynamic pattern selection based on trace structure
    // -----------------------------------------------------------------------
    let pattern_analysis = state.with_object(log_handle, |obj| {
        let log = match obj {
            Some(StoredObject::EventLog(l)) => l,
            _ => {
                return Err(crate::error::js_val(
                    "pattern_analysis: handle does not reference an EventLog",
                ));
            }
        };

        // Extract traces as Vec<Vec<String>> for pattern analysis
        let traces_for_analysis: Vec<Vec<String>> = log
            .traces
            .iter()
            .map(|trace| {
                trace
                    .events
                    .iter()
                    .filter_map(|event| {
                        event
                            .attributes
                            .get(activity_key)
                            .and_then(|attr| attr.as_string())
                            .map(|s| s.to_string())
                    })
                    .collect()
            })
            .collect();

        // Build activity frequencies HashMap
        let mut activity_frequencies: std::collections::HashMap<String, usize> =
            std::collections::HashMap::new();
        for trace in &log.traces {
            for event in &trace.events {
                if let Some(models::AttributeValue::String(name)) =
                    event.attributes.get(activity_key)
                {
                    *activity_frequencies.entry(name.clone()).or_insert(0) += 1;
                }
            }
        }

        // Analyze trace structure to select pattern dynamically
        let analysis =
            pattern_analysis::analyze_trace_structure(&traces_for_analysis, &activity_frequencies);

        Ok::<pattern_analysis::TraceStructureAnalysis, JsValue>(analysis)
    })?;
    let t_perception_end = wall_clock_us();

    // -----------------------------------------------------------------------
    // Layer 2: Decision — Guards + Pattern Dispatch
    // -----------------------------------------------------------------------
    let t_decision_start = wall_clock_us();
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
                0,
                0,
                0,
                0,
                0,
                0,
                0,
                0,
                0,
                0,
                0,
                0,
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

    // Pattern dispatch — use dynamic pattern from analysis
    let pattern_ctx = pattern_dispatch::PatternContext {
        pattern_type: pattern_analysis.primary_pattern,
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
    let pattern_name = if pattern_result.success {
        match pattern_analysis.primary_pattern {
            pattern_dispatch::PatternType::Sequence => "Sequence",
            pattern_dispatch::PatternType::ParallelSplit => "ParallelSplit",
            pattern_dispatch::PatternType::StructuredLoop => "StructuredLoop",
            pattern_dispatch::PatternType::ExclusiveChoice => "ExclusiveChoice",
            _ => "Unknown",
        }
    } else {
        "Failed"
    };
    let pattern_ticks = pattern_result.ticks_used;
    let t_decision_end = wall_clock_us();
    // -----------------------------------------------------------------------
    // Layer 3: Protection — Circuit Breaker + SPC (persistent)
    // -----------------------------------------------------------------------
    let t_protection_start = wall_clock_us();
    let (circuit_allowed, circuit_state) = CIRCUIT_BREAKER.with(|cb| {
        let mut cb = cb.borrow_mut();
        let allowed = cb.allow_request();
        let state = format!("{:?}", cb.state());
        // NOTE: record_success/failure is deferred to after the cycle work
        // completes (see below), so the breaker tracks actual outcomes.
        (allowed, state)
    });

    // Advance the monotonic clock by one cycle step so the circuit breaker
    // can transition from Open → HalfOpen → Closed. Without this, the
    // breaker would stay in Open state forever once tripped (CB-1 fix).
    self_healing::advance_clock(1000);

    // SPC: multi-dimensional (event rate, trace duration, activity frequency)
    let mut all_special_causes: Vec<String> = Vec::new();
    // OBS-GAP-2 FIX: track classified rule types so the primary rule type can be
    // emitted in the RL action correlation span. Preserves type information that
    // would otherwise be lost in scalar spc_alert_level quantization.
    let mut spc_rule_types: Vec<&'static str> = Vec::new();
    let mut spc_results = serde_json::Map::new();

    // SPC on event rate (events per trace)
    let event_counts_per_trace: Vec<f64> = perception["activity_frequencies"]
        .as_object()
        .map(|m| m.values().map(|v| v.as_f64().unwrap_or(0.0)).collect())
        .unwrap_or_default();

    if event_counts_per_trace.len() >= 9 {
        let mean_er =
            event_counts_per_trace.iter().sum::<f64>() / event_counts_per_trace.len() as f64;
        let std_er = (event_counts_per_trace
            .iter()
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
        spc_results.insert(
            "event_rate".to_string(),
            serde_json::json!(if causes.is_empty() { "OK" } else { "ALERT" }),
        );
        for c in &causes {
            // Classify rule type and emit detailed span with attributes
            let (rule_violated, rule_number, rule_attrs) = match c {
                spc::SpecialCause::OutOfControl { value, .. } => {
                    // Rule 1: Point beyond 3σ (outlier)
                    let z_score = if !chart_data.is_empty() {
                        let data_values: Vec<f64> = chart_data.iter().map(|cd| cd.value).collect();
                        let mean = data_values.iter().sum::<f64>() / data_values.len() as f64;
                        let std = (data_values.iter().map(|x| (x - mean).powi(2)).sum::<f64>()
                            / data_values.len() as f64)
                            .sqrt();
                        if std > 0.0 {
                            ((value - mean) / std).abs()
                        } else {
                            0.0
                        }
                    } else {
                        0.0
                    };
                    (
                        "rule_1_outlier",
                        1u8,
                        vec![
                            ("z_score", format!("{:.2}", z_score)),
                            ("outlier_value", format!("{:.2}", value)),
                        ],
                    )
                }
                spc::SpecialCause::Shift { direction, count } => {
                    // Rule 2: 9+ consecutive points on one side of CL
                    let direction_str = match direction {
                        spc::ShiftDirection::Above => "above",
                        spc::ShiftDirection::Below => "below",
                    };
                    (
                        "rule_2_shift",
                        2u8,
                        vec![
                            ("direction", direction_str.to_string()),
                            ("consecutive_points", count.to_string()),
                        ],
                    )
                }
                spc::SpecialCause::Trend { direction, count } => {
                    // Rule 3: 6+ consecutive increasing/decreasing points
                    let direction_str = match direction {
                        spc::TrendDirection::Increasing => "increasing",
                        spc::TrendDirection::Decreasing => "decreasing",
                    };
                    (
                        "rule_3_trend",
                        3u8,
                        vec![
                            ("trend_direction", direction_str.to_string()),
                            ("monotonic_sequence_length", count.to_string()),
                        ],
                    )
                }
                spc::SpecialCause::TwoOfThree { direction } => {
                    // Rule 4: 2 of 3 consecutive points beyond 2σ on same side
                    let direction_str = match direction {
                        spc::ShiftDirection::Above => "above",
                        spc::ShiftDirection::Below => "below",
                    };
                    (
                        "rule_4_two_of_three",
                        4u8,
                        vec![("direction", direction_str.to_string())],
                    )
                }
            };

            // Emit detailed OTEL span with classified rule type
            let current_cycle = 0u64; // PERF: wire with_orch() accessor
            let spc_value = if let Some(last_chart) = chart_data.last() {
                last_chart.value
            } else {
                0.0
            };
            let spc_ucl = if let Some(last_chart) = chart_data.last() {
                last_chart.ucl
            } else {
                0.0
            };
            let spc_lcl = if let Some(last_chart) = chart_data.last() {
                last_chart.lcl
            } else {
                0.0
            };
            let spc_cl = if let Some(last_chart) = chart_data.last() {
                last_chart.cl
            } else {
                0.0
            };

            let sigma_distance = if spc_cl > 0.0 {
                ((spc_value - spc_cl) / ((spc_ucl - spc_cl) / 3.0)).abs()
            } else {
                0.0
            };

            tracing::warn!(
                target: "autonomic.spc",
                spc_rule_type = rule_violated,
                spc_metric = "event_rate",
                spc_value = spc_value,
                spc_ucl = spc_ucl,
                spc_lcl = spc_lcl,
                spc_cl = spc_cl,
                spc_sigma_distance = sigma_distance,
                rule_number = rule_number,
                cycle_count = current_cycle,
                service_name = "wpm",
                status = "error",
                rule_details = rule_attrs.iter().map(|(k, v)| format!("{}={}", k, v)).collect::<Vec<_>>().join(", "),
                "SPC rule violation classified"
            );

            all_special_causes.push(format!("event_rate: {:?}", c));
            spc_rule_types.push(rule_violated); // OBS-GAP-2: preserve rule type
        }
    } else {
        spc_results.insert(
            "event_rate".to_string(),
            serde_json::json!("INSUFFICIENT_DATA"),
        );
    }

    // SPC on trace durations
    let trace_durations: Vec<f64> = perception["trace_durations"]
        .as_array()
        .map(|a| a.iter().map(|v| v.as_f64().unwrap_or(0.0)).collect())
        .unwrap_or_default();

    if trace_durations.len() >= 9 {
        let mean_td = trace_durations.iter().sum::<f64>() / trace_durations.len() as f64;
        let std_td = (trace_durations
            .iter()
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
        spc_results.insert(
            "trace_duration".to_string(),
            serde_json::json!(if causes.is_empty() { "OK" } else { "ALERT" }),
        );
        for c in &causes {
            // Classify rule type and emit detailed span with attributes
            let (rule_violated, rule_number, rule_attrs) = match c {
                spc::SpecialCause::OutOfControl { value, .. } => {
                    let z_score = if !chart_data.is_empty() {
                        let data_values: Vec<f64> = chart_data.iter().map(|cd| cd.value).collect();
                        let mean = data_values.iter().sum::<f64>() / data_values.len() as f64;
                        let std = (data_values.iter().map(|x| (x - mean).powi(2)).sum::<f64>()
                            / data_values.len() as f64)
                            .sqrt();
                        if std > 0.0 {
                            ((value - mean) / std).abs()
                        } else {
                            0.0
                        }
                    } else {
                        0.0
                    };
                    (
                        "rule_1_outlier",
                        1u8,
                        vec![
                            ("z_score", format!("{:.2}", z_score)),
                            ("outlier_value", format!("{:.2}", value)),
                        ],
                    )
                }
                spc::SpecialCause::Shift { direction, count } => {
                    let direction_str = match direction {
                        spc::ShiftDirection::Above => "above",
                        spc::ShiftDirection::Below => "below",
                    };
                    (
                        "rule_2_shift",
                        2u8,
                        vec![
                            ("direction", direction_str.to_string()),
                            ("consecutive_points", count.to_string()),
                        ],
                    )
                }
                spc::SpecialCause::Trend { direction, count } => {
                    let direction_str = match direction {
                        spc::TrendDirection::Increasing => "increasing",
                        spc::TrendDirection::Decreasing => "decreasing",
                    };
                    (
                        "rule_3_trend",
                        3u8,
                        vec![
                            ("trend_direction", direction_str.to_string()),
                            ("monotonic_sequence_length", count.to_string()),
                        ],
                    )
                }
                spc::SpecialCause::TwoOfThree { direction } => {
                    let direction_str = match direction {
                        spc::ShiftDirection::Above => "above",
                        spc::ShiftDirection::Below => "below",
                    };
                    (
                        "rule_4_two_of_three",
                        4u8,
                        vec![("direction", direction_str.to_string())],
                    )
                }
            };

            let current_cycle = 0u64; // PERF: wire with_orch() accessor
            let spc_value = if let Some(last_chart) = chart_data.last() {
                last_chart.value
            } else {
                0.0
            };
            let spc_ucl = if let Some(last_chart) = chart_data.last() {
                last_chart.ucl
            } else {
                0.0
            };
            let spc_lcl = if let Some(last_chart) = chart_data.last() {
                last_chart.lcl
            } else {
                0.0
            };
            let spc_cl = if let Some(last_chart) = chart_data.last() {
                last_chart.cl
            } else {
                0.0
            };

            let sigma_distance = if spc_cl > 0.0 {
                ((spc_value - spc_cl) / ((spc_ucl - spc_cl) / 3.0)).abs()
            } else {
                0.0
            };

            tracing::warn!(
                target: "autonomic.spc",
                spc_rule_type = rule_violated,
                spc_metric = "trace_duration",
                spc_value = spc_value,
                spc_ucl = spc_ucl,
                spc_lcl = spc_lcl,
                spc_cl = spc_cl,
                spc_sigma_distance = sigma_distance,
                rule_number = rule_number,
                cycle_count = current_cycle,
                service_name = "wpm",
                status = "error",
                rule_details = rule_attrs.iter().map(|(k, v)| format!("{}={}", k, v)).collect::<Vec<_>>().join(", "),
                "SPC rule violation classified"
            );
            all_special_causes.push(format!("trace_duration: {:?}", c));
            spc_rule_types.push(rule_violated); // OBS-GAP-2: preserve rule type
        }
    } else {
        spc_results.insert(
            "trace_duration".to_string(),
            serde_json::json!("INSUFFICIENT_DATA"),
        );
    }

    // SPC on activity frequency distribution
    let freq_values: Vec<f64> = perception["activity_frequencies"]
        .as_object()
        .map(|m| m.values().map(|v| v.as_f64().unwrap_or(0.0)).collect())
        .unwrap_or_default();

    if freq_values.len() >= 9 {
        let mean_af = freq_values.iter().sum::<f64>() / freq_values.len() as f64;
        let std_af = (freq_values
            .iter()
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
        spc_results.insert(
            "activity_frequency".to_string(),
            serde_json::json!(if causes.is_empty() { "OK" } else { "ALERT" }),
        );
        for c in &causes {
            // Classify rule type and emit detailed span with attributes
            let (rule_violated, rule_number, rule_attrs) = match c {
                spc::SpecialCause::OutOfControl { value, .. } => {
                    let z_score = if !chart_data.is_empty() {
                        let data_values: Vec<f64> = chart_data.iter().map(|cd| cd.value).collect();
                        let mean = data_values.iter().sum::<f64>() / data_values.len() as f64;
                        let std = (data_values.iter().map(|x| (x - mean).powi(2)).sum::<f64>()
                            / data_values.len() as f64)
                            .sqrt();
                        if std > 0.0 {
                            ((value - mean) / std).abs()
                        } else {
                            0.0
                        }
                    } else {
                        0.0
                    };
                    (
                        "rule_1_outlier",
                        1u8,
                        vec![
                            ("z_score", format!("{:.2}", z_score)),
                            ("outlier_value", format!("{:.2}", value)),
                        ],
                    )
                }
                spc::SpecialCause::Shift { direction, count } => {
                    let direction_str = match direction {
                        spc::ShiftDirection::Above => "above",
                        spc::ShiftDirection::Below => "below",
                    };
                    (
                        "rule_2_shift",
                        2u8,
                        vec![
                            ("direction", direction_str.to_string()),
                            ("consecutive_points", count.to_string()),
                        ],
                    )
                }
                spc::SpecialCause::Trend { direction, count } => {
                    let direction_str = match direction {
                        spc::TrendDirection::Increasing => "increasing",
                        spc::TrendDirection::Decreasing => "decreasing",
                    };
                    (
                        "rule_3_trend",
                        3u8,
                        vec![
                            ("trend_direction", direction_str.to_string()),
                            ("monotonic_sequence_length", count.to_string()),
                        ],
                    )
                }
                spc::SpecialCause::TwoOfThree { direction } => {
                    let direction_str = match direction {
                        spc::ShiftDirection::Above => "above",
                        spc::ShiftDirection::Below => "below",
                    };
                    (
                        "rule_4_two_of_three",
                        4u8,
                        vec![("direction", direction_str.to_string())],
                    )
                }
            };

            let current_cycle = 0u64; // PERF: wire with_orch() accessor
            let spc_value = if let Some(last_chart) = chart_data.last() {
                last_chart.value
            } else {
                0.0
            };
            let spc_ucl = if let Some(last_chart) = chart_data.last() {
                last_chart.ucl
            } else {
                0.0
            };
            let spc_lcl = if let Some(last_chart) = chart_data.last() {
                last_chart.lcl
            } else {
                0.0
            };
            let spc_cl = if let Some(last_chart) = chart_data.last() {
                last_chart.cl
            } else {
                0.0
            };

            let sigma_distance = if spc_cl > 0.0 {
                ((spc_value - spc_cl) / ((spc_ucl - spc_cl) / 3.0)).abs()
            } else {
                0.0
            };

            tracing::warn!(
                target: "autonomic.spc",
                spc_rule_type = rule_violated,
                spc_metric = "activity_frequency",
                spc_value = spc_value,
                spc_ucl = spc_ucl,
                spc_lcl = spc_lcl,
                spc_cl = spc_cl,
                spc_sigma_distance = sigma_distance,
                rule_number = rule_number,
                cycle_count = current_cycle,
                service_name = "wpm",
                status = "error",
                rule_details = rule_attrs.iter().map(|(k, v)| format!("{}={}", k, v)).collect::<Vec<_>>().join(", "),
                "SPC rule violation classified"
            );
            all_special_causes.push(format!("activity_frequency: {:?}", c));
            spc_rule_types.push(rule_violated); // OBS-GAP-2: preserve rule type
        }
    } else {
        spc_results.insert(
            "activity_frequency".to_string(),
            serde_json::json!("INSUFFICIENT_DATA"),
        );
    }

    // Record SPC snapshot to history (cross-cycle trend analysis)
    // Use cycle counter instead of system time (WASM doesn't support std::time)
    let cycle_num = SPC_HISTORY.with(|history| history.borrow().cycle_count + 1);
    let timestamp = format!("cycle-{}", cycle_num);
    let event_rate_mean = if event_counts_per_trace.is_empty() {
        0.0
    } else {
        event_counts_per_trace.iter().sum::<f64>() / event_counts_per_trace.len() as f64
    };
    let trace_duration_mean = if trace_durations.is_empty() {
        0.0
    } else {
        trace_durations.iter().sum::<f64>() / trace_durations.len() as f64
    };
    let activity_freq_mean = if freq_values.is_empty() {
        0.0
    } else {
        freq_values.iter().sum::<f64>() / freq_values.len() as f64
    };

    let snapshot = spc_history::SpcSnapshot::new(
        timestamp.clone(),
        event_rate_mean,
        trace_duration_mean,
        activity_freq_mean,
        health_state_val as u8,
    );

    let (history_cycle_count, history_len, has_sufficient_data) = SPC_HISTORY.with(|history| {
        let mut history = history.borrow_mut();
        history.record_snapshot(snapshot);
        (
            history.cycle_count,
            history.history.len(),
            history.has_sufficient_data(),
        )
    });

    spc_results.insert(
        "history_cycle_count".to_string(),
        serde_json::json!(history_cycle_count),
    );
    spc_results.insert("history_len".to_string(), serde_json::json!(history_len));
    spc_results.insert(
        "has_sufficient_data".to_string(),
        serde_json::json!(has_sufficient_data),
    );

    // If sufficient historical data exists, apply Western Electric rules across cycles
    if has_sufficient_data {
        let historical_event_rates = SPC_HISTORY.with(|history| history.borrow().get_event_rates());
        let historical_trace_durations =
            SPC_HISTORY.with(|history| history.borrow().get_trace_durations());
        let historical_activity_freqs =
            SPC_HISTORY.with(|history| history.borrow().get_activity_frequencies());

        // Apply Western Electric rules to historical event rates
        if historical_event_rates.len() >= 9 {
            let mean_er_hist = spc::spc_mean(&historical_event_rates);
            let std_er_hist = spc::spc_std_dev(&historical_event_rates);
            let chart_data_hist: Vec<spc::ChartData> = historical_event_rates
                .iter()
                .enumerate()
                .map(|(i, &v)| spc::ChartData {
                    timestamp: format!("cycle-{}", i),
                    value: v,
                    ucl: mean_er_hist + 3.0 * std_er_hist,
                    cl: mean_er_hist,
                    lcl: (mean_er_hist - 3.0 * std_er_hist).max(0.0),
                    subgroup_data: None,
                })
                .collect();
            let causes_hist = spc::check_western_electric_rules(&chart_data_hist);
            if !causes_hist.is_empty() {
                spc_results.insert(
                    "event_rate_historical".to_string(),
                    serde_json::json!("ALERT"),
                );
                // NOTE: Observability instrumentation for historical SPC rules simplified to allow compilation
                // Full instrumentation (with rule attribute details) planned for Cycle 56+
                for c in &causes_hist {
                    let (rule_violated, rule_number) = match c {
                        spc::SpecialCause::OutOfControl { .. } => ("rule_1_outlier", 1u8),
                        spc::SpecialCause::Shift { .. } => ("rule_2_shift", 2u8),
                        spc::SpecialCause::Trend { .. } => ("rule_3_trend", 3u8),
                        spc::SpecialCause::TwoOfThree { .. } => ("rule_4_two_of_three", 4u8),
                    };
                    let current_cycle = 0u64; // PERF: wire with_orch() accessor
                    tracing::warn!(
                        target: "autonomic.spc",
                        spc_rule_type = rule_violated,
                        spc_metric = "event_rate_historical",
                        rule_number = rule_number,
                        cycle_count = current_cycle,
                        service_name = "wpm",
                        status = "error",
                        "SPC rule violation classified (historical)"
                    );
                    all_special_causes.push(format!("event_rate_historical: {:?}", c));
                    spc_rule_types.push(rule_violated); // OBS-GAP-2
                }
            } else {
                spc_results.insert("event_rate_historical".to_string(), serde_json::json!("OK"));
            }
        }

        // Apply Western Electric rules to historical trace durations
        if historical_trace_durations.len() >= 9 {
            let mean_td_hist = spc::spc_mean(&historical_trace_durations);
            let std_td_hist = spc::spc_std_dev(&historical_trace_durations);
            let chart_data_hist: Vec<spc::ChartData> = historical_trace_durations
                .iter()
                .enumerate()
                .map(|(i, &v)| spc::ChartData {
                    timestamp: format!("cycle-{}", i),
                    value: v,
                    ucl: mean_td_hist + 3.0 * std_td_hist,
                    cl: mean_td_hist,
                    lcl: (mean_td_hist - 3.0 * std_td_hist).max(0.0),
                    subgroup_data: None,
                })
                .collect();
            let causes_hist = spc::check_western_electric_rules(&chart_data_hist);
            if !causes_hist.is_empty() {
                spc_results.insert(
                    "trace_duration_historical".to_string(),
                    serde_json::json!("ALERT"),
                );
                for c in &causes_hist {
                    let (rule_violated, rule_number) = match c {
                        spc::SpecialCause::OutOfControl { .. } => ("rule_1_outlier", 1u8),
                        spc::SpecialCause::Shift { .. } => ("rule_2_shift", 2u8),
                        spc::SpecialCause::Trend { .. } => ("rule_3_trend", 3u8),
                        spc::SpecialCause::TwoOfThree { .. } => ("rule_4_two_of_three", 4u8),
                    };
                    let current_cycle = 0u64; // PERF: wire with_orch() accessor
                    tracing::warn!(
                        target: "autonomic.spc",
                        spc_rule_type = rule_violated,
                        spc_metric = "trace_duration_historical",
                        rule_number = rule_number,
                        cycle_count = current_cycle,
                        service_name = "wpm",
                        status = "error",
                        "SPC rule violation classified (historical)"
                    );
                    all_special_causes.push(format!("trace_duration_historical: {:?}", c));
                    spc_rule_types.push(rule_violated); // OBS-GAP-2
                }
            } else {
                spc_results.insert(
                    "trace_duration_historical".to_string(),
                    serde_json::json!("OK"),
                );
            }
        }

        // Apply Western Electric rules to historical activity frequencies
        if historical_activity_freqs.len() >= 9 {
            let mean_af_hist = spc::spc_mean(&historical_activity_freqs);
            let std_af_hist = spc::spc_std_dev(&historical_activity_freqs);
            let chart_data_hist: Vec<spc::ChartData> = historical_activity_freqs
                .iter()
                .enumerate()
                .map(|(i, &v)| spc::ChartData {
                    timestamp: format!("cycle-{}", i),
                    value: v,
                    ucl: mean_af_hist + 3.0 * std_af_hist,
                    cl: mean_af_hist,
                    lcl: (mean_af_hist - 3.0 * std_af_hist).max(0.0),
                    subgroup_data: None,
                })
                .collect();
            let causes_hist = spc::check_western_electric_rules(&chart_data_hist);
            if !causes_hist.is_empty() {
                spc_results.insert(
                    "activity_frequency_historical".to_string(),
                    serde_json::json!("ALERT"),
                );
                for c in &causes_hist {
                    let (rule_violated, rule_number) = match c {
                        spc::SpecialCause::OutOfControl { .. } => ("rule_1_outlier", 1u8),
                        spc::SpecialCause::Shift { .. } => ("rule_2_shift", 2u8),
                        spc::SpecialCause::Trend { .. } => ("rule_3_trend", 3u8),
                        spc::SpecialCause::TwoOfThree { .. } => ("rule_4_two_of_three", 4u8),
                    };
                    let current_cycle = 0u64; // PERF: wire with_orch() accessor
                    tracing::warn!(
                        target: "autonomic.spc",
                        spc_rule_type = rule_violated,
                        spc_metric = "activity_frequency_historical",
                        rule_number = rule_number,
                        cycle_count = current_cycle,
                        service_name = "wpm",
                        status = "error",
                        "SPC rule violation classified (historical)"
                    );
                    all_special_causes.push(format!("activity_frequency_historical: {:?}", c));
                    spc_rule_types.push(rule_violated); // OBS-GAP-2
                }
            } else {
                spc_results.insert(
                    "activity_frequency_historical".to_string(),
                    serde_json::json!("OK"),
                );
            }
        }
    }

    let t_protection_end = wall_clock_us();

    // Check if cycle will exceed latency budget (so far: perception + decision + protection)
    let time_so_far = t_protection_end.saturating_sub(t_cycle_start);
    let cycle_latency_budget_exceeded = time_so_far > CYCLE_LATENCY_BUDGET_US;

    // -----------------------------------------------------------------------
    // Layer 4: Optimization — Reinforcement Learning (persistent)
    // -----------------------------------------------------------------------
    let t_optimization_start = wall_clock_us();
    let health_level = health_state_val as u8;
    let rework_ratio_val = {
        let trace_rework = perception["rework_ratio"].as_f64().unwrap_or(0.0) as f32;
        let loop_density = perception["loop_density"].as_f64().unwrap_or(0.0) as f32;
        // Blend: 70% trace-level presence, 30% loop intensity (loops per event)
        // This provides a more accurate rework signal for RL optimization.
        (trace_rework * 0.7 + loop_density * 0.3).min(1.0)
    };

    // Get circuit state for Guard Rule 3
    let circuit_state_u8 = CIRCUIT_BREAKER.with(|cb| {
        let cb = cb.borrow();
        cb.as_rl_circuit_state()
    });

    let (
        action_label,
        reward_val,
        agent_name,
        cycle_count,
        cumulative_reward,
        autoprocess_state_id,
        autoprocess_q_value,
    ) = RL_ORCHESTRATOR.with(|orch_cell| {
        let mut orch = orch_cell.borrow_mut();

        // Build 8-dim feature vector for LinUCB (normalized to [0,1])
        // Compute activity entropy for drift detection
        let activity_entropy = {
            let freqs: Vec<usize> = perception["activity_frequencies"]
                .as_object()
                .map(|m| {
                    m.values()
                        .map(|v| v.as_f64().unwrap_or(0.0) as usize)
                        .collect()
                })
                .unwrap_or_default();

            if freqs.is_empty() {
                0.0
            } else {
                let total: usize = freqs.iter().sum();
                let mut entropy = 0.0_f32;
                for &count in &freqs {
                    if total > 0 {
                        let p = (count as f32) / (total as f32);
                        if p > 0.0 {
                            entropy -= p * p.log2();
                        }
                    }
                }
                if freqs.len() > 1 {
                    entropy / (freqs.len() as f32).log2()
                } else {
                    entropy
                }
            }
        };

        let features: [f32; 8] = [
            (event_count_val as f32 / 10_000.0).min(1.0), // [0] event_rate
            (trace_count_val as f32 / 1_000.0).min(1.0),  // [1] trace_count (unused)
            (unique_activities_val as f32 / 100.0).min(1.0), // [2] activity_count
            (health_level as f32 / 4.0).min(1.0),         // [3] health (unused in from_features)
            if circuit_allowed { 1.0 } else { 0.0 },      // [4] circuit_state
            (all_special_causes.len() as f32 / 10.0).min(1.0), // [5] spc_alert_level
            activity_entropy,                             // [6] drift_status (activity entropy)
            (orch.telemetry().cycle_count as f32 / 1_000.0).min(1.0), // [7] cycle_phase
        ];

        let rl_state = RlState::from_features(&features, health_level, rework_ratio_val);

        // Compute next health state based on cycle outcome and consecutive successes.
        // After 3 consecutive successful cycles (guard_pass && circuit_allowed),
        // health improves by 1 level (3→2→1→0). Failed cycles degrade health and reset counter.
        const IMPROVEMENT_THRESHOLD: u32 = 3;
        let consecutive_successes = orch.telemetry().consecutive_successes;

        let next_health_level = if guard_pass && circuit_allowed {
            // Success: check if we've earned an improvement
            if consecutive_successes >= IMPROVEMENT_THRESHOLD {
                health_level.saturating_sub(1) // Improve: 3→2→1→0 (min 0)
            } else {
                health_level // Stable: not enough consecutive successes yet
            }
        } else {
            (health_level + 1).min(4) // Degrade: failed cycle (cap at 4)
        };
        let rl_next_state = RlState::from_features(&features, next_health_level, rework_ratio_val);

        // Domain 2 wiring: Call AutoProcessAgent if feature-cloud enabled
        let (autoprocess_state_id, autoprocess_q_value) = {
            #[cfg(feature = "cloud")]
            {
                AUTO_PROCESS_AGENT.with(|agent_cell| {
                    let mut agent = agent_cell.borrow_mut();
                    let decision = agent.run_cycle(
                        &rl_state,
                        &features,
                        orch.telemetry().last_reward,
                        &rl_next_state,
                        next_health_level == 4, // done = terminal health
                        guard_pass,             // action_success
                        circuit_state_u8,
                    );
                    (decision.state_id, decision.q_value)
                })
            }
            #[cfg(not(feature = "cloud"))]
            {
                (0u32, 0.0f32) // No-op for non-cloud builds
            }
        };

        let (label, _reward) = orch.run_cycle(
            &features,
            &rl_state,
            &rl_next_state,
            all_special_causes.len(),
            guard_pass,
            circuit_allowed,
            cycle_latency_budget_exceeded,
        );

        (
            label,
            orch.telemetry().last_reward,
            orch.telemetry().active_agent_name.clone(),
            orch.telemetry().cycle_count,
            orch.telemetry().cumulative_reward,
            autoprocess_state_id,
            autoprocess_q_value,
        )
    });

    // Record circuit breaker outcome AFTER actual cycle work completes
    // (not before, so the breaker tracks real success/failure rates)
    CIRCUIT_BREAKER.with(|cb| {
        let mut cb = cb.borrow_mut();
        if circuit_allowed {
            // Cycle executed: record success if guard passed (healthy outcome),
            // or failure if guard failed (execution degradation).
            if guard_pass {
                cb.record_success();
            } else {
                cb.record_failure();
            }
        }
        // If circuit was blocked, the failure was already implicit
        // (allow_request returned false, no work was attempted)
    });

    let t_optimization_end = wall_clock_us();

    // GAP-3: Enhanced decision visibility with action rationale and context
    let action_rationale = match action_label.as_str() {
        "Continue" => "no degradation detected; maintain status quo",
        "Scale" => "spc alerts or instability; increase exploration",
        "Retry" => "transient failure; exponential backoff attempted",
        "Fallback" => "persistent failure; fallback algorithm invoked",
        "Restart" => "critical state or drift; system restart required",
        _ => "unknown action; fallback applied",
    };

    // OBS-GAP-2 FIX: emit primary SPC rule type so Jaeger can correlate
    // rule_type → action_selected without a separate SPC span lookup.
    let spc_primary_rule_type = spc_rule_types.first().copied().unwrap_or("none");

    // OBS-GAP-3 FIX: emit circuit_recovery_signal when circuit transitions
    // from Open/HalfOpen to Closed (recovery event), enabling Jaeger queries
    // like "circuit_recovery_signal=true AND health_improved=true".
    let circuit_recovery_signal = circuit_state.contains("Closed") && circuit_allowed;

    // OBS-GAP-2 FIX: validate action-rule alignment for Rank-2 oracle auditing.
    // Correct rule-to-action mapping per domain contract:
    //   rule_1_outlier  → Retry or Scale (transient spike)
    //   rule_2_shift    → Scale or Fallback (sustained shift)
    //   rule_3_trend    → Scale or Restart (monotonic trend)
    //   rule_4_two_of_three → Scale or Continue (borderline pattern)
    let action_matches_spc_rule = match (spc_primary_rule_type, action_label.as_str()) {
        ("rule_1_outlier", "Retry" | "Scale") => true,
        ("rule_2_shift", "Scale" | "Fallback") => true,
        ("rule_3_trend", "Scale" | "Restart") => true,
        ("rule_4_two_of_three", "Scale" | "Continue") => true,
        ("none", _) => true, // No SPC alert: any action is valid
        _ => false,
    };

    tracing::info!(
        target: "autonomic",
        action = %action_label,
        action_rationale = action_rationale,
        agent = %agent_name,
        reward = %reward_val,
        cumulative_reward = %cumulative_reward,
        cycle = %cycle_count,
        health = %health_state_val,
        spc_alerts = %all_special_causes.len(),
        // OBS-GAP-2: primary rule type and action-rule alignment
        spc_primary_rule_type = spc_primary_rule_type,
        action_matches_spc_rule = action_matches_spc_rule,
        circuit_state = %circuit_state,
        circuit_allowed = %circuit_allowed,
        // OBS-GAP-3: circuit recovery signal for causality correlation
        circuit_recovery_signal = circuit_recovery_signal,
        guard_pass = %guard_pass,
        service_name = "wpm",
        status = if guard_pass && circuit_allowed { "ok" } else { "warning" },
        "autonomic.decision_action_selected"
    );

    // Compute timing deltas using saturating_sub to handle any timing anomalies
    let perception_us = t_perception_end.saturating_sub(t_perception_start);
    let decision_us = t_decision_end.saturating_sub(t_decision_start);
    let protection_us = t_protection_end.saturating_sub(t_protection_start);
    let optimization_us = t_optimization_end.saturating_sub(t_optimization_start);
    let total_us = t_optimization_end.saturating_sub(t_cycle_start);

    // Check if cycle exceeded latency budget
    let cycle_latency_budget_exceeded = total_us > CYCLE_LATENCY_BUDGET_US;

    // -----------------------------------------------------------------------
    // MAPE-K Action Dispatch: Translate RL decision to system actions
    // -----------------------------------------------------------------------
    let (action_dispatch_detail, action_taken) = match action_label.as_str() {
        "Continue" => (
            "no-op: continue normal operation".to_string(),
            "continue".to_string(),
        ),
        "Scale" => {
            // Bump epsilon to 0.5, set drain_every=16 for faster learning
            RL_ORCHESTRATOR.with(|orch_cell| {
                let mut orch = orch_cell.borrow_mut();
                orch.set_exploration_rate(0.5);
            });
            SCALE_BOOST_REMAINING.with(|sb| {
                sb.set(3); // 3 more cycles with boosted exploration
            });
            (
                "exploration boost: epsilon=0.5 x3 cycles".to_string(),
                "scale".to_string(),
            )
        }
        "Retry" => {
            // Set backoff flag for next perception cycle
            (
                "backoff: exponential retry scheduling".to_string(),
                "retry".to_string(),
            )
        }
        "Fallback" => {
            // Use UCB1 bandit to select fallback algorithm; default to "dfg"
            #[cfg(feature = "ml")]
            let fallback_algo = FALLBACK_BANDIT.with(|fb| {
                let mut guard = fb.borrow_mut();
                // Lazy-init on first use
                if guard.is_none() {
                    *guard = Some(crate::prediction_resource::BanditState {
                        arms: vec![
                            crate::prediction_resource::BanditArm {
                                name: "dfg".to_string(),
                                total_reward: 0.0,
                                pull_count: 0,
                            },
                            crate::prediction_resource::BanditArm {
                                name: "heuristic_miner".to_string(),
                                total_reward: 0.0,
                                pull_count: 0,
                            },
                            crate::prediction_resource::BanditArm {
                                name: "alpha_plus_plus".to_string(),
                                total_reward: 0.0,
                                pull_count: 0,
                            },
                        ],
                        total_pulls: 0,
                    });
                }
                crate::prediction_resource::compute_ucb1_selection(
                    guard.as_ref().unwrap(),
                    std::f64::consts::SQRT_2,
                )
                .map(|sel| sel.selected.clone())
                .unwrap_or_else(|_| "dfg".to_string())
            });
            #[cfg(not(feature = "ml"))]
            let fallback_algo = "dfg".to_string();

            LAST_ALGORITHM.with(|la| {
                *la.borrow_mut() = fallback_algo.clone();
            });
            (
                format!(
                    "fallback: switch to {}, reduce event budget 10%",
                    fallback_algo
                ),
                "fallback".to_string(),
            )
        }
        "Restart" => {
            // Clear SPC history, reset circuit breaker, reset epsilon to 1.0
            SPC_HISTORY.with(|spc| {
                *spc.borrow_mut() = spc_history::SpcHistory::new();
            });
            CIRCUIT_BREAKER.with(|cb| {
                *cb.borrow_mut() = self_healing::CircuitBreaker::new();
            });
            RL_ORCHESTRATOR.with(|orch_cell| {
                let mut orch = orch_cell.borrow_mut();
                orch.reset_all_exploration_rates();
            });
            (
                "restart: reset SPC, circuit breaker, epsilon=1.0".to_string(),
                "restart".to_string(),
            )
        }
        _ => ("unknown action".to_string(), "unknown".to_string()),
    };

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
                "rl_agent": agent_name,
                "reward": reward_val,
                "cycle_count": cycle_count,
                "cumulative_reward": cumulative_reward,
                "health_score": health_state_val,
                "action_taken": action_taken,
                "dispatch_detail": action_dispatch_detail,
                "autoprocess_state_id": autoprocess_state_id,
                "autoprocess_q_value": autoprocess_q_value,
            },
        },
        "timing": {
            "perception_us": perception_us,
            "decision_us": decision_us,
            "protection_us": protection_us,
            "optimization_us": optimization_us,
            "total_us": total_us,
            "precision": "1ms_clock",
            "cycle_latency_budget_exceeded": cycle_latency_budget_exceeded,
        },
    });

    Ok(serde_json::to_string(&result).unwrap_or_else(|_| "{}".to_string()))
}

// State space size: 5 × 8 × 8 × 4 × 3 × 8 × 3 × 4 = 368,640 states
// This requires function approximation (not tabular methods)
/// Multi-dimensional RL state with quantized dimensions
#[derive(Clone, PartialEq, Eq, Hash, Debug)]
#[wasm_bindgen]
pub struct RlState {
    pub health_level: u8,     // 0-4 (5 states)
    pub event_rate_q: u8,     // 0-7 (8 quantization levels)
    pub activity_count_q: u8, // 0-7 (8 quantization levels)
    pub spc_alert_level: u8,  // 0-3 (4 levels)
    pub drift_status: u8,     // 0-2 (3 states)
    pub rework_ratio_q: u8,   // 0-7 (8 quantization levels)
    pub circuit_state: u8,    // 0-2 (3 states)
    pub cycle_phase: u8,      // 0-3 (4 phases)
}

impl RlState {
    /// Create from 8-dimensional feature vector and rework ratio
    pub fn from_features(features: &[f32; 8], health_level: u8, rework_ratio: f32) -> Self {
        // features[2] = unique_activities / 100
        let activity_count = (features[2] * 100.0) as u32;
        let activity_count_q = Self::quantize_activity_count(activity_count);

        // features[6] = activity_entropy (0-1)
        let drift_low = get_drift_threshold_low();
        let drift_high = get_drift_threshold_high();
        let drift_status = if features[6] < drift_low {
            0
        } else if features[6] < drift_high {
            1
        } else {
            2
        };

        // features[0] = event_count / 10000
        let event_rate_q = Self::quantize_event_rate(features[0]);

        // features[5] = special_cause_count / 10
        let spc_alert_level = Self::quantize_spc_alerts(features[5]);

        // features[4] = circuit_allowed (0 or 1)
        let circuit_state = if features[4] > 0.5 { 0 } else { 1 }; // 0=closed, 1=open

        // features[7] = cycle_count / 1000
        let cycle_phase = Self::quantize_cycle_phase(features[7]);

        // rework_ratio is computed from log trace analysis
        let rework_ratio_q = Self::quantize_rework_ratio(rework_ratio);

        Self {
            health_level,
            event_rate_q,
            activity_count_q,
            spc_alert_level,
            drift_status,
            rework_ratio_q,
            circuit_state,
            cycle_phase,
        }
    }

    fn quantize_activity_count(count: u32) -> u8 {
        match count {
            0..=10 => 0,
            11..=20 => 1,
            21..=30 => 2,
            31..=40 => 3,
            41..=50 => 4,
            51..=60 => 5,
            61..=70 => 6,
            _ => 7,
        }
    }

    fn quantize_event_rate(normalized_rate: f32) -> u8 {
        // normalized_rate is in [0,1], representing [0, 10000] events
        let rate = (normalized_rate * 10000.0) as u32;
        match rate {
            0..=500 => 0,
            501..=1000 => 1,
            1001..=2000 => 2,
            2001..=3000 => 3,
            3001..=4000 => 4,
            4001..=5000 => 5,
            5001..=7500 => 6,
            _ => 7,
        }
    }

    fn quantize_spc_alerts(normalized_alerts: f32) -> u8 {
        // normalized_alerts is in [0,1], representing [0, 10] special causes
        let alert_count = (normalized_alerts * 10.0) as u32;
        match alert_count {
            0 => 0,
            1..=2 => 1,
            3..=5 => 2,
            _ => 3,
        }
    }

    fn quantize_cycle_phase(normalized_cycles: f32) -> u8 {
        // normalized_cycles is in [0,1], representing [0, 1000] cycles
        let cycles = (normalized_cycles * 1000.0) as u32;
        match cycles {
            0..=10 => 0,   // Initial
            11..=50 => 1,  // Learning
            51..=100 => 2, // Mature
            _ => 3,        // Stable
        }
    }

    fn quantize_rework_ratio(rework_ratio: f32) -> u8 {
        // rework_ratio is in [0,1], fraction of traces with loops
        // Quantize to 8 levels
        let ratio_percent = (rework_ratio * 100.0) as u32;
        match ratio_percent {
            0..=5 => 0,   // 0-5%: minimal rework
            6..=15 => 1,  // 6-15%: low rework
            16..=25 => 2, // 16-25%: moderate-low
            26..=40 => 3, // 26-40%: moderate
            41..=55 => 4, // 41-55%: moderate-high
            56..=70 => 5, // 56-70%: high rework
            71..=85 => 6, // 71-85%: very high
            _ => 7,       // 86-100%: extreme rework
        }
    }
}

#[cfg(feature = "cloud")]
impl reinforcement::WorkflowState for RlState {
    fn features(&self) -> Vec<f32> {
        vec![
            self.health_level as f32 / 4.0,
            self.event_rate_q as f32 / 7.0,
            self.activity_count_q as f32 / 7.0,
            self.spc_alert_level as f32 / 3.0,
            self.drift_status as f32 / 2.0,
            self.rework_ratio_q as f32 / 7.0,
            self.circuit_state as f32 / 2.0,
            self.cycle_phase as f32 / 3.0,
        ]
    }

    fn is_terminal(&self) -> bool {
        self.health_level == 4 // Failed is terminal
    }
}

// Simple RL actions: 5 levels
#[derive(Clone, Copy, PartialEq, Eq, std::hash::Hash, std::fmt::Debug)]
pub enum RlAction {
    Continue = 0,
    Scale = 1,
    Retry = 2,
    Fallback = 3,
    Restart = 4,
}

impl RlAction {
    pub fn name(&self) -> &'static str {
        match self {
            RlAction::Continue => "Continue",
            RlAction::Scale => "Scale",
            RlAction::Retry => "Retry",
            RlAction::Fallback => "Fallback",
            RlAction::Restart => "Restart",
        }
    }
}

#[cfg(feature = "cloud")]
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

// -------------------------------------------------------------------------
// RL State WASM Exports
// -------------------------------------------------------------------------

/// Create an RlState directly from 8 field values.
///
/// # Arguments
///
/// * `health_level` - 0-4 (5 states: Normal, Warning, Degraded, Critical, Failed)
/// * `event_rate_q` - 0-7 (quantized event rate)
/// * `activity_count_q` - 0-7 (quantized activity count)
/// * `spc_alert_level` - 0-3 (SPC alert level)
/// * `drift_status` - 0-2 (drift detection status)
/// * `rework_ratio_q` - 0-7 (quantized rework ratio)
/// * `circuit_state` - 0-2 (circuit breaker state)
/// * `cycle_phase` - 0-3 (autonomic cycle phase)
///
/// # Returns
///
/// * `RlState` - WASM-exported state object
#[wasm_bindgen]
pub fn create_rl_state(
    health_level: u8,
    event_rate_q: u8,
    activity_count_q: u8,
    spc_alert_level: u8,
    drift_status: u8,
    rework_ratio_q: u8,
    circuit_state: u8,
    cycle_phase: u8,
) -> RlState {
    RlState {
        health_level,
        event_rate_q,
        activity_count_q,
        spc_alert_level,
        drift_status,
        rework_ratio_q,
        circuit_state,
        cycle_phase,
    }
}

/// Create an RlState from a feature slice and health level.
///
/// This is the primary constructor used by the RL orchestrator.
/// It quantizes continuous feature values into discrete state dimensions.
///
/// # Arguments
///
/// * `features` - Slice of 8 f32 values (normalized to [0,1])
/// * `health_level` - 0-4 (explicit health score, not derived from features)
/// * `rework_ratio` - 0.0-1.0 (fraction of traces with repeated activities)
///
/// # Returns
///
/// * `RlState` - Quantized state object
///
/// # Feature Mapping
///
/// - `features[0]` → event_rate_q (event count / 10,000)
/// - `features[1]` → unused (trace count / 1,000)
/// - `features[2]` → activity_count_q (unique activities / 100)
/// - `features[3]` → unused (health_level / 4, overridden by param)
/// - `features[4]` → unused (special causes / 10)
/// - `features[5]` → spc_alert_level (special causes / 10)
/// - `features[6]` → drift_status (activity entropy)
/// - `features[7]` → circuit_state (circuit_allowed flag)
/// - `rework_ratio` → rework_ratio_q (0-7 quantized levels)
#[wasm_bindgen]
pub fn rl_state_from_features(features: &[f32], health_level: u8, rework_ratio: f32) -> RlState {
    // Convert slice to array for from_features
    let mut arr = [0.0f32; 8];
    for (i, &val) in features.iter().enumerate() {
        if i < 8 {
            arr[i] = val;
        }
    }
    RlState::from_features(&arr, health_level, rework_ratio)
}

/// Get the health_level field from an RlState.
///
/// # Arguments
///
/// * `state` - Reference to RlState
///
/// # Returns
///
/// * `u8` - Health level (0-4)
#[wasm_bindgen]
pub fn rl_state_health_level(state: &RlState) -> u8 {
    state.health_level
}

// RL Orchestrator WASM Exports
// -------------------------------------------------------------------------

/// Reset the RL orchestrator to fresh state.
#[cfg(feature = "cloud")]
#[wasm_bindgen]
pub fn rl_orchestrator_reset() -> Result<String, JsValue> {
    RL_ORCHESTRATOR.with(|orch| {
        *orch.borrow_mut() = rl_orchestrator::RlOrchestrator::new();
        Ok("RL orchestrator reset".to_string())
    })
}

/// Get the currently active RL agent type (0=QLearning, 1=SARSA, 2=DoubleQ, 3=ExpectedSARSA, 4=REINFORCE).
#[cfg(feature = "cloud")]
#[wasm_bindgen]
pub fn rl_orchestrator_active_agent() -> Result<u8, JsValue> {
    RL_ORCHESTRATOR.with(|orch| Ok(orch.borrow().active_agent() as u8))
}

/// Switch the active RL agent by type index.
#[cfg(feature = "cloud")]
#[wasm_bindgen]
pub fn rl_orchestrator_switch_agent(agent_type: u8) -> Result<String, JsValue> {
    RL_ORCHESTRATOR.with(|orch| {
        let mut orch = orch.borrow_mut();
        match rl_orchestrator::AgentType::from_u8(agent_type) {
            Some(at) => {
                orch.switch_agent(at);
                Ok(format!("Switched to {}", at.name()))
            }
            None => Err(crate::error::js_val(&format!(
                "Invalid agent type: {} (must be 0-4)",
                agent_type
            ))),
        }
    })
}

/// Enable or disable LinUCB-based agent selection.
#[cfg(feature = "cloud")]
#[wasm_bindgen]
pub fn rl_orchestrator_set_linucb(enabled: bool) -> Result<String, JsValue> {
    RL_ORCHESTRATOR.with(|orch| {
        orch.borrow_mut().set_linucb_selection(enabled);
        Ok(format!("LinUCB selection: {}", enabled))
    })
}

/// Get RL orchestrator telemetry as JSON.
#[cfg(feature = "cloud")]
#[wasm_bindgen]
pub fn rl_orchestrator_telemetry() -> Result<String, JsValue> {
    RL_ORCHESTRATOR.with(|orch| {
        let orch = orch.borrow();
        let t = orch.telemetry();
        Ok(serde_json::to_string(t).unwrap_or_else(|_| "{}".to_string()))
    })
}

/// Get RL orchestrator telemetry as a JavaScript object.
///
/// Returns the 5 critical telemetry fields as a JsValue:
/// - cycle_count: number of autonomic cycles executed
/// - last_health_state: system health level (0=Normal, 1=Warning, 2=Degraded, 3=Critical, 4=Failed)
/// - cumulative_reward: total reward accumulated across all cycles
/// - last_reward: reward from the most recent cycle
/// - last_spc_alert_count: number of SPC special causes in the last cycle
#[cfg(feature = "cloud")]
#[wasm_bindgen]
pub fn rl_orchestrator_get_telemetry() -> Result<JsValue, JsValue> {
    RL_ORCHESTRATOR.with(|orch| {
        let orch = orch.borrow();
        let t = orch.telemetry();

        // Create a JavaScript object with the 5 critical telemetry fields
        let obj = js_sys::Object::new();

        // Use JsValue to convert Rust types to JavaScript types
        js_sys::Reflect::set(
            &obj,
            &crate::error::js_val("cycle_count"),
            &JsValue::from(t.cycle_count),
        )
        .map_err(|e| crate::error::js_val(&format!("Failed to set cycle_count: {:?}", e)))?;

        js_sys::Reflect::set(
            &obj,
            &crate::error::js_val("last_health_state"),
            &JsValue::from(t.last_health_state),
        )
        .map_err(|e| crate::error::js_val(&format!("Failed to set last_health_state: {:?}", e)))?;

        js_sys::Reflect::set(
            &obj,
            &crate::error::js_val("cumulative_reward"),
            &JsValue::from(t.cumulative_reward),
        )
        .map_err(|e| crate::error::js_val(&format!("Failed to set cumulative_reward: {:?}", e)))?;

        js_sys::Reflect::set(
            &obj,
            &crate::error::js_val("last_reward"),
            &JsValue::from(t.last_reward),
        )
        .map_err(|e| crate::error::js_val(&format!("Failed to set last_reward: {:?}", e)))?;

        js_sys::Reflect::set(
            &obj,
            &crate::error::js_val("last_spc_alert_count"),
            &JsValue::from(t.last_spc_alert_count),
        )
        .map_err(|e| {
            crate::error::js_val(&format!("Failed to set last_spc_alert_count: {:?}", e))
        })?;

        Ok(JsValue::from(obj))
    })
}

/// Serialize current RL orchestrator state to JSON for persistence.
///
/// Returns a JSON string containing telemetry, active agent, and LinUCB state.
/// This can be stored and later restored via `restore_rl_state` to resume
/// RL learning progress across CLI sessions.
///
/// # Returns
///
/// * `Ok(String)` - JSON-serialized RL state
/// * `Err(JsValue)` - Serialization error
#[cfg(feature = "cloud")]
#[wasm_bindgen]
pub fn serialize_rl_state() -> Result<String, JsValue> {
    RL_ORCHESTRATOR.with(|orch| {
        let orch_ref = orch.borrow();
        let telemetry = orch_ref.telemetry();

        // Export Q-tables from all 5 agents
        let agent_q_tables = orch_ref.export_all_q_tables();

        let state = rl_state_serialization::SerializedRlState {
            telemetry: rl_state_serialization::RlTelemetry {
                cycle_count: telemetry.cycle_count,
                last_health_state: telemetry.last_health_state,
                last_action_label: telemetry.last_action_label.clone(),
                last_spc_alert_count: telemetry.last_spc_alert_count,
                cumulative_reward: telemetry.cumulative_reward as f64,
            },
            active_agent: orch_ref.active_agent() as u8,
            linucb_enabled: orch_ref.linucb_selection_enabled(),
            agent_q_tables,
        };

        serde_json::to_string(&state)
            .map_err(|e| crate::error::js_val(&format!("Serialization failed: {}", e)))
    })
}

/// Restore RL orchestrator state from JSON.
///
/// Deserializes a previously-saved RL state and restores telemetry,
/// active agent, Q-tables from all agents, and LinUCB configuration.
///
/// # Arguments
///
/// * `json` - JSON string previously returned by `serialize_rl_state`
///
/// # Returns
///
/// * `Ok(String)` - Success message with restored cycle count
/// * `Err(JsValue)` - Invalid JSON or malformed state
#[cfg(feature = "cloud")]
#[wasm_bindgen]
pub fn restore_rl_state(json: &str) -> Result<String, JsValue> {
    let state: rl_state_serialization::SerializedRlState = serde_json::from_str(json)
        .map_err(|e| crate::error::js_val(&format!("Invalid JSON: {}", e)))?;

    RL_ORCHESTRATOR
        .with(|orch| {
            let mut orch_ref = orch.borrow_mut();

            // Restore active agent
            if let Some(agent_type) = rl_orchestrator::AgentType::from_u8(state.active_agent) {
                orch_ref.switch_agent(agent_type);
            }

            // Restore LinUCB setting
            orch_ref.set_linucb_selection(state.linucb_enabled);

            // Restore telemetry (cycle_count, cumulative_reward, etc.)
            let mut restored_telemetry = rl_orchestrator::CycleTelemetry {
                cycle_count: state.telemetry.cycle_count,
                last_health_state: state.telemetry.last_health_state,
                last_action_label: state.telemetry.last_action_label.clone(),
                last_spc_alert_count: state.telemetry.last_spc_alert_count,
                cumulative_reward: state.telemetry.cumulative_reward as f32,
                ..Default::default()
            };

            // INVARIANT: derive name from ID to ensure consistency (Gap-18)
            if let Some(agent_type) = rl_orchestrator::AgentType::from_u8(state.active_agent) {
                restored_telemetry.active_agent_name = agent_type.name().to_string();
            }

            orch_ref.restore_telemetry(restored_telemetry);

            // Restore Q-tables for all agents
            let num_q_tables = state.agent_q_tables.len();
            let mut restoration_status = String::new();
            if num_q_tables > 0 {
                let (restored, skipped) = orch_ref.restore_all_q_tables(state.agent_q_tables);
                restoration_status = if skipped > 0 {
                    format!(
                        "; {} Q-tables restored, {} skipped (policy divergence risk)",
                        restored, skipped
                    )
                } else {
                    format!("; all {} Q-tables restored successfully", restored)
                };
            }

            Ok::<String, JsValue>(format!(
                "Restored RL state from cycle {} (agent {}, linucb={}){}",
                state.telemetry.cycle_count,
                state.active_agent,
                state.linucb_enabled,
                restoration_status
            ))
        })
        .map_err(|_e| crate::error::js_val("Failed to restore RL state"))
}

/// Get SPC history as JSON.
#[cfg(feature = "cloud")]
#[wasm_bindgen]
pub fn get_spc_history() -> Result<String, JsValue> {
    SPC_HISTORY.with(|history| {
        let history_ref = history.borrow();
        let snapshots = history_ref.get_all_snapshots();
        let serialized = serde_json::json!({
            "snapshots": snapshots,
            "cycle_count": history_ref.cycle_count
        });
        serde_json::to_string(&serialized)
            .map_err(|e| crate::error::js_val(&format!("Serialization failed: {}", e)))
    })
}

/// Set SPC history from JSON.
#[cfg(feature = "cloud")]
#[wasm_bindgen]
pub fn set_spc_history(json: &str) -> Result<String, JsValue> {
    #[derive(serde::Deserialize)]
    struct SpcHistoryJson {
        snapshots: Vec<spc_history::SpcSnapshot>,
        cycle_count: u64,
    }

    let data: SpcHistoryJson = serde_json::from_str(json)
        .map_err(|e| crate::error::js_val(&format!("Invalid JSON: {}", e)))?;

    let snapshot_count = data.snapshots.len();
    let cycle_count = data.cycle_count;
    SPC_HISTORY.with(|history| {
        // `restore` sets cycle_count exactly once; prior implementation
        // re-incremented it per snapshot, producing cycle_count + N drift
        // and breaking get_spc_history / set_spc_history round-trips.
        history.borrow_mut().restore(data.snapshots, cycle_count);
    });

    Ok(format!("Restored {} SPC snapshots", snapshot_count))
}

/// Get circuit breaker state as JSON.
#[cfg(feature = "cloud")]
#[wasm_bindgen]
pub fn circuit_breaker_get_state() -> Result<String, JsValue> {
    CIRCUIT_BREAKER.with(|cb| {
        let cb_ref = cb.borrow();
        let state_json = cb_ref.to_state_json();
        serde_json::to_string(&state_json)
            .map_err(|e| crate::error::js_val(&format!("Serialization failed: {}", e)))
    })
}

/// Set circuit breaker state from JSON.
#[cfg(feature = "cloud")]
#[wasm_bindgen]
pub fn circuit_breaker_set_state(json: &str) -> Result<String, JsValue> {
    let state_json: self_healing::CircuitBreakerStateJson = serde_json::from_str(json)
        .map_err(|e| crate::error::js_val(&format!("Invalid JSON: {}", e)))?;

    CIRCUIT_BREAKER.with(|cb| {
        let mut cb_ref = cb.borrow_mut();
        *cb_ref = self_healing::CircuitBreaker::from_state_json(state_json);
    });

    Ok("Circuit breaker state restored".to_string())
}
/// Configure the circuit breaker from a JSON config string.
#[cfg(feature = "cloud")]
#[wasm_bindgen]
pub fn circuit_breaker_configure(config_json: &str) -> Result<String, JsValue> {
    CIRCUIT_BREAKER.with(
        |breaker| match self_healing::CircuitBreaker::from_json(config_json) {
            Ok(new_breaker) => {
                *breaker.borrow_mut() = new_breaker;
                Ok("Circuit breaker configured".to_string())
            }
            Err(e) => Err(crate::error::js_val(&e)),
        },
    )
}

/// Get current circuit breaker configuration as JSON.
#[cfg(feature = "cloud")]
#[wasm_bindgen]
pub fn circuit_breaker_get_config() -> Result<String, JsValue> {
    CIRCUIT_BREAKER.with(|breaker| {
        let breaker_ref = breaker.borrow();
        let config = self_healing::CircuitBreakerConfigJson {
            failure_threshold: breaker_ref.failure_threshold(),
            success_threshold: breaker_ref.success_threshold(),
            open_timeout_ms: breaker_ref.open_timeout_ms(),
            half_open_timeout_ms: breaker_ref.half_open_timeout_ms(),
        };
        serde_json::to_string(&config)
            .map_err(|e| crate::error::js_val(&format!("Serialization failed: {}", e)))
    })
}

/// Reset the persistent circuit breaker.
#[cfg(feature = "cloud")]
#[wasm_bindgen]
pub fn circuit_breaker_reset() -> Result<String, JsValue> {
    CIRCUIT_BREAKER.with(|cb| {
        *cb.borrow_mut() = self_healing::CircuitBreaker::new();
        Ok("Circuit breaker reset".to_string())
    })
}

// -------------------------------------------------------------------------
// OCEL Support (Object-Centric Event Logs)
// -------------------------------------------------------------------------

// OCEL functions are exported directly from their modules with cfg gates:
// - ocel_io.rs: load_ocel2_from_json, export_ocel2_to_json, validate_ocel
// - ocel_flatten.rs: list_ocel_object_types, get_ocel_type_statistics, flatten_ocel_to_eventlog, measure_ocel_flattening_loss
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
pub use hand_stats::Median;

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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_iso8601_duration_basic() {
        let dur = parse_iso8601_duration("2026-04-13T10:00:00Z", "2026-04-13T11:00:00Z");
        assert_eq!(dur, 3_600_000.0); // 1 hour in ms
    }

    #[test]
    fn test_parse_iso8601_duration_same_timestamp() {
        let dur = parse_iso8601_duration("2026-04-13T10:00:00Z", "2026-04-13T10:00:00Z");
        assert_eq!(dur, 0.0);
    }

    #[test]
    fn test_parse_iso8601_duration_reverse_order() {
        let dur = parse_iso8601_duration("2026-04-13T11:00:00Z", "2026-04-13T10:00:00Z");
        assert_eq!(dur, -3_600_000.0); // negative when reversed
    }

    #[test]
    fn test_parse_iso8601_duration_empty_strings() {
        let dur = parse_iso8601_duration("", "");
        assert_eq!(dur, 0.0);
    }

    #[test]
    fn test_parse_iso8601_duration_with_offset() {
        let dur = parse_iso8601_duration("2026-04-13T10:00:00+00:00", "2026-04-13T10:00:01+00:00");
        assert_eq!(dur, 1_000.0); // 1 second in ms
    }

    #[test]
    fn test_parse_iso8601_duration_cross_day() {
        let dur = parse_iso8601_duration("2026-04-13T23:00:00Z", "2026-04-14T01:00:00Z");
        assert_eq!(dur, 7_200_000.0); // 2 hours in ms
    }

    #[test]
    fn test_parse_iso8601_duration_with_fractional_seconds() {
        let dur = parse_iso8601_duration("2026-04-13T10:00:00.500Z", "2026-04-13T10:00:01.500Z");
        // Fractional seconds are stripped, so both resolve to the same second
        assert_eq!(dur, 1_000.0); // 1 second in ms
    }

    #[test]
    fn test_parse_iso8601_duration_string_lengths_differ_but_times_dont() {
        // TS-1 regression: same-duration timestamps with different string lengths
        // Old code: (last.len() - first.len()) would return 0 for same-length strings
        // even if they represented different times (e.g., different months)
        let dur = parse_iso8601_duration("2026-01-13T10:00:00Z", "2026-11-13T10:00:00Z");
        // Jan 13 → Nov 13 = 304 days (2026 is not a leap year, Jan has 31, Feb 28, etc.)
        // 304 × 86_400_000 = 26,265,600,000 ms
        assert!(dur > 26_000_000_000.0); // > 26 billion ms
        assert!(dur < 27_000_000_000.0);
    }

    #[test]
    fn test_parse_iso8601_duration_string_lengths_same_but_times_differ() {
        // TS-1 regression: timestamps with identical string length but different durations
        let dur = parse_iso8601_duration("2026-01-01T00:00:00Z", "2026-12-31T23:59:59Z");
        // Old code: (20 - 20) = 0 ms. New code: ~365 days in ms
        assert!(dur > 31_000_000_000.0); // > 31 billion ms (~361 days)
    }

    #[test]
    #[cfg(feature = "cloud")]
    fn test_restore_rl_state_actually_restores_cycle_count() {
        // Simulate serialize → reset → restore round-trip
        let state_json = r#"{
            "telemetry": {
                "cycle_count": 42,
                "last_health_state": 1,
                "last_action_label": "ADAPT_TIMEOUT",
                "last_spc_alert_count": 1,
                "cumulative_reward": -3.5
            },
            "active_agent": 0,
            "linucb_enabled": true
        }"#;

        // Reset orchestrator to fresh state
        RL_ORCHESTRATOR.with(|orch| {
            *orch.borrow_mut() = rl_orchestrator::RlOrchestrator::new();
        });

        // Verify fresh state has cycle_count = 0
        RL_ORCHESTRATOR.with(|orch| {
            assert_eq!(orch.borrow().telemetry().cycle_count, 0);
        });

        // Restore
        restore_rl_state(state_json).expect("restore should succeed");

        // Verify cycle_count is restored
        RL_ORCHESTRATOR.with(|orch| {
            let orch = orch.borrow();
            assert_eq!(
                orch.telemetry().cycle_count,
                42,
                "cycle_count should be restored"
            );
            assert_eq!(
                orch.active_agent() as u8,
                0,
                "active agent should be restored"
            );
            assert!(orch.linucb_selection_enabled(), "linucb should be restored");
        });

        // Reset back to clean state
        RL_ORCHESTRATOR.with(|orch| {
            *orch.borrow_mut() = rl_orchestrator::RlOrchestrator::new();
        });
    }

    /// Rank-1 round-trip oracle: after `restore_rl_state`, the orchestrator's
    /// `active_agent_name` (inside `telemetry`) must agree with the restored
    /// `active_agent` enum. Previously the restore path called
    /// `switch_agent(...)` (which set the name) and then
    /// `restore_telemetry(CycleTelemetry { ..Default::default() })`, which
    /// clobbered the name back to the default ("QLearning"). This is the same
    /// class of bug as the `set_spc_history` cycle_count drift (PR #70):
    /// per-step mutations followed by a final assignment that overwrites them.
    ///
    /// The contract: every documented serialized field round-trips AND the
    /// orchestrator stays internally consistent (active_agent == name).
    #[test]
    #[cfg(feature = "cloud")]
    fn test_restore_rl_state_keeps_active_agent_name_consistent() {
        // active_agent = 2 (DoubleQLearning) — chosen because Default::default()
        // returns "QLearning", so any clobber will be visible.
        let state_json = r#"{
            "telemetry": {
                "cycle_count": 7,
                "last_health_state": 0,
                "last_action_label": "Continue",
                "last_spc_alert_count": 0,
                "cumulative_reward": 1.5
            },
            "active_agent": 2,
            "linucb_enabled": false
        }"#;

        RL_ORCHESTRATOR.with(|orch| {
            *orch.borrow_mut() = rl_orchestrator::RlOrchestrator::new();
        });

        restore_rl_state(state_json).expect("restore should succeed");

        RL_ORCHESTRATOR.with(|orch| {
            let orch = orch.borrow();
            // active_agent enum is restored from the wire
            assert_eq!(
                orch.active_agent() as u8,
                2,
                "active_agent must be restored to DoubleQLearning (2)"
            );
            // Telemetry cycle_count round-trips
            assert_eq!(orch.telemetry().cycle_count, 7);
            // INVARIANT: telemetry.active_agent_name must match the active_agent.
            // PR #70-class drift: switch_agent sets name; restore_telemetry must
            // not clobber it back to a stale default.
            assert_eq!(
                orch.telemetry().active_agent_name,
                "DoubleQLearning",
                "telemetry.active_agent_name must agree with active_agent enum"
            );
        });

        RL_ORCHESTRATOR.with(|orch| {
            *orch.borrow_mut() = rl_orchestrator::RlOrchestrator::new();
        });
    }

    /// Rank-2 round-trip contract: every documented wire field on
    /// `SerializedRlState` survives `serialize_rl_state` → reset →
    /// `restore_rl_state` unchanged. This guards against future drift in any
    /// of the five `RlTelemetry` fields and in the orchestrator's
    /// `active_agent` / `linucb_enabled` slots.
    #[test]
    #[cfg(feature = "cloud")]
    fn test_serialize_restore_rl_state_full_roundtrip() {
        // Seed the orchestrator with a non-default state.
        RL_ORCHESTRATOR.with(|orch| {
            let mut o = orch.borrow_mut();
            *o = rl_orchestrator::RlOrchestrator::new();
            o.switch_agent(rl_orchestrator::AgentType::ExpectedSARSA);
            o.set_linucb_selection(true);
            let t = o.telemetry_mut();
            t.cycle_count = 123;
            t.last_health_state = 3;
            t.last_action_label = "Restart".to_string();
            t.last_spc_alert_count = 4;
            t.cumulative_reward = -7.25; // exactly representable in f32
        });

        let serialized = serialize_rl_state().expect("serialize must succeed");

        // Reset to a different, known state — this is what catches "didn't
        // really restore" bugs.
        RL_ORCHESTRATOR.with(|orch| {
            *orch.borrow_mut() = rl_orchestrator::RlOrchestrator::new();
        });

        restore_rl_state(&serialized).expect("restore must succeed");

        RL_ORCHESTRATOR.with(|orch| {
            let o = orch.borrow();
            assert_eq!(o.active_agent() as u8, 3, "active_agent (ExpectedSARSA=3)");
            assert!(o.linucb_selection_enabled(), "linucb flag");
            let t = o.telemetry();
            assert_eq!(t.cycle_count, 123, "cycle_count");
            assert_eq!(t.last_health_state, 3, "last_health_state");
            assert_eq!(t.last_action_label, "Restart", "last_action_label");
            assert_eq!(t.last_spc_alert_count, 4, "last_spc_alert_count");
            assert!(
                (t.cumulative_reward - (-7.25_f32)).abs() < f32::EPSILON,
                "cumulative_reward"
            );
            // Cross-check: derived name must match the restored agent.
            assert_eq!(t.active_agent_name, "ExpectedSARSA");
        });

        RL_ORCHESTRATOR.with(|orch| {
            *orch.borrow_mut() = rl_orchestrator::RlOrchestrator::new();
        });
    }
}

// ============================================================================
// Agentic Framework WASM Exports
// ============================================================================
//
// These four functions are the WASM public API for the agentic framework.
// Each accepts a JSON-encoded input and returns a JSON-encoded output so that
// no `serde_wasm_bindgen` round-trip is required (avoiding the known to_value
// serialization bug with serde_json::Value on wasm32).
//
// All four are gated on `feature = "cloud"` — the same gate that controls
// `pub mod agentic` — so they are never compiled into browser/edge/iot/fog
// profiles unless cloud features are explicitly requested.
//
// # JS usage pattern
//
// ```js
// const wasm = require('./pkg/wasm4pm.js');
// const parse = r => typeof r === 'string' ? JSON.parse(r) : r;
//
// const taskJson = JSON.stringify({
//   task_id: "t1", title: "triage", phase: "Triage",
//   risk_level: "High",
//   policy: { policy_ids:[], allowed_actions:["Delegate","Read"],
//             forbidden_actions:[], required_roles:[], blocked_roles:[] },
//   evidence: { receipt_refs:[], required_evidence_classes:["otel_span"],
//               available_evidence_classes:["otel_span"], confidence_score:null,
//               confidence_band:"High", drift_status:"Stable" },
//   tags:[], metadata:{}
// });
// const bindings = parse(wasm.run_agentic_pipeline(taskJson));
// ```

/// Run the full agentic pipeline for a task: role selection → topology selection →
/// evidence sufficiency → escalation check → prompt binding compilation.
///
/// Input: JSON-encoded `TaskContext`
/// Output: JSON-encoded `{ bindings: PromptBindingSet, evidence_sufficient: bool,
///         should_escalate: bool, escalation_target: AgentRole|null,
///         gaps: string[] }`
#[cfg(feature = "cloud")]
#[wasm_bindgen]
pub fn run_agentic_pipeline(task_json: &str) -> Result<String, JsValue> {
    use crate::agentic::prelude::*;

    let task: agentic::types::TaskContext = serde_json::from_str(task_json)
        .map_err(|e| crate::error::js_val(&format!("invalid TaskContext JSON: {e}")))?;

    let compiler = DefaultPromptBindingCompiler;
    let bindings = compiler
        .compile_bindings(&task)
        .map_err(|e| crate::error::js_val(&format!("compile_bindings failed: {e}")))?;

    let evidence_checker = DefaultEvidenceSufficiencyChecker;
    let evidence_sufficient = evidence_checker
        .is_sufficient(&task)
        .map_err(|e| crate::error::js_val(&format!("is_sufficient failed: {e}")))?;
    let gaps = evidence_checker
        .summarize_gaps(&task)
        .map_err(|e| crate::error::js_val(&format!("summarize_gaps failed: {e}")))?;

    let escalation_engine = DefaultEscalationEngine;
    let escalation = escalation_engine
        .evaluate_escalation(&task)
        .map_err(|e| crate::error::js_val(&format!("evaluate_escalation failed: {e}")))?;

    let result = serde_json::json!({
        "bindings": bindings,
        "evidence_sufficient": evidence_sufficient,
        "should_escalate": escalation.should_escalate,
        "escalation_target": escalation.target_role,
        "gaps": gaps,
    });

    serde_json::to_string(&result)
        .map_err(|e| crate::error::js_val(&format!("serialization failed: {e}")))
}

/// Validate a handoff request between two agents.
///
/// Input: JSON-encoded `HandoffRequest`
/// Output: JSON-encoded `HandoffDecision`
#[cfg(feature = "cloud")]
#[wasm_bindgen]
pub fn validate_agentic_handoff(request_json: &str) -> Result<String, JsValue> {
    use crate::agentic::prelude::*;

    let req: agentic::types::HandoffRequest = serde_json::from_str(request_json)
        .map_err(|e| crate::error::js_val(&format!("invalid HandoffRequest JSON: {e}")))?;

    let validator = DefaultHandoffValidator;
    let decision = validator
        .validate_handoff(&req)
        .map_err(|e| crate::error::js_val(&format!("validate_handoff failed: {e}")))?;

    serde_json::to_string(&decision)
        .map_err(|e| crate::error::js_val(&format!("serialization failed: {e}")))
}

/// Evaluate counterfactual action options for a task using the RL reward model.
///
/// Input: JSON-encoded `TaskContext`
/// Output: JSON-encoded `CounterfactualResult` — ranked action options with
///         estimated rewards from the RL orchestrator.
#[cfg(feature = "cloud")]
#[wasm_bindgen]
pub fn evaluate_agentic_counterfactuals(task_json: &str) -> Result<String, JsValue> {
    use crate::agentic::prelude::*;

    let task: agentic::types::TaskContext = serde_json::from_str(task_json)
        .map_err(|e| crate::error::js_val(&format!("invalid TaskContext JSON: {e}")))?;

    let evaluator = DefaultCounterfactualEvaluator;
    let result = evaluator
        .evaluate_options(&task)
        .map_err(|e| crate::error::js_val(&format!("evaluate_options failed: {e}")))?;

    serde_json::to_string(&result)
        .map_err(|e| crate::error::js_val(&format!("serialization failed: {e}")))
}

/// Run a JTBD (Jobs-to-be-Done) test suite against the agentic framework.
///
/// Accepts a JSON array of `JtbdCase` objects and returns a JSON array of
/// `JtbdResult` objects, each containing per-assertion pass/fail details.
///
/// Input: JSON-encoded `JtbdCase[]`
/// Output: JSON-encoded `{ passed: number, failed: number, results: JtbdResult[] }`
#[cfg(feature = "cloud")]
#[wasm_bindgen]
pub fn run_agentic_jtbd_suite(cases_json: &str) -> Result<String, JsValue> {
    use crate::agentic::prelude::*;

    let cases: Vec<agentic::types::JtbdCase> = serde_json::from_str(cases_json)
        .map_err(|e| crate::error::js_val(&format!("invalid JtbdCase[] JSON: {e}")))?;

    let runner = DefaultJtbdRunner;
    let results = runner
        .run_suite(&cases)
        .map_err(|e| crate::error::js_val(&format!("run_suite failed: {e}")))?;

    let passed = results.iter().filter(|r| r.passed).count();
    let failed = results.len() - passed;

    let output = serde_json::json!({
        "passed": passed,
        "failed": failed,
        "results": results,
    });

    serde_json::to_string(&output)
        .map_err(|e| crate::error::js_val(&format!("serialization failed: {e}")))
}

#[cfg(feature = "cloud")]
#[wasm_bindgen]
pub fn truex_verify_receipt(envelope_json: &str) -> Result<String, JsValue> {
    let envelope: serde_json::Value = serde_json::from_str(envelope_json)
        .map_err(|e| crate::error::js_val(&format!("Invalid JSON: {e}")))?;

    // Use ReceiptDoctor to audit the receipt envelope
    let report = crate::receipt::ReceiptDoctor::audit(&envelope);

    let status = match report.state {
        crate::receipt::ReceiptDoctorState::Admitted => "ReceiptAdmitted",
        crate::receipt::ReceiptDoctorState::Refused => "ReceiptRefused",
    };

    let batch = ""; // Batch hashing not yet integrated into WASM entry point
    let receipt = ""; // Receipt root hashing not yet integrated into WASM entry point

    let out = serde_json::json!({
        "status": status,
        "admitted": report.admitted,
        "findings": report.findings,
        "equivalence_class": "EquivalentUnderProfileV1",
        "computed_batch_hash": batch,
        "computed_receipt_hash": receipt
    });

    Ok(serde_json::to_string(&out).unwrap())
}

#[cfg(feature = "ocel")]
#[wasm_bindgen]
pub fn evaluate_ocpq(ocel_json: &str, query_str: &str) -> Result<String, JsValue> {
    let ocel: crate::models::OCEL = serde_json::from_str(ocel_json)
        .map_err(|e| crate::error::js_val(&format!("Invalid OCEL JSON: {e}")))?;

    let query = ocpq_parser::parse(query_str)
        .map_err(|e| crate::error::js_val(&format!("OCPQ Parse Error: {e}")))?;

    let verdict = ocpq_runtime::evaluate(&ocel, &query);

    serde_json::to_string(&verdict)
        .map_err(|e| crate::error::js_val(&format!("Serialization failed: {e}")))
}
#[cfg(feature = "feature-gall")]
pub mod gall;
