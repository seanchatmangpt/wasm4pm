//! Pipeline metrics collection for the Closed Claw Constitution.

use std::collections::BTreeMap;

/// Metrics collected per benchmark run.
#[derive(Debug, Clone)]
pub struct PipelineMetrics {
    pub pipeline_class: String,
    pub algorithm: String,
    pub dataset_size: usize,
    pub total_events: usize,
    pub latency_p50_us: u64,
    pub latency_p95_us: u64,
    pub latency_p99_us: u64,
    pub throughput_events_per_sec: f64,
    pub memory_peak_bytes: u64,
    pub output_hash: String,
    pub deterministic: bool,
    pub fitness: Option<f64>,
    pub precision: Option<f64>,
    pub stage_timings_us: BTreeMap<String, u64>,
}

impl PipelineMetrics {
    /// Create a new metrics record with required fields.
    pub fn new(
        pipeline_class: &str,
        algorithm: &str,
        dataset_size: usize,
        total_events: usize,
    ) -> Self {
        Self {
            pipeline_class: pipeline_class.to_string(),
            algorithm: algorithm.to_string(),
            dataset_size,
            total_events,
            latency_p50_us: 0,
            latency_p95_us: 0,
            latency_p99_us: 0,
            throughput_events_per_sec: 0.0,
            memory_peak_bytes: 0,
            output_hash: String::new(),
            deterministic: false,
            fitness: None,
            precision: None,
            stage_timings_us: BTreeMap::new(),
        }
    }
}
