//! Synchronous streaming pipeline for multi-algorithm event processing.
//!
//! Feeds each event to multiple streaming algorithms simultaneously, providing
//! combined snapshots and bounded memory usage. Designed for WASM compatibility
//! (no async channels).
//!
//! # Architecture
//!
//! ```text
//! Event → [DFG Builder] → combined snapshot
//!       → [Skeleton Builder]
//!       → [Heuristic Builder]
//! ```
//!
//! # Memory Model
//!
//! Memory is O(open_traces × avg_length × num_algorithms). Each algorithm
//! maintains its own state independently. The pipeline coordinates event
//! delivery and provides unified snapshot/statistics access.

use serde::{Deserialize, Serialize};
use serde_json::json;
use wasm_bindgen::prelude::*;

use crate::models::DirectlyFollowsGraph;
use crate::state::{get_or_init_state, StoredObject};
use crate::streaming::{
    StreamingAlgorithm, StreamingDfgBuilder, StreamingHeuristicBuilder, StreamingSkeletonBuilder,
};

// ---------------------------------------------------------------------------
// Pipeline configuration
// ---------------------------------------------------------------------------

/// Which algorithms to include in the streaming pipeline.
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct PipelineConfig {
    pub include_dfg: bool,
    pub include_skeleton: bool,
    pub include_heuristic: bool,
}

impl Default for PipelineConfig {
    fn default() -> Self {
        Self {
            include_dfg: true,
            include_skeleton: true,
            include_heuristic: true,
        }
    }
}

impl PipelineConfig {
    /// Enable all algorithms.
    pub fn all() -> Self {
        Self::default()
    }

    /// Enable only DFG (fastest).
    pub fn dfg_only() -> Self {
        Self {
            include_dfg: true,
            include_skeleton: false,
            include_heuristic: false,
        }
    }

    /// Number of active algorithms.
    pub fn algorithm_count(&self) -> usize {
        self.include_dfg as usize + self.include_skeleton as usize + self.include_heuristic as usize
    }
}

// ---------------------------------------------------------------------------
// Pipeline state
// ---------------------------------------------------------------------------

/// Streaming pipeline that runs multiple algorithms on the same event stream.
///
/// Each event is fed to all active algorithms simultaneously. Snapshots
/// can be taken at any time without interrupting event processing.
#[derive(Clone)]
pub struct StreamingPipeline {
    config: PipelineConfig,
    dfg: Option<StreamingDfgBuilder>,
    skeleton: Option<StreamingSkeletonBuilder>,
    heuristic: Option<StreamingHeuristicBuilder>,
    total_events: usize,
    total_traces: usize,
    open_traces: usize,
}

impl StreamingPipeline {
    /// Create a new pipeline with the given configuration.
    pub fn new(config: PipelineConfig) -> Self {
        Self {
            dfg: if config.include_dfg {
                Some(StreamingDfgBuilder::new())
            } else {
                None
            },
            skeleton: if config.include_skeleton {
                Some(StreamingSkeletonBuilder::new())
            } else {
                None
            },
            heuristic: if config.include_heuristic {
                Some(StreamingHeuristicBuilder::new())
            } else {
                None
            },
            config,
            total_events: 0,
            total_traces: 0,
            open_traces: 0,
        }
    }

    /// Feed one event to all active algorithms.
    ///
    /// O(algorithm_count) per event — each algorithm processes independently.
    pub fn add_event(&mut self, case_id: &str, activity: &str) {
        self.total_events += 1;

        if let Some(ref mut dfg) = self.dfg {
            dfg.add_event(case_id, activity);
        }
        if let Some(ref mut skeleton) = self.skeleton {
            skeleton.add_event(case_id, activity);
        }
        if let Some(ref mut heuristic) = self.heuristic {
            heuristic.add_event(case_id, activity);
        }

        // Track open traces from DFG (it's always the most reliable counter)
        if let Some(ref dfg) = self.dfg {
            self.open_traces = dfg.open_traces.len();
        }
    }

    /// Close a trace across all active algorithms.
    pub fn close_trace(&mut self, case_id: &str) {
        self.total_traces += 1;

        if let Some(ref mut dfg) = self.dfg {
            dfg.close_trace(case_id);
        }
        if let Some(ref mut skeleton) = self.skeleton {
            skeleton.close_trace(case_id);
        }
        if let Some(ref mut heuristic) = self.heuristic {
            heuristic.close_trace(case_id);
        }

        if let Some(ref dfg) = self.dfg {
            self.open_traces = dfg.open_traces.len();
        }
    }

    /// Add a batch of events. Each event has `case_id` and `activity` fields.
    ///
    /// Returns the number of events successfully added.
    pub fn add_batch(&mut self, events: &[(String, String)]) -> usize {
        for (case_id, activity) in events {
            self.add_event(case_id, activity);
        }
        events.len()
    }

    /// Get pipeline statistics.
    pub fn stats(&self) -> PipelineStats {
        PipelineStats {
            total_events: self.total_events,
            total_traces: self.total_traces,
            open_traces: self.open_traces,
            active_algorithms: self.config.algorithm_count(),
            dfg_activities: self.dfg.as_ref().map(|d| d.interner.len()).unwrap_or(0),
            memory_estimate: self.estimate_memory(),
        }
    }

    /// Get DFG snapshot if DFG is active.
    pub fn dfg_snapshot(&self) -> Option<DirectlyFollowsGraph> {
        self.dfg.as_ref().map(|d| d.snapshot())
    }

    /// Get combined snapshot as JSON.
    pub fn snapshot_json(&self) -> serde_json::Value {
        let mut result = json!({
            "stats": self.stats(),
        });

        if let Some(dfg) = self.dfg.as_ref() {
            result["dfg"] = json!({
                "activities": dfg.interner.len(),
                "open_traces": dfg.open_traces.len(),
            });
        }

        if let Some(skeleton) = self.skeleton.as_ref() {
            result["skeleton"] = json!({
                "activities": skeleton.interner.len(),
            });
        }

        if let Some(heuristic) = self.heuristic.as_ref() {
            result["heuristic"] = json!({
                "activities": heuristic.interner.len(),
            });
        }

        result
    }

    /// Finalize all open traces and return final models.
    ///
    /// Note: `finalize()` takes ownership of `self` via the `StreamingAlgorithm`
    /// trait, so we use `take()` + `Option::map()` to handle each builder.
    pub fn finalize(&mut self) -> PipelineResult {
        // take() each builder, call finalize (which consumes), then replace with new
        let dfg_result = self.dfg.take().map(|d| {
            let result = d.finalize();
            self.dfg = Some(StreamingDfgBuilder::new());
            result
        });
        let skeleton_result = self.skeleton.take().map(|s| {
            let result = s.finalize();
            self.skeleton = Some(StreamingSkeletonBuilder::new());
            result
        });
        let heuristic_result = self.heuristic.take().map(|h| {
            let result = h.finalize();
            self.heuristic = Some(StreamingHeuristicBuilder::new());
            result
        });

        PipelineResult {
            dfg: dfg_result,
            skeleton: skeleton_result,
            heuristic: heuristic_result,
            total_events: self.total_events,
            total_traces: self.total_traces,
        }
    }

    /// Reset the pipeline to empty state.
    pub fn clear(&mut self) {
        if let Some(ref mut dfg) = self.dfg {
            *dfg = StreamingDfgBuilder::new();
        }
        if let Some(ref mut skeleton) = self.skeleton {
            *skeleton = StreamingSkeletonBuilder::new();
        }
        if let Some(ref mut heuristic) = self.heuristic {
            *heuristic = StreamingHeuristicBuilder::new();
        }
        self.total_events = 0;
        self.total_traces = 0;
        self.open_traces = 0;
    }

    /// Rough memory estimate in bytes.
    fn estimate_memory(&self) -> usize {
        let mut bytes = std::mem::size_of::<Self>();
        if let Some(ref dfg) = self.dfg {
            bytes += std::mem::size_of::<StreamingDfgBuilder>();
            bytes += dfg.open_traces.len() * 200; // ~200 bytes per open trace
            bytes += dfg.interner.len() * 50; // ~50 bytes per activity
        }
        bytes
    }
}

// ---------------------------------------------------------------------------
// Pipeline statistics
// ---------------------------------------------------------------------------

/// Statistics from the streaming pipeline.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PipelineStats {
    pub total_events: usize,
    pub total_traces: usize,
    pub open_traces: usize,
    pub active_algorithms: usize,
    pub dfg_activities: usize,
    pub memory_estimate: usize,
}

/// Final results from the streaming pipeline after finalization.
#[derive(Debug, Clone)]
pub struct PipelineResult {
    pub dfg: Option<DirectlyFollowsGraph>,
    pub skeleton: Option<DirectlyFollowsGraph>,
    pub heuristic: Option<DirectlyFollowsGraph>,
    pub total_events: usize,
    pub total_traces: usize,
}

// ---------------------------------------------------------------------------
// WASM bindings
// ---------------------------------------------------------------------------

/// Begin a new streaming pipeline session.
///
/// `config_json` is a JSON object with boolean fields:
/// - `include_dfg` (default: true)
/// - `include_skeleton` (default: true)
/// - `include_heuristic` (default: true)
#[wasm_bindgen]
pub fn pipeline_begin(config_json: &str) -> Result<String, JsValue> {
    let config: PipelineConfig = if config_json.is_empty() {
        PipelineConfig::default()
    } else {
        serde_json::from_str(config_json)
            .map_err(|e| JsValue::from_str(&format!("Invalid config JSON: {}", e)))?
    };

    let pipeline = StreamingPipeline::new(config);
    let handle = get_or_init_state().store_object(StoredObject::StreamingPipeline(pipeline))?;

    let info = serde_json::to_string(&json!({
        "handle": handle,
        "active_algorithms": config.algorithm_count(),
        "include_dfg": config.include_dfg,
        "include_skeleton": config.include_skeleton,
        "include_heuristic": config.include_heuristic,
    }))
    .map_err(|e| JsValue::from_str(&e.to_string()))?;

    Ok(info)
}

/// Feed one event to the pipeline.
#[wasm_bindgen]
pub fn pipeline_add_event(handle: &str, case_id: &str, activity: &str) -> Result<JsValue, JsValue> {
    get_or_init_state().with_object_mut(handle, |obj| match obj {
        Some(StoredObject::StreamingPipeline(pipeline)) => {
            pipeline.add_event(case_id, activity);
            serde_wasm_bindgen::to_value(&json!({
                "ok": true,
                "total_events": pipeline.total_events,
                "open_traces": pipeline.open_traces,
            }))
            .map_err(|e| JsValue::from_str(&e.to_string()))
        }
        Some(_) => Err(JsValue::from_str("Object is not a StreamingPipeline")),
        None => Err(JsValue::from_str(&format!(
            "Pipeline '{}' not found",
            handle
        ))),
    })
}

/// Close a trace in the pipeline.
#[wasm_bindgen]
pub fn pipeline_close_trace(handle: &str, case_id: &str) -> Result<JsValue, JsValue> {
    get_or_init_state().with_object_mut(handle, |obj| match obj {
        Some(StoredObject::StreamingPipeline(pipeline)) => {
            pipeline.close_trace(case_id);
            serde_wasm_bindgen::to_value(&json!({
                "ok": true,
                "total_traces": pipeline.total_traces,
                "open_traces": pipeline.open_traces,
            }))
            .map_err(|e| JsValue::from_str(&e.to_string()))
        }
        Some(_) => Err(JsValue::from_str("Object is not a StreamingPipeline")),
        None => Err(JsValue::from_str(&format!(
            "Pipeline '{}' not found",
            handle
        ))),
    })
}

/// Get pipeline statistics.
#[wasm_bindgen]
pub fn pipeline_stats(handle: &str) -> Result<JsValue, JsValue> {
    get_or_init_state().with_object(handle, |obj| match obj {
        Some(StoredObject::StreamingPipeline(pipeline)) => {
            let stats = pipeline.stats();
            serde_wasm_bindgen::to_value(&stats).map_err(|e| JsValue::from_str(&e.to_string()))
        }
        Some(_) => Err(JsValue::from_str("Object is not a StreamingPipeline")),
        None => Err(JsValue::from_str(&format!(
            "Pipeline '{}' not found",
            handle
        ))),
    })
}

/// Get combined snapshot from all active algorithms.
#[wasm_bindgen]
pub fn pipeline_snapshot(handle: &str) -> Result<JsValue, JsValue> {
    get_or_init_state().with_object(handle, |obj| match obj {
        Some(StoredObject::StreamingPipeline(pipeline)) => {
            let snapshot = pipeline.snapshot_json();
            serde_wasm_bindgen::to_value(&snapshot).map_err(|e| JsValue::from_str(&e.to_string()))
        }
        Some(_) => Err(JsValue::from_str("Object is not a StreamingPipeline")),
        None => Err(JsValue::from_str(&format!(
            "Pipeline '{}' not found",
            handle
        ))),
    })
}

/// Finalize all open traces and return final models.
#[wasm_bindgen]
pub fn pipeline_finalize(handle: &str) -> Result<JsValue, JsValue> {
    get_or_init_state().with_object_mut(handle, |obj| match obj {
        Some(StoredObject::StreamingPipeline(pipeline)) => {
            let result = pipeline.finalize();
            serde_wasm_bindgen::to_value(&json!({
                "ok": true,
                "total_events": result.total_events,
                "total_traces": result.total_traces,
                "dfg": result.dfg.is_some(),
                "skeleton": result.skeleton.is_some(),
                "heuristic": result.heuristic.is_some(),
            }))
            .map_err(|e| JsValue::from_str(&e.to_string()))
        }
        Some(_) => Err(JsValue::from_str("Object is not a StreamingPipeline")),
        None => Err(JsValue::from_str(&format!(
            "Pipeline '{}' not found",
            handle
        ))),
    })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_events() -> Vec<(String, String)> {
        vec![
            ("case1".to_string(), "A".to_string()),
            ("case1".to_string(), "B".to_string()),
            ("case1".to_string(), "C".to_string()),
            ("case2".to_string(), "A".to_string()),
            ("case2".to_string(), "B".to_string()),
            ("case3".to_string(), "A".to_string()),
            ("case3".to_string(), "C".to_string()),
        ]
    }

    #[test]
    fn test_pipeline_config_default() {
        let config = PipelineConfig::default();
        assert!(config.include_dfg);
        assert!(config.include_skeleton);
        assert!(config.include_heuristic);
        assert_eq!(config.algorithm_count(), 3);
    }

    #[test]
    fn test_pipeline_config_dfg_only() {
        let config = PipelineConfig::dfg_only();
        assert!(config.include_dfg);
        assert!(!config.include_skeleton);
        assert!(!config.include_heuristic);
        assert_eq!(config.algorithm_count(), 1);
    }

    #[test]
    fn test_pipeline_add_events() {
        let mut pipeline = StreamingPipeline::new(PipelineConfig::all());
        let events = sample_events();

        for (case_id, activity) in &events {
            pipeline.add_event(case_id, activity);
        }

        assert_eq!(pipeline.total_events, 7);
        assert_eq!(pipeline.open_traces, 3); // 3 open traces
    }

    #[test]
    fn test_pipeline_close_traces() {
        let mut pipeline = StreamingPipeline::new(PipelineConfig::all());

        pipeline.add_event("case1", "A");
        pipeline.add_event("case1", "B");
        pipeline.close_trace("case1");

        assert_eq!(pipeline.total_events, 2);
        assert_eq!(pipeline.total_traces, 1);
        assert_eq!(pipeline.open_traces, 0);
    }

    #[test]
    fn test_pipeline_add_batch() {
        let mut pipeline = StreamingPipeline::new(PipelineConfig::all());
        let events = sample_events();
        let added = pipeline.add_batch(&events);

        assert_eq!(added, 7);
        assert_eq!(pipeline.total_events, 7);
    }

    #[test]
    fn test_pipeline_stats() {
        let mut pipeline = StreamingPipeline::new(PipelineConfig::all());
        pipeline.add_event("case1", "A");
        pipeline.add_event("case1", "B");

        let stats = pipeline.stats();
        assert_eq!(stats.total_events, 2);
        assert_eq!(stats.total_traces, 0);
        assert_eq!(stats.active_algorithms, 3);
    }

    #[test]
    fn test_pipeline_dfg_only() {
        let mut pipeline = StreamingPipeline::new(PipelineConfig::dfg_only());
        pipeline.add_event("case1", "A");
        pipeline.add_event("case1", "B");
        pipeline.close_trace("case1");

        let dfg = pipeline.dfg_snapshot();
        assert!(dfg.is_some());
        let dfg = dfg.unwrap();
        // Should have at least the A→B edge
        assert!(!dfg.edges.is_empty());
    }

    #[test]
    fn test_pipeline_snapshot_json() {
        let mut pipeline = StreamingPipeline::new(PipelineConfig::all());
        pipeline.add_event("case1", "A");
        pipeline.add_event("case2", "B");

        let snapshot = pipeline.snapshot_json();
        assert_eq!(snapshot["stats"]["total_events"], 2);
        assert!(snapshot.get("dfg").is_some());
        assert!(snapshot.get("skeleton").is_some());
        assert!(snapshot.get("heuristic").is_some());
    }

    #[test]
    fn test_pipeline_finalize() {
        let mut pipeline = StreamingPipeline::new(PipelineConfig::all());
        let events = sample_events();
        for (case_id, activity) in &events {
            pipeline.add_event(case_id, activity);
        }
        pipeline.close_trace("case1");
        pipeline.close_trace("case2");
        pipeline.close_trace("case3");

        let result = pipeline.finalize();
        assert_eq!(result.total_events, 7);
        assert_eq!(result.total_traces, 3);
        assert!(result.dfg.is_some());
    }

    #[test]
    fn test_pipeline_clear() {
        let mut pipeline = StreamingPipeline::new(PipelineConfig::all());
        pipeline.add_event("case1", "A");
        pipeline.add_event("case1", "B");
        pipeline.close_trace("case1");

        assert!(pipeline.total_events > 0);

        pipeline.clear();
        assert_eq!(pipeline.total_events, 0);
        assert_eq!(pipeline.total_traces, 0);
        assert_eq!(pipeline.open_traces, 0);
    }

    #[test]
    fn test_pipeline_memory_estimate() {
        let config = PipelineConfig::all();
        let pipeline = StreamingPipeline::new(config);
        let stats = pipeline.stats();
        assert!(stats.memory_estimate > 0);
    }

    #[test]
    fn test_pipeline_empty() {
        let pipeline = StreamingPipeline::new(PipelineConfig::all());
        assert_eq!(pipeline.total_events, 0);
        assert_eq!(pipeline.total_traces, 0);
        assert_eq!(pipeline.open_traces, 0);
        assert!(pipeline.dfg_snapshot().is_some());
    }
}
