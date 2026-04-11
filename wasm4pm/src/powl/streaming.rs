//! Streaming (incremental) conformance checking.
use super::conformance::token_replay::{replay_trace, TraceReplayResult};
use super::conversion::to_petri_net;
use crate::powl_arena::PowlArena;
use crate::powl_event_log::Trace;
use crate::powl_models::{PowlMarking, PowlPetriNet};
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AlertConfig {
    pub fitness_threshold: f64,
    pub perfect_rate_threshold: f64,
    pub missing_tokens_threshold: f64,
}

impl Default for AlertConfig {
    fn default() -> Self {
        Self {
            fitness_threshold: 0.8,
            perfect_rate_threshold: 0.5,
            missing_tokens_threshold: 5.0,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub enum Alert {
    FitnessBelowThreshold { current: f64, threshold: f64 },
    PerfectRateBelow { current: f64, threshold: f64 },
    MissingTokensExceeded { current: f64, threshold: f64 },
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ConformanceSnapshot {
    pub fitness: f64,
    pub avg_trace_fitness: f64,
    pub perfect_rate: f64,
    pub traces_seen: usize,
    pub perfect_traces: usize,
    pub total_missing: u32,
    pub total_remaining: u32,
    pub total_produced: u32,
    pub total_consumed: u32,
    pub avg_missing_per_trace: f64,
    pub alerts: Vec<Alert>,
}

pub struct StreamingConformance {
    net: PowlPetriNet,
    initial_marking: PowlMarking,
    final_marking: PowlMarking,
    alert_config: AlertConfig,
    total_produced: u32,
    total_consumed: u32,
    total_missing: u32,
    total_remaining: u32,
    traces_seen: usize,
    perfect_traces: usize,
    trace_fitness_sum: f64,
    window_size: usize,
    window: std::collections::VecDeque<TraceReplayResult>,
}

impl StreamingConformance {
    pub fn new(
        net: PowlPetriNet,
        initial_marking: PowlMarking,
        final_marking: PowlMarking,
    ) -> Self {
        Self {
            net,
            initial_marking,
            final_marking,
            alert_config: AlertConfig::default(),
            total_produced: 0,
            total_consumed: 0,
            total_missing: 0,
            total_remaining: 0,
            traces_seen: 0,
            perfect_traces: 0,
            trace_fitness_sum: 0.0,
            window_size: 100,
            window: std::collections::VecDeque::new(),
        }
    }

    pub fn from_powl(arena: &PowlArena, root: u32) -> Result<Self, String> {
        let pn_result = to_petri_net::apply(arena, root);
        Ok(Self::new(
            pn_result.net,
            pn_result.initial_marking,
            pn_result.final_marking,
        ))
    }

    pub fn set_alert_config(&mut self, config: AlertConfig) {
        self.alert_config = config;
    }
    pub fn set_window_size(&mut self, n: usize) {
        self.window_size = n.max(1);
    }

    pub fn push_trace(&mut self, trace: &Trace) -> (TraceReplayResult, Vec<Alert>) {
        let result = replay_trace(&self.net, &self.initial_marking, &self.final_marking, trace);
        self.total_produced += result.produced_tokens;
        self.total_consumed += result.consumed_tokens;
        self.total_missing += result.missing_tokens;
        self.total_remaining += result.remaining_tokens;
        self.traces_seen += 1;
        self.trace_fitness_sum += result.fitness;
        if result.is_perfect() {
            self.perfect_traces += 1;
        }
        if self.window.len() >= self.window_size {
            self.window.pop_front();
        }
        self.window.push_back(result.clone());
        let alerts = self.check_alerts();
        (result, alerts)
    }

    pub fn push_all<'a>(
        &mut self,
        traces: impl IntoIterator<Item = &'a Trace>,
    ) -> ConformanceSnapshot {
        for trace in traces {
            self.push_trace(trace);
        }
        self.snapshot()
    }

    pub fn fitness(&self) -> f64 {
        if self.total_produced == 0 && self.total_consumed == 0 {
            return 1.0;
        }
        let c = self.total_consumed as f64;
        let p = self.total_produced as f64;
        let m = self.total_missing as f64;
        let r = self.total_remaining as f64;
        (0.5 * (1.0 - m / c) + 0.5 * (1.0 - r / p)).clamp(0.0, 1.0)
    }

    pub fn windowed_fitness(&self) -> f64 {
        if self.window.is_empty() {
            return 1.0;
        }
        let tp: u32 = self.window.iter().map(|r| r.produced_tokens).sum();
        let tc: u32 = self.window.iter().map(|r| r.consumed_tokens).sum();
        let tm: u32 = self.window.iter().map(|r| r.missing_tokens).sum();
        let tr: u32 = self.window.iter().map(|r| r.remaining_tokens).sum();
        if tp == 0 && tc == 0 {
            return 1.0;
        }
        let c = tc as f64;
        let p = tp as f64;
        let m = tm as f64;
        let r = tr as f64;
        (0.5 * (1.0 - m / c) + 0.5 * (1.0 - r / p)).clamp(0.0, 1.0)
    }

    pub fn snapshot(&self) -> ConformanceSnapshot {
        let fitness = self.fitness();
        let perfect_rate = if self.traces_seen == 0 {
            1.0
        } else {
            self.perfect_traces as f64 / self.traces_seen as f64
        };
        let avg_trace_fitness = if self.traces_seen == 0 {
            1.0
        } else {
            self.trace_fitness_sum / self.traces_seen as f64
        };
        let avg_missing = if self.traces_seen == 0 {
            0.0
        } else {
            self.total_missing as f64 / self.traces_seen as f64
        };
        ConformanceSnapshot {
            fitness,
            avg_trace_fitness,
            perfect_rate,
            traces_seen: self.traces_seen,
            perfect_traces: self.perfect_traces,
            total_missing: self.total_missing,
            total_remaining: self.total_remaining,
            total_produced: self.total_produced,
            total_consumed: self.total_consumed,
            avg_missing_per_trace: avg_missing,
            alerts: self.check_alerts(),
        }
    }

    pub fn reset(&mut self) {
        self.total_produced = 0;
        self.total_consumed = 0;
        self.total_missing = 0;
        self.total_remaining = 0;
        self.traces_seen = 0;
        self.perfect_traces = 0;
        self.trace_fitness_sum = 0.0;
        self.window.clear();
    }

    fn check_alerts(&self) -> Vec<Alert> {
        if self.traces_seen == 0 {
            return vec![];
        }
        let mut alerts = Vec::new();
        let fitness = self.fitness();
        let perfect_rate = self.perfect_traces as f64 / self.traces_seen as f64;
        let avg_missing = self.total_missing as f64 / self.traces_seen as f64;
        if fitness < self.alert_config.fitness_threshold {
            alerts.push(Alert::FitnessBelowThreshold {
                current: fitness,
                threshold: self.alert_config.fitness_threshold,
            });
        }
        if perfect_rate < self.alert_config.perfect_rate_threshold {
            alerts.push(Alert::PerfectRateBelow {
                current: perfect_rate,
                threshold: self.alert_config.perfect_rate_threshold,
            });
        }
        if avg_missing > self.alert_config.missing_tokens_threshold {
            alerts.push(Alert::MissingTokensExceeded {
                current: avg_missing,
                threshold: self.alert_config.missing_tokens_threshold,
            });
        }
        alerts
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::powl_arena::PowlArena;
    use crate::powl_event_log::Event;
    use crate::powl_parser::parse_powl_model_string;
    use std::collections::HashMap;

    fn parse(s: &str) -> (PowlArena, u32) {
        let mut arena = PowlArena::new();
        let root = parse_powl_model_string(s, &mut arena).unwrap();
        (arena, root)
    }

    fn make_trace(case_id: &str, acts: &[&str]) -> Trace {
        Trace {
            case_id: case_id.to_string(),
            events: acts
                .iter()
                .map(|&a| Event {
                    name: a.to_string(),
                    timestamp: None,
                    lifecycle: None,
                    attributes: HashMap::new(),
                })
                .collect(),
        }
    }

    #[test]
    fn test_streaming_fitness_tracking() {
        // Happy path: starts at full fitness
        let (arena, root) = parse("PO=(nodes={A, B}, order={A-->B})");
        let sc = StreamingConformance::from_powl(&arena, root).unwrap();
        assert!((sc.fitness() - 1.0).abs() < 1e-9);

        // Perfect trace keeps fitness at 1.0
        let mut sc = StreamingConformance::from_powl(&arena, root).unwrap();
        let (result, _) = sc.push_trace(&make_trace("c1", &["A", "B"]));
        assert!(result.is_perfect());
        assert!((sc.fitness() - 1.0).abs() < 1e-9);

        // Imperfect trace lowers fitness
        let mut sc = StreamingConformance::from_powl(&arena, root).unwrap();
        sc.push_trace(&make_trace("c1", &["A"]));
        assert!(sc.fitness() < 1.0);
    }

    #[test]
    fn test_streaming_mixed_and_reset() {
        // Mixed traces produce partial fitness
        let (arena, root) = parse("PO=(nodes={A, B}, order={A-->B})");
        let mut sc = StreamingConformance::from_powl(&arena, root).unwrap();
        sc.push_trace(&make_trace("c1", &["A", "B"]));
        sc.push_trace(&make_trace("c2", &["A"]));
        let snap = sc.snapshot();
        assert!(snap.fitness < 1.0 && snap.fitness > 0.0);
        assert_eq!(snap.perfect_traces, 1);

        // Reset clears state back to initial
        let (arena, root) = parse("A");
        let mut sc = StreamingConformance::from_powl(&arena, root).unwrap();
        sc.push_trace(&make_trace("c1", &["A"]));
        sc.reset();
        assert_eq!(sc.traces_seen, 0);
        assert!((sc.fitness() - 1.0).abs() < 1e-9);
    }

    #[test]
    fn test_streaming_alerts_and_windowing() {
        // Alert fires on low fitness
        let (arena, root) = parse("PO=(nodes={A, B}, order={A-->B})");
        let mut sc = StreamingConformance::from_powl(&arena, root).unwrap();
        sc.set_alert_config(AlertConfig {
            fitness_threshold: 0.99,
            perfect_rate_threshold: 0.0,
            missing_tokens_threshold: 100.0,
        });
        let (_r, alerts) = sc.push_trace(&make_trace("c1", &["A"]));
        assert!(alerts
            .iter()
            .any(|a| matches!(a, Alert::FitnessBelowThreshold { .. })));

        // Windowed fitness uses last N traces
        let (arena, root) = parse("PO=(nodes={A, B}, order={A-->B})");
        let mut sc = StreamingConformance::from_powl(&arena, root).unwrap();
        sc.set_window_size(2);
        for _ in 0..3 {
            sc.push_trace(&make_trace("x", &["A"]));
        }
        sc.push_trace(&make_trace("p1", &["A", "B"]));
        sc.push_trace(&make_trace("p2", &["A", "B"]));
        assert!((sc.windowed_fitness() - 1.0).abs() < 1e-9);
    }
}
