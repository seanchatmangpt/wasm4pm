/// Token-based replay conformance checking.
use crate::powl_event_log::{EventLog, Trace};
use crate::powl_models::{PowlMarking as Marking, PowlPetriNet as PetriNet};
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TraceReplayResult {
    pub case_id: String,
    pub fitness: f64,
    pub produced_tokens: u32,
    pub consumed_tokens: u32,
    pub missing_tokens: u32,
    pub remaining_tokens: u32,
}

impl TraceReplayResult {
    pub fn is_perfect(&self) -> bool {
        self.missing_tokens == 0 && self.remaining_tokens == 0
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct FitnessResult {
    pub percentage: f64,
    pub avg_trace_fitness: f64,
    pub perfectly_fitting_traces: usize,
    pub total_traces: usize,
    pub trace_results: Vec<TraceReplayResult>,
}

fn preset(net: &PetriNet, trans_name: &str) -> Vec<String> {
    net.arcs.iter()
        .filter(|a| a.target == trans_name)
        .filter(|a| net.places.iter().any(|p| p.name == a.source))
        .map(|a| a.source.clone())
        .collect()
}

fn postset(net: &PetriNet, trans_name: &str) -> Vec<String> {
    net.arcs.iter()
        .filter(|a| a.source == trans_name)
        .filter(|a| net.places.iter().any(|p| p.name == a.target))
        .map(|a| a.target.clone())
        .collect()
}

fn is_enabled(marking: &Marking, pre: &[String]) -> bool {
    pre.iter().all(|p| marking.get(p).copied().unwrap_or(0) > 0)
}

fn fire(marking: &mut Marking, pre: &[String], post: &[String]) -> (u32, u32) {
    for p in pre { *marking.entry(p.clone()).or_insert(0) -= 1; }
    for p in post { *marking.entry(p.clone()).or_insert(0) += 1; }
    (pre.len() as u32, post.len() as u32)
}

fn fire_silent_enabled(net: &PetriNet, marking: &mut Marking) -> (u32, u32) {
    let mut total_c = 0u32;
    let mut total_p = 0u32;
    let mut budget = net.transitions.len() * 4 + 16;
    loop {
        if budget == 0 { break; }
        let mut fired = false;
        for trans in &net.transitions {
            if trans.label.is_some() { continue; }
            let pre = preset(net, &trans.name);
            if !pre.is_empty() && is_enabled(marking, &pre) {
                let post = postset(net, &trans.name);
                let (c, p) = fire(marking, &pre, &post);
                total_c += c;
                total_p += p;
                budget -= 1;
                fired = true;
                break;
            }
        }
        if !fired { break; }
    }
    (total_c, total_p)
}

pub fn replay_trace(
    net: &PetriNet,
    initial_marking: &Marking,
    final_marking: &Marking,
    trace: &Trace,
) -> TraceReplayResult {
    let mut marking: Marking = initial_marking.clone();
    let mut produced: u32 = initial_marking.values().sum();
    let mut consumed: u32 = 0;
    let mut missing: u32 = 0;
    let (sc, sp) = fire_silent_enabled(net, &mut marking);
    consumed += sc;
    produced += sp;
    for event in &trace.events {
        let activity = &event.name;
        let candidates: Vec<&str> = net.transitions.iter()
            .filter(|t| t.label.as_deref() == Some(activity.as_str()))
            .map(|t| t.name.as_str())
            .collect();
        if candidates.is_empty() { continue; }
        let enabled_trans = candidates.iter().find(|&&t| is_enabled(&marking, &preset(net, t))).copied();
        let chosen = if let Some(t) = enabled_trans { t } else { candidates[0] };
        let pre = preset(net, chosen);
        let post = postset(net, chosen);
        for p in &pre {
            let have = marking.get(p).copied().unwrap_or(0);
            if have == 0 {
                *marking.entry(p.clone()).or_insert(0) += 1;
                produced += 1;
                missing += 1;
            }
        }
        let (c, p) = fire(&mut marking, &pre, &post);
        consumed += c;
        produced += p;
        let (sc, sp) = fire_silent_enabled(net, &mut marking);
        consumed += sc;
        produced += sp;
    }
    let remaining: u32 = marking.iter()
        .filter(|(place, &tokens)| tokens > 0 && final_marking.get(*place).copied().unwrap_or(0) == 0)
        .map(|(_, &t)| t)
        .sum();
    let final_consumed: u32 = final_marking.values().sum();
    consumed += final_consumed;
    let fitness = if produced == 0 && consumed == 0 {
        1.0
    } else {
        let c = consumed as f64;
        let p = produced as f64;
        let m = missing as f64;
        let r = remaining as f64;
        (0.5 * (1.0 - m / c) + 0.5 * (1.0 - r / p)).clamp(0.0, 1.0)
    };
    TraceReplayResult { case_id: trace.case_id.clone(), fitness, produced_tokens: produced, consumed_tokens: consumed, missing_tokens: missing, remaining_tokens: remaining }
}

pub fn compute_fitness(
    net: &PetriNet,
    initial_marking: &Marking,
    final_marking: &Marking,
    log: &EventLog,
) -> FitnessResult {
    let trace_results: Vec<TraceReplayResult> = log.traces.iter().map(|t| replay_trace(net, initial_marking, final_marking, t)).collect();
    let perfectly_fitting_traces = trace_results.iter().filter(|r| r.is_perfect()).count();
    let total_traces = trace_results.len();
    let avg_trace_fitness = if total_traces == 0 { 1.0 } else { trace_results.iter().map(|r| r.fitness).sum::<f64>() / total_traces as f64 };
    let total_produced: u32 = trace_results.iter().map(|r| r.produced_tokens).sum();
    let total_consumed: u32 = trace_results.iter().map(|r| r.consumed_tokens).sum();
    let total_missing: u32 = trace_results.iter().map(|r| r.missing_tokens).sum();
    let total_remaining: u32 = trace_results.iter().map(|r| r.remaining_tokens).sum();
    let percentage = if total_produced == 0 && total_consumed == 0 { 1.0 } else {
        let c = total_consumed as f64; let p = total_produced as f64;
        let m = total_missing as f64; let r = total_remaining as f64;
        (0.5 * (1.0 - m / c) + 0.5 * (1.0 - r / p)).clamp(0.0, 1.0)
    };
    FitnessResult { percentage, avg_trace_fitness, perfectly_fitting_traces, total_traces, trace_results }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::powl_models::PowlPetriNet as PetriNet;
    use crate::powl_event_log::Event;

    fn sequential_net() -> (PetriNet, Marking, Marking) {
        let mut net = PetriNet::new("seq");
        net.add_place("p_start");
        net.add_place("p1");
        net.add_place("p_end");
        net.add_transition("t_A", Some("A".into()));
        net.add_transition("t_B", Some("B".into()));
        net.add_arc("p_start", "t_A");
        net.add_arc("t_A", "p1");
        net.add_arc("p1", "t_B");
        net.add_arc("t_B", "p_end");
        let mut initial = Marking::new();
        initial.insert("p_start".into(), 1);
        let mut final_m = Marking::new();
        final_m.insert("p_end".into(), 1);
        (net, initial, final_m)
    }

    fn make_trace(case_id: &str, acts: &[&str]) -> Trace {
        Trace {
            case_id: case_id.to_string(),
            events: acts.iter().map(|&a| Event {
                name: a.to_string(), timestamp: None, lifecycle: None, attributes: std::collections::HashMap::new(),
            }).collect(),
        }
    }

    #[test]
    fn perfect_trace_fitness_1() {
        let (net, initial, final_m) = sequential_net();
        let trace = make_trace("c1", &["A", "B"]);
        let result = replay_trace(&net, &initial, &final_m, &trace);
        assert_eq!(result.missing_tokens, 0);
        assert_eq!(result.remaining_tokens, 0);
        assert!((result.fitness - 1.0).abs() < 1e-9);
        assert!(result.is_perfect());
    }

    #[test]
    fn missing_activity_lowers_fitness() {
        let (net, initial, final_m) = sequential_net();
        let trace = make_trace("c1", &["A"]);
        let result = replay_trace(&net, &initial, &final_m, &trace);
        assert_eq!(result.remaining_tokens, 1);
        assert!(result.fitness < 1.0);
    }

    #[test]
    fn extra_activity_forces_missing_token() {
        let (net, initial, final_m) = sequential_net();
        let trace = make_trace("c1", &["B", "A"]);
        let result = replay_trace(&net, &initial, &final_m, &trace);
        assert!(result.missing_tokens > 0);
        assert!(result.fitness < 1.0);
    }

    #[test]
    fn log_level_fitness_all_perfect() {
        let (net, initial, final_m) = sequential_net();
        let log = EventLog { traces: vec![make_trace("c1", &["A", "B"]), make_trace("c2", &["A", "B"])] };
        let result = compute_fitness(&net, &initial, &final_m, &log);
        assert_eq!(result.perfectly_fitting_traces, 2);
        assert!((result.percentage - 1.0).abs() < 1e-9);
    }

    #[test]
    fn log_level_fitness_mixed() {
        let (net, initial, final_m) = sequential_net();
        let log = EventLog { traces: vec![make_trace("c1", &["A", "B"]), make_trace("c2", &["A"])] };
        let result = compute_fitness(&net, &initial, &final_m, &log);
        assert_eq!(result.perfectly_fitting_traces, 1);
        assert_eq!(result.total_traces, 2);
        assert!(result.percentage < 1.0 && result.percentage > 0.0);
    }
}
