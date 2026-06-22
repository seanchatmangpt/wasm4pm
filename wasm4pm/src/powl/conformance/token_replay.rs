/// Token-based replay conformance checking.
use crate::powl_event_log::{EventLog, Trace};
use crate::powl_models::{PowlMarking as Marking, PowlPetriNet as PetriNet};
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TraceReplayResult {
    pub case_id: String,
    pub fitness: f64,
    pub precision: f64,
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
    pub avg_trace_precision: f64,
    pub perfectly_fitting_traces: usize,
    pub total_traces: usize,
    pub trace_results: Vec<TraceReplayResult>,
}

fn preset(net: &PetriNet, trans_name: &str) -> Vec<String> {
    net.arcs
        .iter()
        .filter(|a| a.target == trans_name)
        .filter(|a| net.places.iter().any(|p| p.name == a.source))
        .map(|a| a.source.clone())
        .collect()
}

fn postset(net: &PetriNet, trans_name: &str) -> Vec<String> {
    net.arcs
        .iter()
        .filter(|a| a.source == trans_name)
        .filter(|a| net.places.iter().any(|p| p.name == a.target))
        .map(|a| a.target.clone())
        .collect()
}

fn is_enabled(marking: &Marking, pre: &[String]) -> bool {
    pre.iter().all(|p| marking.get(p).copied().unwrap_or(0) > 0)
}

fn fire(marking: &mut Marking, pre: &[String], post: &[String]) -> (u32, u32) {
    for p in pre {
        *marking.entry(p.clone()).or_insert(0) -= 1;
    }
    for p in post {
        *marking.entry(p.clone()).or_default() += 1;
    }
    (pre.len() as u32, post.len() as u32)
}

/// Enabled silent transitions whose preset is *contested* — i.e. another enabled
/// silent transition shares at least one preset place — represent a mutually-exclusive
/// choice point. Eagerly firing one would arbitrarily commit to one branch, breaking
/// downstream activity replay if the trace dictates a different branch. We defer those
/// to [`fire_silent_to_enable`], which fires the specific branch the next activity needs.
fn fire_silent_safely(net: &PetriNet, marking: &mut Marking) -> (u32, u32) {
    let mut total_c = 0u32;
    let mut total_p = 0u32;
    let mut budget = net.transitions.len() * 4 + 16;
    loop {
        if budget == 0 {
            break;
        }
        // Snapshot every currently enabled silent transition.
        let enabled: Vec<(String, Vec<String>, Vec<String>)> = net
            .transitions
            .iter()
            .filter(|t| t.label.is_none())
            .filter_map(|t| {
                let pre = preset(net, &t.name);
                if pre.is_empty() || !is_enabled(marking, &pre) {
                    return None;
                }
                let post = postset(net, &t.name);
                Some((t.name.clone(), pre, post))
            })
            .collect();
        if enabled.is_empty() {
            break;
        }
        // Find one whose preset places are NOT contested by any other enabled silent.
        let safe_idx = enabled.iter().position(|(name, pre, _)| {
            enabled.iter().all(|(other_name, other_pre, _)| {
                other_name == name || pre.iter().all(|p| !other_pre.contains(p))
            })
        });
        match safe_idx {
            Some(i) => {
                let (_, pre, post) = &enabled[i];
                let (c, p) = fire(marking, pre, post);
                total_c += c;
                total_p += p;
                budget -= 1;
            }
            None => break, // All enabled silents are contested — wait for activity to disambiguate.
        }
    }
    (total_c, total_p)
}

/// One-step look-ahead silent firing: if `target_pre` is not currently enabled,
/// look for an enabled silent transition whose firing would *contribute* to enabling
/// it (its postset overlaps `target_pre`). Fires that silent and returns whether
/// it succeeded.
fn fire_silent_to_enable(
    net: &PetriNet,
    marking: &mut Marking,
    target_pre: &[String],
) -> Option<(u32, u32)> {
    if is_enabled(marking, target_pre) {
        return None;
    }
    for trans in &net.transitions {
        if trans.label.is_some() {
            continue;
        }
        let pre = preset(net, &trans.name);
        if pre.is_empty() || !is_enabled(marking, &pre) {
            continue;
        }
        let post = postset(net, &trans.name);
        if post.iter().any(|p| target_pre.contains(p)) {
            let (c, p) = fire(marking, &pre, &post);
            return Some((c, p));
        }
    }
    None
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
    let (sc, sp) = fire_silent_safely(net, &mut marking);
    consumed += sc;
    produced += sp;
    for event in &trace.events {
        let activity = &event.name;
        let candidates: Vec<&str> = net
            .transitions
            .iter()
            .filter(|t| t.label.as_deref() == Some(activity.as_str()))
            .map(|t| t.name.as_str())
            .collect();
        if candidates.is_empty() {
            continue;
        }
        // Try each candidate's preset for direct enablement first.
        let mut chosen = candidates
            .iter()
            .find(|&&t| is_enabled(&marking, &preset(net, t)))
            .copied();
        // If none is directly enabled, walk one step of silents (1-step look-ahead)
        // to fire the silent path that would enable a candidate. This resolves
        // mutually-exclusive silent choice points (e.g. per-edge τ_start branches)
        // by letting the next activity dictate which branch wins.
        if chosen.is_none() {
            for &cand in &candidates {
                let cand_pre = preset(net, cand);
                let mut budget = net.transitions.len() + 4;
                while budget > 0 && !is_enabled(&marking, &cand_pre) {
                    match fire_silent_to_enable(net, &mut marking, &cand_pre) {
                        Some((c, p)) => {
                            consumed += c;
                            produced += p;
                            budget -= 1;
                        }
                        None => break,
                    }
                }
                if is_enabled(&marking, &cand_pre) {
                    chosen = Some(cand);
                    break;
                }
            }
        }
        let chosen = chosen.unwrap_or(candidates[0]);
        let pre = preset(net, chosen);
        let post = postset(net, chosen);
        for p in &pre {
            let have = marking.get(p).copied().unwrap_or(0);
            if have == 0 {
                *marking.entry(p.clone()).or_default() += 1;
                produced += 1;
                missing += 1;
            }
        }
        let (c, p) = fire(&mut marking, &pre, &post);
        consumed += c;
        produced += p;
        let (sc, sp) = fire_silent_safely(net, &mut marking);
        consumed += sc;
        produced += sp;
    }
    let remaining: u32 = marking
        .iter()
        .filter(|(place, &tokens)| {
            tokens > 0 && final_marking.get(*place).copied().unwrap_or(0) == 0
        })
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
    let precision = if produced == 0 {
        1.0
    } else {
        (1.0 - remaining as f64 / produced as f64).clamp(0.0, 1.0)
    };
    TraceReplayResult {
        case_id: trace.case_id.clone(),
        fitness,
        precision,
        produced_tokens: produced,
        consumed_tokens: consumed,
        missing_tokens: missing,
        remaining_tokens: remaining,
    }
}

pub fn compute_fitness(
    net: &PetriNet,
    initial_marking: &Marking,
    final_marking: &Marking,
    log: &EventLog,
) -> FitnessResult {
    let trace_results: Vec<TraceReplayResult> = log
        .traces
        .iter()
        .map(|t| replay_trace(net, initial_marking, final_marking, t))
        .collect();
    let perfectly_fitting_traces = trace_results.iter().filter(|r| r.is_perfect()).count();
    let total_traces = trace_results.len();
    let avg_trace_fitness = if total_traces == 0 {
        1.0
    } else {
        trace_results.iter().map(|r| r.fitness).sum::<f64>() / total_traces as f64
    };
    let avg_trace_precision = if total_traces == 0 {
        1.0
    } else {
        trace_results.iter().map(|r| r.precision).sum::<f64>() / total_traces as f64
    };
    let (total_produced, total_consumed, total_missing, total_remaining) =
        trace_results.iter().fold((0u32, 0u32, 0u32, 0u32), |(p, c, m, r), x| {
            (
                p + x.produced_tokens,
                c + x.consumed_tokens,
                m + x.missing_tokens,
                r + x.remaining_tokens,
            )
        });
    let percentage = if total_produced == 0 && total_consumed == 0 {
        1.0
    } else {
        let c = total_consumed as f64;
        let p = total_produced as f64;
        let m = total_missing as f64;
        let r = total_remaining as f64;
        (0.5 * (1.0 - m / c) + 0.5 * (1.0 - r / p)).clamp(0.0, 1.0)
    };
    FitnessResult {
        percentage,
        avg_trace_fitness,
        avg_trace_precision,
        perfectly_fitting_traces,
        total_traces,
        trace_results,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::powl_event_log::Event;
    use crate::powl_models::PowlPetriNet as PetriNet;

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
            events: acts
                .iter()
                .map(|&a| Event {
                    name: a.to_string(),
                    timestamp: None,
                    lifecycle: None,
                    attributes: std::collections::HashMap::new(),
                })
                .collect(),
        }
    }

    #[test]
    fn test_token_replay_perfect_fitness() {
        // Happy path: perfect trace has fitness 1.0
        let (net, initial, final_m) = sequential_net();
        let trace = make_trace("c1", &["A", "B"]);
        let result = replay_trace(&net, &initial, &final_m, &trace);
        assert_eq!(result.missing_tokens, 0);
        assert_eq!(result.remaining_tokens, 0);
        assert!((result.fitness - 1.0).abs() < 1e-9);
    }

    #[test]
    fn test_token_replay_imperfect_cases() {
        // Missing activity lowers fitness
        let (net, initial, final_m) = sequential_net();
        let trace = make_trace("c1", &["A"]);
        let result = replay_trace(&net, &initial, &final_m, &trace);
        assert!(result.fitness < 1.0);

        // Extra activity forces missing token
        let trace = make_trace("c1", &["B", "A"]);
        let result = replay_trace(&net, &initial, &final_m, &trace);
        assert!(result.missing_tokens > 0);
    }

    #[test]
    fn test_token_replay_log_level_fitness() {
        // Log with all perfect traces
        let (net, initial, final_m) = sequential_net();
        let log = EventLog {
            traces: vec![make_trace("c1", &["A", "B"]), make_trace("c2", &["A", "B"])],
        };
        let result = compute_fitness(&net, &initial, &final_m, &log);
        assert_eq!(result.perfectly_fitting_traces, 2);
        assert!((result.percentage - 1.0).abs() < 1e-9);

        // Mixed log (some perfect, some not)
        let log = EventLog {
            traces: vec![make_trace("c1", &["A", "B"]), make_trace("c2", &["A"])],
        };
        let result = compute_fitness(&net, &initial, &final_m, &log);
        assert_eq!(result.perfectly_fitting_traces, 1);
        assert!(result.percentage < 1.0 && result.percentage > 0.0);
    }
}
