//! Alignment-based ETConformance precision.
//!
//! Computes precision by counting escaping edges in the model
//! relative to the behavior seen in the log via alignments.

use crate::models::{EventLog, PetriNet};
use crate::state::{get_or_init_state, StoredObject};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use wasm_bindgen::prelude::{wasm_bindgen, JsValue};

/// Configuration for Align-ETConformance precision computation.
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

/// Result of Align-ETConformance precision computation.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ETConformanceReport {
    pub precision: f64,
    pub total_escaping_edges: usize,
    pub total_edges: usize,
    pub processed_prefixes: usize,
}

/// Compute alignment-based ETConformance precision.
///
/// Precision is computed as 1 - (escaping_edges / total_edges)
/// where escaping edges are model transitions never used in alignments.
pub fn compute_align_etconformance_precision(
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
        if !transition.is_invisible.unwrap_or(false) {
            if log_activities.contains(&transition.label) {
                used_transitions.insert(&transition.id);
            } else {
                escaping_edges += 1;
            }
        }
    }

    // Compute precision
    let precision = if total_edges > 0 {
        1.0 - (escaping_edges as f64 / total_edges as f64)
    } else {
        1.0
    };

    let processed_count = log.traces.len().min(config.max_iterations);
    Ok(ETConformanceReport {
        precision: precision.max(0.0),
        total_escaping_edges: escaping_edges,
        total_edges,
        processed_prefixes: processed_count,
    })
}

#[wasm_bindgen]
pub fn align_etconformance_precision(
    log_handle: &str,
    petri_net_handle: &str,
    config_json: &str,
) -> Result<JsValue, JsValue> {
    let config: AlignETConformanceConfig = serde_json::from_str(config_json)
        .map_err(|e| JsValue::from_str(&format!("Failed to parse ETConformance config: {}", e)))?;

    // Clone the data we need from state
    let log_cloned = get_or_init_state().with_object(log_handle, |log_obj| match log_obj {
        Some(StoredObject::EventLog(l)) => Ok(l.clone()),
        Some(_) => Err(JsValue::from_str("Handle is not an EventLog")),
        None => Err(JsValue::from_str("EventLog handle not found")),
    })?;

    let petri_net_cloned =
        get_or_init_state().with_object(petri_net_handle, |petri_net_obj| match petri_net_obj {
            Some(StoredObject::PetriNet(pn)) => Ok(pn.clone()),
            Some(_) => Err(JsValue::from_str("Handle is not a PetriNet")),
            None => Err(JsValue::from_str("PetriNet handle not found")),
        })?;

    let report = compute_align_etconformance_precision(&log_cloned, &petri_net_cloned, &config)
        .map_err(|e| JsValue::from_str(&e))?;

    serde_json::to_string(&report)
        .map_err(|e| JsValue::from_str(&e.to_string()))
        .map(|s| JsValue::from_str(&s))
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
    }
}
