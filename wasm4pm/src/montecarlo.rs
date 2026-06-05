//! Monte Carlo discrete-event simulation for process models.
//!
//! Simulates case execution with stochastic service times and inter-arrival times
//! to estimate process performance metrics.

use crate::models::EventLog;
use crate::state::get_or_init_state;
use rand::prelude::*;
use rand_distr::LogNormal;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use wasm_bindgen::prelude::{wasm_bindgen, JsValue};

/// Configuration for Monte Carlo simulation.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct MonteCarloConfig {
    pub num_cases: usize,
    pub inter_arrival_mean_ms: f64,
    pub activity_service_time_ms: HashMap<String, LogNormalParams>,
    pub resource_capacity: HashMap<String, usize>,
    pub simulation_time_ms: u64,
    pub random_seed: u64,
}

impl Default for MonteCarloConfig {
    fn default() -> Self {
        Self {
            num_cases: 100,
            inter_arrival_mean_ms: 1000.0,
            activity_service_time_ms: HashMap::new(),
            resource_capacity: HashMap::new(),
            simulation_time_ms: 60000,
            random_seed: 42,
        }
    }
}

/// Log-normal distribution parameters for activity service times.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct LogNormalParams {
    pub mean: f64,
    pub std_dev: f64,
}

/// Result of Monte Carlo simulation.
///
/// Distribution statistics (P5/P50/P95/std) are computed over per-case sojourn times
/// collected during the simulation loop and sorted at the end.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct MonteCarloReport {
    pub completed_cases: usize,
    pub total_sojourn_time_ms: f64,
    pub total_waiting_time_ms: f64,
    pub total_service_time_ms: f64,
    /// Mean case sojourn time in ms (total_sojourn / completed_cases).
    pub avg_sojourn_time_ms: f64,
    /// Mean trace length in activities per case.
    pub avg_trace_length: f64,
    /// Sample standard deviation of per-case sojourn times in ms (n-1 denominator).
    pub sojourn_time_std_ms: f64,
    /// 5th percentile of per-case sojourn times in ms.
    pub sojourn_time_p5_ms: f64,
    /// 50th percentile (median) of per-case sojourn times in ms.
    pub sojourn_time_p50_ms: f64,
    /// 95th percentile of per-case sojourn times in ms.
    pub sojourn_time_p95_ms: f64,
    pub activity_statistics: HashMap<String, ActivityStats>,
    pub resource_utilization: HashMap<String, f64>,
}

/// Statistics for a single activity.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ActivityStats {
    pub executions: usize,
    pub avg_service_time_ms: f64,
    pub avg_waiting_time_ms: f64,
    /// Internal accumulator for total service time (not serialized)
    #[serde(skip)]
    total_service_time_ms: f64,
    /// Internal accumulator for total waiting time (not serialized)
    #[serde(skip)]
    total_waiting_time_ms: f64,
}

/// Resource pool state.
struct ResourcePool {
    capacity: usize,
    busy: usize,
    total_busy_time_ms: f64,
    last_update_ms: f64,
}

impl ResourcePool {
    fn new(capacity: usize) -> Self {
        Self {
            capacity,
            busy: 0,
            total_busy_time_ms: 0.0,
            last_update_ms: 0.0,
        }
    }

    fn update(&mut self, current_time_ms: f64) {
        let elapsed = current_time_ms - self.last_update_ms;
        self.total_busy_time_ms += self.busy as f64 * elapsed;
        self.last_update_ms = current_time_ms;
    }

    fn acquire(&mut self) -> bool {
        if self.busy < self.capacity {
            self.busy += 1;
            true
        } else {
            false
        }
    }

    fn release(&mut self) {
        self.busy = self.busy.saturating_sub(1);
    }

    fn utilization(&self, total_time_ms: f64) -> f64 {
        if total_time_ms > 0.0 {
            self.total_busy_time_ms / (self.capacity as f64 * total_time_ms)
        } else {
            0.0
        }
    }
}

/// Compute percentile of an already-sorted slice via linear interpolation.
/// `p` is in [0, 100].
fn percentile_sorted(sorted: &[f64], p: f64) -> f64 {
    if sorted.is_empty() {
        return 0.0;
    }
    if sorted.len() == 1 {
        return sorted[0];
    }
    let rank = p / 100.0 * (sorted.len() - 1) as f64;
    let lo = rank.floor() as usize;
    let hi = (lo + 1).min(sorted.len() - 1);
    let frac = rank - lo as f64;
    sorted[lo] * (1.0 - frac) + sorted[hi] * frac
}

/// Run Monte Carlo simulation.
pub fn run_monte_carlo_simulation(
    log: &EventLog,
    _config: &MonteCarloConfig,
) -> Result<MonteCarloReport, String> {
    let mut rng = StdRng::seed_from_u64(_config.random_seed);

    // Statistics
    let completed_cases = log.traces.len().min(_config.num_cases);
    let mut total_sojourn_time_ms = 0.0f64;
    let mut total_waiting_time_ms = 0.0f64;
    let mut total_service_time_ms = 0.0f64;
    // Collect per-case sojourn times so we can compute P5/P50/P95/std after the loop.
    let mut per_case_sojourn_ms: Vec<f64> = Vec::with_capacity(completed_cases);
    let mut total_trace_length: usize = 0;
    let mut activity_stats: HashMap<String, ActivityStats> = HashMap::new();
    let mut resource_pools: HashMap<String, ResourcePool> = _config
        .resource_capacity
        .iter()
        .map(|(r, &c)| (r.clone(), ResourcePool::new(c)))
        .collect();

    // Extract activities from log
    let traces: Vec<Vec<String>> = log
        .traces
        .iter()
        .map(|trace| {
            trace
                .events
                .iter()
                .filter_map(|event| {
                    event
                        .attributes
                        .get("concept:name")
                        .and_then(|v| v.as_string())
                        .map(|s| s.to_string())
                })
                .collect()
        })
        .collect();

    // Simulate each trace
    let mut current_time_ms = 0.0f64;
    let inter_arrival_lambda = 1.0 / _config.inter_arrival_mean_ms;

    for (case_idx, trace) in traces.iter().take(completed_cases).enumerate() {
        if trace.is_empty() {
            continue;
        }

        let case_start_time = current_time_ms;
        let mut trace_service_time = 0.0f64;
        let mut trace_wait_time = 0.0f64;

        // Update resource pools
        for pool in resource_pools.values_mut() {
            pool.update(current_time_ms);
        }

        // Simulate each activity in the trace
        for activity in trace {
            // Get service time parameters
            let service_params = _config
                .activity_service_time_ms
                .get(activity)
                .cloned()
                .unwrap_or(LogNormalParams {
                    mean: 100.0,
                    std_dev: 20.0,
                });

            // Sample service time from log-normal distribution
            let service_time_ms =
                sample_log_normal(&mut rng, service_params.mean, service_params.std_dev).map_err(
                    |e| {
                        format!(
                            "Failed to sample service time for activity {}: {}",
                            activity, e
                        )
                    },
                )?;

            // Check resource availability
            let resource_key = format!("{}_resource", activity);

            let mut waiting = 0.0;
            if let Some(pool) = resource_pools.get_mut(&resource_key) {
                if !pool.acquire() {
                    // Resource busy — use the activity's mean service time as a wait proxy
                    waiting = service_params.mean;
                    trace_wait_time += waiting;
                }
            }

            // Execute activity
            trace_service_time += service_time_ms;

            // Release resource
            if let Some(pool) = resource_pools.get_mut(&resource_key) {
                pool.release();
            }

            // Update activity statistics with actual accumulated values
            let stats = activity_stats
                .entry(activity.clone())
                .or_insert_with(|| ActivityStats {
                    executions: 0,
                    avg_service_time_ms: 0.0,
                    avg_waiting_time_ms: 0.0,
                    total_service_time_ms: 0.0,
                    total_waiting_time_ms: 0.0,
                });
            stats.executions += 1;
            stats.total_service_time_ms += service_time_ms;
            stats.total_waiting_time_ms += waiting;
        }

        current_time_ms += trace_service_time + trace_wait_time;

        // Sample next inter-arrival time
        if case_idx < completed_cases - 1 {
            let u: f64 = rng.gen();
            let inter_arrival = -u.ln() / inter_arrival_lambda;
            current_time_ms = current_time_ms.max(case_start_time + inter_arrival);
        }

        let sojourn_time = current_time_ms - case_start_time;
        total_sojourn_time_ms += sojourn_time;
        total_waiting_time_ms += trace_wait_time;
        total_service_time_ms += trace_service_time;
        per_case_sojourn_ms.push(sojourn_time);
        total_trace_length += trace.len();
    }

    // Calculate final resource utilization
    let resource_utilization: HashMap<String, f64> = resource_pools
        .iter()
        .map(|(r, pool)| (r.clone(), pool.utilization(current_time_ms)))
        .collect();

    // Update activity statistics with computed averages
    for stats in activity_stats.values_mut() {
        if stats.executions > 0 {
            stats.avg_service_time_ms = stats.total_service_time_ms / stats.executions as f64;
            stats.avg_waiting_time_ms = stats.total_waiting_time_ms / stats.executions as f64;
        }
    }

    // Compute distribution statistics over per-case sojourn times
    let n = per_case_sojourn_ms.len();
    let avg_sojourn_time_ms = if n > 0 {
        total_sojourn_time_ms / n as f64
    } else {
        0.0
    };
    let avg_trace_length = if n > 0 {
        total_trace_length as f64 / n as f64
    } else {
        0.0
    };

    let sojourn_time_std_ms = if n > 1 {
        let variance = per_case_sojourn_ms
            .iter()
            .map(|&x| (x - avg_sojourn_time_ms).powi(2))
            .sum::<f64>()
            / (n - 1) as f64;
        variance.sqrt()
    } else {
        0.0
    };

    per_case_sojourn_ms.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let sojourn_time_p5_ms = percentile_sorted(&per_case_sojourn_ms, 5.0);
    let sojourn_time_p50_ms = percentile_sorted(&per_case_sojourn_ms, 50.0);
    let sojourn_time_p95_ms = percentile_sorted(&per_case_sojourn_ms, 95.0);

    Ok(MonteCarloReport {
        completed_cases,
        total_sojourn_time_ms,
        total_waiting_time_ms,
        total_service_time_ms,
        avg_sojourn_time_ms,
        avg_trace_length,
        sojourn_time_std_ms,
        sojourn_time_p5_ms,
        sojourn_time_p50_ms,
        sojourn_time_p95_ms,
        activity_statistics: activity_stats,
        resource_utilization,
    })
}

/// Sample from log-normal distribution.
///
/// Converts from desired lognormal mean/std to underlying normal parameters (mu, sigma).
/// The rand_distr::LogNormal::new(mu, sigma) takes parameters of the underlying NORMAL distribution,
/// not the lognormal mean/std. We convert using:
/// - sigma^2 = ln(1 + (std_dev^2 / mean^2))
/// - mu = ln(mean) - sigma^2 / 2
///
/// Returns error if sigma <= 0 (which would make LogNormal::new fail).
fn sample_log_normal(rng: &mut StdRng, mean: f64, std_dev: f64) -> Result<f64, String> {
    // Convert from desired lognormal mean/std to underlying normal params
    let variance = std_dev * std_dev;
    let sigma2 = (variance / (mean * mean) + 1.0).ln();
    let sigma = sigma2.sqrt().max(1e-6);
    let mu = mean.ln() - sigma2 / 2.0;

    let log_normal = LogNormal::new(mu, sigma)
        .map_err(|e| format!("Failed to create LogNormal distribution: {}", e))?;
    Ok(log_normal.sample(rng))
}

#[wasm_bindgen]
pub fn monte_carlo_simulation(
    log_handle: &str,
    _powl_handle: &str,
    _root_id: &str,
    config_json: &str,
) -> Result<JsValue, JsValue> {
    let config: MonteCarloConfig = serde_json::from_str(config_json)
        .map_err(|e| crate::error::js_val(&format!("Failed to parse config JSON: {}", e)))?;

    let report = get_or_init_state().with_object(log_handle, |obj| match obj {
        Some(crate::state::StoredObject::EventLog(log)) => {
            run_monte_carlo_simulation(log, &config).map_err(|e| crate::error::js_val(&e))
        }
        Some(_) => Err(crate::error::js_val("Handle is not an EventLog")),
        None => Err(crate::error::js_val("EventLog handle not found")),
    })?;

    serde_json::to_string(&report)
        .map_err(|e| crate::error::js_val(&e.to_string()))
        .map(|s| crate::error::js_val(&s))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{AttributeValue, Trace};

    #[test]
    fn test_log_normal_sampling() {
        let mut rng = StdRng::seed_from_u64(42);
        let samples: Vec<f64> = (0..100)
            .map(|_| sample_log_normal(&mut rng, 2.0, 0.5))
            .collect::<Result<_, _>>()
            .expect("Failed to generate samples");

        // All samples should be positive
        assert!(samples.iter().all(|&x| x > 0.0));

        // Mean should be roughly around the expected range
        let mean = samples.iter().sum::<f64>() / samples.len() as f64;
        assert!(mean > 1.0 && mean < 20.0);
    }

    #[test]
    fn test_simple_simulation() {
        let mut log = EventLog::new();

        // Add 10 traces so num_cases=10 can all complete
        for _ in 0..10 {
            let mut trace = Trace::new();
            for i in 0..5 {
                let mut event = crate::models::Event::new();
                event.attributes.insert(
                    "concept:name".to_string(),
                    AttributeValue::String(format!("activity_{}", i)),
                );
                trace.events.push(event);
            }
            log.traces.push(trace);
        }

        let mut config = MonteCarloConfig::default();
        config.num_cases = 10;
        config.simulation_time_ms = 10000;

        let result = run_monte_carlo_simulation(&log, &config);
        assert!(result.is_ok());

        let report = result.unwrap();
        assert_eq!(report.completed_cases, 10);
        assert!(report.total_sojourn_time_ms > 0.0);
        // Distribution fields must be consistent
        assert!(report.avg_sojourn_time_ms > 0.0);
        assert!(report.avg_trace_length > 0.0);
        assert!(report.sojourn_time_p5_ms <= report.sojourn_time_p50_ms);
        assert!(report.sojourn_time_p50_ms <= report.sojourn_time_p95_ms);
    }

    #[test]
    fn test_resource_pool() {
        let mut pool = ResourcePool::new(2);

        // Acquire resources
        assert!(pool.acquire());
        assert!(pool.acquire());
        assert!(!pool.acquire()); // Should fail - at capacity

        // Release and acquire again
        pool.release();
        assert!(pool.acquire()); // Should succeed now

        // Update and check utilization
        pool.update(100.0);
        let util = pool.utilization(100.0);
        assert!(util > 0.0 && util <= 1.0);
    }

    #[test]
    fn test_percentile_sorted() {
        let data = vec![1.0, 2.0, 3.0, 4.0, 5.0];
        assert!((percentile_sorted(&data, 0.0) - 1.0).abs() < 1e-9);
        assert!((percentile_sorted(&data, 50.0) - 3.0).abs() < 1e-9);
        assert!((percentile_sorted(&data, 100.0) - 5.0).abs() < 1e-9);
        // Empty slice
        assert_eq!(percentile_sorted(&[], 50.0), 0.0);
        // Single element
        assert_eq!(percentile_sorted(&[42.0], 95.0), 42.0);
    }
}
