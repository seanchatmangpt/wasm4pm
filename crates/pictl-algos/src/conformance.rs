use pictl_types::*;
use std::collections::{HashMap, HashSet};

/// Token replay conformance checking against a DFG model.
///
/// Algorithm:
/// 1. For each trace, initialise a token multiset at the virtual start node.
/// 2. For each event activity, attempt to fire an outgoing edge from the
///    current token position.  If no matching edge is found, record a missing
///    token (log move) and stay in place.
/// 3. After the trace, any tokens that are not on a declared end-activity node
///    are counted as remaining tokens (model moves).
/// 4. Aggregate counts across all traces and compute
///    fitness = consumed / (consumed + missing).
pub fn check_conformance_token_replay(
    log: &EventLog,
    model: &DFG,
    activity_key: &str,
) -> Result<ConformanceResult> {
    if log.is_empty() {
        return Ok(ConformanceResult::new(1.0, 0, 0, 0));
    }

    // Build adjacency map: activity → set of successor activities
    let mut successors: HashMap<&str, HashSet<&str>> = HashMap::new();
    for edge in &model.edges {
        successors
            .entry(edge.source.as_str())
            .or_default()
            .insert(edge.target.as_str());
    }

    let start_set: HashSet<&str> = model.start_activities.iter().map(|s| s.as_str()).collect();
    let end_set: HashSet<&str> = model.end_activities.iter().map(|s| s.as_str()).collect();

    let total_traces = log.traces.len();
    let mut total_consumed: usize = 0;
    let mut total_missing: usize = 0;
    let mut fitting_traces: usize = 0;

    for trace in &log.traces {
        let activities = trace.activities(activity_key);
        if activities.is_empty() {
            fitting_traces += 1;
            continue;
        }

        // Token multiset: current_node → token count
        // Initialise at the start node (use first activity if start_activities empty)
        let mut tokens: HashMap<&str, usize> = HashMap::new();
        let first_act = activities[0].as_str();

        // Place initial token at the start of the trace
        let start_node: &str = if start_set.contains(first_act) {
            first_act
        } else if let Some(s) = start_set.iter().next() {
            s
        } else {
            first_act
        };
        *tokens.entry(start_node).or_insert(0) += 1;

        let mut trace_consumed: usize = 0;
        let mut trace_missing: usize = 0;

        for activity in &activities {
            let act = activity.as_str();

            // Find a token on some node that has `act` as a successor (or IS `act`)
            // Simple rule: if a token sits on a predecessor of `act`, fire it.
            // If a token already sits on `act`, consume it for the transition.
            let found = tokens.get(act).copied().unwrap_or(0) > 0;

            if found {
                // Consume token at current node, fire forward
                *tokens.entry(act).or_insert(0) -= 1;
                if tokens[act] == 0 {
                    tokens.remove(act);
                }
                trace_consumed += 1;
                // Produce token at act (it remains as current position)
                // No new token produced here because we're treating the activity
                // as consuming and being consumed in one step for replay purposes.
                // The token moves TO act and stays there until next event.
                *tokens.entry(act).or_insert(0) += 1;
            } else {
                // Check if any existing token position can reach `act` via a
                // single edge (predecessor firing)
                let mut fired = false;
                let positions: Vec<&str> = tokens.keys().copied().collect();
                for pos in positions {
                    if successors.get(pos).map_or(false, |s| s.contains(act)) {
                        // Fire the transition: consume token at pos, produce at act
                        let cnt = tokens.entry(pos).or_insert(0);
                        *cnt -= 1;
                        let c = *cnt;
                        if c == 0 {
                            tokens.remove(pos);
                        }
                        trace_consumed += 1;
                        *tokens.entry(act).or_insert(0) += 1;
                        fired = true;
                        break;
                    }
                }
                if !fired {
                    // Log move: activity in log but no matching token/edge — missing token
                    trace_missing += 1;
                    // Force-place a token at act to allow replay to continue
                    *tokens.entry(act).or_insert(0) += 1;
                }
            }
        }

        // Count remaining tokens not on end activities
        let trace_remaining: usize = tokens
            .iter()
            .filter(|(node, _)| !end_set.contains(*node))
            .map(|(_, cnt)| cnt)
            .sum();

        let trace_fitting = trace_missing == 0 && trace_remaining == 0;
        if trace_fitting {
            fitting_traces += 1;
        }

        total_consumed += trace_consumed;
        total_missing += trace_missing;
        let _ = trace_remaining; // tracked per-trace for fitting check above
    }

    let denominator = (total_consumed + total_missing) as f64;
    let fitness = if denominator == 0.0 {
        1.0
    } else {
        total_consumed as f64 / denominator
    };

    let deviating_traces = total_traces - fitting_traces;
    Ok(ConformanceResult::new(
        fitness.clamp(0.0, 1.0),
        total_traces,
        fitting_traces,
        deviating_traces,
    ))
}

// ─── Move classification for alignment ────────────────────────────────────────

#[derive(Debug, Clone, PartialEq)]
enum AlignMove {
    SyncMove,
    LogMove,
    ModelMove,
}

/// Greedy alignment-based conformance checking against a Petri net.
///
/// Algorithm (greedy, not optimal):
/// 1. Build enabled-transition lookup from the current marking.
/// 2. For each event in the trace, attempt a synchronous move (event label
///    matches an enabled transition).  If successful, fire the transition.
/// 3. If no sync move is possible, record a LogMove and advance the log
///    pointer without changing the marking.
/// 4. After replaying all events, fire invisible or any enabled transitions to
///    drain the net toward the sink place (ModelMoves).
/// 5. fitness = sync_moves / (sync_moves + log_moves + model_moves).
pub fn check_conformance_alignment(
    log: &EventLog,
    model: &PetriNet,
    activity_key: &str,
) -> Result<ConformanceResult> {
    if log.is_empty() {
        return Ok(ConformanceResult::new(1.0, 0, 0, 0));
    }

    // Pre-build lookup structures for the Petri net
    // arcs: place→transition (input arcs) and transition→place (output arcs)
    let place_ids: HashMap<&str, usize> = model
        .places
        .iter()
        .enumerate()
        .map(|(i, p)| (p.id.as_str(), i))
        .collect();

    let trans_ids: HashMap<&str, usize> = model
        .transitions
        .iter()
        .enumerate()
        .map(|(i, t)| (t.id.as_str(), i))
        .collect();

    // input_arcs[t] = list of place indices that must have tokens to enable t
    let mut input_arcs: Vec<Vec<usize>> = vec![Vec::new(); model.transitions.len()];
    // output_arcs[t] = list of place indices that receive a token when t fires
    let mut output_arcs: Vec<Vec<usize>> = vec![Vec::new(); model.transitions.len()];

    for arc in &model.arcs {
        if let (Some(&t_idx), Some(&p_idx)) = (
            trans_ids.get(arc.source.as_str()),
            place_ids.get(arc.target.as_str()),
        ) {
            // transition → place (output arc)
            output_arcs[t_idx].push(p_idx);
        } else if let (Some(&p_idx), Some(&t_idx)) = (
            place_ids.get(arc.source.as_str()),
            trans_ids.get(arc.target.as_str()),
        ) {
            // place → transition (input arc)
            input_arcs[t_idx].push(p_idx);
        }
    }

    // label_to_transitions: activity label → list of transition indices
    let mut label_to_trans: HashMap<&str, Vec<usize>> = HashMap::new();
    for (i, t) in model.transitions.iter().enumerate() {
        if !t.invisible {
            label_to_trans.entry(t.label.as_str()).or_default().push(i);
        }
    }

    // Initial marking from place.initial_marking
    let initial_marking: Vec<usize> = model.places.iter().map(|p| p.initial_marking).collect();

    // Helper closure: is transition `t_idx` enabled in `marking`?
    let is_enabled = |marking: &Vec<usize>, t_idx: usize| -> bool {
        input_arcs[t_idx].iter().all(|&p| marking[p] > 0)
    };

    // Helper: fire transition `t_idx` on a cloned marking
    let fire = |marking: &mut Vec<usize>, t_idx: usize| {
        for &p in &input_arcs[t_idx] {
            marking[p] -= 1;
        }
        for &p in &output_arcs[t_idx] {
            marking[p] += 1;
        }
    };

    let total_traces = log.traces.len();
    let mut total_sync: usize = 0;
    let mut total_log: usize = 0;
    let mut total_model: usize = 0;
    let mut fitting_traces: usize = 0;

    for trace in &log.traces {
        let activities = trace.activities(activity_key);
        let mut marking = initial_marking.clone();
        let mut moves: Vec<AlignMove> = Vec::new();

        for activity in &activities {
            let act = activity.as_str();
            // Try to find an enabled synchronous move
            let sync_trans = label_to_trans
                .get(act)
                .and_then(|ts| ts.iter().find(|&&t| is_enabled(&marking, t)).copied());

            if let Some(t_idx) = sync_trans {
                fire(&mut marking, t_idx);
                moves.push(AlignMove::SyncMove);
            } else {
                // Log move: event in log, no enabled matching transition
                moves.push(AlignMove::LogMove);
            }
        }

        // Drain model: fire remaining enabled transitions (model moves) up to a
        // safety limit to avoid infinite loops on nets with cycles.
        let max_model_moves = model.transitions.len() + 1;
        let mut model_move_count = 0;
        loop {
            if model_move_count >= max_model_moves {
                break;
            }
            // Prefer invisible transitions first, then any enabled
            let next = (0..model.transitions.len())
                .find(|&t| model.transitions[t].invisible && is_enabled(&marking, t))
                .or_else(|| (0..model.transitions.len()).find(|&t| is_enabled(&marking, t)));
            match next {
                Some(t_idx) => {
                    fire(&mut marking, t_idx);
                    moves.push(AlignMove::ModelMove);
                    model_move_count += 1;
                }
                None => break,
            }
        }

        let sync = moves.iter().filter(|m| **m == AlignMove::SyncMove).count();
        let log_m = moves.iter().filter(|m| **m == AlignMove::LogMove).count();
        let model_m = moves.iter().filter(|m| **m == AlignMove::ModelMove).count();

        total_sync += sync;
        total_log += log_m;
        total_model += model_m;

        if log_m == 0 && model_m == 0 {
            fitting_traces += 1;
        }
    }

    let denom = (total_sync + total_log + total_model) as f64;
    let fitness = if denom == 0.0 {
        1.0
    } else {
        total_sync as f64 / denom
    };

    let deviating_traces = total_traces - fitting_traces;
    Ok(ConformanceResult::new(
        fitness.clamp(0.0, 1.0),
        total_traces,
        fitting_traces,
        deviating_traces,
    ))
}

// ─── Helpers for tests ────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    fn make_event(activity: &str) -> Event {
        let mut attrs = HashMap::new();
        attrs.insert(
            "concept:name".to_string(),
            AttributeValue::String(activity.to_string()),
        );
        Event::new(attrs)
    }

    fn make_trace(case_id: &str, activities: &[&str]) -> Trace {
        Trace::new(
            case_id.to_string(),
            activities.iter().map(|a| make_event(a)).collect(),
        )
    }

    fn make_log(traces: Vec<Trace>) -> EventLog {
        EventLog::new(traces, HashMap::new())
    }

    /// Build a simple linear DFG: A → B → C
    fn linear_dfg() -> DFG {
        DFG {
            nodes: vec![
                DFGNode::new("A".to_string(), 1),
                DFGNode::new("B".to_string(), 1),
                DFGNode::new("C".to_string(), 1),
            ],
            edges: vec![
                DFGEdge::new("A".to_string(), "B".to_string(), 1),
                DFGEdge::new("B".to_string(), "C".to_string(), 1),
            ],
            start_activities: vec!["A".to_string()],
            end_activities: vec!["C".to_string()],
        }
    }

    // ── Token replay tests ────────────────────────────────────────────────────

    #[test]
    fn test_token_replay_perfect_fit() {
        let dfg = linear_dfg();
        let log = make_log(vec![make_trace("c1", &["A", "B", "C"])]);
        let result =
            check_conformance_token_replay(&log, &dfg, "concept:name").expect("should succeed");
        assert_eq!(result.total_traces, 1);
        assert_eq!(result.fitting_traces, 1);
        assert_eq!(result.deviating_traces, 0);
        assert!(
            result.fitness >= 0.99,
            "perfect trace should have fitness ≈ 1.0, got {}",
            result.fitness
        );
    }

    #[test]
    fn test_token_replay_one_deviation() {
        let dfg = linear_dfg();
        // Trace skips B: A → C (one log move — B missing, C has no predecessor token)
        let log = make_log(vec![make_trace("c2", &["A", "C"])]);
        let result =
            check_conformance_token_replay(&log, &dfg, "concept:name").expect("should succeed");
        assert_eq!(result.total_traces, 1);
        assert!(
            result.fitness < 1.0,
            "trace with deviation should have fitness < 1.0, got {}",
            result.fitness
        );
        assert_eq!(
            result.deviating_traces, 1,
            "should count one deviating trace"
        );
    }

    // ── Alignment tests ───────────────────────────────────────────────────────

    /// Build a simple linear Petri net: [start] --(tA)--> [p1] --(tB)--> [end]
    /// Labels: tA = "A", tB = "B"
    fn linear_petri_net() -> PetriNet {
        let mut pn = PetriNet::new();
        // Places
        let mut start_place = PetriNetPlace::new("start".to_string(), "start".to_string());
        start_place.initial_marking = 1;
        pn.places.push(start_place);
        pn.places
            .push(PetriNetPlace::new("p1".to_string(), "p1".to_string()));
        pn.places
            .push(PetriNetPlace::new("end".to_string(), "end".to_string()));

        // Transitions
        pn.transitions.push(PetriNetTransition::new(
            "tA".to_string(),
            "A".to_string(),
            false,
        ));
        pn.transitions.push(PetriNetTransition::new(
            "tB".to_string(),
            "B".to_string(),
            false,
        ));

        // Arcs: start → tA → p1 → tB → end
        pn.arcs
            .push(PetriNetArc::new("start".to_string(), "tA".to_string(), 1));
        pn.arcs
            .push(PetriNetArc::new("tA".to_string(), "p1".to_string(), 1));
        pn.arcs
            .push(PetriNetArc::new("p1".to_string(), "tB".to_string(), 1));
        pn.arcs
            .push(PetriNetArc::new("tB".to_string(), "end".to_string(), 1));
        pn
    }

    #[test]
    fn test_alignment_perfect_fit() {
        let pn = linear_petri_net();
        let log = make_log(vec![make_trace("c1", &["A", "B"])]);
        let result =
            check_conformance_alignment(&log, &pn, "concept:name").expect("should succeed");
        assert_eq!(result.total_traces, 1);
        assert_eq!(result.fitting_traces, 1);
        assert!(
            result.fitness >= 0.99,
            "perfect alignment should have fitness ≈ 1.0, got {}",
            result.fitness
        );
    }

    #[test]
    fn test_alignment_one_log_move() {
        let pn = linear_petri_net();
        // Trace has extra event "X" which doesn't exist in the model → LogMove
        let log = make_log(vec![make_trace("c2", &["A", "X", "B"])]);
        let result =
            check_conformance_alignment(&log, &pn, "concept:name").expect("should succeed");
        assert_eq!(result.total_traces, 1);
        assert!(
            result.fitness < 1.0,
            "trace with log move should have fitness < 1.0, got {}",
            result.fitness
        );
        assert_eq!(
            result.deviating_traces, 1,
            "should count one deviating trace"
        );
    }
}
