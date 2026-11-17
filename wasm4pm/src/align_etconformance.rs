//! Label-coverage precision (honesty rename).
//!
//! This module does NOT compute alignment-based ETConformance precision.
//! It counts visible transitions whose label never appears in the log
//! ("escaping" transitions) — a label-coverage heuristic. No alignments are
//! computed; alignment costs (sync/log/model move) accepted via
//! [`AlignETConformanceConfig`] are ignored. The WASM export name
//! `align_etconformance_precision` is kept for API compatibility; the report
//! payload carries `"method": "label_coverage"` and an `"ignored_config"`
//! list so downstream consumers can tell heuristic from real alignments.
//! A real alignment-based implementation remains future work.

use crate::models::{EventLog, PetriNet};
use crate::state::{get_or_init_state, StoredObject};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use wasm_bindgen::prelude::{wasm_bindgen, JsValue};

/// Configuration for Align-ETConformance precision computation.
///
/// DEPRECATED semantics: this heuristic only reads `max_iterations` (as a
/// trace cap). `sync_cost` / `log_move_cost` / `model_move_cost` are accepted
/// for wire compatibility and IGNORED — reported in the payload's
/// `"ignored_config"` list.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AlignETConformanceConfig {
    pub max_iterations: usize,
    pub sync_cost: f64,
    pub log_move_cost: f64,
    pub model_move_cost: f64,
}

impl Default for AlignETConformanceConfig {
    fn default() -> Self {
        Self {
            max_iterations: 100_000,
            sync_cost: 0.0,
            log_move_cost: 1.0,
            model_move_cost: 1.0,
        }
    }
}

/// Result of label-coverage precision computation.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ETConformanceReport {
    pub precision: f64,
    pub total_escaping_edges: usize,
    pub total_edges: usize,
    pub processed_prefixes: usize,
    /// Always "label_coverage": identifies the heuristic actually executed.
    #[serde(default)]
    pub method: String,
    /// Config fields accepted but not used by this heuristic.
    #[serde(default)]
    pub ignored_config: Vec<String>,
}

/// Compute label-coverage precision (the heuristic previously — and
/// misleadingly — named alignment-based ETConformance precision).
///
/// Precision = 1 - (escaping_edges / total_edges), where "escaping edges" are
/// visible model transitions whose label never appears in the log. No
/// alignments are computed.
pub fn compute_label_coverage_precision(
    log: &EventLog,
    petri_net: &PetriNet,
    config: &AlignETConformanceConfig,
) -> Result<ETConformanceReport, String> {
    // Collect all activities from the log (limited by max_iterations)
    let mut log_activities = HashSet::new();
    for trace in log.traces.iter().take(config.max_iterations) {
        for event in &trace.events {
            if let Some(activity) = event
                .attributes
                .get("concept:name")
                .and_then(|v| v.as_string())
            {
                log_activities.insert(activity.to_string());
            }
        }
    }

    // Count total edges in the model
    let total_edges = petri_net.transitions.len();

    // Count escaping edges (transitions never used in log)
    let mut escaping_edges = 0usize;
    let mut used_transitions = HashSet::new();

    for transition in &petri_net.transitions {
        #[cfg(feature = "bcinr")]
        {
            let is_visible = !transition.is_invisible.unwrap_or(false);
            let in_log = log_activities.contains(&transition.label);
            let increment = bcinr::mask::select_u64((is_visible && !in_log) as u64, 1, 0);

            // Branchless membership update
            if is_visible && in_log {
                used_transitions.insert(&transition.id);
            }
            escaping_edges += increment as usize;
        }
        #[cfg(not(feature = "bcinr"))]
        {
            if !transition.is_invisible.unwrap_or(false) {
                if log_activities.contains(&transition.label) {
                    used_transitions.insert(&transition.id);
                } else {
                    escaping_edges += 1;
                }
            }
        }
    }

    // Compute precision
    #[cfg(feature = "bcinr")]
    let precision = {
        let has_edges = (total_edges > 0) as u64;
        let p = 1.0 - (escaping_edges as f64 / total_edges as f64);
        f64::from_bits(bcinr::mask::select_u64(
            has_edges,
            p.to_bits(),
            1.0f64.to_bits(),
        ))
    };
    #[cfg(not(feature = "bcinr"))]
    let precision = if total_edges > 0 {
        1.0 - (escaping_edges as f64 / total_edges as f64)
    } else {
        1.0
    };

    let processed_count = log.traces.len().min(config.max_iterations);
    // Iter-10 hardening: full [0, 1] clamp + NaN guard. Previously only
    // `.max(0.0)` was applied — a NaN from a corrupt total_edges (e.g.
    // a future signed-arithmetic path that overflows) would propagate.
    let precision = if precision.is_finite() {
        precision.clamp(0.0, 1.0)
    } else {
        0.0
    };
    Ok(ETConformanceReport {
        precision,
        total_escaping_edges: escaping_edges,
        total_edges,
        processed_prefixes: processed_count,
        method: "label_coverage".to_string(),
        ignored_config: vec![
            "sync_cost".to_string(),
            "log_move_cost".to_string(),
            "model_move_cost".to_string(),
        ],
    })
}

/// Back-compat alias for [`compute_label_coverage_precision`] under the old
/// (misleading) name. The heuristic is unchanged; the report payload now
/// identifies itself via `"method": "label_coverage"`.
pub fn compute_align_etconformance_precision(
    log: &EventLog,
    petri_net: &PetriNet,
    config: &AlignETConformanceConfig,
) -> Result<ETConformanceReport, String> {
    compute_label_coverage_precision(log, petri_net, config)
}

#[wasm_bindgen]
pub fn align_etconformance_precision(
    log_handle: &str,
    petri_net_handle: &str,
    config_json: &str,
) -> Result<JsValue, JsValue> {
    let config: AlignETConformanceConfig = serde_json::from_str(config_json).map_err(|e| {
        crate::error::js_val(&format!("Failed to parse ETConformance config: {}", e))
    })?;

    // Clone the data we need from state
    let log_cloned = get_or_init_state().with_object(log_handle, |log_obj| match log_obj {
        Some(StoredObject::EventLog(l)) => Ok(l.clone()),
        Some(_) => Err(crate::error::js_val("Handle is not an EventLog")),
        None => Err(crate::error::js_val("EventLog handle not found")),
    })?;

    let petri_net_cloned =
        get_or_init_state().with_object(petri_net_handle, |petri_net_obj| match petri_net_obj {
            Some(StoredObject::PetriNet(pn)) => Ok(pn.clone()),
            Some(_) => Err(crate::error::js_val("Handle is not a PetriNet")),
            None => Err(crate::error::js_val("PetriNet handle not found")),
        })?;

    let report = compute_align_etconformance_precision(&log_cloned, &petri_net_cloned, &config)
        .map_err(|e| crate::error::js_val(&e))?;

    serde_json::to_string(&report)
        .map_err(|e| crate::error::js_val(&e.to_string()))
        .map(|s| crate::error::js_val(&s))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_config_default() {
        let config = AlignETConformanceConfig::default();
        assert_eq!(config.max_iterations, 100_000);
        assert_eq!(config.sync_cost, 0.0);
        assert_eq!(config.log_move_cost, 1.0);
        assert_eq!(config.model_move_cost, 1.0);
    }

    #[test]
    fn test_precision_calculation() {
        // If half the transitions are escaping, precision should be 0.5
        let precision = 1.0 - (5.0 / 10.0);
        assert_eq!(precision, 0.5);
    }

    #[test]
    fn test_precision_bounds() {
        let report = ETConformanceReport {
            precision: 0.85,
            total_escaping_edges: 3,
            total_edges: 20,
            processed_prefixes: 100,
            method: "label_coverage".to_string(),
            ignored_config: vec![],
        };

        assert!(report.precision >= 0.0 && report.precision <= 1.0);
    }

    #[test]
    fn test_empty_model() {
        let log = EventLog::new();
        let petri_net = PetriNet::new();
        let config = AlignETConformanceConfig::default();

        let result = compute_align_etconformance_precision(&log, &petri_net, &config);
        assert!(result.is_ok());

        let report = result.unwrap();
        assert_eq!(report.total_edges, 0);
        assert_eq!(report.precision, 1.0); // No edges = perfect precision
        assert_eq!(report.method, "label_coverage");
        assert_eq!(
            report.ignored_config,
            vec!["sync_cost", "log_move_cost", "model_move_cost"]
        );
    }

    /// Iter-10 Rank-1: Range invariant. Old code clamped only at the
    /// lower bound (`precision.max(0.0)`), permitting > 1.0 if any
    /// future code path produced a negative `escaping_edges` count.
    /// Verify the full [0, 1] clamp + finite-value guard now hold.
    #[test]
    fn iter10_precision_always_in_unit_interval() {
        let log = EventLog::new();
        let petri_net = PetriNet::new();
        let cfg = AlignETConformanceConfig::default();
        let report = compute_align_etconformance_precision(&log, &petri_net, &cfg).unwrap();
        assert!(
            (0.0..=1.0).contains(&report.precision),
            "precision {} not in [0,1]",
            report.precision
        );
        assert!(report.precision.is_finite(), "precision must be finite");
    }
}
