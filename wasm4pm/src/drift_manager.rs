use serde::{Deserialize, Serialize};
use std::collections::VecDeque;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
pub enum CircuitState {
    Closed,
    HalfOpen,
    Open,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TraceSnapshot {
    pub timestamp_ms: u64,
    pub event_count: usize,
    pub duration_ms: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamCircuitBreaker {
    pub state: CircuitState,
    pub spc_buffer: VecDeque<TraceSnapshot>,
    pub consecutive_failures: u8,
    pub window_size: usize,
}

impl Default for StreamCircuitBreaker {
    fn default() -> Self {
        Self {
            state: CircuitState::Closed,
            spc_buffer: VecDeque::with_capacity(100),
            consecutive_failures: 0,
            window_size: 100,
        }
    }
}

#[derive(Debug)]
pub enum DriftError {
    SevereDriftDetected,
}

impl StreamCircuitBreaker {
    pub fn new(window_size: usize) -> Self {
        Self {
            window_size,
            ..Default::default()
        }
    }

    pub fn check_drift(&mut self, snapshot: TraceSnapshot) -> Result<(), DriftError> {
        self.spc_buffer.push_back(snapshot);
        if self.spc_buffer.len() > self.window_size {
            self.spc_buffer.pop_front();
        }

        if self.violates_western_electric_rules() {
            self.consecutive_failures += 1;
            if self.consecutive_failures >= 3 {
                self.state = CircuitState::Open;
                return Err(DriftError::SevereDriftDetected);
            }
        } else {
            self.consecutive_failures = 0;
            if self.state == CircuitState::Open {
                self.state = CircuitState::HalfOpen;
            } else if self.state == CircuitState::HalfOpen {
                self.state = CircuitState::Closed;
            }
        }
        Ok(())
    }

    fn violates_western_electric_rules(&self) -> bool {
        if self.spc_buffer.len() < 10 {
            return false;
        }

        let mut durations: Vec<f64> = self.spc_buffer.iter().map(|s| s.duration_ms).collect();
        let latest = *durations.last().unwrap();

        // Use Median and MAD for robust statistics
        durations.sort_unstable_by(|a, b| a.total_cmp(b));
        let mid = durations.len() / 2;
        let median = if durations.len() % 2 == 0 {
            (durations[mid - 1] + durations[mid]) / 2.0
        } else {
            durations[mid]
        };

        let mut absolute_deviations: Vec<f64> = self
            .spc_buffer
            .iter()
            .map(|s| (s.duration_ms - median).abs())
            .collect();
        absolute_deviations.sort_unstable_by(|a, b| a.total_cmp(b));
        let mad = if absolute_deviations.len() % 2 == 0 {
            (absolute_deviations[mid - 1] + absolute_deviations[mid]) / 2.0
        } else {
            absolute_deviations[mid]
        };

        // Consistency constant for normal distribution (approx 1.4826)
        let std_dev_robust = mad * 1.4826;

        // Rule 1: 1 point beyond 3σ (robust)
        if std_dev_robust > 0.0 && (latest - median).abs() > 3.0 * std_dev_robust {
            return true;
        }

        // Fallback to simple mean for Rule 2 (runs)
        let mean = self.spc_buffer.iter().map(|s| s.duration_ms).sum::<f64>()
            / self.spc_buffer.len() as f64;
        if self.spc_buffer.len() >= 9 {
            let last_9 = &self.spc_buffer.as_slices().0[self.spc_buffer.len().saturating_sub(9)..];
            // Handle wrap-around if needed, but for simplicity we assume contiguous for now
            // VecDeque as_slices might return two slices.
            let (s1, s2) = self.spc_buffer.as_slices();
            let all: Vec<&TraceSnapshot> = s1.iter().chain(s2.iter()).collect();
            let last_9_refs = &all[all.len() - 9..];

            let above = last_9_refs.iter().all(|s| s.duration_ms > mean);
            let below = last_9_refs.iter().all(|s| s.duration_ms < mean);
            if above || below {
                return true;
            }
        }

        false
    }

    pub fn trip_circuit(&mut self) {
        self.state = CircuitState::Open;
    }

    pub fn reset_circuit(&mut self) {
        self.state = CircuitState::Closed;
        self.consecutive_failures = 0;
    }
}
